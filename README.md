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
- **Bot indicator (tweets)** — a small colored dot next to an author's name on
  x.com / twitter.com flagging confirmed labels and classifier-flagged bots.
  Purely local: no network, no data leaves the browser.

## Bot indicator on tweets

When you browse x.com/twitter.com, the extension shows a small badge next to a
tweet author's name:

- **GOOD** (green) / **BOT** (red) / **HUMAN** (neutral) — accounts Leo has
  already confirmed in review. These are baked in from
  `data/fingerprint/human-decisions.json` and always show.
- **BOT** (red, from the local classifier) — unknown accounts, only after the
  author has enough tweets visible for the classifier to build a sample, and
  only when the signal clears a confidence floor. A triage hint, not a verdict.
- Hover a badge for the reason (known accounts) or the classifier's signals
  (unknown accounts).

Design honesty: the 2026-08 calibration measured **50% precision on 12-tweet
samples**, so a single tweet is weak evidence. Unknown accounts get no badge
until ~3 tweets are accumulated, and the classifier must score above the floor.
Confirmed labels are the high-trust source; the classifier is secondary.

No author data, tweet text, or labels are ever sent anywhere. Everything runs
locally in the content script. Regenerate baked-in labels with
`node scripts/gen-known-labels.js` after adding human-review decisions.

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
- `lib/bot-fingerprint.js` — timeline-aware bot classifier (shared with review).
- `content/bot-indicator.js` — tweet badge content script (x.com/twitter.com).
- `content/known-labels.js` — baked-in confirmed labels (generated).
- `scripts/gen-known-labels.js` — regenerate baked-in labels from decisions.
- `review/bot-review.html` — human review/triage page (flip through, confirm).
- `test-page.html` — fixture harness for the badge content script.
- `collector/` — the phone-home presence collector.

## Security boundary

- The extension wallet's key lives in `chrome.storage.local` (unencrypted). It is
  low-stakes attestation only. Never put treasury or large funds in it.
- Money movement goes through Phantom; the BIPU key never signs a transfer.
- The `Marvin go long` path is gated by pool routability and requires a two-step
  confirm. It refuses to fake a trade when the pool can't route.

## License

MIT
