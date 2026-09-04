import React from 'react';
import { ShieldCheck, Award, Target, CheckCircle2 } from 'lucide-react';

export function getQualityCategory(accuracy) {
  if (typeof accuracy !== 'number' || isNaN(accuracy)) return { label: 'Unknown', color: '#64748B', bg: '#F1F5F9' };
  if (accuracy <= 10) return { label: 'Pinpoint (< 10m)', color: '#065F46', bg: '#ECFDF5' };
  if (accuracy <= 25) return { label: 'Very Good (< 25m)', color: '#047857', bg: '#D1FAE5' };
  if (accuracy <= 30) return { label: 'Target Met (< 30m)', color: '#047857', bg: '#D1FAE5' };
  if (accuracy <= 50) return { label: 'Good (< 50m)', color: '#1E40AF', bg: '#DBEAFE' };
  if (accuracy <= 100) return { label: 'Moderate (Calibrating)', color: '#B45309', bg: '#FEF3C7' };
  if (accuracy <= 300) return { label: 'Poor', color: '#C2410C', bg: '#FFEDD5' };
  return { label: 'Very Poor', color: '#991B1B', bg: '#FEE2E2' };
}

export const AccuracyIndicator = ({ accuracy, bestAccuracy, quality }) => {
  const cat = getQualityCategory(accuracy);
  const displayQuality = quality || cat.label;
  const isTargetMet = typeof accuracy === 'number' && accuracy <= 30.0;

  return (
    <div
      style={{
        width: '100%',
        background: 'var(--bg-card-subtle)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            GPS ACCURACY
          </span>
          {isTargetMet && (
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#059669',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              <CheckCircle2 size={12} /> Target Locked
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '12px',
            background: cat.bg,
            color: cat.color,
          }}
        >
          {displayQuality}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {typeof accuracy === 'number' ? accuracy.toFixed(1) : '--'}
        </span>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>meters radial error</span>
      </div>

      {/* Target status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
        <Target size={13} style={{ color: isTargetMet ? '#059669' : '#F59E0B' }} />
        <span>Target Threshold: <strong>20 – 30 meters</strong></span>
      </div>

      {/* Section 19: Best Accuracy this session */}
      {typeof bestAccuracy === 'number' && (
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Award size={14} style={{ color: '#059669' }} />
          <span>
            Best accuracy this session: <strong style={{ color: 'var(--text-primary)' }}>{bestAccuracy.toFixed(1)} m</strong>
          </span>
        </div>
      )}
    </div>
  );
};
