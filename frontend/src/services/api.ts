import { OwnerSession, SessionPublic } from '../types';

export const getBackendBaseUrl = (): string => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//${hostname}:8000`;
  }
  return '';
};

export const getWebSocketUrl = (endpointPath: string): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  const host = (hostname === 'localhost' || hostname === '127.0.0.1')
    ? `${hostname}:8000`
    : window.location.host;
  return `${protocol}//${host}${endpointPath}`;
};

const API_BASE = `${getBackendBaseUrl()}/api`;

export async function createSession(title?: string, expiresHours: number = 24): Promise<OwnerSession> {
  // First try direct backend URL, fallback to relative proxy /api/sessions
  const urls = [`${API_BASE}/sessions`, '/api/sessions'];
  let lastError: any = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'Live Tracking Session', expires_hours: expiresHours }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError?.message || 'Failed to connect to backend server. Make sure backend is running on port 8000.');
}

export async function getPublicSession(secureToken: string): Promise<SessionPublic> {
  const urls = [
    `${API_BASE}/sessions/${encodeURIComponent(secureToken)}`,
    `/api/sessions/${encodeURIComponent(secureToken)}`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  throw new Error('Failed to load session');
}

export async function stopDeviceSharing(secureToken: string): Promise<void> {
  const urls = [
    `${API_BASE}/sessions/${encodeURIComponent(secureToken)}/stop`,
    `/api/sessions/${encodeURIComponent(secureToken)}/stop`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) return;
    } catch (e) {}
  }
}

export async function getOwnerSession(ownerKey: string): Promise<OwnerSession> {
  const urls = [
    `${API_BASE}/sessions/owner/${encodeURIComponent(ownerKey)}`,
    `/api/sessions/owner/${encodeURIComponent(ownerKey)}`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  throw new Error('Failed to load owner session');
}

export async function endOwnerSession(ownerKey: string): Promise<void> {
  const urls = [
    `${API_BASE}/sessions/owner/${encodeURIComponent(ownerKey)}/end`,
    `/api/sessions/owner/${encodeURIComponent(ownerKey)}/end`
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) return;
    } catch (e) {}
  }
  throw new Error('Failed to end session');
}
