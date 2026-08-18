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
- **Developer mode (training)** — capture the tweets/notifications you view into
  a downloadable JSONL training dump for offline analysis, building toward a
  fast account-lookup service the extension can use. Local only; nothing leaves
  the browser until you click Export.

## Developer mode — training capture

Building the bot indicator on real data requires a labeled corpus. Developer
mode collects it:

1. Open the popup → **Developer mode** → toggle **Training capture on**.
2. Browse x.com normally. Every tweet/notification the content script sees is
   accumulated (deduped by tweet URL) with its classifier verdict into a local
   buffer (`chrome.storage.local`).
3. Click **Capture current view** to force-scan what's on screen, or **Export
   dump (JSONL)** to download `bipu-train-capture-<stamp>.jsonl`.
4. Analyze the dump offline, then build the lookup artifact:

```bash
node scripts/build-lookup.js path/to/capture.jsonl  # -> lookup.json next to it
```

`lookup.json` (schema `bipu.lookup.v1`) is a compact per-handle summary —
aggregate verdict (bot/human/uncertain/mixed/thin), bot/human/uncertain counts,
top label + score, top signals, first/last seen, and tweet URLs. It's the seed
for the quick-lookup service: the extension can bundle it to short-circuit
re-classifying accounts it has already seen in a dump. Regenerate it after each
fresh dump.

The capture record schema is `bipu.train_capture.v1`:
`{schema, captured_at, source (home/notifications/tweet_detail/other),
page_url, tweet:{handle,name,text,url}, classifier:{label,score,confidence,signals}}`.

Nothing phones home. Capture is written only to local storage; the only way data
leaves the browser is your explicit **Export dump** download.

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
- `content/bot-indicator.js` — tweet badge content script + training capture (x.com/twitter.com).
- `content/known-labels.js` — baked-in confirmed labels (generated).
- `scripts/gen-known-labels.js` — regenerate baked-in labels from decisions.
- `scripts/build-lookup.js` — build a per-handle lookup artifact from a training dump.
- `review/bot-review.html` — human review/triage page (flip through, confirm).
- `test-page.html` — fixture harness for the badge content script.
- `test-train.html` — training-capture harness.
- `collector/` — the phone-home presence collector.

## Security boundary

- The extension wallet's key lives in `chrome.storage.local` (unencrypted). It is
  low-stakes attestation only. Never put treasury or large funds in it.
- Money movement goes through Phantom; the BIPU key never signs a transfer.
- The `Marvin go long` path is gated by pool routability and requires a two-step
  confirm. It refuses to fake a trade when the pool can't route.

## License

MIT
