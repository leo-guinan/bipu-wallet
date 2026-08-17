import json, base64, urllib.request, urllib.error
import nacl.signing, base58

HOST = 'http://127.0.0.1:8791'

def mk(kp, ts):
    pub_b58 = base58.b58encode(bytes(kp.verify_key)).decode()
    canon = f'phone_home|{pub_b58}|0.2.0|{ts}'
    sig = base64.b64encode(kp.sign(canon.encode()).signature).decode()
    return {'schema': 'bipu.phone_home.v1', 'event_type': 'phone_home',
            'public_key': pub_b58, 'extension_version': '0.2.0',
            'observed_at': ts, 'signature_b64': sig}

def post(c, label):
    req = urllib.request.Request(HOST + '/v1/phone-home',
                                 data=json.dumps(c).encode(),
                                 headers={'content-type': 'application/json'})
    try:
        r = urllib.request.urlopen(req)
        print(label, '->', r.status, r.read().decode())
    except urllib.error.HTTPError as e:
        print(label, '-> HTTP', e.code, e.read().decode())

k1 = nacl.signing.SigningKey(bytes(range(32)))
post(mk(k1, '2026-08-17T14:00:00Z'), 'claim#1 valid')
post(mk(k1, '2026-08-17T14:05:00Z'), 'claim#2 same-key (dedupe)')
print('summary1:', urllib.request.urlopen(HOST + '/api/summary').read().decode())

k2 = nacl.signing.SigningKey(bytes(range(40, 72)))
post(mk(k2, '2026-08-17T15:00:00Z'), 'claim#3 second-distinct-key')
print('summary2:', urllib.request.urlopen(HOST + '/api/summary').read().decode())

bad = mk(k1, '2026-08-17T16:00:00Z'); bad['signature_b64'] = 'AAAA'
post(bad, 'claim#4 bad-sig')
print('summary3 (unchanged):', urllib.request.urlopen(HOST + '/api/summary').read().decode())
