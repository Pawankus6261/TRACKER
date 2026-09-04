import math
import datetime
import json
import logging
import urllib.request
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor, wait, as_completed
from typing import Optional, Tuple, Dict, Any, List
from app.config import settings

logger = logging.getLogger("location_service")

# Thread pool for simultaneous non-blocking API calls
_executor = ThreadPoolExecutor(max_workers=10)

# In-memory caches to eliminate redundant external roundtrips
_address_cache: Dict[str, Dict[str, Any]] = {}
_elevation_cache: Dict[str, float] = {}

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on the Earth
    in meters using the Haversine formula.
    """
    R = 6371000.0  # Earth's radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return R * c

def detect_outlier(
    prev_lat: Optional[float],
    prev_lon: Optional[float],
    prev_timestamp: Optional[int],
    new_lat: float,
    new_lon: float,
    new_timestamp: int,
    max_expected_speed_kmh: float = 120.0
) -> Tuple[bool, float, float]:
    """
    Evaluates whether a new location fix is a GPS jump / outlier based on
    distance, time difference, and estimated speed.
    Returns: (is_outlier, distance_meters, estimated_speed_kmh)
    """
    if prev_lat is None or prev_lon is None or prev_timestamp is None:
        # First point cannot be an outlier by jump
        return False, 0.0, 0.0

    time_diff_sec = (new_timestamp - prev_timestamp) / 1000.0
    if time_diff_sec <= 0:
        # If timestamp is identical or backwards, evaluate coordinates
        if prev_lat != new_lat or prev_lon != new_lon:
            return True, 0.0, 9999.0
        return False, 0.0, 0.0

    distance_m = haversine_distance(prev_lat, prev_lon, new_lat, new_lon)
    speed_mps = distance_m / time_diff_sec
    speed_kmh = speed_mps * 3.6

    # If speed physically exceeds max_expected_speed_kmh (with 25% margin for GPS jitter)
    is_outlier = speed_kmh > (max_expected_speed_kmh * 1.25)
    return is_outlier, distance_m, speed_kmh

def classify_accuracy_quality(accuracy: float) -> str:
    """
    Section 6 Quality Classifier:
    0–10 m       Excellent
    10–25 m      Very Good
    25–50 m      Good
    50–100 m     Moderate
    100–300 m    Poor
    300m+        Very Poor
    """
    if accuracy <= 10.0:
        return "Excellent"
    elif accuracy <= 25.0:
        return "Very Good"
    elif accuracy <= 50.0:
        return "Good"
    elif accuracy <= 100.0:
        return "Moderate"
    elif accuracy <= 300.0:
        return "Poor"
    else:
        return "Very Poor"

def evaluate_target_accuracy(accuracy: float, target_threshold_meters: float = 30.0) -> Dict[str, Any]:
    """
    Evaluates fix against the 20-30 meter high accuracy threshold.
    """
    target_met = accuracy <= target_threshold_meters
    pinpoint_met = accuracy <= 10.0
    return {
        "accuracy_meters": round(accuracy, 1),
        "target_threshold": target_threshold_meters,
        "target_met": target_met,
        "pinpoint_met": pinpoint_met,
        "status_badge": "High Accuracy Locked" if target_met else "Calibrating GPS"
    }

def classify_stale_status(last_received_at: Optional[datetime.datetime]) -> Tuple[str, Optional[int]]:
    """
    Section 16 Stale Location Detection:
    0–10 sec       LIVE
    10–30 sec      DELAYED
    30+ sec        STALE
    """
    if not last_received_at:
        return "INITIALIZING", None

    diff_sec = int((datetime.datetime.utcnow() - last_received_at).total_seconds())
    if diff_sec < 0:
        diff_sec = 0

    if diff_sec <= 10:
        return "LIVE", diff_sec
    elif diff_sec <= 30:
        return "DELAYED", diff_sec
    else:
        return "STALE", diff_sec


# ---------------------------------------------------------------------------
# SIMULTANEOUS MULTI-PROVIDER GEOCODING ENGINE (MapTiler + Google + OSM)
# ---------------------------------------------------------------------------

def _query_maptiler_geocoding(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Query MapTiler Reverse Geocoding API."""
    api_key = settings.MAPTILER_API_KEY
    if not api_key:
        return None

    try:
        url = f"https://api.maptiler.com/geocoding/{lon},{lat}.json?key={api_key}"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            features = data.get("features", [])
            if features:
                top = features[0]
                place_name = top.get("place_name")
                context = top.get("context", [])
                
                street = top.get("text", "")
                city = ""
                country = ""
                postal_code = ""

                for c in context:
                    cid = c.get("id", "")
                    if "postal_code" in cid:
                        postal_code = c.get("text", "")
                    elif "place" in cid or "municipality" in cid:
                        city = c.get("text", "")
                    elif "country" in cid:
                        country = c.get("text", "")

                return {
                    "provider": "MapTiler Geocoding",
                    "formatted_address": place_name,
                    "street": street,
                    "city": city,
                    "postal_code": postal_code,
                    "country": country,
                    "relevance": top.get("relevance", 1.0)
                }
    except Exception as e:
        logger.debug(f"MapTiler geocoding notice: {e}")
    return None


def _query_google_geocoding(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Query Google Maps Platform Geocoding API."""
    api_key = settings.GOOGLE_API_KEY
    if not api_key:
        return None

    try:
        url = f"https://maps.googleapis.com/maps/api/geocode/json?latlng={lat},{lon}&key={api_key}"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            status = data.get("status")
            if status == "OK" and data.get("results"):
                top = data["results"][0]
                formatted = top.get("formatted_address")

                components = {}
                for comp in top.get("address_components", []):
                    types = comp.get("types", [])
                    if "route" in types:
                        components["street"] = comp.get("long_name")
                    elif "locality" in types:
                        components["city"] = comp.get("long_name")
                    elif "postal_code" in types:
                        components["postal_code"] = comp.get("long_name")
                    elif "country" in types:
                        components["country"] = comp.get("long_name")

                return {
                    "provider": "Google Maps Platform",
                    "formatted_address": formatted,
                    "street": components.get("street", ""),
                    "city": components.get("city", ""),
                    "postal_code": components.get("postal_code", ""),
                    "country": components.get("country", ""),
                    "location_type": top.get("geometry", {}).get("location_type")
                }
            elif "error_message" in data:
                logger.debug(f"Google Geocoding note: {data['error_message']}")
    except Exception as e:
        logger.debug(f"Google geocoding error: {e}")
    return None


def _query_osm_nominatim(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """Query OpenStreetMap Nominatim Reverse Geocoder."""
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            addr_str = data.get("display_name")
            if addr_str:
                addr = data.get("address", {})
                return {
                    "provider": "OpenStreetMap",
                    "formatted_address": addr_str,
                    "street": addr.get("road") or addr.get("pedestrian") or "",
                    "city": addr.get("city") or addr.get("town") or addr.get("village") or "",
                    "postal_code": addr.get("postcode", ""),
                    "country": addr.get("country", "")
                }
    except Exception as e:
        logger.debug(f"OSM geocoding notice: {e}")
    return None


def _query_bigdatacloud_geocoding(lat: float, lon: float) -> Optional[Dict[str, Any]]:
    """
    Query BigDataCloud Client-side / Server-side Reverse Geocoding API.
    Endpoint: https://api.bigdatacloud.net/data/reverse-geocode-client
    Provides high-speed reverse geocoding and Open Location Code (Plus Code).
    """
    try:
        url = f"https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage=en"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=3.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            locality = data.get("locality") or data.get("city") or ""
            city = data.get("city") or locality
            subdivision = data.get("principalSubdivision") or ""
            country = data.get("countryName") or ""
            plus_code = data.get("plusCode") or ""
            postcode = data.get("postcode") or ""

            # Build human-readable formatted address
            parts = [p for p in [locality, city, subdivision, country] if p]
            dedup_parts = []
            for p in parts:
                if not dedup_parts or p.lower() != dedup_parts[-1].lower():
                    dedup_parts.append(p)

            formatted_address = ", ".join(dedup_parts) if dedup_parts else (plus_code or f"{lat:.5f}, {lon:.5f}")

            return {
                "provider": "BigDataCloud",
                "formatted_address": formatted_address,
                "street": locality,
                "city": city,
                "postal_code": postcode,
                "country": country,
                "plus_code": plus_code,
                "locality": locality
            }
    except Exception as e:
        logger.debug(f"BigDataCloud geocoding notice: {e}")
    return None


def resolve_simultaneous_address(lat: float, lon: float) -> Dict[str, Any]:
    """
    Execute simultaneous multi-provider reverse geocoding across:
    1. Google Maps Platform Geocoding API
    2. MapTiler Geocoding API
    3. BigDataCloud Reverse Geocoding API (with Open Location Plus Code)
    4. OpenStreetMap Nominatim

    Picks the highest precision result, extracts plus_code, and returns structured address details.
    """
    cache_key = f"{round(lat, 4)},{round(lon, 4)}"
    if cache_key in _address_cache:
        return _address_cache[cache_key]

    # Dispatch simultaneous workers
    futures = {
        _executor.submit(_query_google_geocoding, lat, lon): "Google Maps Platform",
        _executor.submit(_query_maptiler_geocoding, lat, lon): "MapTiler Geocoding",
        _executor.submit(_query_bigdatacloud_geocoding, lat, lon): "BigDataCloud",
        _executor.submit(_query_osm_nominatim, lat, lon): "OpenStreetMap"
    }

    # Wait up to 3.5s for simultaneous workers to complete
    done, not_done = concurrent.futures.wait(futures.keys(), timeout=3.5)

    results = []
    providers_queried = []

    for fut in done:
        prov_name = futures[fut]
        providers_queried.append(prov_name)
        try:
            res = fut.result()
            if res and res.get("formatted_address"):
                results.append(res)
        except Exception:
            pass

    # Extract Plus Code if returned by BigDataCloud or Google
    plus_code = ""
    for item in results:
        if item.get("plus_code"):
            plus_code = item.get("plus_code")
            break

    # Select best provider result:
    # Priority: Google (street-level) > MapTiler > BigDataCloud > OSM
    best = None
    for item in results:
        if item.get("provider") == "Google Maps Platform":
            best = item
            break

    if not best:
        for item in results:
            if item.get("provider") == "MapTiler Geocoding":
                best = item
                break

    if not best:
        for item in results:
            if item.get("provider") == "BigDataCloud":
                best = item
                break

    if not best and results:
        best = results[0]

    if best:
        output = {
            "address": best["formatted_address"],
            "provider": best["provider"],
            "street": best.get("street", ""),
            "city": best.get("city", ""),
            "postal_code": best.get("postal_code", ""),
            "country": best.get("country", ""),
            "plus_code": plus_code,
            "providers_queried": providers_queried
        }
    else:
        output = {
            "address": f"{round(lat, 6)}, {round(lon, 6)}",
            "provider": "GPS Coordinates",
            "street": "",
            "city": "",
            "postal_code": "",
            "country": "",
            "plus_code": plus_code,
            "providers_queried": providers_queried
        }

    _address_cache[cache_key] = output
    return output


def get_address_from_coords(lat: float, lon: float) -> Optional[str]:
    """Backward-compatible helper returning single formatted address string."""
    info = resolve_simultaneous_address(lat, lon)
    return info.get("address")


# ---------------------------------------------------------------------------
# SIMULTANEOUS ELEVATION & TOPOGRAPHICAL ALTITUDE
# ---------------------------------------------------------------------------

def _query_google_elevation(lat: float, lon: float) -> Optional[float]:
    """Query Google Elevation API."""
    api_key = settings.GOOGLE_API_KEY
    if not api_key:
        return None
    try:
        url = f"https://maps.googleapis.com/maps/api/elevation/json?locations={lat},{lon}&key={api_key}"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=1.8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get("status") == "OK" and data.get("results"):
                return round(float(data["results"][0]["elevation"]), 1)
    except Exception:
        pass
    return None

def _query_open_elevation(lat: float, lon: float) -> Optional[float]:
    """Query Open-Elevation fallback."""
    try:
        url = f"https://api.open-elevation.com/api/v1/lookup?locations={lat},{lon}"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=1.8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            res = data.get("results", [])
            if res:
                return round(float(res[0]["elevation"]), 1)
    except Exception:
        pass
    return None

def resolve_simultaneous_elevation(lat: float, lon: float) -> Optional[float]:
    """
    Simultaneously queries elevation services to obtain true ground elevation (meters above sea level).
    """
    cache_key = f"{round(lat, 3)},{round(lon, 3)}"
    if cache_key in _elevation_cache:
        return _elevation_cache[cache_key]

    futures = [
        _executor.submit(_query_google_elevation, lat, lon),
        _executor.submit(_query_open_elevation, lat, lon)
    ]

    done, not_done = wait(futures, timeout=2.2)

    for fut in done:
        try:
            val = fut.result()
            if val is not None:
                _elevation_cache[cache_key] = val
                return val
        except Exception:
            pass

    return None


# ---------------------------------------------------------------------------
# SIMULTANEOUS IP/NETWORK GEOLOCATION SEED (IP-API + MapTiler)
# ---------------------------------------------------------------------------

def _query_ip_api(query: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Query IP-API for instant network geolocation seed and ISP attribution.
    Endpoint: http://ip-api.com/json/{query}
    """
    try:
        url = "http://ip-api.com/json/?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query"
        if query and query not in ("127.0.0.1", "localhost", "::1") and not query.startswith("192.168.") and not query.startswith("10."):
            url = f"http://ip-api.com/json/{query}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query"

        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=2.2) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data.get("status") == "success":
                lat = data.get("lat")
                lon = data.get("lon")
                if lat is not None and lon is not None:
                    return {
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "city": data.get("city", ""),
                        "region": data.get("regionName", ""),
                        "country": data.get("country", ""),
                        "zip": data.get("zip", ""),
                        "isp": data.get("isp", ""),
                        "org": data.get("org", ""),
                        "accuracy": 3000.0,
                        "provider": "IP-API Geolocation",
                        "is_seed": True
                    }
    except Exception as e:
        logger.debug(f"IP-API seed notice: {e}")
    return None


def _query_maptiler_ip_seed(ip: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Query MapTiler IP Geolocation API."""
    api_key = settings.MAPTILER_API_KEY
    if not api_key:
        return None

    try:
        url = f"https://api.maptiler.com/geolocation/ip.json?key={api_key}"
        if ip and ip not in ("127.0.0.1", "localhost", "::1") and not ip.startswith("192.168.") and not ip.startswith("10."):
            url += f"&ip={ip}"
        req = urllib.request.Request(url, headers={"User-Agent": "DeviceLiveTracker/1.0"})
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            lat = data.get("latitude")
            lon = data.get("longitude")
            if lat is not None and lon is not None:
                return {
                    "latitude": float(lat),
                    "longitude": float(lon),
                    "city": data.get("city", ""),
                    "country": data.get("country", ""),
                    "accuracy": 5000.0,
                    "provider": "MapTiler IP Geolocation",
                    "is_seed": True
                }
    except Exception as e:
        logger.debug(f"MapTiler IP Geolocation notice: {e}")
    return None


def resolve_ip_geolocation_seed(ip: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """
    Simultaneously queries IP-API and MapTiler IP Geolocation to provide an instant
    initial location seed before satellite GPS lock is acquired.
    """
    futures = {
        _executor.submit(_query_ip_api, ip): "IP-API",
        _executor.submit(_query_maptiler_ip_seed, ip): "MapTiler"
    }

    done, not_done = concurrent.futures.wait(futures.keys(), timeout=2.5)

    candidates = []
    for fut in done:
        try:
            res = fut.result()
            if res and res.get("latitude") is not None and res.get("longitude") is not None:
                candidates.append(res)
        except Exception:
            pass

    if not candidates:
        return None

    # Prefer result with richer ISP and city metadata
    for c in candidates:
        if c.get("isp") and c.get("city"):
            return c

    return candidates[0]

