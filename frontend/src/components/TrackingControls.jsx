import React from 'react';
import { Square, Share2, Power } from 'lucide-react';

export const TrackingControls = ({
  onStopSharing,
  onEndSession,
  onOpenShare,
  isOwner = false,
  isLive = true
}) => {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {onOpenShare && (
        <button
          onClick={onOpenShare}
          className="btn-secondary"
          style={{
            height: '38px',
            padding: '0 12px',
            gap: 6,
            border: '1px solid var(--border-subtle)',
            fontSize: '13px',
          }}
        >
          <Share2 size={15} />
          Share Link
        </button>
      )}

      {isOwner && onEndSession && isLive && (
        <button
          onClick={onEndSession}
          className="btn-danger"
          style={{
            height: '38px',
            padding: '0 12px',
            gap: 6,
            fontSize: '13px',
          }}
        >
          <Square size={14} fill="currentColor" />
          End Session
        </button>
      )}

      {!isOwner && onStopSharing && (
        <button
          onClick={onStopSharing}
          className="btn-danger"
          style={{
            height: '44px',
            width: '100%',
            fontSize: '14px',
            gap: 6,
          }}
        >
          <Power size={15} />
          Stop Sharing
        </button>
      )}
    </div>
  );
};
