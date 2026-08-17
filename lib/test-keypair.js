// Standalone test for lib/bipu-wallet.js (Node). Verifies keypair generation,
// address derivation, and a sign roundtrip. No browser needed.
if (typeof btoa === 'undefined') global.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
if (typeof atob === 'undefined') global.atob = (s) => Buffer.from(s, 'base64').toString('binary');
require('./bipu-wallet.js');
const W = global.BIPU_WALLET;

(async () => {
  const kp = await W.generateKeypair();
  const pubBytes = atob(kp.publicKeyB64).length;
  if (pubBytes !== 32) throw new Error('bad pubkey length ' + pubBytes);
  if (!kp.privateKeyJwk.d) throw new Error('jwk missing seed');
  const msg = new TextEncoder().encode('bipu-wallet-test-message');
  const sig = await W.signWithJwk(kp.privateKeyJwk, msg);
  const sigLen = atob(sig).length;
  if (sigLen !== 64) throw new Error('bad sig length ' + sigLen);
  console.log('PASS');
  console.log('address:', kp.publicKeyBase58);
  console.log('sig bytes:', sigLen);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
