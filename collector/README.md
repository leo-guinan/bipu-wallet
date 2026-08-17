# BIPU phone-home collector

Minimal, opt-in presence endpoint for the BIPU Wallet extension. Counts distinct
verified installs; returns only aggregate numbers.

## Endpoints

- `GET  /health`          → `{"ok":true}`
- `POST /v1/phone-home`   → accepts a signed claim; returns `{status, distinct_count}`
- `GET  /api/summary`     → `{distinct_count, total_events, first_seen}`

## Trust model

Each claim is an Ed25519 signature over the canonical string
`phone_home|<public_key>|<version>|<timestamp>`, verified against the public key
the extension reports. Because the extension signs with the same key it presents,
this proves the claim came from a real BIPU install (self-attestation). It does
NOT prove a human's identity. Dedupe is by public key → `distinct_count` is the
number of distinct installs that opted in, not impressions or bot pings.

## Privacy boundary

- The public summary never returns raw public keys — only `distinct_count`.
- The JSONL log (append-only) records `public_key`, version, and timestamps. This
  is the raw record; do not expose it in any public UI.
- The extension sends nothing until the user clicks the button.

## Run locally

```bash
python3 -m pip install -r requirements.txt
python3 -m uvicorn collector:app --port 8791 --log-level info
python3 test_collector.py
```

## Production boundary (do this before public use)

This is an in-memory reference collector. Before deploying for real network
counting, add: durable retention, rate limiting, bot filtering (e.g. IP/UA
heuristics — signature proves an install, not a human), HTTPS, a consent and
revocation record, a deletion policy, and an explicit public statement of what
`distinct_count` means. Do not label local counts as production metrics.
