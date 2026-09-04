export interface LocationPing {
  id?: number;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
  received_at?: string;
}

export interface SessionPublic {
  secure_token: string;
  title: string;
  is_active: boolean;
  device_connected: boolean;
  created_at: string;
  expires_at?: string | null;
}

export interface OwnerSession {
  secure_token: string;
  owner_key: string;
  title: string;
  is_active: boolean;
  device_connected: boolean;
  created_at: string;
  expires_at?: string | null;
  ended_at?: string | null;
  latest_ping?: LocationPing | null;
  history: LocationPing[];
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'error_denied'
  | 'error_unavailable'
  | 'error_network'
  | 'stopped'
  | 'session_ended';
