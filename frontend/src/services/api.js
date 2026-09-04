export const getBackendBaseUrl = () => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${window.location.protocol}//${hostname}:8000`;
  }
  return '';
};

export const getWebSocketUrl = (endpointPath) => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  const host = (hostname === 'localhost' || hostname === '127.0.0.1')
    ? `${hostname}:8000`
    : window.location.host;
  return `${protocol}//${host}${endpointPath}`;
};

const API_BASE = `${getBackendBaseUrl()}/api`;

export async function createSession(maxSpeedKmh = 120.0, expiresHours = 24) {
  const urls = [`${API_BASE}/sessions`, '/api/sessions'];
  let lastErr = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          max_expected_speed_kmh: maxSpeedKmh,
          expires_hours: expiresHours,
        }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(lastErr?.message || 'Failed to connect to backend server at port 8000');
}

export async function getPublicSession(token) {
  const urls = [
    `${API_BASE}/sessions/${encodeURIComponent(token)}`,
    `/api/sessions/${encodeURIComponent(token)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  throw new Error('Session not found or unavailable');
}

export async function getOwnerSession(ownerKey) {
  const urls = [
    `${API_BASE}/sessions/owner/${encodeURIComponent(ownerKey)}`,
    `/api/sessions/owner/${encodeURIComponent(ownerKey)}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  throw new Error('Owner session not found');
}

export async function stopSharing(token) {
  const urls = [
    `${API_BASE}/sessions/${encodeURIComponent(token)}/stop`,
    `/api/sessions/${encodeURIComponent(token)}/stop`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}
  }
}

export async function endSession(ownerKey) {
  const urls = [
    `${API_BASE}/sessions/owner/${encodeURIComponent(ownerKey)}/end`,
    `/api/sessions/owner/${encodeURIComponent(ownerKey)}/end`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.ok) return await res.json();
    } catch (e) {}
  }
}

export async function getSeedLocation(token) {
  const urls = [
    `${API_BASE}/sessions/${encodeURIComponent(token)}/seed-location`,
    `/api/sessions/${encodeURIComponent(token)}/seed-location`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  return null;
}

/**
 * Direct Client-Side Fallback: IP-API Geolocation (http://ip-api.com/json/)
 */
export async function fetchClientIpLocation() {
  try {
    const res = await fetch('http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query');
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'success' && data.lat && data.lon) {
        return {
          latitude: data.lat,
          longitude: data.lon,
          city: data.city,
          region: data.regionName,
          country: data.country,
          isp: data.isp,
          accuracy: 3000,
          provider: 'IP-API.com',
          is_seed: true,
        };
      }
    }
  } catch (e) {
    console.debug('Direct IP-API notice:', e);
  }
  return null;
}

/**
 * Direct Client-Side Reverse Geocoding: BigDataCloud (https://api.bigdatacloud.net/data/reverse-geocode-client)
 */
export async function fetchBigDataCloudReverse(latitude, longitude) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const locality = data.locality || data.city || '';
      const parts = [locality, data.principalSubdivision, data.countryName].filter(Boolean);
      return {
        formatted_address: parts.join(', ') || data.plusCode,
        plus_code: data.plusCode,
        city: data.city || locality,
        country: data.countryName,
        provider: 'BigDataCloud',
      };
    }
  } catch (e) {
    console.debug('BigDataCloud reverse geocode notice:', e);
  }
  return null;
}

