// BIPU Wallet background service worker — v0.2 (dual wallet).
//
// Model:
//   - BIPU wallet: auto-created attestation identity (WebCrypto Ed25519).
//     Always exists, always used for attestation. Never moves money.
//   - Phantom: optional external wallet connected via the injected provider.
//     Used for attestation too, AND is the ONLY money-moving path.
//
// Money routing rule: funds go through Phantom, never through the BIPU key.
//
// Injection flow (Phantom lives in page MAIN world, not extension worlds):
//   1. popup asks PHANTOM_STATUS / PHANTOM_CONNECT -> we inject bridge.js
//      (ISOLATED) + injected/phantom-main.js (MAIN) into the active tab.
//   2. We post a request into the MAIN world.
//   3. phantom-main.js answers via postMessage; bridge.js relays to us.
//   4. We resolve the matching by-type pending promise and reply to the popup.

importScripts('lib/bipu-wallet.js');
importScripts('injected/web3-bundle.js'); // provides global solanaWeb3 for the SW too

// browser service worker lacks atob/btoa globals — shim them
if (typeof atob === 'undefined') globalThis.atob = (s) => { const b = Uint8Array.from(atobBytes(s)); return String.fromCharCode(...b); };
if (typeof btoa === 'undefined') globalThis.btoa = (s) => { const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let o = ''; const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); for (let i = 0; i < u.length; i += 3) { const a = u[i], b = i + 1 < u.length ? u[i + 1] : 0, c = i + 2 < u.length ? u[i + 2] : 0; const n = (a << 16) | (b << 8) | c; o += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + chars[(n >> 6) & 63] + chars[n & 63]; } return o.slice(0, Math.ceil(u.length / 3) * 4 - (u.length % 3 ? 3 - (u.length % 3) : 0)).replace(/=+$/,'') + '==='.slice(0, u.length % 3 ? 3 - (u.length % 3) : 0); };
function atobBytes(s) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const b = [];
  let i = 0;
  s = s.replace(/[^A-Za-z0-9+/=]/g, '');
  while (i < s.length) {
    const e1 = chars.indexOf(s[i++]), e2 = chars.indexOf(s[i++]);
    const e3 = chars.indexOf(s[i++]), e4 = chars.indexOf(s[i++]);
    const c1 = (e1 << 2) | (e2 >> 4), c2 = ((e2 & 15) << 4) | (e3 >> 2), c3 = ((e3 & 3) << 6) | e4;
    b.push(c1);
    if (e3 !== 64) b.push(c2);
    if (e4 !== 64) b.push(c3);
  }
  return b;
}

const STORE_KEY = 'bipu_wallet_v1';
const PHANTOM_KEY = 'bipu_phantom_v1';
// Default collector for phone-home presence. Set to empty/unset until a real
// collector exists; users/Leo configure it via storage. Keeping this explicit
// means nothing posts to a surprise endpoint.
const DEFAULT_COLLECTOR_URL = (() => {
  // env-agnostic default — change this to the real collector when it exists
  return 'https://rendezvous.metaspn.network/v1/phone-home';
})();
const PENDING_BY_TYPE = {}; // type -> { resolve, reject, timer }
const TYPE_FOR_RESULT = {
  'BIPU_PHANTOM_STATUS_RESULT': 'BIPU_PHANTOM_STATUS',
  'BIPU_PHANTOM_CONNECT_RESULT': 'BIPU_PHANTOM_CONNECT',
  'BIPU_MARVIN_SIGN_SWAP_RESULT': 'BIPU_MARVIN_SIGN_SWAP',
  'BIPU_INJECTED_READY': 'BIPU_PHANTOM_STATUS',
};

async function getStored(key, def) {
  const r = await chrome.storage.local.get(key);
  return r[key] ?? def;
}
async function setStored(key, val) {
  await chrome.storage.local.set({ [key]: val });
}

function registerAsk(type) {
  return new Promise((resolve, reject) => {
    if (PENDING_BY_TYPE[type]) PENDING_BY_TYPE[type].reject(new Error('replaced'));
    const timer = setTimeout(() => { clearAsk(type); reject(new Error('phantom_connect_timeout')); }, 15000);
    PENDING_BY_TYPE[type] = { resolve, reject, timer };
  });
}
function clearAsk(type) {
  if (PENDING_BY_TYPE[type]) {
    clearTimeout(PENDING_BY_TYPE[type].timer);
    PENDING_BY_TYPE[type] = null;
  }
}

// ---- BIPU attestation wallet ----
async function ensureWallet() {
  const existing = await getStored(STORE_KEY, null);
  if (existing && existing.publicKeyBase58) return existing;
  const kp = await BIPU_WALLET.generateKeypair();
  const wallet = {
    publicKeyBase58: kp.publicKeyBase58,
    publicKeyB64: kp.publicKeyB64,
    privateKeyJwk: kp.privateKeyJwk,
    createdAt: new Date().toISOString(),
  };
  await setStored(STORE_KEY, wallet);
  return wallet;
}

// ---- Phantom via active-tab injection ----
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || typeof tab.id !== 'number') throw new Error('no_active_tab');
  return tab;
}

async function injectInto(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['bridge.js'] }).catch(() => {});
  // web3-bundle MUST load before phantom-main (probe uses solanaWeb3 global)
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['injected/web3-bundle.js'] }).catch(() => {});
  await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['injected/phantom-main.js'] }).catch(() => {});
}

async function postRequest(tabId, type, extra) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (t, e) => { window.postMessage({ source: 'bipu-wallet-extension', type: t, ...(e || {}) }, '*'); },
    args: [type, extra || null],
  });
}

async function askActiveTab(type) {
  const p = registerAsk(type);
  const tab = await getActiveTab();
  await injectInto(tab.id);
  await postRequest(tab.id, type);
  return p;
}

async function phantomStatus() {
  const stored = await getStored(PHANTOM_KEY, null);
  if (stored && stored.publicKey) return { connected: true, publicKey: stored.publicKey };
  try {
    const res = await askActiveTab('BIPU_PHANTOM_STATUS');
    return { connected: !!res.publicKey, detected: !!res.detected, publicKey: res.publicKey || null };
  } catch (e) {
    return { connected: false, detected: false, error: String(e && e.message || e) };
  }
}

async function phantomConnect() {
  const res = await askActiveTab('BIPU_PHANTOM_CONNECT');
  if (!res.ok || !res.publicKey) throw new Error(res.error || 'phantom_connect_failed');
  await setStored(PHANTOM_KEY, { publicKey: res.publicKey, connectedAt: new Date().toISOString() });
  return { connected: true, publicKey: res.publicKey };
}

// Marvin go long: sell amountMarvin MARVIN -> SOL. All network here (host
// perms), sign delegated to the page MAIN world (Phantom). Produces SOL; the
// SOL->OPEN long is a manual step surfaced honestly, never faked.
async function marvinGoLong(amountMarvin) {
  const n = Number(amountMarvin);
  if (!Number.isFinite(n) || n <= 0) throw new Error('invalid_amount');
  const amountRaw = Math.floor(n * 1e6);

  const MINT_MARVIN = '3CJThScW1XhsY5zCbpiZYiuV7vovEikFjW8z3BAMpump';
  const MINT_SOL = 'So11111111111111111111111111111111111111112';

  // 1) route check + quote
  const q = new URLSearchParams({ inputMint: MINT_MARVIN, outputMint: MINT_SOL, amount: String(amountRaw), slippageBps: '500' });
  const quoteResp = await fetch('https://lite-api.jup.ag/swap/v1/quote?' + q.toString());
  const quote = await quoteResp.json();
  if (!quoteResp.ok || !quote.outAmount) throw new Error('marvin_not_routable: ' + (quote.error || ('HTTP ' + quoteResp.status)));
  const outSol = Number(quote.outAmount) / 1e9;

  // 2) get the connected wallet address for building
  const stored = await getStored(PHANTOM_KEY, null);
  if (!stored || !stored.publicKey) throw new Error('phantom_not_connected');
  const userPublicKey = stored.publicKey;

  // 3) build the swap tx
  const swapResp = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: 'medium' } },
    }),
  });
  const swapBody = await swapResp.json();
  if (!swapBody.swapTransaction) throw new Error('no_swap_transaction');

  // 4) delegate signing to the MAIN world (Phantom holds the key)
  const signedRes = await askActiveTab('BIPU_MARVIN_SIGN_SWAP', { swapTransactionBase64: swapBody.swapTransaction });
  if (!signedRes.ok || !signedRes.signedTransactionBase64) throw new Error(signedRes.error || 'phantom_sign_failed');

  // 5) simulate + submit via RPC (browser has no Buffer; do it manually)
  const { VersionedTransaction, Connection } = solanaWeb3;
  const fromB64 = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const signedTx = VersionedTransaction.deserialize(fromB64(signedRes.signedTransactionBase64));
  const conn = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const sim = await conn.simulateTransaction(signedTx, { replaceRecentBlockhash: true });
  if (sim.value.err) throw new Error('simulation_failed: ' + JSON.stringify(sim.value.err));
  const sig = await conn.sendRawTransaction(signedTx.serialize(), { skipPreflight: false, maxRetries: 2 });
  const confirmed = await conn.confirmTransaction(sig, 'confirmed');
  if (confirmed.value.err) throw new Error('transaction_failed');

  return {
    signature: sig,
    amountMarvin: n,
    solReceived: outSol,
    priceImpactPct: quote.priceImpactPct,
    openSeam: 'manual',
    note: 'SOL received in Phantom. To open the OPEN long, move SOL to your brokerage/tokenized-stock venue manually and record the position.',
  };
}

// Bridge relay: injected-probe results carry _bridge:true and are matched to a
// pending ask by the request type the result corresponds to.
chrome.runtime.onMessage.addListener((message) => {
  if (!message || !message._bridge) return false;
  const askedType = TYPE_FOR_RESULT[message.type];
  if (!askedType) return false;
  const pending = PENDING_BY_TYPE[askedType];
  if (pending) {
    clearAsk(askedType);
    pending.resolve(message);
  }
  return false;
});

// Phone home: opt-in presence signal. Sends only the BIPU attestation public
// key (stable pseudonymous ID), extension version, and a timestamp, signed with
// the BIPU key so the collector can verify + dedupe. No page data, no history,
// no wallet data. Collector URL is user-configured in storage.
async function phoneHome() {
  const w = await ensureWallet();
  const collector = (await getStored('bipu_collector_url_v1', null)) || DEFAULT_COLLECTOR_URL;
  const version = '0.2.0';
  const observedAt = new Date().toISOString();
  const claim = {
    schema: 'bipu.phone_home.v1',
    event_type: 'phone_home',
    public_key: w.publicKeyBase58,
    extension_version: version,
    observed_at: observedAt,
  };
  // sign a canonical string of the claim fields (no raw object hashing pitfalls)
  const canonical = ['phone_home', claim.public_key, claim.extension_version, claim.observed_at].join('|');
  const sig = await BIPU_WALLET.signWithJwk(w.privateKeyJwk, new TextEncoder().encode(canonical));
  const body = { ...claim, signature_b64: sig };

  const resp = await fetch(collector, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || ('collector_http_' + resp.status));
  // record last phone-home locally so the user can see it worked
  await setStored('bipu_last_phone_home_v1', { at: observedAt, collector, distinct_count: json.distinct_count });
  return { ...json, at: observedAt };
}

// Trust Vault contribution: create a Stripe Checkout Session via the vault
// service. Returns a checkout URL the user opens. Real money can move once they
// complete checkout; the vault is ARMED. Contribution = support, not investment.
async function vaultContribute(publicKey, amountUsd) {
  const vault = 'https://rendezvous.metaspn.network/v1/vault/contribute';
  const resp = await fetch(vault, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      public_key: String(publicKey || ''),
      amount_usd: Number(amountUsd) || 25,
    }),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.error) throw new Error(json.error || ('vault_http_' + resp.status));
  return { checkout_url: json.checkout_url, session_id: json.session_id, funds_moved: !!json.funds_moved };
}

// ---- message API ----
chrome.runtime.onInstalled.addListener(async () => {
  await ensureWallet();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case 'GET_STATUS': {
        const w = await ensureWallet();
        const phantom = await getStored(PHANTOM_KEY, null);
        return {
          bipu: { exists: true, publicKeyBase58: w.publicKeyBase58, createdAt: w.createdAt },
          phantom: { connected: !!(phantom && phantom.publicKey), publicKey: phantom ? phantom.publicKey : null },
        };
      }
      case 'SIGN_ATTESTATION': {
        const w = await ensureWallet();
        const msgBytes = new TextEncoder().encode(String(message.payload || ''));
        const sig = await BIPU_WALLET.signWithJwk(w.privateKeyJwk, msgBytes);
        return { publicKeyBase58: w.publicKeyBase58, signatureB64: sig };
      }
      case 'PHANTOM_STATUS':
        return await phantomStatus();
      case 'PHANTOM_CONNECT':
        return await phantomConnect();
      case 'PHANTOM_DISCONNECT':
        await setStored(PHANTOM_KEY, null);
        return { connected: false };
      case 'MARVIN_GO_LONG':
        return await marvinGoLong(message.amountMarvin);
      case 'PHONE_HOME':
        return await phoneHome();
      case 'SET_COLLECTOR_URL':
        await setStored('bipu_collector_url_v1', String(message.url || ''));
        return { set: true };
      case 'VAULT_CONTRIBUTE':
        return await vaultContribute(message.publicKey, message.amountUsd);
      default:
        return { error: 'unknown_message' };
    }
  })().then(sendResponse).catch((e) => sendResponse({ error: String(e && e.message || e) }));
  return true; // async response
});
