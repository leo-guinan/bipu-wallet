// BIPU Wallet — isolated-world bridge.
// The extension's service worker and content scripts run in an ISOLATED world,
// which cannot see window.solana (that only exists in the page's MAIN world).
// This script relays postMessage between the injected MAIN-world probe and the
// background service worker. It is injected into the active tab on demand.

const INJECTED_SOURCE = 'bipu-wallet-injected';

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== INJECTED_SOURCE) return;
  // forward any injected-probe result to the service worker
  chrome.runtime.sendMessage({ ...msg, _bridge: true });
});

// Tell the background this bridge is live so it knows the tab can route.
chrome.runtime.sendMessage({ type: 'BIPU_BRIDGE_READY', _bridge: true });
