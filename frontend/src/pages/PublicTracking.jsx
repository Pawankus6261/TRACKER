import React, { useState, useEffect, useRef } from 'react';
import { LocationPermission } from '../components/LocationPermission';
import { AccuracyIndicator } from '../components/AccuracyIndicator';
import { TrackingStatus } from '../components/TrackingStatus';
import { TrackingControls } from '../components/TrackingControls';
import { DualStreamGPSTracker, isBetterLocation, evaluateTargetAccuracy } from '../services/geolocation';
import { TrackingWebSocketClient } from '../services/websocket';
import { stopSharing, getPublicSession } from '../services/api';
import { copyToClipboard } from '../services/clipboard';
import { AlertCircle, MapPinOff, RefreshCw, CheckCircle2, Radio, Copy, Check, HelpCircle, Download } from 'lucide-react';

export const PublicTracking = ({ token }) => {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('INITIALIZING');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [bestAccuracy, setBestAccuracy] = useState(null);
  const [quality, setQuality] = useState('Unknown');
  const [errorMessage, setErrorMessage] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [installDone, setInstallDone] = useState(false);

  const trackerRef = useRef(null);
  const wsClientRef = useRef(null);
  const deferredInstallPrompt = useRef(null);

  const bestLocationRef = useRef(null);

  // Validate session on load
  useEffect(() => {
    getPublicSession(token)
      .then((s) => {
        setSession(s);
        if (s.status === 'ENDED' || s.status === 'EXPIRED') {
          setStatus(s.status);
        }
      })
      .catch((err) => {
        setStatus('ERROR');
        setErrorMessage(err.message || 'Tracking session not found or invalid.');
      });

    return () => {
      cleanup();
    };
  }, [token]);

  // Capture the PWA install prompt (Android Chrome fires this automatically)
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      deferredInstallPrompt.current = e;
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredInstallPrompt.current) return;
    deferredInstallPrompt.current.prompt();
    const { outcome } = await deferredInstallPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setInstallDone(true);
      setShowInstallBanner(false);
    }
    deferredInstallPrompt.current = null;
  };

  const cleanup = () => {
    if (trackerRef.current) {
      trackerRef.current.stop();
      trackerRef.current = null;
    }
    if (wsClientRef.current) {
      wsClientRef.current.close();
      wsClientRef.current = null;
    }
  };

  const handleStartTracking = () => {
    setHasStarted(true);
    setStatus('SEARCHING');
    setErrorMessage('');

    // 1. Connect WebSocket client
    const ws = new TrackingWebSocketClient(token, {
      onAck: (ack) => {
        if (ack.quality) setQuality(ack.quality);
      },
      onSessionEnded: () => {
        cleanup();
        setStatus('ENDED');
      },
      onReconnecting: () => {
        setStatus('RECONNECTING');
      },
      onConnected: () => {
        if (bestLocationRef.current) {
          setStatus(bestLocationRef.current.accuracy > 100 ? 'LOW_ACCURACY' : 'LIVE');
        } else {
          setStatus('SEARCHING');
        }
      },
    });
    ws.connect();
    wsClientRef.current = ws;

    // 2. Start ultra-fast 4-phase GPS tracking (network seed + burst salvo + watch + recalibration)
    const tracker = new DualStreamGPSTracker(
      (newFix) => {
        // Ignore extremely coarse IP-based seeds (> 50,000m) — don't display on map
        const isUsableFix = newFix.accuracy <= 50000;

        const isBetter = isBetterLocation(newFix, bestLocationRef.current);

        if (isBetter || !bestLocationRef.current) {
          bestLocationRef.current = newFix;

          if (isUsableFix) {
            setCurrentLocation(newFix);
          }

          // Update best accuracy tracker (only with real fixes)
          if (isUsableFix) {
            setBestAccuracy((prev) => {
              if (prev === null || newFix.accuracy < prev) return newFix.accuracy;
              return prev;
            });
          }

          // Status: LIVE once accuracy ≤ 50m, else LOW_ACCURACY, else stay SEARCHING
          if (newFix.accuracy <= 50) {
            setStatus('LIVE');
          } else if (newFix.accuracy <= 5000) {
            setStatus('LOW_ACCURACY');
          }
          // else: keep SEARCHING until a usable fix arrives
        }

        // Only stream real fixes (not 200km IP noise) through WebSocket
        if (wsClientRef.current && newFix.accuracy <= 5000) {
          wsClientRef.current.sendFix(newFix);
        }
      },
      (geoError) => {
        console.warn('Geolocation error:', geoError);
        if (geoError.code === 1) { // PERMISSION_DENIED
          setStatus('ERROR_DENIED');
        } else if (geoError.code === 2 || geoError.code === 3) { // POSITION_UNAVAILABLE or TIMEOUT
          setStatus('ERROR_UNAVAILABLE');
          setErrorMessage('Location unavailable. Make sure your device Location is enabled and retry from an area with better GPS reception.');
        } else {
          setStatus('ERROR_UNAVAILABLE');
          setErrorMessage(geoError.message || 'Unable to determine device position.');
        }
        cleanup();
      }
    );

    tracker.start();
    trackerRef.current = tracker;
  };

  const handleStop = async () => {
    cleanup();
    setStatus('STOPPED');
    try {
      await stopSharing(token);
    } catch (e) {
      // Ignored
    }
  };

  const handleCancel = () => {
    cleanup();
    setStatus('STOPPED');
  };

  const handleRetry = () => {
    cleanup();
    handleStartTracking();
  };

  return (
    <div className="device-page-container">
      {/* 1. Initial Screen: Permission Request */}
      {!hasStarted && (status === 'INITIALIZING' || status === 'SEARCHING') && (
        <LocationPermission
          onConnect={handleStartTracking}
          onCancel={handleCancel}
        />
      )}

      {/* 2. Active Tracking Screen (Searching / Low Accuracy / Live) */}
      {hasStarted && (status === 'SEARCHING' || status === 'LOW_ACCURACY' || status === 'LIVE' || status === 'RECONNECTING') && (
        <div className="device-card">
          <div className="card-icon-wrapper success animate-pulse-green">
            <CheckCircle2 size={32} />
          </div>

          <h1 className="card-title" style={{ marginBottom: 6 }}>
            {status === 'LIVE' ? 'Device Connected' : status === 'LOW_ACCURACY' ? 'Refining GPS Fix' : 'Locking Satellites...'}
          </h1>

          <div style={{ marginBottom: 20 }}>
            <TrackingStatus
              status={status}
              staleStatus="LIVE"
              accuracy={currentLocation?.accuracy}
            />
          </div>

          {/* Satellite lock progress hint while searching */}
          {status === 'SEARCHING' && !currentLocation && (
            <div style={{
              width: '100%',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '14px 16px',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '12.5px', color: '#64748B', marginBottom: '10px', fontWeight: 500 }}>
                📡 Firing GPS burst — acquiring satellites...
              </div>
              {/* Animated progress bar */}
              <div style={{ height: '4px', background: '#E2E8F0', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 50%, #3B82F6 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'gpsSearchBar 1.6s ease-in-out infinite',
                  borderRadius: '99px',
                  width: '60%',
                }} />
              </div>
              <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '8px' }}>
                Hold phone near a window or step outside for faster lock
              </div>
            </div>
          )}

          {/* Section 6 & 22: Exact raw accuracy and quality */}
          {currentLocation && (
            <div style={{ width: '100%', marginBottom: 20 }}>
              <AccuracyIndicator
                accuracy={currentLocation.accuracy}
                bestAccuracy={bestAccuracy}
                quality={quality}
              />
            </div>
          )}

          {/* Telemetry rows */}
          {currentLocation && (
            <div className="connected-metrics-box" style={{ marginBottom: 20 }}>
              <div className="metric-row">
                <span className="metric-label">Latitude:</span>
                <span className="metric-value">{currentLocation.latitude.toFixed(6)}</span>
              </div>
              <div className="metric-row">
                <span className="metric-label">Longitude:</span>
                <span className="metric-value">{currentLocation.longitude.toFixed(6)}</span>
              </div>
              {currentLocation.speed !== null && (
                <div className="metric-row">
                  <span className="metric-label">Speed:</span>
                  <span className="metric-value">{(currentLocation.speed * 3.6).toFixed(1)} km/h</span>
                </div>
              )}

            </div>
          )}

          {/* PWA Install Banner: shown when Android Chrome offers install */}
          {showInstallBanner && !installDone && (
            <div
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                borderRadius: '14px',
                padding: '14px 16px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <img src="/icon-512.png" alt="app" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginBottom: 2 }}>
                  Install Live Tracker
                </div>
                <div style={{ fontSize: '11.5px', color: '#94A3B8', lineHeight: 1.35 }}>
                  Track in background even when Chrome is closed
                </div>
              </div>
              <button
                onClick={handleInstallPWA}
                style={{
                  background: '#3B82F6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  flexShrink: 0,
                }}
              >
                <Download size={13} /> Install
              </button>
            </div>
          )}

          {/* Background tracking active notice */}
          {installDone && (
            <div style={{
              width: '100%',
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: '10px',
              padding: '10px 14px',
              marginBottom: '14px',
              fontSize: '12.5px',
              color: '#065F46',
              fontWeight: 600,
            }}>
              ✅ App installed! Tracking continues in background even with screen off.
            </div>
          )}

          {/* Section 26: Stop Sharing Control */}
          <div style={{ width: '100%' }}>
            <TrackingControls onStopSharing={handleStop} isOwner={false} isLive={true} />
          </div>
        </div>
      )}


      {/* 3. Error: Permission Denied or Insecure Context */}
      {status === 'ERROR_DENIED' && (
        <div className="device-card" style={{ maxWidth: '440px' }}>
          <div className="card-icon-wrapper error">
            <AlertCircle size={30} />
          </div>
          <h1 className="card-title">Location Access Blocked</h1>
          <p className="card-subtitle" style={{ marginBottom: '16px' }}>
            {!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
              ? 'Mobile browsers (Chrome / Safari) strictly require HTTPS or a developer flag to access GPS over local Wi-Fi.'
              : 'Your browser denied location access. Permission is required to stream real-time GPS coordinates.'}
          </p>

          {!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? (
            <div
              style={{
                background: '#FEF3C7',
                border: '1px solid #F59E0B',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '20px',
                textAlign: 'left',
                fontSize: '12.5px',
                color: '#92400E',
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                ⚡ Quick 30-Second Fix in Mobile Chrome:
              </div>
              <ol style={{ paddingLeft: '18px', margin: '6px 0 10px 0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <li>
                  Open a new tab in Chrome on your phone and go to:
                  <div style={{ marginTop: '2px', wordBreak: 'break-all' }}>
                    <code style={{ background: '#FDE68A', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
                      chrome://flags/#unsafely-treat-insecure-origin-as-secure
                    </code>
                  </div>
                </li>
                <li>
                  In the text box, enter this address:
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <code style={{ background: '#FDE68A', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
                      {window.location.origin}
                    </code>
                    <button
                      onClick={async () => {
                        await copyToClipboard(window.location.origin);
                        alert('Copied URL! Paste it in the Chrome flags box.');
                      }}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: '1px solid #D97706',
                        background: 'white',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: '#B45309',
                      }}
                    >
                      Copy URL
                    </button>
                  </div>
                </li>
                <li>
                  Set the dropdown to <strong>Enabled</strong> and tap <strong>Relaunch</strong> at the bottom.
                </li>
                <li>
                  Reopen this page and tap <strong>Try Again</strong> below — Chrome will now prompt for GPS!
                </li>
              </ol>
            </div>
          ) : (
            <div
              style={{
                background: 'var(--bg-card-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '12px 14px',
                marginBottom: '20px',
                textAlign: 'left',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
              }}
            >
              <strong>How to unblock:</strong> Tap the lock or tune icon (⚙️) on the left side of your browser address bar, set <strong>Location</strong> to <strong>Allow</strong>, then tap Try Again.
            </div>
          )}

          <div className="cta-group">
            <button className="btn-primary" onClick={handleRetry}>
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        </div>
      )}

      {/* 4. Error: GPS Unavailable */}
      {status === 'ERROR_UNAVAILABLE' && (
        <div className="device-card">
          <div className="card-icon-wrapper error">
            <MapPinOff size={30} />
          </div>
          <h1 className="card-title">Location Unavailable</h1>
          <p className="card-subtitle">
            {errorMessage || 'Make sure your device Location is enabled and retry from an area with better GPS reception.'}
          </p>
          <div className="cta-group">
            <button className="btn-primary" onClick={handleRetry}>
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        </div>
      )}

      {/* 5. Stopped / Ended */}
      {(status === 'STOPPED' || status === 'ENDED' || status === 'EXPIRED') && (
        <div className="device-card">
          <h1 className="card-title">
            {status === 'ENDED' ? 'Session Ended' : 'Location Sharing Stopped'}
          </h1>
          <p className="card-subtitle">
            {status === 'ENDED'
              ? 'The session has been ended by the owner.'
              : 'This device is no longer sharing position updates.'}
          </p>
          <div className="cta-group">
            <button className="btn-primary" onClick={() => { setHasStarted(false); setStatus('INITIALIZING'); }}>
              Reconnect Device
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
