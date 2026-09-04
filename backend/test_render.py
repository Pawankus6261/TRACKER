import sys, urllib.request, json
sys.stdout.reconfigure(encoding='utf-8')

base = 'https://tracker-pikc.onrender.com'

# 1. Create a fresh session on Render
data = json.dumps({'max_speed_kmh': 120.0, 'expires_hours': 24}).encode('utf-8')
req = urllib.request.Request(
    f'{base}/api/sessions', data=data,
    headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
)
with urllib.request.urlopen(req, timeout=15) as r:
    session = json.loads(r.read().decode('utf-8'))

token = session.get('token')
owner_key = session.get('owner_key')

print('=== NEW SESSION CREATED ON RENDER ===')
print(f'Token      : {token}')
print(f'Owner Key  : {owner_key}')
print()
print(f'Track Link : https://frontend-pi-gules-80.vercel.app/track/{token}')
print(f'Dashboard  : https://frontend-pi-gules-80.vercel.app/dashboard/{owner_key}')

# 2. Fetch it back to confirm
req2 = urllib.request.Request(
    f'{base}/api/sessions/{token}',
    headers={'User-Agent': 'Mozilla/5.0'}
)
with urllib.request.urlopen(req2, timeout=10) as r2:
    s = json.loads(r2.read().decode('utf-8'))
    print()
    print(f'Status     : {s.get("status")}')
    print('Render backend lookup: OK!')
