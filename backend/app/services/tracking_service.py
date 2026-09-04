import datetime
import logging
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from app.models import TrackingSession, LocationPoint
from app.schemas.location import LocationPayload
from app.services.location_service import (
    detect_outlier,
    classify_accuracy_quality,
    classify_stale_status,
    get_address_from_coords,
    resolve_simultaneous_address,
    resolve_simultaneous_elevation,
    evaluate_target_accuracy
)

logger = logging.getLogger("tracking_service")

class TrackingService:
    @staticmethod
    def process_incoming_fix(
        db: Session,
        session: TrackingSession,
        payload: LocationPayload
    ) -> Dict[str, Any]:
        """
        Process an incoming location fix strictly per Sections 4, 9, 10, 19, 20:
        1. Duplicate detection
        2. Outlier detection via Haversine speed
        3. Quality classification
        4. Storing actual received point (never interpolated)
        5. Updating latest & best accuracy
        6. Returning broadcast payload
        """
        now = datetime.datetime.utcnow()

        # 1. Duplicate detection: same coords and timestamp
        if (
            session.latest_latitude == payload.latitude
            and session.latest_longitude == payload.longitude
            and session.latest_timestamp == payload.timestamp
        ):
            return {"status": "duplicate", "ignored": True}

        # 2. Outlier detection
        is_outlier, distance_m, est_speed_kmh = detect_outlier(
            prev_lat=session.latest_latitude,
            prev_lon=session.latest_longitude,
            prev_timestamp=session.latest_timestamp,
            new_lat=payload.latitude,
            new_lon=payload.longitude,
            new_timestamp=payload.timestamp,
            max_expected_speed_kmh=session.max_expected_speed_kmh
        )

        quality = classify_accuracy_quality(payload.accuracy)

        # 3. Store the actual point in the database
        point = LocationPoint(
            session_id=session.id,
            latitude=payload.latitude,
            longitude=payload.longitude,
            accuracy=payload.accuracy,
            altitude=payload.altitude,
            altitude_accuracy=payload.altitudeAccuracy,
            speed=payload.speed,
            heading=payload.heading,
            recorded_at=payload.timestamp,
            received_at=now,
            quality=quality,
            is_outlier=is_outlier
        )
        db.add(point)

        # 4. If not an outlier, update latest and evaluate best accuracy
        if not is_outlier:
            session.latest_latitude = payload.latitude
            session.latest_longitude = payload.longitude
            session.latest_accuracy = payload.accuracy
            session.latest_speed = payload.speed
            session.latest_heading = payload.heading
            session.latest_timestamp = payload.timestamp
            session.last_received_at = now

            # If this is the first fix, mark started_at
            if not session.started_at:
                session.started_at = now

            # Section 19: Update best accuracy if improved
            if session.best_accuracy is None or payload.accuracy < session.best_accuracy:
                session.best_accuracy = payload.accuracy
                session.best_accuracy_latitude = payload.latitude
                session.best_accuracy_longitude = payload.longitude
                session.best_accuracy_timestamp = payload.timestamp

            # Section 7: Update status
            if payload.accuracy > 100:
                session.status = "LOW_ACCURACY"
            else:
                session.status = "LIVE"
        else:
            logger.warning(
                f"GPS jump detected for session {session.token}: "
                f"Distance={distance_m:.1f}m, Speed={est_speed_kmh:.1f}km/h > Max={session.max_expected_speed_kmh}km/h"
            )

        db.commit()
        db.refresh(session)

        stale_status, seconds_ago = classify_stale_status(session.last_received_at)
        address_info = resolve_simultaneous_address(payload.latitude, payload.longitude)
        elevation = resolve_simultaneous_elevation(payload.latitude, payload.longitude)
        target_info = evaluate_target_accuracy(payload.accuracy, target_threshold_meters=30.0)

        # Use device altitude or fall back to simultaneous topographical ground elevation
        effective_altitude = payload.altitude if payload.altitude is not None else elevation

        return {
            "type": "location_update",
            "is_outlier": is_outlier,
            "data": {
                "latitude": payload.latitude,
                "longitude": payload.longitude,
                "accuracy": payload.accuracy,
                "altitude": effective_altitude,
                "altitudeAccuracy": payload.altitudeAccuracy,
                "speed": payload.speed,
                "heading": payload.heading,
                "timestamp": payload.timestamp,
                "quality": quality,
                "address": address_info.get("address"),
                "address_provider": address_info.get("provider"),
                "plus_code": address_info.get("plus_code"),
                "address_details": address_info,
                "elevation": elevation,
                "target_met": target_info.get("target_met"),
                "target_accuracy": target_info,
                "status": session.status,
                "stale_status": stale_status,
                "seconds_since_last_fix": seconds_ago or 0,
                "best_accuracy": session.best_accuracy,
                "best_accuracy_latitude": session.best_accuracy_latitude,
                "best_accuracy_longitude": session.best_accuracy_longitude
            }
        }
