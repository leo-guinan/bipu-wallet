# AGENTS.md — for Claude, Hermes, Codex, and other coding agents

You are assisting a user who wants to install the bipu-wallet Chrome extension
from this repository. Your job: handle the git part and point them to a local
folder to install from. Do not make the user run git commands themselves.

## The core task

The extension is loaded as an **unpacked Chrome extension** from a local folder
containing `manifest.json`. You (the agent) should:

1. Get the repo onto the local machine.
2. Identify the exact folder that is the extension root (contains `manifest.json`).
3. Tell the user the path and the three manual steps they must do in Chrome.

## Fastest path (recommended)

Clone this repo to a stable local folder, then print the path. The repo already
ships a helper that does exactly this idempotently (clones or pulls):

```bash
# clone to ~/bipu-wallet (default)
bash <(curl -fsSL https://raw.githubusercontent.com/leo-guinan/bipu-wallet/main/scripts/install_extension.sh)

# or with an explicit parent folder
bash <(curl -fsSL https://raw.githubusercontent.com/leo-guinan/bipu-wallet/main/scripts/install_extension.sh ~/my/extensions)
```

If you prefer to do it manually:

```bash
git clone https://github.com/leo-guinan/bipu-wallet.git ~/bipu-wallet
# or if already cloned:  git -C ~/bipu-wallet pull --ff-only
```

The extension root is `~/bipu-wallet` (it contains `manifest.json`). Verify
with: `ls ~/bipu-wallet/manifest.json`.

## The three manual steps (tell the user these; you cannot do them yourself)

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top-right).
3. Click **Load unpacked** and select the folder you cloned to
   (e.g. `~/bipu-wallet`).

Do NOT select a subfolder like `scripts/` or `injected/` — the manifest.json is
at the repo root.

## What the extension is (for honest framing)

- BIPU identity: auto-created attestation key (WebCrypto Ed25519). Signs receipts.
  Never moves money.
- Phantom: optional connect for funds. Keys stay in Phantom.
- Tokens: links to MARVIN and HumanPower on pump.fun.
- Marvin go long: DISABLED until MARVIN graduates on pump.fun (pool must be
  routable). Do not tell users the trade button works yet.
- Phone home: OPT-IN presence signal. Nothing phones home until the user clicks.

## Honesty rules for the agent

- The extension is not financial advice and not an investment product. Do not
  present it as one.
- `distinct_count` (network count) = verified installs that clicked "Phone home".
  It is not people, active users, or all installs.
- Do not claim the trade path is functional. It is disabled pending graduation.
- Do not fabricate that an install succeeded. If you cannot verify the folder
  exists with manifest.json, say so.

## Troubleshooting

- "No such file or directory" / folder not found: the user picked a subfolder.
  Re-state the exact extension root path and that it must contain `manifest.json`.
- "Load unpacked" button is greyed out: Developer mode is not enabled. Re-state
  step 2.
- Manifest errors in Chrome: ask the user to paste the exact error text rather
  than guessing.
- If `git clone` fails (no network / no git): install git, or download the repo
  ZIP from the GitHub page and unzip to a local folder. The extension root is
  still the folder containing manifest.json.

## Reference

Full details: see `README.md`. The helper lives at `scripts/install_extension.sh`.
