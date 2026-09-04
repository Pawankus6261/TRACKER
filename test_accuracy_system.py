import asyncio
import json
import urllib.request
import websockets

async def test_full_system():
    # 1. Create session
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/sessions',
        data=json.dumps({'max_expected_speed_kmh': 120.0, 'expires_hours': 24}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        session = json.loads(resp.read().decode('utf-8'))

    token = session['token']
    owner_key = session['owner_key']
    tracking_url = session['tracking_url']
    print(f"[1] Session Created! Token: {token}", flush=True)
    print(f"    Tracking URL: {tracking_url}", flush=True)

    dash_ws_url = f"ws://127.0.0.1:8000/ws/dashboard/{owner_key}"
    dev_ws_url = f"ws://127.0.0.1:8000/ws/tracking/{token}"

    # 2. Connect Dashboard & Device WebSockets
    async with websockets.connect(dash_ws_url) as dash_ws:
        init_msg = await asyncio.wait_for(dash_ws.recv(), timeout=5.0)
        print(f"[2] Dashboard received init: {init_msg}", flush=True)

        async with websockets.connect(dev_ws_url) as dev_ws:
            dev_status = await asyncio.wait_for(dash_ws.recv(), timeout=5.0)
            print(f"[3] Dashboard received status: {dev_status}", flush=True)

            # 3. Send high-accuracy fix from Section 5
            fix1 = {
                "latitude": 23.2599,
                "longitude": 77.4126,
                "accuracy": 6.8,
                "altitude": 514.2,
                "altitudeAccuracy": 8.4,
                "speed": 4.2,
                "heading": 127.5,
                "timestamp": 1788505980000
            }
            await dev_ws.send(json.dumps(fix1))

            # Verify ACK on device
            ack = await asyncio.wait_for(dev_ws.recv(), timeout=5.0)
            ack_data = json.loads(ack)
            print(f"[4] Device received ACK: {ack_data}", flush=True)
            assert ack_data['quality'] == 'Excellent'
            assert ack_data['accuracy'] == 6.8

            # Verify broadcast on dashboard
            bcast = await asyncio.wait_for(dash_ws.recv(), timeout=5.0)
            bcast_data = json.loads(bcast)
            print(f"[5] Dashboard received broadcast: {bcast_data}", flush=True)
            assert bcast_data['type'] == 'location_update'
            assert bcast_data['data']['quality'] == 'Excellent'
            assert bcast_data['data']['best_accuracy'] == 6.8
            assert bcast_data['is_outlier'] == False

            # 4. Wait 0.6s to respect rate limit, then send intentional outlier
            await asyncio.sleep(0.6)
            jump_fix = {
                "latitude": 23.3599,
                "longitude": 77.4126,
                "accuracy": 7.0,
                "altitude": 514.2,
                "altitudeAccuracy": 8.4,
                "speed": 4.2,
                "heading": 127.5,
                "timestamp": 1788505981000
            }
            await dev_ws.send(json.dumps(jump_fix))

            ack_jump = await asyncio.wait_for(dev_ws.recv(), timeout=5.0)
            ack_jump_data = json.loads(ack_jump)
            print(f"[6] Device received ACK for jump: {ack_jump_data}", flush=True)
            assert ack_jump_data['is_outlier'] == True

            bcast_jump = await asyncio.wait_for(dash_ws.recv(), timeout=5.0)
            bcast_jump_data = json.loads(bcast_jump)
            print(f"[7] Dashboard received jump update: is_outlier={bcast_jump_data['is_outlier']}", flush=True)
            assert bcast_jump_data['is_outlier'] == True

            print("\n*** ALL SYSTEM VERIFICATION CHECKS PASSED! ***", flush=True)

if __name__ == '__main__':
    asyncio.run(test_full_system())
