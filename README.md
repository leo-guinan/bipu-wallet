# bipu-wallet

A progressive browser extension for the Build in Public University ecosystem:
attestation identity, optional Phantom connection, and an opt-in presence signal.

This is an experimental, local-first extension. It is not financial advice, not a
fund, and not an investment product.

## What it does

- **BIPU identity (attestation)** — auto-created, always on, WebCrypto Ed25519.
  Signs participation receipts. Never moves money.
- **Phantom (funds)** — connect your existing Phantom wallet. This is the only
  money-moving path. Keys stay in Phantom.
- **Tokens** — quick links to MARVIN and HumanPower (HP) on pump.fun.
- **Marvin go long (disabled)** — sells MARVIN for SOL via your Phantom, then
  records a commitment to an OPEN long. Currently **disabled until MARVIN
  graduates on pump.fun** (the pool must be routable before any trade is
  possible). The SOL→OPEN crossing is a manual step; the button never opens a
  stock position for you.
- **Phone home (opt-in)** — tells the network you exist.

## The network count, stated honestly

`distinct_count` on the live summary is the number of **verified BIPU installs
that clicked "Phone home"** — a real extension signing a claim with its key. It
is NOT:
- the number of installs (people who never opt in are not counted),
- active users (a one-time ping counts the same as daily use),
- people (a bot with the extension could count).

The collector verifies an Ed25519 signature, dedupes by public key, and returns
only aggregate counts. It never returns raw public keys. See `collector/README.md`.

## Install (local dev)

1. `chrome://extensions` → Developer mode → **Load unpacked** → select this directory.
2. Open any web page (Phantom must be installed to use the funds path).
3. Open the popup.

## Repo layout

- `manifest.json`, `background.js`, `popup.*`, `bridge.js` — MV3 extension core.
- `injected/phantom-main.js` — MAIN-world probe that sees `window.solana`.
- `injected/web3-bundle.js` — bundled `@solana/web3.js` (build artifact).
- `lib/bipu-wallet.js` — pure WebCrypto Ed25519 keypair + signing.
- `collector/` — the phone-home presence collector.

## Security boundary

- The extension wallet's key lives in `chrome.storage.local` (unencrypted). It is
  low-stakes attestation only. Never put treasury or large funds in it.
- Money movement goes through Phantom; the BIPU key never signs a transfer.
- The `Marvin go long` path is gated by pool routability and requires a two-step
  confirm. It refuses to fake a trade when the pool can't route.

## License

MIT
