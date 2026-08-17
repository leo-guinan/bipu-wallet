#!/usr/bin/env python3
"""
BIPU phone-home collector — minimal presence endpoint.

Accepts opt-in, signed presence claims from the BIPU Wallet extension and returns
only aggregate counts. Never returns raw public keys in the public summary.

Payload (POST /v1/phone-home):
    {
      "schema": "bipu.phone_home.v1",
      "event_type": "phone_home",
      "public_key": "<b58>",
      "extension_version": "0.2.0",
      "observed_at": "ISO-8601",
      "signature_b64": "<ed25519 sig over 'phone_home|<pk>|<ver>|<ts>'>"
    }

Verification: an Ed25519 signature over the canonical string, checked against the
public key bytes (base58-decoded). Because the extension signs with the same key
it reports, this proves the claim came from a real BIPU install (self-attestation),
not a random bot. It does NOT prove the person's identity.

Storage: append-only JSONL keyed by public_key. Dedupe by public_key -> distinct
member count. This is an in-memory/local reference; production needs durable
retention, rate limiting, HTTPS, and a deletion policy (see README).

Endpoints:
    GET  /health             -> ok
    GET  /api/summary        -> { distinct_count, total_events, first_seen }
    POST /v1/phone-home      -> { status, distinct_count }

Deps:  fastapi  uvicorn  pynacl  base58
Run:   uvicorn collector:app --port 8791
"""
import json, time, base64
from datetime import datetime, timezone

from fastapi import FastAPI, Request, Response
from pydantic import BaseModel, Field, ConfigDict

import nacl.signing, base58

app = FastAPI()

# In-memory store: public_key -> first-seen ISO. Append-only local file.
STORE = {}
LOG_PATH = "phone_home_events.jsonl"

class Claim(BaseModel):
    # alias 'schema' -> schema_ so we can reference claim.schema_ internally
    model_config = ConfigDict(populate_by_name=True)
    schema_: str = Field(alias='schema')
    event_type: str
    public_key: str
    extension_version: str
    observed_at: str
    signature_b64: str

def canonical(pk, ver, ts):
    return f"phone_home|{pk}|{ver}|{ts}"

def verify(claim: Claim) -> bool:
    try:
        pk_bytes = base58.b58decode(claim.public_key)
        if len(pk_bytes) != 32:
            return False
        sig = base64.b64decode(claim.signature_b64)
        verify_key = nacl.signing.VerifyKey(pk_bytes)
        verify_key.verify(canonical(claim.public_key, claim.extension_version, claim.observed_at).encode(), sig)
        return True
    except Exception:
        return False

def append_log(claim: Claim):
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "public_key": claim.public_key,
        "extension_version": claim.extension_version,
        "observed_at": claim.observed_at,
    }
    with open(LOG_PATH, "a") as f:
        f.write(json.dumps(row) + "\n")

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/v1/phone-home")
async def phone_home(claim: Claim, request: Request):
    if claim.schema_ != "bipu.phone_home.v1":
        return Response(status_code=422, content=json.dumps({"error": "bad_schema"}))
    if claim.event_type != "phone_home":
        return Response(status_code=422, content=json.dumps({"error": "bad_event_type"}))
    if not verify(claim):
        return Response(status_code=401, content=json.dumps({"error": "bad_signature"}))
    if claim.public_key not in STORE:
        STORE[claim.public_key] = claim.observed_at
        append_log(claim)
    return {"status": "ok", "distinct_count": len(STORE)}

@app.get("/api/summary")
def summary():
    first = min(STORE.values()) if STORE else None
    return {"distinct_count": len(STORE), "total_events": sum(1 for _ in open(LOG_PATH)) if __import__("os").path.exists(LOG_PATH) else 0, "first_seen": first}
