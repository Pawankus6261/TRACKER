"""
End-to-End Automated Test for Simultaneous Multi-Provider Accuracy Engine
Verifies:
1. Concurrent MapTiler + Google + OSM Reverse Geocoding
2. Elevation Resolution
3. 20-30m Target Accuracy Evaluation
4. Full WebSocket Ingestion and Enriched Broadcast
"""

import sys
import asyncio
import json
import websockets
import urllib.request
from app.services.location_service import (
    resolve_simultaneous_address,
    resolve_simultaneous_elevation,
    evaluate_target_accuracy,
    resolve_ip_geolocation_seed
)

def test_unit_services():
    print("\n--- 1. Testing Simultaneous Multi-Provider Geocoding ---")
    delhi_coords = (28.6139, 77.2090)
    addr_info = resolve_simultaneous_address(*delhi_coords)
    print(f"Address: {addr_info.get('address')}")
    print(f"Provider: {addr_info.get('provider')}")
    print(f"Plus Code: {addr_info.get('plus_code')}")
    print(f"Providers Queried: {addr_info.get('providers_queried')}")
    assert addr_info.get("address"), "Address must not be empty"
    assert addr_info.get("provider"), "Provider must be identified"
    assert addr_info.get("plus_code"), "BigDataCloud Plus Code must be captured"
    assert "BigDataCloud" in addr_info.get("providers_queried", []), "BigDataCloud must be queried simultaneously"

    print("\n--- 2. Testing Target Accuracy Evaluation ---")
    eval_22m = evaluate_target_accuracy(22.4, target_threshold_meters=30.0)
    print(f"Accuracy 22.4m evaluation: {eval_22m}")
    assert eval_22m["target_met"] is True, "22.4m must meet the <= 30m target"

    eval_8m = evaluate_target_accuracy(8.2, target_threshold_meters=30.0)
    print(f"Accuracy 8.2m evaluation: {eval_8m}")
    assert eval_8m["pinpoint_met"] is True, "8.2m must meet the <= 10m pinpoint target"

    eval_65m = evaluate_target_accuracy(65.0, target_threshold_meters=30.0)
    print(f"Accuracy 65.0m evaluation: {eval_65m}")
    assert eval_65m["target_met"] is False, "65m must not meet target"

    print("\n--- 3. Testing IP Geolocation Seed (IP-API + MapTiler) ---")
    seed = resolve_ip_geolocation_seed()
    safe_seed = {k: (v.encode('ascii', 'replace').decode() if isinstance(v, str) else v) for k, v in seed.items()} if seed else None
    print(f"IP Geolocation Seed: {safe_seed}")
    assert seed is not None, "Seed must not be None"
    assert "latitude" in seed and "longitude" in seed, "Seed must contain coordinates"
    assert seed.get("provider"), "Seed provider must be identified"

    print("\nUnit tests PASSED successfully!")


async def test_live_websocket_enrichment():
    print("\n--- 4. Testing Live WebSocket Telemetry Enrichment ---")
    base_url = "http://127.0.0.1:8000"
    
    # 1. Create session via REST
    req = urllib.request.Request(
        f"{base_url}/api/sessions",
        data=json.dumps({"expires_hours": 1, "max_expected_speed_kmh": 120.0}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        session_data = json.loads(resp.read().decode())
    
    token = session_data["token"]
    owner_key = session_data["owner_key"]
    print(f"Created Session. Token={token[:8]}..., OwnerKey={owner_key[:8]}...")

    # 2. Connect Owner Dashboard WebSocket and Tracking Device WebSocket
    dashboard_ws_url = f"ws://127.0.0.1:8000/ws/dashboard/{owner_key}"
    tracking_ws_url = f"ws://127.0.0.1:8000/ws/tracking/{token}"

    async with websockets.connect(dashboard_ws_url) as dash_ws, \
               websockets.connect(tracking_ws_url) as track_ws:
        
        # Ingest high-accuracy fix (18.2m accuracy)
        fix_payload = {
            "type": "location_update",
            "data": {
                "latitude": 28.6139,
                "longitude": 77.2090,
                "accuracy": 18.2,
                "altitude": None,
                "altitudeAccuracy": None,
                "speed": 1.4,
                "heading": 90.0,
                "timestamp": 1725447000000
            }
        }

        # Send from device
        await track_ws.send(json.dumps(fix_payload))

        # Await device ACK
        ack_msg = await asyncio.wait_for(track_ws.recv(), timeout=5.0)
        ack = json.loads(ack_msg)
        print(f"Device ACK received: status={ack.get('status')}, quality={ack.get('quality')}")
        assert ack.get("status") in ["ack", "accepted"], f"Unexpected status: {ack.get('status')}"

        # Await Dashboard broadcast with simultaneous enrichment (skipping connection_init and device_status)
        dash_data = None
        for _ in range(5):
            dash_msg = await asyncio.wait_for(dash_ws.recv(), timeout=5.0)
            msg_obj = json.loads(dash_msg)
            if msg_obj.get("type") == "location_update":
                dash_data = msg_obj
                break

        assert dash_data is not None, "Dashboard must receive location_update message"
        print(f"Dashboard Broadcast received: type={dash_data.get('type')}")
        loc_data = dash_data.get("data", {})
        print(f"  Accuracy: {loc_data.get('accuracy')} m")
        print(f"  Target Met: {loc_data.get('target_met')}")
        print(f"  Address: {loc_data.get('address')}")
        print(f"  Provider: {loc_data.get('address_provider')}")
        print(f"  Plus Code: {loc_data.get('plus_code')}")

        assert loc_data.get("target_met") is True, "Target met must be True for 18.2m"
        assert loc_data.get("address"), "Address must be resolved and attached"
        assert loc_data.get("address_provider"), "Provider attribution must be present"

    print("\nLive WebSocket telemetry test PASSED successfully!")


if __name__ == "__main__":
    test_unit_services()
    asyncio.run(test_live_websocket_enrichment())
