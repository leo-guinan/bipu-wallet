// bipu-wallet: pure-JS Solana keypair generation via WebCrypto Ed25519.
// No web3.js dependency. Keypair = ed25519 keypair; Solana address = base58(pubkey).
// Shared by the extension service worker and popup. Works in both MV3 (browser
// WebCrypto) and Node (node:crypto webcrypto) for testing.

(function (global) {
  'use strict';

  const b58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function base58Encode(bytes) {
    const bytesArr = Array.from(bytes);
    let digits = [0];
    for (let i = 0; i < bytesArr.length; i++) {
      let carry = bytesArr[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    let out = '';
    for (let k = 0; k < bytesArr.length && bytesArr[k] === 0; k++) out += '1';
    for (let i = digits.length - 1; i >= 0; i--) out += b58[digits[i]];
    return out;
  }

  // Generate a fresh Solana keypair.
  // Returns { publicKeyBase58, publicKeyB64, privateKeyJwk }
  async function generateKeypair() {
    const { subtle } = global.crypto;
    const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
    const jwk = await subtle.exportKey('jwk', kp.privateKey);
    return {
      publicKeyBase58: base58Encode(pub),
      publicKeyB64: btoa(String.fromCharCode(...pub)),
      privateKeyJwk: jwk, // includes seed ('d'), kept extractable so we can store + re-import
    };
  }

  // Sign a message with a stored JWK private key. Returns 64-byte ed25519 sig (base64).
  async function signWithJwk(jwk, messageBytes) {
    const { subtle } = global.crypto;
    const key = await subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
    const sig = new Uint8Array(await subtle.sign({ name: 'Ed25519' }, key, messageBytes));
    return btoa(String.fromCharCode(...sig));
  }

  global.BIPU_WALLET = { generateKeypair, signWithJwk, base58Encode };
})(typeof globalThis !== 'undefined' ? globalThis : this);
