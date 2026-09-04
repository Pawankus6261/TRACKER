import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Crosshair, Navigation, Layers } from 'lucide-react';

export const MapView = ({ currentPosition, history = [], isLive = false }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const polylineRef = useRef(null);

  // Section 18: [ Follow Device ] toggle
  const [followDevice, setFollowDevice] = useState(true);
  const [mapProvider, setMapProvider] = useState('maptiler'); // 'maptiler' | 'google_satellite' | 'maptiler_satellite'
  const hasCenteredFirstFixRef = useRef(false);

  const maptilerApiKey = import.meta.env.VITE_MAPTILER_API_KEY || 'vOmhH4Y5ABEyhsT3zGtp';

  const getTileUrlAndAttribution = (provider) => {
    if (provider === 'google_satellite') {
      return {
        url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
        attribution: '&copy; Google Maps Satellite Imagery',
        maxZoom: 21,
      };
    } else if (provider === 'maptiler_satellite') {
      return {
        url: `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}.jpg?key=${maptilerApiKey}`,
        attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap',
        maxZoom: 20,
      };
    }
    // Default: MapTiler Streets
    return {
      url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${maptilerApiKey}`,
      attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap',
      maxZoom: 20,
    };
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = currentPosition
      ? [currentPosition.latitude, currentPosition.longitude]
      : [23.2599, 77.4126];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
    });

    const tileInfo = getTileUrlAndAttribution(mapProvider);
    const tileLayer = L.tileLayer(tileInfo.url, {
      attribution: tileInfo.attribution,
      maxZoom: tileInfo.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Section 17: Route drawn from actual stored GPS points
    const polyline = L.polyline([], {
      color: '#0F172A',
      weight: 3.5,
      opacity: 0.85,
      lineJoin: 'round',
      dashArray: '3, 6',
    }).addTo(map);

    // Section 17: Accuracy Circle with true reported uncertainty
    const accuracyCircle = L.circle(initialCenter, {
      radius: currentPosition?.accuracy || 20,
      color: '#2563EB',
      fillColor: '#3B82F6',
      fillOpacity: 0.15,
      weight: 1.5,
    }).addTo(map);

    // Section 17: Current Marker at latest accepted GPS point
    const customMarkerIcon = L.divIcon({
      className: 'custom-maptiler-pin',
      html: `
        <div style="position: relative; width: 24px; height: 24px;">
          <div style="position: absolute; top: 0; left: 0; width: 24px; height: 24px; border-radius: 50%; background: #0F172A; border: 3px solid #FFFFFF; box-shadow: 0 3px 8px rgba(0,0,0,0.35); z-index: 2;"></div>
          <div style="position: absolute; top: -6px; left: -6px; width: 36px; height: 36px; border-radius: 50%; background: rgba(37, 99, 235, 0.25); animation: radar-pulse 2.2s infinite ease-out; z-index: 1;"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker(initialCenter, { icon: customMarkerIcon }).addTo(map);

    // Detect user manual pan to temporarily disable followDevice
    map.on('dragstart', () => {
      setFollowDevice(false);
    });

    mapRef.current = map;
    markerRef.current = marker;
    accuracyCircleRef.current = accuracyCircle;
    polylineRef.current = polyline;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update base tile layer on simultaneous switcher
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    const tileInfo = getTileUrlAndAttribution(mapProvider);
    const newTileLayer = L.tileLayer(tileInfo.url, {
      attribution: tileInfo.attribution,
      maxZoom: tileInfo.maxZoom,
    }).addTo(mapRef.current);
    newTileLayer.bringToBack();
    tileLayerRef.current = newTileLayer;
  }, [mapProvider]);

  // Update route polyline
  useEffect(() => {
    if (!polylineRef.current) return;
    const latLngs = history.map((p) => [p.latitude, p.longitude]);
    polylineRef.current.setLatLngs(latLngs);
  }, [history]);

  // Section 18 & 19: Live marker update & auto-centering on good location
  useEffect(() => {
    if (!currentPosition || !mapRef.current || !markerRef.current || !accuracyCircleRef.current) return;

    const latLng = [currentPosition.latitude, currentPosition.longitude];

    // Move marker and accuracy circle
    markerRef.current.setLatLng(latLng);
    accuracyCircleRef.current.setLatLng(latLng);
    if (typeof currentPosition.accuracy === 'number') {
      accuracyCircleRef.current.setRadius(currentPosition.accuracy);
    }

    // Auto-center on first good fix
    if (!hasCenteredFirstFixRef.current) {
      mapRef.current.setView(latLng, 16, { animate: true });
      hasCenteredFirstFixRef.current = true;
    } else if (followDevice) {
      mapRef.current.panTo(latLng, { animate: true, duration: 0.8 });
    }
  }, [currentPosition, followDevice]);

  const handleCenter = () => {
    if (currentPosition && mapRef.current) {
      mapRef.current.setView([currentPosition.latitude, currentPosition.longitude], 16, { animate: true });
      setFollowDevice(true);
    }
  };

  const toggleFollow = () => {
    const next = !followDevice;
    setFollowDevice(next);
    if (next && currentPosition && mapRef.current) {
      mapRef.current.panTo([currentPosition.latitude, currentPosition.longitude], { animate: true });
    }
  };

  const cycleMapProvider = () => {
    if (mapProvider === 'maptiler') {
      setMapProvider('google_satellite');
    } else if (mapProvider === 'google_satellite') {
      setMapProvider('maptiler_satellite');
    } else {
      setMapProvider('maptiler');
    }
  };

  const providerLabel = {
    maptiler: 'MapTiler Streets',
    google_satellite: 'Google Satellite',
    maptiler_satellite: 'MapTiler Satellite',
  }[mapProvider];

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Floating Map Controls */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button
          onClick={handleCenter}
          title="Center on Device"
          style={{
            background: 'white',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            color: 'var(--primary)',
          }}
        >
          <Crosshair size={18} />
        </button>

        {/* Section 18: [ Follow Device ] toggle */}
        <button
          onClick={toggleFollow}
          title={followDevice ? 'Following Device (Click to Free Roam)' : 'Follow Device (Disabled)'}
          style={{
            background: followDevice ? 'var(--primary)' : 'white',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            color: followDevice ? 'white' : 'var(--text-secondary)',
          }}
        >
          <Navigation size={18} />
        </button>

        {/* Simultaneous Map Provider Switcher */}
        <button
          onClick={cycleMapProvider}
          title={`Switch Map Style (Currently: ${providerLabel})`}
          style={{
            background: 'white',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            color: 'var(--primary)',
          }}
        >
          <Layers size={18} />
        </button>
      </div>

      {/* Simultaneous Map Style Pill */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 999,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '20px',
          padding: '5px 12px',
          fontSize: '11.5px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
          cursor: 'pointer',
        }}
        onClick={cycleMapProvider}
      >
        <Layers size={13} />
        <span>{providerLabel}</span>
      </div>

      {/* Follow Device Indicator Pill */}
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          zIndex: 999,
          background: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '24px',
          padding: '6px 14px',
          fontSize: '12px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isLive ? '#10B981' : '#F59E0B',
          }}
        />
        <span>{followDevice ? 'Auto-Following Device' : 'Free Roam Map'}</span>
      </div>
    </div>
  );
};
