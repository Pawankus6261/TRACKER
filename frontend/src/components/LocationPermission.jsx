import React from 'react';
import { Radio, ArrowRight, Shield, Compass, CheckCircle } from 'lucide-react';

export const LocationPermission = ({ onConnect, onCancel }) => {
  const [showInsecureHelp, setShowInsecureHelp] = React.useState(false);
  const isInsecureRemote = typeof window !== 'undefined' && !window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  return (
    <div className="device-card">
      <div className="card-icon-wrapper radar animate-pulse-radar">
        <Radio size={28} />
      </div>

      <h1 className="card-title">Connect This Device</h1>
      <p className="card-subtitle">
        Activate this device for the current live session.
      </p>

      {/* Section 13: Setup tips for phone */}
      <div
        style={{
          width: '100%',
          background: 'var(--bg-card-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '14px',
          marginBottom: '20px',
          textAlign: 'left',
          fontSize: '12.5px',
        }}
      >
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Compass size={15} /> For the best accuracy:
        </div>
        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '5px', color: 'var(--text-secondary)' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
            Turn on device Location
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
            Enable high-accuracy location services
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
            Keep this page open
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />
            Prefer outdoor / open-sky conditions
          </li>
        </ul>
      </div>

      {isInsecureRemote && (
        <div
          style={{
            width: '100%',
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: '10px',
            padding: '10px 12px',
            marginBottom: '16px',
            textAlign: 'left',
            fontSize: '12px',
            color: '#B45309',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>📱 Mobile Wi-Fi Notice</span>
            <button
              type="button"
              onClick={() => setShowInsecureHelp(!showInsecureHelp)}
              style={{
                background: 'none',
                border: 'none',
                color: '#B45309',
                textDecoration: 'underline',
                cursor: 'pointer',
                fontSize: '11.5px',
                fontWeight: 600,
              }}
            >
              {showInsecureHelp ? 'Hide guide' : 'If GPS blocked?'}
            </button>
          </div>
          {showInsecureHelp && (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #FDE68A', fontSize: '11.5px', lineHeight: 1.45 }}>
              Mobile browsers block GPS on HTTP addresses. In Chrome on your phone:
              <ol style={{ paddingLeft: '16px', margin: '4px 0 0 0' }}>
                <li>Open <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
                <li>Add <code>{window.location.origin}</code> &amp; enable</li>
                <li>Tap <strong>Relaunch</strong></li>
              </ol>
            </div>
          )}
        </div>
      )}

      <p className="card-disclosure">
        Position access is required to keep the session updated.
      </p>

      <div className="cta-group">
        <button
          id="btn-connect-continue"
          className="btn-primary"
          onClick={onConnect}
          style={{ height: '50px', fontSize: '15px' }}
        >
          Connect & Continue
          <ArrowRight size={16} />
        </button>

        <button
          id="btn-cancel"
          className="btn-secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      {/* Section 28: Accuracy Disclosure */}
      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '20px', lineHeight: 1.4 }}>
        GPS accuracy depends on your device, location services, signal conditions, and surrounding environment.
      </div>
    </div>
  );
};
