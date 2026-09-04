import { getWebSocketUrl } from './api';

export class TrackingWebSocketClient {
  constructor(token, callbacks = {}) {
    this.token = token;
    this.callbacks = callbacks;
    this.ws = null;
    this.isClosedManually = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.heartbeatInterval = null;
    this.lastSentCoords = null;
  }

  connect() {
    this.isClosedManually = false;
    const url = getWebSocketUrl(`/ws/tracking/${encodeURIComponent(this.token)}`);

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      if (this.callbacks.onError) this.callbacks.onError(e);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      if (this.callbacks.onConnected) this.callbacks.onConnected();
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'session_ended') {
          if (this.callbacks.onSessionEnded) this.callbacks.onSessionEnded(msg.message);
          this.close();
        } else if (msg.status === 'ack') {
          if (this.callbacks.onAck) this.callbacks.onAck(msg);
        }
      } catch (err) {
        // Ignored
      }
    };

    this.ws.onclose = (event) => {
      this.stopHeartbeat();
      if (!this.isClosedManually) {
        if (this.callbacks.onDisconnected) this.callbacks.onDisconnected(event);
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      if (this.callbacks.onError) this.callbacks.onError(err);
    };
  }

  sendFix(locationFix) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Section 12: Duplicate coordinate prevention
    if (
      this.lastSentCoords &&
      this.lastSentCoords.latitude === locationFix.latitude &&
      this.lastSentCoords.longitude === locationFix.longitude &&
      locationFix.timestamp - this.lastSentCoords.timestamp < 1000
    ) {
      return false; // Skip redundant duplicate ping
    }

    this.lastSentCoords = locationFix;
    this.ws.send(JSON.stringify(locationFix));
    return true;
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.isClosedManually) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.callbacks.onMaxReconnectReached) this.callbacks.onMaxReconnectReached();
      return;
    }

    this.reconnectAttempts += 1;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    if (this.callbacks.onReconnecting) this.callbacks.onReconnecting(this.reconnectAttempts, delay);

    setTimeout(() => {
      if (!this.isClosedManually) {
        this.connect();
      }
    }, delay);
  }

  close() {
    this.isClosedManually = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
