/**
 * Ultra-Fast High-Accuracy Geolocation Service
 * Strategy:
 * - Stream 1: Instant low-accuracy fix (network/WiFi, maximumAge: 3000ms, timeout: 4s) → shows on map immediately
 * - Stream 2: Continuous high-accuracy watchPosition (GPS satellites, maximumAge: 0, timeout: 20s)
 * - Stream 3: Aggressive parallel burst salvo (5 simultaneous getCurrentPosition calls at startup)
 * - Stream 4: Auto-retry burst every 8s while accuracy > 30m
 * Never fakes, interpolates, or artificially improves accuracy values.
 */

export function evaluateTargetAccuracy(accuracy, targetThreshold = 30.0) {
  if (typeof accuracy !== 'number' || isNaN(accuracy)) {
    return {
      targetMet: false,
      pinpointMet: false,
      label: 'Acquiring Satellites',
      color: '#64748B',
      bg: '#F1F5F9',
    };
  }

  const targetMet = accuracy <= targetThreshold;
  const pinpointMet = accuracy <= 10.0;

  if (pinpointMet) {
    return { targetMet: true, pinpointMet: true, label: 'Pinpoint GPS (< 10m)', color: '#065F46', bg: '#ECFDF5' };
  } else if (targetMet) {
    return { targetMet: true, pinpointMet: false, label: 'Target Accuracy Locked (< 30m)', color: '#047857', bg: '#D1FAE5' };
  } else if (accuracy <= 50) {
    return { targetMet: false, pinpointMet: false, label: 'Good Fix (Refining...)', color: '#1E40AF', bg: '#DBEAFE' };
  } else if (accuracy <= 200) {
    return { targetMet: false, pinpointMet: false, label: 'Calibrating GPS...', color: '#B45309', bg: '#FEF3C7' };
  } else {
    return { targetMet: false, pinpointMet: false, label: 'Network Seed (Waiting for GPS)', color: '#9333EA', bg: '#F3E8FF' };
  }
}

export function isBetterLocation(newLocation, oldLocation) {
  if (!oldLocation) return true;

  const timeDelta = newLocation.timestamp - oldLocation.timestamp;
  const isSignificantlyNewer = timeDelta > 15000;
  const isSignificantlyOlder = timeDelta < -15000;
  const isNewer = timeDelta > 0;

  if (isSignificantlyNewer) return true;
  if (isSignificantlyOlder) return false;

  const accuracyDelta = newLocation.accuracy - oldLocation.accuracy;
  const isMoreAccurate = accuracyDelta < 0;
  const isSignificantlyLessAccurate = accuracyDelta > 50;
  const isSameLocation =
    newLocation.latitude === oldLocation.latitude &&
    newLocation.longitude === oldLocation.longitude;

  // ALWAYS accept a fix that is much better accuracy (> 20% improvement)
  if (newLocation.accuracy < oldLocation.accuracy * 0.8) return true;
  if (isMoreAccurate) return true;
  if (isNewer && !isSignificantlyLessAccurate && !isSameLocation) return true;

  return false;
}

export function formatRawPosition(position) {
  const coords = position.coords;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    altitude: coords.altitude !== null ? coords.altitude : null,
    altitudeAccuracy: coords.altitudeAccuracy !== null ? coords.altitudeAccuracy : null,
    speed: coords.speed !== null ? coords.speed : null,
    heading: coords.heading !== null ? coords.heading : null,
    timestamp: position.timestamp || Date.now(),
  };
}

export function startHighAccuracyWatch(onFix, onError) {
  if (!('geolocation' in navigator)) {
    onError(new Error('Geolocation is not supported by your device browser.'));
    return null;
  }

  const watchId = navigator.geolocation.watchPosition(
    (position) => onFix(formatRawPosition(position)),
    onError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );

  return watchId;
}

export function stopHighAccuracyWatch(watchId) {
  if (watchId !== null && 'geolocation' in navigator) {
    navigator.geolocation.clearWatch(watchId);
  }
}

/**
 * Ultra-Fast Dual-Stream GPS Tracker
 *
 * Phase 1 – Instant Network Seed (0–2s):
 *   getCurrentPosition with maximumAge:5000ms → delivers fast WiFi/cell fix immediately
 *
 * Phase 2 – Parallel Burst Salvo (0–8s):
 *   5 simultaneous getCurrentPosition(highAccuracy) calls fired at 0ms, 300ms, 600ms, 1200ms, 2500ms
 *   Forces GPS chipset to wake up and race to get the first satellite lock
 *
 * Phase 3 – Continuous Watch (ongoing):
 *   watchPosition with enableHighAccuracy:true, maximumAge:0 → sustained real GPS stream
 *
 * Phase 4 – Auto-Recalibration (every 8s while accuracy > 30m):
 *   Retry burst if still not accurate enough
 */
export class DualStreamGPSTracker {
  constructor(onFix, onError) {
    this.onFix = onFix;
    this.onError = onError;
    this.watchId = null;
    this.burstTimer = null;
    this.isActive = false;
    this.latestFix = null;
    this._burstCount = 0;
  }

  start() {
    if (!('geolocation' in navigator)) {
      this.onError(new Error('Geolocation is not supported by your device browser.'));
      return;
    }

    this.isActive = true;

    // ── Phase 1: Instant network/WiFi fix (fast, low accuracy) ──────────────
    // Uses cached position (up to 5s old) for instant map placement
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!this.isActive) return;
        const fmt = formatRawPosition(pos);
        // Only use if it's better than nothing (ignore 200km IP seeds)
        if (!this.latestFix || fmt.accuracy < this.latestFix.accuracy) {
          this.latestFix = fmt;
          this.onFix(fmt);
        }
      },
      () => { /* silent — high accuracy watch will handle errors */ },
      { enableHighAccuracy: false, maximumAge: 5000, timeout: 4000 }
    );

    // ── Phase 2: Burst Salvo — 5 parallel GPS requests at staggered times ──
    // Wakes GPS chipset aggressively for fastest satellite lock
    const burstDelays = [0, 300, 700, 1400, 2800];
    burstDelays.forEach((delay) => {
      setTimeout(() => {
        if (!this.isActive) return;
        this._fireBurst();
      }, delay);
    });

    // ── Phase 3: Continuous high-accuracy GPS watch ──────────────────────────
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!this.isActive) return;
        const formatted = formatRawPosition(position);
        if (isBetterLocation(formatted, this.latestFix)) {
          this.latestFix = formatted;
          this.onFix(formatted);
        }
      },
      (error) => {
        this.onError(error);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );

    // ── Phase 4: Auto-Recalibration burst every 8s if still coarse ──────────
    this.burstTimer = setInterval(() => {
      if (!this.isActive) return;
      const currentAccuracy = this.latestFix?.accuracy ?? Infinity;
      if (currentAccuracy > 30) {
        this._fireBurst();
      }
    }, 8000);
  }

  _fireBurst() {
    if (!('geolocation' in navigator) || !this.isActive) return;
    this._burstCount++;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!this.isActive) return;
        const formatted = formatRawPosition(pos);
        if (isBetterLocation(formatted, this.latestFix)) {
          this.latestFix = formatted;
          this.onFix(formatted);
        }
      },
      (err) => {
        console.debug(`GPS burst #${this._burstCount} notice:`, err.message);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
    );
  }

  stop() {
    this.isActive = false;
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    if (this.burstTimer) {
      clearInterval(this.burstTimer);
      this.burstTimer = null;
    }
  }
}
