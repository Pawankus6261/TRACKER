import json
import urllib.request

def test_api():
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/sessions',
        data=json.dumps({'title': 'Master Demo Session'}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    
    token = data['secure_token']
    owner_key = data['owner_key']
    print(f"Created session: {token}, Owner key: {owner_key[:12]}...")

    req2 = urllib.request.Request(f'http://127.0.0.1:8000/api/sessions/{token}')
    with urllib.request.urlopen(req2) as resp2:
        pub_data = json.loads(resp2.read().decode('utf-8'))
    
    print(f"Public session verified: {pub_data['title']}, Active: {pub_data['is_active']}")

    req3 = urllib.request.Request(f'http://127.0.0.1:8000/api/sessions/owner/{owner_key}')
    with urllib.request.urlopen(req3) as resp3:
        owner_data = json.loads(resp3.read().decode('utf-8'))

    print(f"Owner session verified: title={owner_data['title']}, active={owner_data['is_active']}")
    print("ALL REST CHECKS PASSED!")

if __name__ == '__main__':
    test_api()
