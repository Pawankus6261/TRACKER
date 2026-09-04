import time
import json
import logging
from typing import Dict, Set
from fastapi import WebSocket
from app.config import settings

logger = logging.getLogger("websocket_manager")

class TrackingConnectionManager:
    def __init__(self):
        # token -> WebSocket (device broadcaster)
        self.device_connections: Dict[str, WebSocket] = {}
        # token -> Set[WebSocket] (dashboard subscribers)
        self.dashboard_subscribers: Dict[str, Set[WebSocket]] = {}
        # rate limiting: token -> float epoch seconds
        self.last_ping_time: Dict[str, float] = {}

    async def connect_device(self, token: str, websocket: WebSocket):
        await websocket.accept()
        if token in self.device_connections:
            old_ws = self.device_connections[token]
            try:
                await old_ws.close(code=1000, reason="Replaced by new connection")
            except Exception:
                pass
        self.device_connections[token] = websocket
        logger.info(f"Device connected for token: {token}")

        # Broadcast device online status
        await self.broadcast_to_dashboards(token, {
            "type": "device_status",
            "connected": True,
            "status": "SEARCHING",
            "message": "Device connected, acquiring GPS fix..."
        })

    def disconnect_device(self, token: str, websocket: WebSocket):
        if self.device_connections.get(token) == websocket:
            del self.device_connections[token]
            logger.info(f"Device disconnected for token: {token}")

    async def notify_device_disconnect(self, token: str):
        await self.broadcast_to_dashboards(token, {
            "type": "device_status",
            "connected": False,
            "status": "STALE",
            "message": "Device disconnected"
        })

    async def connect_dashboard(self, token: str, websocket: WebSocket):
        await websocket.accept()
        if token not in self.dashboard_subscribers:
            self.dashboard_subscribers[token] = set()
        self.dashboard_subscribers[token].add(websocket)
        logger.info(f"Dashboard subscriber connected for token: {token}")

        is_device_online = token in self.device_connections
        await websocket.send_json({
            "type": "connection_init",
            "device_online": is_device_online,
            "message": "Connected to real-time telemetry stream"
        })

    def disconnect_dashboard(self, token: str, websocket: WebSocket):
        if token in self.dashboard_subscribers:
            self.dashboard_subscribers[token].discard(websocket)
            if not self.dashboard_subscribers[token]:
                del self.dashboard_subscribers[token]
            logger.info(f"Dashboard subscriber disconnected for token: {token}")

    def check_rate_limit(self, token: str) -> bool:
        now = time.time()
        last = self.last_ping_time.get(token, 0.0)
        if now - last < settings.MIN_PING_INTERVAL_SEC:
            return False
        self.last_ping_time[token] = now
        return True

    async def broadcast_to_dashboards(self, token: str, payload: dict):
        subscribers = self.dashboard_subscribers.get(token, set())
        if not subscribers:
            return

        dead_sockets = set()
        for ws in subscribers:
            try:
                await ws.send_json(payload)
            except Exception as e:
                logger.warning(f"Error broadcasting to dashboard websocket: {e}")
                dead_sockets.add(ws)

        for dead in dead_sockets:
            subscribers.discard(dead)
        if not subscribers and token in self.dashboard_subscribers:
            del self.dashboard_subscribers[token]

    async def notify_session_ended(self, token: str):
        await self.broadcast_to_dashboards(token, {
            "type": "session_ended",
            "message": "Session has been ended."
        })
        if token in self.device_connections:
            ws = self.device_connections[token]
            try:
                await ws.send_json({"type": "session_ended", "message": "Session ended."})
                await ws.close(code=1000, reason="Session ended")
            except Exception:
                pass
            del self.device_connections[token]

manager = TrackingConnectionManager()
