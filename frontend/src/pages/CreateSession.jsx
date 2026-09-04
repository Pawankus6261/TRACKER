import React, { useState, useEffect } from 'react';
import { createSession } from '../services/api';
import { copyToClipboard } from '../services/clipboard';
import { ArrowRight, Copy, Check, Smartphone, RefreshCw, Radio, Shield } from 'lucide-react';

export const CreateSession = ({ onSessionCreated }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [resumeKey, setResumeKey] = useState('');

  const generateSession = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await createSession(120.0, 24);
      setSession(data);
    } catch (e) {
      setError(e.message || 'Failed to initialize session');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateSession();
  }, []);

  const sessionToken = session?.token || session?.secure_token || '';
  const shareUrl = sessionToken
    ? `${window.location.origin}/track/${sessionToken}`
    : (session?.tracking_url || '');

  const qrApiUrl = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}&color=0f172a`
    : '';

  const handleCopy = async () => {
    if (!shareUrl) return;
    await copyToClipboard(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenDashboard = () => {
    if (session) {
      onSessionCreated(session.owner_key);
    }
  };

  const handleResume = (e) => {
    e.preventDefault();
    if (!resumeKey.trim()) return;
    onSessionCreated(resumeKey.trim());
  };

  return (
    <div className="device-page-container">
      <div className="device-card" style={{ maxWidth: '460px' }}>
        {loading && !session && (
          <div style={{ padding: '30px 0', textAlign: 'center' }}>
            <div className="card-icon-wrapper radar animate-pulse-radar" style={{ margin: '0 auto 20px auto' }}>
              <Radio size={28} />
            </div>
            <h1 className="card-title" style={{ fontSize: '20px' }}>Generating Live Link...</h1>
            <p className="card-subtitle" style={{ fontSize: '14px' }}>
              Creating your high-accuracy tracking session.
            </p>
          </div>
        )}

        {error && (
          <div style={{ width: '100%', textAlign: 'center' }}>
            <div
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#FEF2F2',
                color: '#B91C1C',
                borderRadius: '10px',
                fontSize: '13px',
                marginBottom: '18px',
                border: '1px solid #FCA5A5',
              }}
            >
              {error}
            </div>
            <button className="btn-primary" onClick={generateSession}>
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        )}

        {session && sessionToken && (
          <>
            <div className="card-icon-wrapper success animate-pulse-green">
              <Smartphone size={28} />
            </div>

            <h1 className="card-title">Shareable Link Ready</h1>
            <p className="card-subtitle" style={{ marginBottom: '18px', fontSize: '14px' }}>
              Share this link with any phone or device to start high-accuracy GPS tracking.
            </p>

            {/* Generated Link Box */}
            <div
              style={{
                width: '100%',
                background: 'var(--bg-card-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                marginBottom: '16px',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>
                Tracking URL (High-Accuracy)
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    background: 'white',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleCopy}
                  className="btn-primary"
                  style={{
                    width: 'auto',
                    padding: '0 14px',
                    height: '38px',
                    fontSize: '13px',
                    background: copied ? '#10B981' : 'var(--primary)',
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* QR Code preview */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                background: 'white',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px',
                marginBottom: '20px',
                textAlign: 'left',
              }}
            >
              <img
                src={qrApiUrl}
                alt="QR Code"
                style={{ width: '70px', height: '70px', borderRadius: '6px', border: '1px solid #E2E8F0' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Scan on Phone
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Point your camera to open tracking on mobile with high accuracy.
                </div>
              </div>
            </div>

            {/* Dominant Primary Action: Open Dashboard */}
            <div className="cta-group">
              <button
                id="btn-open-dashboard"
                className="btn-primary"
                onClick={handleOpenDashboard}
                style={{ height: '52px', fontSize: '16px' }}
              >
                Open Live Map Dashboard
                <ArrowRight size={18} />
              </button>

              <button
                className="btn-secondary"
                onClick={generateSession}
                disabled={loading}
                style={{ fontSize: '13px' }}
              >
                <RefreshCw size={14} style={{ marginRight: 6 }} />
                Generate Another Link
              </button>
            </div>

            {/* Resume existing session */}
            <div
              style={{
                width: '100%',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '16px',
                marginTop: '16px',
              }}
            >
              <form onSubmit={handleResume} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Or enter existing Owner Key"
                  value={resumeKey}
                  onChange={(e) => setResumeKey(e.target.value)}
                  style={{
                    flex: 1,
                    height: '38px',
                    padding: '0 12px',
                    fontSize: '12.5px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    background: 'white',
                  }}
                />
                <button
                  type="submit"
                  className="btn-secondary"
                  style={{ height: '38px', border: '1px solid var(--border-subtle)', padding: '0 12px', fontSize: '12.5px' }}
                >
                  Open
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
