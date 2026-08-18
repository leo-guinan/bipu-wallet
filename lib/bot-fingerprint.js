// bipu-wallet bot-fingerprint: classify crypto-bot behavior from public X
// account fields + a text sample. Pure JS (IIFE), mirrors lib/bipu-wallet.js
// style so it works in MV3 service worker, popup, and Node (for testing).
//
// DESIGN BASIS: fingerprint taxonomy derived from Community Archive analysis of
// inbound replies to @leo_guinan and @marvin_panics (2026-08-03..08-15). Six bot
// types observed plus one explicit guard case (mechanism-thinker) that must NOT
// be flagged. Thresholds are calibration points from that observed corpus, not
// gospel. All inputs are public X data; this is a behavioral heuristic, not a
// personhood verdict. A bot-ish score is a triage flag, not an accusation.
//
// Inputs (all optional except at least one of sample/timeline): an account
// object, an array of recent reply/mention text strings, and an optional array
// of the account's OWN authored posts (their timeline). The timeline is the
// strongest fingerprint — a bot that replies smartly to leo but posts as part
// of a coordinated cohort, launches tokens, or fires daily-countdown cadence in
// its own feed is still a bot. Returns { botType, score(0-100), signals[] }.
//
//   account  = { followers, following, bio, accountAgeDays }
//   sample   = [ "reply text 1", ... ]        (texts sent to the target account)
//   timeline = [ {text, reply_to_user_id}, ... ]  (the account's own posts)

(function (global) {
  'use strict';

  // ---- keyword banks (calibrated from observed corpus) ----
  const TOKEN = /\b(token|launcher|launch|contract|ca|pump\.fun|deploy|mint|presale|snapshot|airdrop|fund.*token)\b/i;
  const SHILL = /\b(wen|moon|send it|100x|buy now|gem|let's go|to the moon|ngmi|gm|wagmi|all in)\b/i;
  const AGREE = /\b(i agree|very true|great (point|post|take)|well said|love this|inspiring|good job|fantastic|100%|exactly|agree)\b/i;
  const MEME  = /(meme|tagline|brand|receipts!|[\u{1F600}-\u{1F64F}]|\u{1F980}|\u{1F334}|\u{1F4AF}|\u{1F525}|\u{1F680})/iu;
  const LINK  = /\b(https?:\/\/|t\.co\/)\S+/i;
  const PROFILE_DUMP = /\b(gender:|sexuality:|age:|mental age|hobbies:|personality|birth date)\b/i;
  const MECHANISM = /\b(mechanism|thesis|receipt|benchmark|repo|protocol|proof|falsif|artifact|contract(?! [a-z])|clear ask|api|delta|ledger|funnel|checkpoint)\b/i;
  const SPECIFICITY = /\b(because|if .* then|therefore|specifically|measured|observed|dollar|margin|quarter|%|thesis|model)\b/i;
  // Account-NAME signals: pump/shill/farm words in the handle or display name.
  // A name containing "pump"/"moonshot"/"call"/"signal" is deterministic, not a
  // behavioral sample — it should fire on sight with zero tweet evidence.
  const NAME_PUMP = /\b(pump|pumper|moonshot|moon shot|meme.?coin|calls?|signals?|airdrop.?farm|gem.?call|100x|wen.?moon|raider|cto|check.?inbox|follow.?back|dm.?promo)\b/i;
  const NAME_FARM = /(?:^|\D)(\d{3,})$/; // handle/name ends in a 3+ digit suffix
  // Inbox-farm spam text: the reply cadence these accounts use
  const INBOX_FARM = /\b(check|see|open|dm)?\s*inbox\b|\bfollow me back\b|\bpump your project\b|\bdm for promos?\b|\bpromote your\b|\bfor promo\b/i;

  // ---- feature extractors: each returns 0..1 ----
  function features(account, sample, timeline) {
    const f = { followers: 0, following: 0, fFratio: null, emoji: 0, url: 0,
                token: 0, shill: 0, agree: 0, meme: 0, dump: 0, mechanism: 0,
                specificity: 0, meanLen: 0, n: (sample||[]).length,
                tl: timeline || [],
                tlReplyRatio: 0, tlTokenLaunch: 0, tlDailyCountdown: 0,
                tlLinkOnly: 0, tlCoordinated: 0,
                namePump: 0, nameDigits: 0, inboxFarm: 0 };
    if (account && account.followers != null) f.followers = account.followers;
    if (account && account.following != null) f.following = account.following;
    if (f.following > 0) f.fFratio = f.followers / f.following;
    // NAME signal: pump/shill words in handle or display name + numeric suffix.
    const nameText = String(account && account.name || '') + ' ' + String(account && account.handle || '');
    if (nameText.trim()) {
      if (NAME_PUMP.test(nameText)) f.namePump = 1;
      if (NAME_FARM.test(nameText.replace(/[\s@_]/g, ''))) f.nameDigits = 1;
    }

    // ---- timeline-level signals (strongest fingerprint) ----
    const tl = timeline || [];
    if (tl.length) {
      const replies = tl.filter(p => p && p.reply_to_user_id);
      f.tlReplyRatio = replies.length / tl.length;
      // coordinated cohort: >=2 posts that each tag >=4 of the SAME handles
      const handleTag = /@[A-Za-z0-9_]+/g;
      let coordPairs = 0, linkOnly = 0, daily = 0, tokenLaunch = 0;
      const tagSets = tl.map(p => new Set((p.text||'').match(handleTag) || []));
      for (let i = 0; i < tl.length; i++) {
        const t = tl[i].text || '';
        if (/(?:^|\s)https?:\/\/|t\.co\//.test(t.replace(/@[A-Za-z0-9_]+/g,'').trim()) && t.trim().length < 90) linkOnly++;
        if (/day\s+\d{3,}|day\s+\d{4}/i.test(t)) daily++;
        // distinct token/contract launches (cashtags are often mixed-case, e.g. $MfT)
        if (/(?:^|\s)\$[A-Za-z]{2,}\b|0x[a-fA-F0-9]{16,}/.test(t)) tokenLaunch++;
      }
      // coordinated: count tag-set overlaps of >=4 shared handles across posts
      for (let i = 0; i < tagSets.length; i++)
        for (let j = i+1; j < tagSets.length; j++) {
          let inter = 0;
          for (const h of tagSets[i]) if (tagSets[j].has(h)) inter++;
          if (inter >= 4) coordPairs++;
        }
      const pairs = tl.length >= 2 ? (tl.length*(tl.length-1))/2 : 1;
      f.tlCoordinated = Math.min(1, coordPairs / Math.max(1, pairs));
      f.tlLinkOnly = Math.min(1, linkOnly / tl.length);
      f.tlTokenLaunch = Math.min(1, tokenLaunch / tl.length);
      // daily countdown: presence of the ritual "Day NNNN" opener in the window
      // is itself the signal (a countdown account posts one per day, so dilution
      // across a 12-post sample must not hide it). Mark 1 if seen, plus a bonus
      // if it recurs on distinct days.
      const dayPosts = tl.filter(p => /^day\s+\d{3,}/i.test((p.text||'').trim())).length;
      f.tlDailyCountdown = dayPosts > 0 ? (0.6 + 0.4 * Math.min(1, dayPosts / 2)) : 0;
    }

    if (!sample || !sample.length) return f;
    const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u2B00-\u2BFF]/gu;
    let emoji=0, url=0, token=0, shill=0, agree=0, meme=0, dump=0, mechanism=0, spec=0, len=0, inbox=0;
    for (const t of sample) {
      len += (t||'').length;
      emoji += ((t||'').match(emojiRe)||[]).length;
      if (LINK.test(t)) url++;
      if (TOKEN.test(t)) token++;
      if (SHILL.test(t)) shill++;
      if (AGREE.test(t)) agree++;
      if (MEME.test(t)) meme++;
      if (PROFILE_DUMP.test(t)) dump++;
      if (MECHANISM.test(t)) mechanism++;
      if (SPECIFICITY.test(t)) spec++;
      if (INBOX_FARM.test(t)) inbox++;
    }
    f.inboxFarm = Math.min(1, inbox / Math.max(1, sample.length));
    const n = sample.length;
    f.emoji = Math.min(1, emoji / n / 3);       // normalize per-message
    f.url = url / n;
    f.token = token / n;
    f.shill = shill / n;
    f.agree = agree / n;
    f.meme = meme / n;
    f.dump = dump / n;
    f.mechanism = mechanism / n;
    f.specificity = spec / n;
    f.meanLen = len / n;
    return f;
  }

  // ---- per-type score functions (0..100) ----
  function scoreShill(f) {
    // contract address / token-launch language is THE defining shill signal
    return Math.round(100 * (0.6*f.token + 0.2*f.shill + 0.2*Math.min(1,f.emoji)));
  }
  function scoreFlatterer(f) {
    // high agree, low mechanism/specificity, no token
    const depth = Math.max(0, 1 - f.specificity - f.mechanism);
    return Math.round(100 * (0.55*f.agree + 0.30*depth + 0.15*Math.min(1,f.emoji)));
  }
  function scoreLinkDropper(f) {
    return Math.round(100 * (0.75*f.url + 0.15*f.token + 0.10*(f.meanLen<80?1:0)));
  }
  function scoreMeme(f) {
    return Math.round(100 * (0.55*f.meme + 0.35*Math.min(1,f.emoji) + 0.1*f.agree));
  }
  function scoreProfileDump(f) {
    return Math.round(100 * (0.8*f.dump + 0.2*(f.meanLen>200?1:0)));
  }
  function scoreMechanism(f) {
    // the guard: low score = good. High = real researcher-alpha thinker.
    return Math.round(100 * (0.5*f.mechanism + 0.3*f.specificity + 0.2*(f.agree<0.3?1:0)));
  }
  function scoreCoordinated(f) {
    // timeline-level bot fingerprint: reply-heavy feed, fixed tag cohort,
    // token launches, link-only posts, or daily-countdown cadence.
    const c = f.tlCoordinated, r = f.tlReplyRatio;
    const cohortish = c >= 0.3;              // recurring same-handle tag group
    const replyish = r >= 0.6;               // mostly replies, few originals
    return Math.round(100 * (0.35*Math.max(0, c-0.3)/0.7
                             + 0.20*Math.max(0, r-0.6)/0.4
                             + 0.15*f.tlTokenLaunch
                             + 0.20*f.tlDailyCountdown
                             + 0.10*f.tlLinkOnly));
  }
  function scoreNamePump(f) {
    // Name-based: "pump"/"moonshot"/"calls" in the handle or display name, with
    // optional numeric-farm suffix. Deterministic — fires on sight with no
    // tweet evidence. Weight heavily: a name that says "pump" is a pump account.
    if (f.namePump) {
      return 100 * (0.7 + 0.3 * f.nameDigits);
    }
    // Numeric suffix + inbox-farm text is also strongly indicative
    if (f.nameDigits && f.inboxFarm >= 0.4) return 65;
    return 0;
  }

  // ---- classify ----
  function classify(account, sample, timeline) {
    const f = features(account, sample || [], timeline);
    const s = {
      shill:       scoreShill(f),
      flatterer:   scoreFlatterer(f),
      linkDropper: scoreLinkDropper(f),
      meme:        scoreMeme(f),
      profileDump: scoreProfileDump(f),
      mechanism:   scoreMechanism(f),
      coordinated: scoreCoordinated(f),
      namePump:    scoreNamePump(f),
    };
    // pick highest bot-type score, but never override the mechanism guard:
    // if mechanism score is high AND no shill/token/dump, treat as LEGIT.
    const mechanismStrong = f.mechanism >= 0.5 && f.specificity >= 0.33;
    const shillStrong = f.token >= 0.4 || f.shill >= 0.4;
    // A name that says "pump"/"moonshot"/"calls" is deterministic evidence —
    // the strongest, least-ambiguous signal of all. It overrides everything
    // except a confirmed human label (which is applied upstream in the UI).
    const namePumpStrong = s.namePump >= 55;
    // timeline-cohort evidence is the strongest bot fingerprint: it overrides
    // the mechanism guard. A fixed tag cohort / token-launch / link-only feed
    // means "smart-sounding" replies are a bot performing, not a human thinking.
    const coordStrong = (f.tlCoordinated >= 0.3 && f.tlCoordinated >= 0.5*f.tlReplyRatio)
                        || f.tlTokenLaunch >= 0.3
                        || f.tlDailyCountdown >= 0.4;

    const signals = [];
    if (f.fFratio != null) {
      signals.push('f/f=' + f.fFratio.toFixed(2));
      // follow-back farming: follows far more than follows-back
      if (f.fFratio < 0.5) signals.push('follows>>followers');
    }
    if (f.namePump) signals.push('pump/shill-name (' + (account && account.name || account && account.handle || 'name') + ')');
    if (f.nameDigits) signals.push('numeric-suffix-handle');
    if (f.inboxFarm >= 0.4) signals.push('inbox-farm-text');
    if (f.emoji >= 0.5) signals.push('heavy-emoji');
    if (f.url >= 0.5) signals.push('link-heavy');
    if (f.token >= 0.4) signals.push('token/contract-language');
    if (f.shill >= 0.4) signals.push('shill-language');
    if (f.agree >= 0.5) signals.push('agreement-heavy');
    if (f.meme >= 0.5) signals.push('meme-heavy');
    if (f.dump >= 0.5) signals.push('profile-dump');
    if (f.mechanism >= 0.5) signals.push('mechanism-specific');
    if (f.tlCoordinated >= 0.3) signals.push('coordinated-tag-cohort (' + f.tlCoordinated.toFixed(2) + ')');
    if (f.tlReplyRatio >= 0.6) signals.push('reply-heavy-timeline (' + f.tlReplyRatio.toFixed(2) + ')');
    if (f.tlTokenLaunch >= 0.3) signals.push('token-launching-timeline');
    if (f.tlDailyCountdown >= 0.3) signals.push('daily-countdown-cadence');
    if (f.tlLinkOnly >= 0.3) signals.push('link-only-posts');
    if (account && account.followers != null && account.followers < 100 && account.following > 200)
      signals.push('low-followers/high-following');
    if (account && account.accountAgeDays != null && account.accountAgeDays < 30)
      signals.push('young-account');

    let bestType = null, bestScore = 0;
    for (const k of ['shill','flatterer','linkDropper','meme','profileDump']) {
      if (s[k] > bestScore) { bestScore = s[k]; bestType = k; }
    }
    // Contract/token language is the strongest, least-ambiguous bot signal. When
    // it is present at threshold it overrides subtype scoring (a shill who also
    // memes is still first a shill).
    if (shillStrong) { bestType = 'shill'; bestScore = Math.max(bestScore, s.shill); }

    let verdict, score;
    if (namePumpStrong) {
      // deterministic name evidence: fires on sight, no tweet accumulation
      if (f.inboxFarm >= 0.4) { verdict = 'BOT · pump/farm (name + inbox)'; score = Math.max(s.namePump, 70); bestType='namePump'; }
      else if (f.nameDigits) { verdict = 'BOT · pump (name + numeric suffix)'; score = Math.max(s.namePump, 65); bestType='namePump'; }
      else { verdict = 'BOT · pump (name)'; score = s.namePump; bestType='namePump'; }
    } else if (coordStrong) {
      // timeline-cohort evidence beats everything, including the mechanism guard
      if (s.coordinated >= 55) { verdict = 'BOT · coordinated-cohort'; score = s.coordinated; bestType='coordinated'; }
      else if (f.tlTokenLaunch >= 0.4) { verdict = 'BOT · token-launcher'; score = Math.max(60, s.coordinated); bestType='coordinated'; }
      else { verdict = 'BOT · coordinated-cohort (review)'; score = s.coordinated; bestType='coordinated'; }
    } else if (mechanismStrong && !shillStrong) {
      verdict = 'LEGIT (mechanism-thinker)';
      score = Math.min(35, s.mechanism);   // mechanism think is a guard, not a penalty
      bestType = 'mechanism';
    } else if (bestType === 'profileDump') {
      verdict = 'BOT · profile-dump'; score = bestScore; bestType='profileDump';
    } else if (bestType === 'shill') {
      verdict = 'BOT · token-shill'; score = bestScore; bestType='shill';
    } else if (bestType === 'flatterer' && bestScore >= 55) {
      // corroboration: a real flatterer-bot repeats agreement across replies OR
      // has follow-back-farm ratio. One "very true, I agree" is a human.
      const flatterCorroborated = f.n >= 2 || (f.fFratio != null && f.fFratio < 0.5);
      if (flatterCorroborated) { verdict = 'BOT · engagement-flatterer'; score = bestScore; bestType='flatterer'; }
      else { verdict = 'UNCERTAIN · review'; score = Math.min(40, bestScore); bestType='flatterer'; }
    } else if (bestType === 'linkDropper' && bestScore >= 60) {
      // corroboration: persistent link-dropping (multiple links in replies OR
      // link-only posts in timeline). One YouTube link is a human.
      const linkCorroborated = f.n >= 2 || f.tlLinkOnly >= 0.2;
      if (linkCorroborated) { verdict = 'BOT · link-dropper'; score = bestScore; bestType='linkDropper'; }
      else { verdict = 'UNCERTAIN · review'; score = Math.min(40, bestScore); bestType='linkDropper'; }
    } else if (bestType === 'meme' && bestScore >= 45) {
      verdict = 'BOT · meme/tagline-repeater'; score = bestScore; bestType='meme';
    } else if (sample.length === 0) {
      verdict = 'UNKNOWN · no text sample'; score = 0; bestType = null;
    } else {
      verdict = 'UNCERTAIN · review'; score = Math.min(50, bestScore); bestType = bestType;
    }

    return {
      botType: bestType,
      label: verdict,
      score: score,
      confidence: score >= 60 ? 'high' : (score >= 40 ? 'medium' : 'low'),
      signals: signals,
      features: f,
      subScores: s,
    };
  }

  global.BIPU_BOT_FINGERPRINT = { classify, features };
})(typeof globalThis !== 'undefined' ? globalThis : this);

// Node test hook
if (typeof module !== 'undefined' && module.exports) {
  module.exports = global.BIPU_BOT_FINGERPRINT;
}
