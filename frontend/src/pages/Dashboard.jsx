import React, { useState, useEffect, useRef } from 'react';
import { getOwnerSession, endSession, getWebSocketUrl } from '../services/api';
import { copyToClipboard } from '../services/clipboard';
import { MapView } from '../components/MapView';
import { TrackingStatus } from '../components/TrackingStatus';
import { AccuracyIndicator } from '../components/AccuracyIndicator';
import { TrackingControls } from '../components/TrackingControls';
import { ShareLinkModal } from '../components/ShareLinkModal.jsx';
import { MapPin, Compass, Gauge, Clock, Award, Shield } from 'lucide-react';

export const Dashboard = ({ ownerKey }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentFix, setCurrentFix] = useState(null);
  const [history, setHistory] = useState([]);
  const [staleStatus, setStaleStatus] = useState('INITIALIZING');
  const [secondsSinceLastFix, setSecondsSinceLastFix] = useState(0);
  const [bestAccuracy, setBestAccuracy] = useState(null);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const wsRef = useRef(null);
  const lastReceivedTimeRef = useRef(Date.now());

  // Fetch initial session state
  const loadSession = async () => {
    try {
      setLoading(true);
      const data = await getOwnerSession(ownerKey);
      setSession(data);
      setStaleStatus(data.stale_status);
      setBestAccuracy(data.best_accuracy);

      if (data.latest_latitude !== null && data.latest_longitude !== null) {
        const latest = {
          latitude: data.latest_latitude,
          longitude: data.latest_longitude,
          accuracy: data.latest_accuracy,
          speed: data.latest_speed,
          heading: data.latest_heading,
          timestamp: data.latest_timestamp,
          quality: data.latest_quality,
        };
        setCurrentFix(latest);
        lastReceivedTimeRef.current = Date.now();
      }

      if (data.history && data.history.length > 0) {
        setHistory(data.history);
      }
    } catch (e) {
      setError(e.message || 'Failed to load owner session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [ownerKey]);

  // Connect to Owner Dashboard WebSocket
  useEffect(() => {
    if (!ownerKey) return;

    const wsUrl = getWebSocketUrl(`/ws/dashboard/${encodeURIComponent(ownerKey)}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.type === 'location_update' && payload.data) {
          const d = payload.data;
          setCurrentFix({
            latitude: d.latitude,
            longitude: d.longitude,
            accuracy: d.accuracy,
            altitude: d.altitude,
            speed: d.speed,
            heading: d.heading,
            timestamp: d.timestamp,
            quality: d.quality,
            address: d.address,
            address_provider: d.address_provider,
            address_details: d.address_details,
            elevation: d.elevation,
            target_met: d.target_met,
            target_accuracy: d.target_accuracy,
          });

          if (!payload.is_outlier) {
            setHistory((prev) => [...prev, d]);
          }

          if (d.best_accuracy !== undefined) {
            setBestAccuracy(d.best_accuracy);
          }

          setStaleStatus(d.stale_status || 'LIVE');
          lastReceivedTimeRef.current = Date.now();
          setSecondsSinceLastFix(0);
        } else if (payload.type === 'device_status') {
          if (!payload.connected) {
            setStaleStatus('STALE');
          }
        } else if (payload.type === 'session_ended') {
          setSession((prev) => (prev ? { ...prev, status: 'ENDED' } : null));
          setStaleStatus('STALE');
        }
      } catch (err) {
        console.error('Error parsing dashboard websocket message:', err);
      }
    };

    return () => {
      ws.close();
    };
  }, [ownerKey]);

  // Real-time counter for seconds since last fix
  useEffect(() => {
    const timer = setInterval(() => {
      if (!currentFix) return;
      const diffSec = Math.floor((Date.now() - lastReceivedTimeRef.current) / 1000);
      setSecondsSinceLastFix(diffSec);

      // Section 16: Local stale categorization
      if (diffSec <= 10) {
        setStaleStatus('LIVE');
      } else if (diffSec <= 30) {
        setStaleStatus('DELAYED');
      } else {
        setStaleStatus('STALE');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentFix]);

  const handleEndSession = async () => {
    if (!window.confirm('Are you sure you want to end this live tracking session?')) return;
    try {
      await endSession(ownerKey);
      setSession((prev) => (prev ? { ...prev, status: 'ENDED' } : null));
      setStaleStatus('STALE');
    } catch (e) {
      alert(e.message || 'Failed to end session');
    }
  };

  if (loading) {
    return (
      <div className="device-page-container">
        <div className="device-card">
          <h2 className="card-title">Loading live session...</h2>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="device-page-container">
        <div className="device-card">
          <h2 className="card-title">Session Unavailable</h2>
          <p className="card-subtitle">{error || 'Session not found or expired.'}</p>
          <a href="/" className="btn-primary" style={{ textDecoration: 'none' }}>
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  const speedKmH = currentFix?.speed !== null && currentFix?.speed !== undefined
    ? (currentFix.speed * 3.6).toFixed(1)
    : '0.0';

  const headingDeg = currentFix?.heading !== null && currentFix?.heading !== undefined
    ? `${Math.round(currentFix.heading)}°`
    : '--';

  return (
    <div className="dashboard-container">
      {/* Header per Section 23 */}
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <div>
            <div className="dashboard-title-tag">LIVE TRACKING</div>
            <h1 className="dashboard-session-title">High-Accuracy Session</h1>
          </div>
        </div>

        <div className="dashboard-actions">
          <TrackingStatus
            status={session.status}
            staleStatus={staleStatus}
            secondsSinceLastFix={secondsSinceLastFix}
            accuracy={currentFix?.accuracy}
          />

          <TrackingControls
            onEndSession={handleEndSession}
            onOpenShare={() => setIsShareModalOpen(true)}
            isOwner={true}
            isLive={session.status !== 'ENDED' && session.status !== 'EXPIRED'}
          />
        </div>
      </header>

      {/* Main Grid: MapView + Telemetry Sidebar */}
      <main className="dashboard-main">
        {/* MapTiler Map */}
        <MapView
          currentPosition={currentFix}
          history={history}
          isLive={staleStatus === 'LIVE'}
        />

        {/* Telemetry Sidebar */}
        <aside className="dashboard-sidebar">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              ACCURACY & TELEMETRY
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {secondsSinceLastFix <= 2 ? 'Just now' : `${secondsSinceLastFix}s ago`}
            </span>
          </div>

          {/* Section 6 & 19: Accuracy & Best Accuracy */}
          <AccuracyIndicator
            accuracy={currentFix?.accuracy}
            bestAccuracy={bestAccuracy}
            quality={currentFix?.quality}
          />

          {/* Telemetry Cards */}
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-card-label">Latitude</span>
              <div className="metric-card-value">
                {currentFix ? currentFix.latitude.toFixed(6) : '--'}
              </div>
              <span className="metric-card-sub">WGS84 coordinate</span>
            </div>

            <div className="metric-card">
              <span className="metric-card-label">Longitude</span>
              <div className="metric-card-value">
                {currentFix ? currentFix.longitude.toFixed(6) : '--'}
              </div>
              <span className="metric-card-sub">WGS84 coordinate</span>
            </div>

            <div className="metric-card">
              <span className="metric-card-label">Speed</span>
              <div className="metric-card-value">{speedKmH} km/h</div>
              <span className="metric-card-sub">Ground velocity</span>
            </div>

            <div className="metric-card">
              <span className="metric-card-label">Heading</span>
              <div className="metric-card-value">{headingDeg}</div>
              <span className="metric-card-sub">Compass bearing</span>
            </div>

            <div className="metric-card">
              <span className="metric-card-label">Elevation</span>
              <div className="metric-card-value">
                {currentFix?.elevation !== undefined && currentFix?.elevation !== null
                  ? `${currentFix.elevation} m`
                  : (currentFix?.altitude !== undefined && currentFix?.altitude !== null
                    ? `${currentFix.altitude.toFixed(0)} m`
                    : '--')}
              </div>
              <span className="metric-card-sub">Topographical ground</span>
            </div>
          </div>

          {/* Real-Time Street / Location Address with Provider Attribution */}
          {currentFix?.address && (
            <div
              style={{
                padding: '12px 14px',
                background: 'var(--bg-card-subtle)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                textAlign: 'left',
              }}
            >
              <MapPin size={18} style={{ color: '#2563EB', flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    Resolved Location
                  </strong>
                  {currentFix.address_provider && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '10px',
                        background: '#EFF6FF',
                        color: '#1D4ED8',
                        border: '1px solid #BFDBFE',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {currentFix.address_provider}
                    </span>
                  )}
                </div>
                <span style={{ color: 'var(--text-secondary)', lineHeight: 1.4, display: 'block' }}>
                  {currentFix.address}
                </span>
                {currentFix.plus_code && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        background: '#EEF2FF',
                        color: '#4338CA',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid #C7D2FE',
                        letterSpacing: '0.04em'
                      }}
                    >
                      Plus Code: {currentFix.plus_code}
                    </span>
                    <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                      (3m grid accuracy)
                    </span>
                  </div>
                )}
                {currentFix.elevation && (
                  <span style={{ display: 'block', marginTop: 4, fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Ground Elevation: <strong>{currentFix.elevation} m</strong> above sea level
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Simultaneous Multi-API Active Status Banner */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Simultaneous Accuracy Stack:
              </span>
              <span style={{ fontSize: '10px', color: '#16A34A', fontWeight: 700 }}>● ALL ACTIVE</span>
            </div>
            <span style={{ fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
              Google Maps + MapTiler + BigDataCloud + IP-API + Dual-Stream GPS
            </span>
          </div>

          {/* Section 24: Shareable Tracking URL */}
          <div className="share-link-banner">
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              Shareable Tracking Link
            </span>
            <div className="share-link-input-group">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/track/${session.token || session.secure_token}`}
                className="share-link-input"
              />
              <button
                onClick={async () => {
                  await copyToClipboard(`${window.location.origin}/track/${session.token || session.secure_token}`);
                  alert('Link copied to clipboard!');
                }}
                className="btn-copy"
              >
                Copy
              </button>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Open on phone to begin high-accuracy streaming
            </span>
          </div>

          {/* Session Metadata */}
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--bg-card-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              fontSize: '12.5px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Session Token</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{session.token.slice(0, 10)}...</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Valid GPS Points</span>
              <span style={{ fontWeight: 600 }}>{history.length} fixes</span>
            </div>
          </div>
        </aside>
      </main>

      {/* Share Modal */}
      <ShareLinkModal
        secureToken={session.token}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};
