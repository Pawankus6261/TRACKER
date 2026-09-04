import secrets
import datetime
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Request
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models import TrackingSession, LocationPoint
from app.schemas import (
    SessionCreateRequest,
    SessionCreateResponse,
    SessionPublicResponse,
    OwnerDashboardResponse,
    LocationPayload,
    LocationPointResponse
)
from app.services.location_service import (
    classify_stale_status,
    classify_accuracy_quality,
    resolve_ip_geolocation_seed
)
from app.services.tracking_service import TrackingService
from app.websocket import manager

logger = logging.getLogger("routes.sessions")
router = APIRouter(tags=["Sessions"])

def generate_urlsafe_token() -> str:
    return secrets.token_urlsafe(24)

def generate_owner_key() -> str:
    return secrets.token_urlsafe(32)

@router.post("/api/sessions", response_model=SessionCreateResponse)
def create_session(
    request: SessionCreateRequest,
    req: Request,
    db: Session = Depends(get_db)
):
    """
    Section 24: Create shareable tracking session.
    Returns token, owner_key, and tracking_url.
    """
    token = generate_urlsafe_token()
    owner_key = generate_owner_key()
    now = datetime.datetime.utcnow()
    expires_at = now + datetime.timedelta(hours=request.expires_hours or 24)

    session = TrackingSession(
        token=token,
        owner_key=owner_key,
        status="INITIALIZING",
        created_at=now,
        expires_at=expires_at,
        max_expected_speed_kmh=request.max_expected_speed_kmh or 120.0
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Base URL for tracking
    origin = req.headers.get("origin") or req.headers.get("host") or "localhost:5173"
    if not origin.startswith("http"):
        protocol = "https" if req.url.scheme == "https" else "http"
        origin = f"{protocol}://{origin}"

    tracking_url = f"{origin}/track/{token}"

    return SessionCreateResponse(
        token=session.token,
        secure_token=session.token,
        owner_key=session.owner_key,
        tracking_url=tracking_url,
        status=session.status,
        created_at=session.created_at,
        expires_at=session.expires_at
    )

@router.get("/api/sessions/{token}", response_model=SessionPublicResponse)
def get_public_session(token: str, db: Session = Depends(get_db)):
    """
    Validate public token for device tracking.
    """
    session = db.query(TrackingSession).filter(TrackingSession.token == token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Tracking session not found")

    if session.expires_at and datetime.datetime.utcnow() > session.expires_at:
        session.status = "EXPIRED"
        db.commit()

    return session

@router.get("/api/sessions/{token}/seed-location")
def get_seed_location(token: str, req: Request, db: Session = Depends(get_db)):
    """
    Provide instant simultaneous network/IP geolocation seed
    while GPS device is acquiring satellite lock.
    """
    session = db.query(TrackingSession).filter(TrackingSession.token == token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Tracking session not found")

    client_ip = req.client.host if req.client else None
    x_forwarded_for = req.headers.get("x-forwarded-for")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()

    seed = resolve_ip_geolocation_seed(client_ip)
    if not seed:
        return {"has_seed": False}
    return {"has_seed": True, "seed": seed}

@router.get("/api/sessions/owner/{owner_key}", response_model=OwnerDashboardResponse)
def get_owner_session(owner_key: str, db: Session = Depends(get_db)):
    """
    Section 23: Retrieve owner session state, history, quality, and stale telemetry.
    """
    session = db.query(TrackingSession).filter(TrackingSession.owner_key == owner_key).first()
    if not session:
        raise HTTPException(status_code=404, detail="Owner session not found")

    if session.expires_at and datetime.datetime.utcnow() > session.expires_at:
        session.status = "EXPIRED"
        db.commit()

    stale_status, seconds_ago = classify_stale_status(session.last_received_at)
    latest_quality = classify_accuracy_quality(session.latest_accuracy) if session.latest_accuracy else None

    # Retrieve valid history points (excluding outliers from map trail)
    points = db.query(LocationPoint).filter(
        LocationPoint.session_id == session.id,
        LocationPoint.is_outlier == False
    ).order_by(LocationPoint.recorded_at.asc()).limit(300).all()

    return OwnerDashboardResponse(
        token=session.token,
        secure_token=session.token,
        owner_key=session.owner_key,
        status=session.status,
        stale_status=stale_status,
        seconds_since_last_fix=seconds_ago,
        latest_latitude=session.latest_latitude,
        latest_longitude=session.latest_longitude,
        latest_accuracy=session.latest_accuracy,
        latest_speed=session.latest_speed,
        latest_heading=session.latest_heading,
        latest_timestamp=session.latest_timestamp,
        latest_quality=latest_quality,
        best_accuracy=session.best_accuracy,
        best_accuracy_latitude=session.best_accuracy_latitude,
        best_accuracy_longitude=session.best_accuracy_longitude,
        best_accuracy_timestamp=session.best_accuracy_timestamp,
        created_at=session.created_at,
        started_at=session.started_at,
        ended_at=session.ended_at,
        expires_at=session.expires_at,
        last_received_at=session.last_received_at,
        history=[LocationPointResponse.model_validate(p) for p in points]
    )

@router.post("/api/sessions/{token}/stop")
async def stop_sharing(token: str, db: Session = Depends(get_db)):
    """
    Section 26: Stop sharing location.
    """
    session = db.query(TrackingSession).filter(TrackingSession.token == token).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "STOPPED"
    session.ended_at = datetime.datetime.utcnow()
    db.commit()

    await manager.notify_device_disconnect(token)
    return {"status": "stopped", "message": "Location sharing stopped."}

@router.post("/api/sessions/owner/{owner_key}/end")
async def end_session(owner_key: str, db: Session = Depends(get_db)):
    """
    Owner explicitly terminates the session.
    """
    session = db.query(TrackingSession).filter(TrackingSession.owner_key == owner_key).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = "ENDED"
    session.ended_at = datetime.datetime.utcnow()
    db.commit()

    await manager.notify_session_ended(session.token)
    return {"status": "ended", "message": "Session ended successfully."}


# ==================== WEBSOCKETS ====================

@router.websocket("/ws/tracking/{token}")
async def ws_tracking_device(websocket: WebSocket, token: str):
    """
    Section 20: Device location broadcaster WebSocket.
    """
    db = SessionLocal()
    try:
        session = db.query(TrackingSession).filter(TrackingSession.token == token).first()
        if not session or session.status in ["ENDED", "EXPIRED"]:
            await websocket.close(code=4003, reason="Session invalid or ended")
            return

        await manager.connect_device(token, websocket)

        while True:
            try:
                data_str = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            try:
                msg = json.loads(data_str)
            except Exception:
                await websocket.send_json({"error": "Malformed JSON"})
                continue

            # Heartbeat handling
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong", "timestamp": int(datetime.datetime.utcnow().timestamp() * 1000)})
                continue

            # Validate location payload (supports both direct fields and nested {"data": {...}})
            try:
                loc_dict = msg.get("data") if ("data" in msg and isinstance(msg["data"], dict)) else msg
                payload = LocationPayload(**loc_dict)
            except Exception as e:
                await websocket.send_json({"error": f"Invalid coordinates payload: {str(e)}"})
                continue

            # Rate limiting
            if not manager.check_rate_limit(token):
                continue

            # Process through tracking service
            result = TrackingService.process_incoming_fix(db, session, payload)
            if result.get("ignored"):
                continue

            # Broadcast to dashboard
            await manager.broadcast_to_dashboards(token, result)

            # Ack back to device with quality classification
            await websocket.send_json({
                "status": "ack",
                "timestamp": payload.timestamp,
                "quality": result["data"]["quality"],
                "accuracy": payload.accuracy,
                "is_outlier": result.get("is_outlier", False)
            })

    except WebSocketDisconnect:
        logger.info(f"Device disconnected: {token}")
    except Exception as e:
        logger.exception(f"Error in tracking ws: {e}")
    finally:
        manager.disconnect_device(token, websocket)
        try:
            await manager.notify_device_disconnect(token)
        except Exception:
            pass
        db.close()


@router.websocket("/ws/dashboard/{owner_key}")
async def ws_dashboard_subscriber(websocket: WebSocket, owner_key: str):
    """
    Section 20: Dashboard live telemetry receiver WebSocket.
    """
    db = SessionLocal()
    token = None
    try:
        session = db.query(TrackingSession).filter(TrackingSession.owner_key == owner_key).first()
        if not session or session.status in ["ENDED", "EXPIRED"]:
            await websocket.close(code=4003, reason="Session invalid or ended")
            return

        token = session.token
        await manager.connect_dashboard(token, websocket)

        while True:
            text = await websocket.receive_text()
            try:
                msg = json.loads(text)
                if msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                pass

    except WebSocketDisconnect:
        logger.info("Dashboard websocket disconnected")
    except Exception as e:
        logger.exception(f"Error in dashboard ws: {e}")
    finally:
        if token:
            manager.disconnect_dashboard(token, websocket)
        db.close()
