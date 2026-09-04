import React from 'react';
import { Loader2, AlertCircle, WifiOff, CheckCircle2, Clock } from 'lucide-react';

export const TrackingStatus = ({ status, staleStatus, secondsSinceLastFix, accuracy }) => {
  // Stale overrides if LIVE
  const isActuallyStale = staleStatus === 'STALE';
  const isDelayed = staleStatus === 'DELAYED';

  if (status === 'SEARCHING') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '13px',
            fontWeight: 700,
            color: '#B45309',
            background: '#FEF3C7',
            padding: '4px 12px',
            borderRadius: '20px',
          }}
        >
          <Loader2 size={14} className="animate-spin-slow" />
          SEARCHING
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Finding your most accurate position...
        </span>
      </div>
    );
  }

  if (status === 'LOW_ACCURACY') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '13px',
            fontWeight: 700,
            color: '#C2410C',
            background: '#FFEDD5',
            padding: '4px 12px',
            borderRadius: '20px',
          }}
        >
          <Loader2 size={14} className="animate-spin-slow" />
          LOW ACCURACY
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Improving location accuracy... (Current: {accuracy ? `${accuracy.toFixed(0)}m` : '--'})
        </span>
      </div>
    );
  }

  if (status === 'LIVE') {
    if (isActuallyStale) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#991B1B',
              background: '#FEE2E2',
              padding: '4px 12px',
              borderRadius: '20px',
            }}
          >
            <Clock size={14} />
            STALE
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Last fix: {secondsSinceLastFix}s ago
          </span>
        </div>
      );
    }

    if (isDelayed) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '12.5px',
              fontWeight: 700,
              color: '#B45309',
              background: '#FEF3C7',
              padding: '4px 12px',
              borderRadius: '20px',
            }}
          >
            <Clock size={14} />
            DELAYED
          </span>
          <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            Last fix: {secondsSinceLastFix}s ago
          </span>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="live-indicator">
          <span className="live-dot" />
          LIVE
        </span>
        <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
          {secondsSinceLastFix && secondsSinceLastFix > 1 ? `Updated ${secondsSinceLastFix}s ago` : 'Just now'}
        </span>
      </div>
    );
  }

  if (status === 'RECONNECTING') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '12.5px',
          fontWeight: 600,
          color: '#64748B',
          background: '#F1F5F9',
          padding: '4px 12px',
          borderRadius: '20px',
        }}
      >
        <WifiOff size={14} />
        Reconnecting...
      </span>
    );
  }

  if (status === 'STOPPED' || status === 'ENDED' || status === 'EXPIRED') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '12.5px',
          fontWeight: 600,
          color: '#64748B',
          background: '#F1F5F9',
          padding: '4px 12px',
          borderRadius: '20px',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94A3B8' }} />
        {status}
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: '12.5px',
        fontWeight: 600,
        color: '#64748B',
        background: '#F1F5F9',
        padding: '4px 12px',
        borderRadius: '20px',
      }}
    >
      INITIALIZING
    </span>
  );
};
