// BIPU bot indicator — content script for x.com / twitter.com.
//
// Shows a small colored dot next to a tweet author's name when there is a
// meaningful bot/account signal. Two sources feed it:
//
//   1. KNOWN_LABELS — the confirmed human-review decisions (baked in at build
//      time from data/fingerprint/human-decisions.json). These are Leo's own
//      judgments, highest trust. Shown as GOOD (green) / BOT (amber) / HUMAN.
//   2. Local classifier — runs BIPU_BOT_FINGERPRINT.classify on the author's
//      tweet text accumulated across the scroll session (sample grows as you
//      see more of an author). Pure local, no network, no data leaves browser.
//      A badge appears only when the classifier returns a real BOT signal with
//      at least medium confidence.
//
// Honesty: a single tweet is weak evidence (the 2026-08 analysis measured 50%
// precision on 12-tweet samples). So unknown accounts start with NO badge; the
// classifier needs a few tweets before it is allowed to flag anything. When it
// does flag, the badge is a triage hint, not a verdict. Known labeled accounts
// always show their confirmed label.
//
// Requires lib/bot-fingerprint.js to run first (declared before this in the
// manifest content_scripts array so its BIPU_BOT_FINGERPRINT global exists).

(function () {
  'use strict';
  if (window.__BIPU_BOT_INDICATOR__) return; // idempotent
  window.__BIPU_BOT_INDICATOR__ = true;

  var fp = globalThis.BIPU_BOT_FINGERPRINT;
  if (!fp || !fp.classify) {
    console.warn('[bipu-bot] classifier not loaded; indicator disabled');
    return;
  }

  // ---- baked-in confirmed human labels (from data/fingerprint/human-decisions.json) ----
  var KNOWN = globalThis.__BIPU_KNOWN_LABELS__ || {}; // injected by generator; { handleLower: {behavioral, intent, reason} }

  // ---- per-author accumulated sample (tweet text) for the local classifier ----
  var samples = {};   // handleLower -> array of tweet text
  var MIN_TWEETS = 3; // require this many tweets before the classifier may flag an unknown account
  var MIN_SCORE = 45; // classifier BOT score floor (roughly matches 50%-precision calibration)

  // ---- styling ----
  var CSS = '' +
    '.bipu-badge{display:inline-flex;align-items:center;margin-left:6px;font-size:10px;font-weight:700;' +
      'letter-spacing:.3px;border-radius:999px;padding:1px 6px;line-height:1.4;vertical-align:middle;cursor:default;' +
      'border:1px solid transparent;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}' +
    '.bipu-badge.bipu-good{background:#12301f;color:#7ee2a8;border-color:#1f6f43}' +
    '.bipu-badge.bipu-bot{background:#3d1d1d;color:#ffb3b3;border-color:#6e2a2a}' +
    '.bipu-badge.bipu-human{background:#21262d;color:#c9d1d9;border-color:#30363d}' +
    '.bipu-badge.bipu-hint{background:#2a2310;color:#e3c36b;border-color:#5e4d1a}' +
    '.bipu-badge:hover{border-color:#58a6ff}' +
    '.bipu-tip{position:fixed;max-width:280px;background:#0d1117;color:#e6edf3;border:1px solid #30363d;' +
      'border-radius:8px;padding:8px 10px;font-size:11px;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.5);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;pointer-events:none}' +
    '.bipu-tip b{color:#fff}' +
    '.bipu-tip .k{color:#7d8590}';

  function ensureCss() {
    if (document.getElementById('bipu-bot-indicator-css')) return;
    var st = document.createElement('style');
    st.id = 'bipu-bot-indicator-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function addTip(el, html) {
    var tip = document.createElement('div');
    tip.className = 'bipu-tip';
    tip.innerHTML = html;
    document.body.appendChild(tip);
    el.addEventListener('mouseenter', function (e) {
      var r = el.getBoundingClientRect();
      tip.style.left = Math.max(4, Math.min(e.clientX + 10, window.innerWidth - 290)) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      tip.style.display = 'block';
    });
    el.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function shortReason(r) {
    if (!r) return '';
    var t = String(r);
    return t.length > 110 ? t.slice(0, 107) + '…' : t;
  }

  // ---- extract author handle + display name + tweet text from a tweet article ----
  function extractTweet(article) {
    var handle = null, name = '', text = '';
    // author name block contains the display name + @handle in spans
    var userBlock = article.querySelector('[data-testid="User-Name"]');
    if (userBlock) {
      var spans = userBlock.querySelectorAll('span');
      for (var i = 0; i < spans.length; i++) {
        var t = (spans[i].textContent || '').trim();
        if (/^@[A-Za-z0-9_]{1,15}$/.test(t)) { handle = t.toLowerCase().replace(/^@/, ''); }
        else if (t && !name) { name = t; }
      }
    }
    if (!handle) {
      // fallback: any link whose href matches /<handle>/status/
      var links = article.querySelectorAll('a[href*="/status/"]');
      for (var j = 0; j < links.length; j++) {
        var m = (links[j].getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,15})\/status\//);
        if (m) { handle = m[1].toLowerCase(); break; }
      }
    }
    var textEl = article.querySelector('[data-testid="tweetText"]');
    if (textEl) text = textEl.textContent || '';
    return { handle: handle, name: name, text: text };
  }

  // ---- render a badge into the author name block ----
  // Guard is PER-ARTICLE, not per-handle: on a scrolling SPA each tweet is its
  // own <article>, and React re-renders replace article nodes (wiping badges).
  // So every article whose author has a label gets one badge, and a badge that
  // got wiped by a re-render is re-added on the next scan.
  function renderBadge(article, handle, badge) {
    if (article.querySelector('.bipu-badge[data-bipu-handle="' + handle + '"]')) return;
    var userBlock = article.querySelector('[data-testid="User-Name"]');
    if (!userBlock) return;

    var el = document.createElement('span');
    el.className = 'bipu-badge ' + badge.cls;
    el.textContent = badge.label;
    el.setAttribute('data-bipu-handle', handle);
    if (badge.tip) addTip(el, badge.tip);
    userBlock.appendChild(el);
  }

  // ---- decide + render for one tweet ----
  function processArticle(article) {
    var info = extractTweet(article);
    if (!info.handle) return;
    if (!info.text) return;

    var known = KNOWN[info.handle];
    if (known) {
      // known labeled account -> always show its confirmed label
      var intent = known.intent;
      if (intent === 'good') {
        renderBadge(article, info.handle, {
          cls: 'bipu-good', label: 'GOOD',
          tip: '<b>@' + esc(info.handle) + '</b> — confirmed good bot.<br><span class="k">' +
               esc(shortReason(known.reason)) + '</span>',
        });
      } else if (intent === 'bad') {
        renderBadge(article, info.handle, {
          cls: 'bipu-bot', label: 'BOT',
          tip: '<b>@' + esc(info.handle) + '</b> — confirmed bad bot.<br><span class="k">' +
               esc(shortReason(known.reason)) + '</span>',
        });
      } else {
        renderBadge(article, info.handle, {
          cls: 'bipu-human', label: 'HUMAN',
          tip: '<b>@' + esc(info.handle) + '</b> — confirmed human.<br><span class="k">' +
               esc(shortReason(known.reason)) + '</span>',
        });
      }
      return;
    }

    // unknown account: accumulate sample
    if (!samples[info.handle]) samples[info.handle] = [];
    var s = samples[info.handle];
    // avoid double-counting the same text within a session
    if (s.indexOf(info.text) === -1) s.push(info.text);

    var account = { name: info.name, handle: info.handle };
    var r = fp.classify(account, s, []); // sample only; no profile/timeline fetch

    // A pump/shill NAME fires instantly — deterministic evidence, no tweet wait.
    // Classifier's namePump score is already >=55 in this case.
    var nameFired = r.subScores && r.subScores.namePump >= 55;
    if (s.length < MIN_TWEETS && !nameFired) return; // not enough evidence yet (name bypasses this)

    if (r.label.indexOf('BOT') === 0 && r.score >= MIN_SCORE) {
      renderBadge(article, info.handle, {
        cls: 'bipu-bot', label: 'BOT',
        tip: '<b>@' + esc(info.handle) + '</b> — classifier: ' + esc(r.label) +
             ' (score ' + r.score + ', ' + r.confidence + ').<br>' +
             '<span class="k">Signals: ' + esc((r.signals || []).join(', ') || 'none') + '</span>' +
             '<br><span class="k">Heuristic hint, not a verdict.</span>',
      });
    } else if (r.confidence === 'high' && r.label.indexOf('LEGIT') === 0) {
      renderBadge(article, info.handle, {
        cls: 'bipu-human', label: 'HUMAN',
        tip: '<b>@' + esc(info.handle) + '</b> — classifier: mechanism-thinker pattern.',
      });
    }
  }

  // ---- scan all tweet articles on the page ----
  function scan() {
    ensureCss();
    var articles = document.querySelectorAll('article[data-testid="tweet"]');
    for (var i = 0; i < articles.length; i++) processArticle(articles[i]);
  }

  // SPA: rescan on DOM mutations (debounced via idle callback)
  var scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    var fn = function () { scheduled = false; try { scan(); } catch (e) {} };
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 800 });
    else setTimeout(fn, 300);
  }
  var mo = new MutationObserver(scheduleScan);
  function start() {
    ensureCss();
    scan();
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
