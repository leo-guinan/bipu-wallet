// BIPU Wallet — MAIN-world Phantom probe.
// Injected into the active tab's MAIN world via chrome.scripting (world: MAIN).
// This is the ONLY place window.solana (Phantom's provider) actually exists.
// It does NOT sign anything. It only reports provider presence + publicKey and
// relays the user's connect intent to Phantom. It never sees the BIPU key.

(() => {
  const BRIDGE_SOURCE = 'bipu-wallet-extension';
  const INJECTED_SOURCE = 'bipu-wallet-injected';

  function getProvider() {
    // Phantom injects both window.solana (legacy) and window.phantom.solana.
    return (window.solana && window.solana.isPhantom) ? window.solana
      : (window.phantom && window.phantom.solana) ? window.phantom.solana
      : null;
  }

  function post(payload) {
    window.postMessage({ ...payload, source: INJECTED_SOURCE }, '*');
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== BRIDGE_SOURCE) return;

    if (msg.type === 'BIPU_PHANTOM_STATUS') {
      const provider = getProvider();
      post({
        type: 'BIPU_PHANTOM_STATUS_RESULT',
        detected: !!provider,
        isPhantom: !!(provider && provider.isPhantom),
        publicKey: provider && provider.publicKey ? provider.publicKey.toBase58() : null,
        // recent connection may be available synchronously
        connected: !!(provider && provider.publicKey),
      });
      return;
    }

    if (msg.type === 'BIPU_PHANTOM_CONNECT') {
      const provider = getProvider();
      if (!provider) {
        post({ type: 'BIPU_PHANTOM_CONNECT_RESULT', ok: false, error: 'phantom_not_detected' });
        return;
      }
      try {
        // try silent reconnect first; fall back to explicit connect
        try {
          await provider.connect({ onlyIfTrusted: true });
        } catch (_) {
          await provider.connect();
        }
        const pub = provider.publicKey ? provider.publicKey.toBase58() : null;
        post({ type: 'BIPU_PHANTOM_CONNECT_RESULT', ok: !!pub, publicKey: pub, error: pub ? null : 'no_public_key' });
      } catch (e) {
        post({ type: 'BIPU_PHANTOM_CONNECT_RESULT', ok: false, error: String(e && e.message || e) });
      }
      return;
    }

    // "Marvin go long": background builds the swap tx and hands it here for
    // Phantom to SIGN. This probe NEVER does network and NEVER touches funds
    // beyond the signature request — Phantom holds the key. The SOL->OPEN
    // crossing is a manual step surfaced by the background, never faked here.
    if (msg.type === 'BIPU_MARVIN_SIGN_SWAP') {
      try {
        const provider = getProvider();
        if (!provider) throw new Error('phantom_not_detected');
        const b64 = String(msg.swapTransactionBase64 || '');
        if (!b64) throw new Error('no_swap_transaction');
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const tx = solanaWeb3.VersionedTransaction.deserialize(bytes);
        const signed = await provider.signTransaction(tx);
        const signedBytes = signed.serialize();
        const outB64 = btoa(String.fromCharCode(...signedBytes));
        post({ type: 'BIPU_MARVIN_SIGN_SWAP_RESULT', ok: true, signedTransactionBase64: outB64, signature: signed.signatures[0].signature ? btoa(String.fromCharCode(...signed.signatures[0].signature)) : null });
      } catch (e) {
        post({ type: 'BIPU_MARVIN_SIGN_SWAP_RESULT', ok: false, error: String(e && e.message || e) });
      }
      return;
    }
  });

  // announce the probe is alive
  post({ type: 'BIPU_INJECTED_READY', detected: !!getProvider() });
})();
