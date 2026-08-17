// End-to-end test of the Phantom detection path (the thing that was failing).
// Simulates: a page window with postMessage, a mock Phantom provider injected
// as window.solana, then loads injected/phantom-main.js (MAIN world) and a
// mock bridge, and verifies the STATUS -> RESULT roundtrip.
'use strict';
const fs = require('fs');
const vm = require('vm');

function makeWindow() {
  const listeners = [];
  return {
    listeners,
    postMessage(data, origin) { for (const l of listeners) l({ source: this, data }); },
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
    _trigger(source, data) { for (const l of listeners) l({ source, data }); },
  };
}

async function run() {
  const window = makeWindow();

  // Mock Phantom provider injected into window.solana (what Phantom actually does).
  // # git-secret-ignore — the string below is a fabricated test fixture, not a real key.
  window.solana = {
    isPhantom: true,
    publicKey: { toBase58: () => 'Phan1omMockPublicKey1234567890abcdefghijkl' },
    async connect(opts) { return { publicKey: this.publicKey }; },
  };

  // Load the MAIN-world probe into the window context.
  const probeSrc = fs.readFileSync(__dirname + '/../injected/phantom-main.js', 'utf8');
  const sandbox = { window, self: window, location: { href: 'https://example.com' } };
  vm.createContext(sandbox);
  vm.runInContext(probeSrc, sandbox);

  // Bridge simulation: relay any INJECTED_SOURCE message as if bridge.js did.
  const results = [];
  window.addEventListener('message', (event) => {
    if (event.data && event.data.source === 'bipu-wallet-injected') results.push(event.data);
  });

  // Simulate the background posting a STATUS request into MAIN world.
  await new Promise((r) => setTimeout(r, 50));
  window._trigger(window, { source: 'bipu-wallet-extension', type: 'BIPU_PHANTOM_STATUS' });

  await new Promise((r) => setTimeout(r, 100));

  const statusRes = results.find((r) => r.type === 'BIPU_PHANTOM_STATUS_RESULT');
  if (!statusRes) throw new Error('no status result');
  if (!statusRes.detected) throw new Error('provider not detected');
  if (statusRes.publicKey !== window.solana.publicKey.toBase58()) throw new Error('wrong publicKey');

  console.log('PASS: provider detected =', statusRes.detected);
  console.log('PASS: isPhantom         =', statusRes.isPhantom);
  console.log('PASS: publicKey         =', statusRes.publicKey);

  // Test CONNECT path
  window._trigger(window, { source: 'bipu-wallet-extension', type: 'BIPU_PHANTOM_CONNECT' });
  await new Promise((r) => setTimeout(r, 100));
  const connRes = results.find((r) => r.type === 'BIPU_PHANTOM_CONNECT_RESULT');
  if (!connRes || !connRes.ok) throw new Error('connect failed: ' + JSON.stringify(connRes));
  console.log('PASS: connect ok =', connRes.ok, 'pub =', connRes.publicKey);
  console.log('ALL PASS');
}

run().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
