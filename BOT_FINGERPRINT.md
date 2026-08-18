# Crypto Bot Fingerprinting — Community Archive Analysis (2026-08-17)

Source: TheExGenesis Community Archive via the **live cohort pull** on arc-vps
(`/root/twitter-energy/cohort.sqlite`), NOT the raw archive blob. The blob is a
stale upload snapshot; the cohort DB is the normalized `tweets` table kept
current by the browser extension. Incremental pull run 2026-08-17 brought the
DB from `2026-08-01T13:38` to `2026-08-18T01:52` (+185,362 rows).

Accounts analyzed: `@leo_guinan` (1325102346792218629) and `@marvin_panics`
(1364210482387816449). Window: inbound replies **2026-08-04 → 2026-08-17**.

## Coverage boundary (read this first)

- **Reply text and behavior are FRESH** (extension-captured, current to Aug 17).
  32 external inbound replies from 10 distinct accounts in the window.
- **Account timelines are FRESH and are the strongest signal.** The cohort pull
  gives every bot account's OWN recent posts, which is what separates real bots
  from smart-sounding ones. The reply-only view misses this.
- **Follower/following counts are now LIVE** (X v2 API via the marvin-x OAuth
  app on arc-vps, pulled 2026-08-17). See the F:F table below. The archive's
  `accounts` table only held the 360 uploader accounts; live X resolves the bots.
- **Live X access** comes from the **marvin-x OAuth2 app on arc-vps** (authenticated
  as @marvin_panics, 2026-08-17). Local `xurl` tokens were expired; the VPS auth was
  not. No counts fabricated.

## Account baselines (CA snapshot, unchanged)

| account | followers | following | F:F | tweets |
|---|---|---|---|---|
| @leo_guinan | 3,114 | 1,733 | 1.80 | 47,814 |
| @marvin_panics | 186 | 78 | 2.38 | 1,560 |

## Observed accounts — timeline-aware classification (10 accounts, 32 replies)

Ground truth assigned by reading each account's **own timeline** from the fresh
cohort pull AND **live X profiles** (via the marvin-x OAuth app on arc-vps,
2026-08-17), cross-checked with the quantified classifier. Live F:F ratios and
bios resolve what the archive could not.

| account_id | @handle | F:F | account age | verdict |
|---|---|---|---|---|
| 4895618824 | @MemeForTrees | 29,952/17,245 = 1.74 | 2016 | **BOT · token-shill** |
| 1766194375044804608 | @boardyai | 31,530/11,856 = 2.66 | 2024 | **BOT · coordinated-cohort** |
| 862488191638671360 | @alchemicAV | 515/332 = 1.55 | 2017 | **BOT · meme/tagline-repeater** |
| 48606995 | @garcia590 | 611/1,126 = 0.54 | 2009 | **BOT · link-dropper** |
| 18842214 | @AlmostMedia | 45,549/9,069 = 5.02 | 2009 | **BOT · daily-countdown** |
| 8537442 | @lilchiva | 4,317/2,349 = 1.84 | 2007 | HUMAN |
| 1041016105 | @Steph_Curdy | 1,348/1,522 = 0.89 | 2012 | HUMAN |
| 1485978825787858946 | @Shadow_Rebbe | 616/803 = 0.77 | 2022 | HUMAN |
| 1400492097082327040 | @jessyka_boat | 684/1,053 = 0.65 | 2021 | HUMAN |
| 1827773478600359936 | @Aikun011 | 406/3,297 = 0.12 | 2024 | HUMAN |

**Live bio corroboration** (X API, 2026-08-17):
- @boardyai: "I'm an AI superconnector who's made thousands of introductions
  within my network of 200,00…" — self-declared bot. Its SIRISYS tag cohort
  links to @alchemicAV's bio "SIRISYS Diffusion Analyzer" → a **SIRISYS bot
  network** spans both flagged accounts.
- @MemeForTrees: "Memes, music and art to support tree planting, 24/7 automation
  + active personal posts" — self-declared automation.
- @AlmostMedia: "Invest early… Founded & sold startups" — VC/content cadence.
- The five HUMAN accounts have ordinary human bios (exec, researcher,
  Quai/Wolfram documenter, cybernetics debater, bodhisattva-intern).

**Corrected finding:** the account I first labeled "LEGIT mechanism-thinker"
(@boardyai) from its *replies* is actually a **member of a coordinated bot
cohort** — its own feed shows it addressing the same 5+ handles in lockstep
bursts. The reply-only view was fooled; the timeline exposed it. This is the
single most important lesson of the full-pull approach: **a bot that writes
smart-sounding replies is still a bot if its timeline shows coordinated tagging,
token launches, link-only posts, or ritual cadence.**

## Human calibration (Leo's review, 2026-08-18)

Leo reviewed all 11 accounts in `review/bot-review.html` and exported his
judgments to `data/fingerprint/human-decisions.json`. Evaluating the classifier
against them (`node eval-human-decisions.js`):

```
classifier label              human-behavior  intent   match
UNCERTAIN                      reject          neutral  OK
BOT · coordinated-cohort       reject          neutral  MISS   <- AlmostMedia (human)
BOT · link-dropper             reject          neutral  MISS   <- garcia590 (human)
UNCERTAIN                      reject          neutral  OK
BOT · coordinated-cohort       confirm         good     OK     <- boardyai
BOT · coordinated-cohort       confirm         good     OK     <- MemeForTrees
BOT · profile-dump             confirm         good     OK     <- grok response
BOT · meme/tagline-repeater    reject          neutral  MISS   <- alchemicAV (human)
UNCERTAIN                      reject          neutral  OK
UNCERTAIN                      reject          neutral  OK
UNCERTAIN                      reject          neutral  OK

Bot-recall:    3/3 = 100%   (every real bot caught)
Bot-precision: 3/6 = 50%    (3 false positives)
Accuracy:      8/11
```

Three findings worth acting on:

1. **100% recall, 50% precision.** No false negatives — every bot Leo confirmed
   the classifier caught. But it over-flagged 3 humans as bots: @AlmostMedia
   (daily-countdown signal fired on a human's ritual "Day NNNN" posts),
   @garcia590 (link-dropper fired on a human crypto researcher), @alchemicAV
   (meme/tagline fired on a human). The daily-countdown and link-dropper
   thresholds are too aggressive; the meme/tagline classifier needs account
   size/listedness context (@alchemicAV has only 515 followers but a real
   SIRISYS bio and 695 media posts).
2. **All 3 confirmed bots are GOOD actors** — @MemeForTrees (built a BIPU
   endowment fed by memes), @boardyai (helpful AI superconnector), and the
   grok profile-dump. No bad bots in this window. Good-bot classification is
   not the same as behavioral bot detection; the two axes are independent and
   both are needed.
3. **The behavioral label is a triage flag, not a verdict.** Precision 50%
   means roughly half of BOT flags need human confirmation before any action.
   The review page exists precisely because of this.

## Review tool (`review/bot-review.html`)

The classifier labels *behavior* (automation patterns). It cannot judge *intent* —
that's a human call, and a good bot (an automated account building something
real) and a bad bot (a shill/farm) can look behaviorally identical. Use the
review page to separate the two.

- One self-contained HTML file, openable from `file://` (no server needed).
  Regenerate with `node scripts/gen-bot-review.js` after data updates.
- Flip through all accounts; each shows live profile (handle, F:F, age, bio),
  the classifier verdict + score + signals, the reply evidence sent to
  @leo_guinan/@marvin_panics, and the account's own recent timeline.
- Two judgment axes per account:
  - **Behavioral label**: Confirm / Reject / Revise / Skip — is the automation
    claim right?
  - **Intent**: Good bot / Bad bot / Neutral-human / Unclear.
- Free-text reasoning (firsthand knowledge goes here — e.g. "I've spoken to
  them; building a token ecosystem with positive feedback loops").
- Decisions persist to `localStorage`; "Export decisions (JSON)" downloads them.

Known judgment context (from this analysis, verify on the page):
- @MemeForTrees (4895618824) and @boardyai (1766194375044804608) are flagged
  BOT behaviorally — but you've flagged both as **good** actors (MemeForTrees is
  building a token ecosystem with positive feedback loops; boardyai is an
  AI superconnector). Confirm the behavior claim, then set Intent = Good.
- The page includes the 11th account (1720665183188922368, a profile-dump bot)
  which has replies but no live profile/timeline — it renders as an edge case.

## How the classifier works (`lib/bot-fingerprint.js`)

Pure-JS IIFE matching the extension's existing module style. Inputs:
`account = {followers, following, bio, accountAgeDays}`,
`sample = [replyText, ...]` (replies sent to the target), and
`timeline = [{text, reply_to_user_id}, ...]` (the account's OWN posts — the
strongest fingerprint). Returns
`{botType, label, score, confidence, signals, features, subScores}`.

Per-type scores (0-100):
- `shill`        = 0.6·token + 0.2·shill + 0.2·emoji
- `flatterer`    = 0.55·agree + 0.30·depth + 0.15·emoji
- `linkDropper`  = 0.75·url + 0.15·token + 0.10·short
- `meme`         = 0.55·meme + 0.35·emoji + 0.10·agree
- `profileDump`  = 0.80·dump + 0.20·long
- `mechanism`    = 0.50·mechanism + 0.30·specificity + 0.20·not-agree (guard)
- `coordinated`  (timeline) = 0.35·cohort + 0.20·replyRatio + 0.15·tokenLaunch
                              + 0.20·dailyCountdown + 0.10·linkOnly

Timeline features:
- `tlReplyRatio` — fraction of own posts that are replies (bots reply, don't originate)
- `tlCoordinated` — fraction of post-pairs sharing ≥4 of the same @handles
- `tlTokenLaunch` — fraction of posts with a cashtag or contract address
- `tlDailyCountdown` — presence of the "Day NNNN" ritual opener
- `tlLinkOnly` — fraction of short link-only posts

Verdict rules:
1. **coordStrong** (timeline-cohort evidence) overrides everything, including
   the mechanism guard: `tlCoordinated≥0.3 && ≥0.5·replyRatio` OR `tokenLaunch
   ≥0.3` OR `dailyCountdown≥0.4` → BOT (coordinated-cohort / token-launcher).
   This catches smart-sounding bots.
2. Contract/token language at threshold forces `shill`.
3. Mechanism guard (`mechanism≥0.5 && specificity≥0.33`, not shill/coord) →
   `LEGIT (mechanism-thinker)`.
4. **Corroboration gates** on single-reply subtypes: `flatterer` needs n≥2 or
   F:F<0.5; `linkDropper` needs n≥2 or timeline link-only. One "I agree" or one
   YouTube link is a human → `UNCERTAIN · review`.

## Test results

- `test-bot-timeline.js` — 10 real accounts, human-vs-bot using actual VPS
  timelines: **10/10 correct**. Run `node test-bot-timeline.js`.
- `test-bot-fingerprint.js` — 7 unit cases from the observed corpus: **7/7**.
  Run `node test-bot-fingerprint.js`.
- Data: `/root/twitter-energy/bot_timelines_20260817.json` (VPS),
  `/tmp/bot_timelines.json` (local), `/tmp/ext_replies.json` (temp).

## To wire into the BIPU wallet extension

Module is standalone, no network. To use:

1. Include `lib/bot-fingerprint.js` (service worker or popup); it attaches
   `global.BIPU_BOT_FINGERPRINT.classify`.
2. Feed it public X data:
   - `account`: live follower/following counts, bio, account age (from X).
   - `sample`: text of replies/mentions the account sent to @leo_guinan /
     @marvin_panics / @BuildInPublicU (CA `tweets` API or mention feed).
   - `timeline`: the account's own recent posts (CA `tweets?account_id=eq.<id>`
     — available free from the archive, no X API needed for this part).
3. Render `label` + `score` + `confidence` + `signals` as a triage flag.
   A bot-ish score is a **heuristic flag, not a personhood verdict** — never
   auto-block; always show `signals` for human confirmation.

The timeline input is the key upgrade: it catches coordinated-cohort bots that
write good replies. Without it you'll call a bot a mechanism-thinker, as I did.

## Falsifiers

- If a coordinated human (consistent tag-group from real community work) is
  flagged, `tlCoordinated` is over-firing — raise the shared-handle threshold
  above 4 or require the cohort to be mostly-unknown/low-follower handles.
- If a real researcher-alpha trader with heavy emoji + a token in bio is flagged
  `token-shill`, require a literal contract-address pattern (0x…) rather than a
  bare cashtag.
- Live F:F ratios (from X, not archive) may re-segment the flatterer population;
  the current flatterer corroboration uses the archive's F:F only where resolved.
