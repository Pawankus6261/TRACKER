import asyncio
import json
import websockets
import urllib.request

async def test_realtime_tracking():
    # 1. Create a session
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/sessions',
        data=json.dumps({'title': 'WebSocket Verification Session'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        session = json.loads(resp.read().decode('utf-8'))
    
    secure_token = session['secure_token']
    owner_key = session['owner_key']
    print(f"[1] Created Session: {secure_token}")

    dashboard_ws_url = f"ws://127.0.0.1:8000/ws/dashboard/{owner_key}"
    device_ws_url = f"ws://127.0.0.1:8000/ws/tracking/{secure_token}"

    # 2. Connect dashboard and device
    async with websockets.connect(dashboard_ws_url) as dash_ws:
        init_msg = await dash_ws.recv()
        print(f"[2] Dashboard received initial message: {init_msg}")

        async with websockets.connect(device_ws_url) as dev_ws:
            status_msg = await dash_ws.recv()
            print(f"[3] Dashboard received device status: {status_msg}")

            # 3. Send coordinate ping from device
            test_payload = {
                "latitude": 23.2599,
                "longitude": 77.4126,
                "accuracy": 7.5,
                "speed": 12.4,
                "heading": 180,
                "timestamp": 1788505980000
            }
            await dev_ws.send(json.dumps(test_payload))
            print(f"[4] Device sent coordinate ping: {test_payload['latitude']}, {test_payload['longitude']}")

            # Receive ack on device
            ack = await dev_ws.recv()
            print(f"[5] Device received ack: {ack}")

            # Receive broadcast on dashboard
            broadcast = await dash_ws.recv()
            print(f"[6] Dashboard received live update: {broadcast}")

            parsed = json.loads(broadcast)
            assert parsed['type'] == 'location_update'
            assert parsed['data']['latitude'] == 23.2599
            assert parsed['data']['longitude'] == 77.4126
            print("\n*** WEBSOCKET TEST PASSED SUCCESSFULLY! ***")

if __name__ == '__main__':
    asyncio.run(test_realtime_tracking())
