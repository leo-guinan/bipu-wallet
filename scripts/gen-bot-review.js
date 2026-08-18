#!/usr/bin/env node
// Generate a self-contained bot-review HTML page.
// Reads: lib/bot-fingerprint.js (classifier), data/fingerprint/*.json (fixtures).
// Emits: review/bot-review.html — one file, no build step, openable from file://.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const classifierSrc = fs.readFileSync(path.join(ROOT, 'lib', 'bot-fingerprint.js'), 'utf8');
const accounts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fingerprint', 'live_bot_accounts.json'), 'utf8'));
const timelines = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fingerprint', 'bot_timelines.json'), 'utf8'));
const replies = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'fingerprint', 'ext_replies.json'), 'utf8'));

// group replies by account_id
const replyByAcct = {};
for (const r of replies) {
  (replyByAcct[r.account_id] = replyByAcct[r.account_id] || []).push({
    created_at: r.created_at, text: r.full_text,
  });
}

// order accounts by reply count desc (most active first)
const order = Object.keys(replyByAcct).sort((a, b) =>
  (replyByAcct[b] || []).length - (replyByAcct[a] || []).length);

const payload = { accounts, timelines, replyByAcct, order };

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BIPU Bot Review — fingerprint triage</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    background: #0d1117; color: #e6edf3; line-height: 1.5; -webkit-font-smoothing: antialiased;
  }
  header { padding: 20px 28px; border-bottom: 1px solid #21262d; display: flex; align-items: baseline; gap: 16px; }
  header h1 { font-size: 17px; font-weight: 600; letter-spacing: 0.2px; }
  header .sub { color: #7d8590; font-size: 13px; }
  header .progress { margin-left: auto; color: #7d8590; font-size: 13px; }
  main { max-width: 980px; margin: 0 auto; padding: 24px 28px 60px; }
  .deck { display: flex; gap: 18px; align-items: center; margin-bottom: 20px; }
  .deck button {
    background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px;
    padding: 8px 16px; font-size: 14px; cursor: pointer;
  }
  .deck button:hover:not(:disabled) { background: #30363d; }
  .deck button:disabled { opacity: 0.4; cursor: default; }
  .deck .counter { font-size: 14px; color: #7d8590; }
  .card {
    background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 22px; margin-bottom: 18px;
  }
  .card.top { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  .handle { font-size: 20px; font-weight: 600; }
  .handle .id { color: #7d8590; font-size: 12px; font-weight: 400; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13px; color: #7d8590; margin-top: 6px; }
  .meta b { color: #e6edf3; font-weight: 500; }
  .bio { font-size: 13px; color: #a5b0bc; margin-top: 8px; max-width: 640px; }
  .verdict {
    border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; margin: 14px 0;
    background: #0d1117; font-size: 13px;
  }
  .verdict .row { display: flex; gap: 18px; flex-wrap: wrap; align-items: baseline; }
  .verdict .label { font-size: 15px; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; }
  .badge.bot { background: #3d1d1d; color: #ff8a8a; border: 1px solid #6e2a2a; }
  .badge.human { background: #12301f; color: #7ee2a8; border: 1px solid #1f6f43; }
  .badge.uncertain { background: #3a2d12; color: #e3c36b; border: 1px solid #6e5a1e; }
  .badge.good { background: #12301f; color: #7ee2a8; border: 1px solid #1f6f43; }
  .badge.bad { background: #3d1d1d; color: #ff8a8a; border: 1px solid #6e2a2a; }
  .badge.neutral { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
  .signals { margin-top: 8px; color: #a5b0bc; }
  .signals .chip { display: inline-block; background: #21262d; border: 1px solid #30363d; border-radius: 4px; padding: 1px 7px; margin: 2px 4px 2px 0; font-size: 11px; color: #c9d1d9; }
  .section { margin-top: 16px; }
  .section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #7d8590; margin-bottom: 8px; }
  .evidence {
    border: 1px solid #30363d; border-radius: 8px; max-height: 260px; overflow: auto;
    background: #0d1117; font-size: 12px;
  }
  .evt { padding: 8px 12px; border-bottom: 1px solid #21262d; color: #a5b0bc; }
  .evt:last-child { border-bottom: none; }
  .evt .ts { color: #7d8590; font-size: 11px; margin-right: 8px; }
  .evt .who { color: #58a6ff; font-size: 11px; margin-right: 8px; }
  .judge { margin-top: 16px; border-top: 1px solid #21262d; padding-top: 16px; }
  .judge h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #7d8590; margin-bottom: 10px; }
  .btnrow { display: flex; gap: 8px; flex-wrap: wrap; }
  .btnrow button {
    background: #21262d; color: #e6edf3; border: 1px solid #30363d; border-radius: 6px;
    padding: 7px 12px; font-size: 13px; cursor: pointer;
  }
  .btnrow button:hover { background: #30363d; }
  .btnrow button.active { border-color: #58a6ff; background: #0d2233; color: #58a6ff; }
  .judge .axis { margin-bottom: 12px; }
  .judge .axis .axlabel { font-size: 12px; color: #7d8590; margin-bottom: 6px; }
  textarea {
    width: 100%; min-height: 60px; background: #0d1117; color: #e6edf3;
    border: 1px solid #30363d; border-radius: 6px; padding: 10px; font-size: 13px; font-family: inherit;
    margin-top: 10px;
  }
  .status { font-size: 12px; margin-top: 8px; color: #7d8590; min-height: 18px; }
  .footer { color: #7d8590; font-size: 12px; padding: 16px 28px; border-top: 1px solid #21262d; }
  .queue { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 18px; }
  .queue .dot { width: 26px; height: 26px; border-radius: 6px; border: 1px solid #30363d; display: flex; align-items: center; justify-content: center; font-size: 11px; cursor: pointer; background: #161b22; color: #7d8590; }
  .queue .dot.done { background: #12301f; color: #7ee2a8; border-color: #1f6f43; }
  .queue .dot.current { border-color: #58a6ff; color: #58a6ff; }
  .exportrow { display: flex; gap: 10px; margin-top: 14px; }
  .exportrow button { background: #1f6f43; color: #fff; border: none; border-radius: 6px; padding: 8px 14px; font-size: 13px; cursor: pointer; }
  .exportrow button:hover { background: #238636; }
  .notes { font-size: 11px; color: #7d8590; margin-top: 6px; }
</style>
</head>
<body>
<header>
  <h1>BIPU Bot Review</h1>
  <span class="sub">fingerprint triage · confirm/reject · good vs bad</span>
  <span class="progress" id="progress"></span>
</header>
<main>
  <div class="queue" id="queue"></div>
  <div class="deck">
    <button id="prev">← Prev</button>
    <span class="counter" id="counter"></span>
    <button id="next">Next →</button>
    <button id="auto" title="skip already-decided accounts">Skip decided</button>
  </div>
  <div class="card top" id="topcard"></div>
  <div class="verdict" id="verdict"></div>
  <div class="card section">
    <h3>Reply evidence (to @leo_guinan / @marvin_panics)</h3>
    <div class="evidence" id="replyev"></div>
  </div>
  <div class="card section">
    <h3>Own timeline (last 12 posts)</h3>
    <div class="evidence" id="timeline"></div>
  </div>
  <div class="card judge" id="judge">
    <h3>Your judgment</h3>
    <div class="axis">
      <div class="axlabel">Behavioral label (is the automation claim right?)</div>
      <div class="btnrow" id="behrow">
        <button data-beh="confirm">Confirm</button>
        <button data-beh="reject">Reject</button>
        <button data-beh="revise">Revise</button>
        <button data-beh="skip">Skip</button>
      </div>
    </div>
    <div class="axis">
      <div class="axlabel">Intent (is it a good bot or a bad bot?)</div>
      <div class="btnrow" id="introw">
        <button data-int="good">Good bot</button>
        <button data-int="bad">Bad bot</button>
        <button data-int="neutral">Neutral / human</button>
        <button data-int="unclear">Unclear</button>
      </div>
    </div>
    <textarea id="reason" placeholder="Reasoning — why confirm/reject, what's the intent signal, any firsthand knowledge..."></textarea>
    <div class="status" id="status"></div>
    <div class="exportrow">
      <button id="export">Export decisions (JSON)</button>
    </div>
    <div class="notes">Decisions are saved locally in your browser (localStorage). Export to keep a copy. A "reject" here means the automated label was wrong — pair it with a revise note.</div>
  </div>
</main>
<footer class="footer">Behavioral labels are heuristic triage, not verdicts. Intent is a human call. Source: Community Archive cohort pull + live X profiles, 2026-08-17.</footer>
<script>
${classifierSrc}
</script>
<script>
const PAYLOAD = ${JSON.stringify(payload)};
(function () {
  const fp = globalThis.BIPU_BOT_FINGERPRINT;
  const KEY = 'bipu-bot-review-v1';
  let store = {};
  try { store = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}

  let idx = 0;
  const order = PAYLOAD.order;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  function classifyFor(aid) {
    const account = PAYLOAD.accounts[aid] || {};
    const sample = (PAYLOAD.replyByAcct[aid] || []).map(r => r.text);
    const tl = (PAYLOAD.timelines[aid] || []).map(p => ({ text: p.text, reply_to_user_id: p.reply_to_user_id }));
    return fp.classify(account, sample, tl);
  }

  function render() {
    const aid = order[idx];
    const acc = PAYLOAD.accounts[aid] || {};
    const d = store[aid] || {};
    const v = classifyFor(aid);

    document.getElementById('counter').textContent = (idx + 1) + ' / ' + order.length;
    document.getElementById('progress').textContent =
      Object.keys(store).filter(k => store[k] && (store[k].behavioral || store[k].intent)).length +
      ' / ' + order.length + ' decided';

    // queue
    const q = document.getElementById('queue');
    q.innerHTML = '';
    order.forEach((a, i) => {
      const s = store[a] || {};
      const done = !!(s.behavioral || s.intent);
      const el = document.createElement('span');
      el.className = 'dot' + (i === idx ? ' current' : '') + (done ? ' done' : '');
      el.textContent = i + 1;
      el.title = (PAYLOAD.accounts[a] || {}).username || a;
      el.onclick = () => { idx = i; render(); };
      q.appendChild(el);
    });

    // top card
    const tc = document.getElementById('topcard');
    const age = acc.accountAgeDays != null ? Math.round(acc.accountAgeDays / 365.25) + 'y' : '?';
    const ff = (acc.followers != null && acc.following) ? (acc.followers / acc.following).toFixed(2) : '?';
    tc.innerHTML =
      '<div style="flex:1;min-width:260px">' +
        '<div class="handle">@' + (acc.username || '?') + ' <span class="id">' + aid + '</span></div>' +
        '<div class="meta">' +
          '<span>followers <b>' + (acc.followers ?? '?') + '</b></span>' +
          '<span>following <b>' + (acc.following ?? '?') + '</b></span>' +
          '<span>F:F <b>' + ff + '</b></span>' +
          '<span>age <b>' + age + '</b></span>' +
          '<span>tweets <b>' + (acc.tweet_count ?? '?') + '</b></span>' +
        '</div>' +
        '<div class="bio">' + (acc.bio || '') + '</div>' +
      '</div>' +
      '<div style="text-align:right;min-width:140px">' +
        '<div id="ybeh"></div><div id="yint" style="margin-top:6px"></div>' +
      '</div>';

    const ybeh = document.getElementById('ybeh');
    const yint = document.getElementById('yint');
    const behBadge = d.behavioral
      ? (d.behavioral === 'confirm' ? '<span class="badge bot">CONFIRMED</span>'
        : d.behavioral === 'reject' ? '<span class="badge human">REJECTED</span>'
        : d.behavioral === 'revise' ? '<span class="badge uncertain">REVISED</span>'
        : '<span class="badge neutral">SKIPPED</span>')
      : '<span class="badge neutral">UNDECIDED</span>';
    const intBadge = d.intent
      ? (d.intent === 'good' ? '<span class="badge good">GOOD</span>'
        : d.intent === 'bad' ? '<span class="badge bad">BAD</span>'
        : d.intent === 'neutral' ? '<span class="badge neutral">NEUTRAL/HUMAN</span>'
        : '<span class="badge uncertain">UNCLEAR</span>')
      : '';
    ybeh.innerHTML = 'Behavior: ' + behBadge;
    yint.innerHTML = d.intent ? ('Intent: ' + intBadge) : '';

    // verdict box
    const vv = document.getElementById('verdict');
    const behClass = v.label.startsWith('BOT') ? 'bot' : v.label.startsWith('LEGIT') ? 'human' : 'uncertain';
    const vBadge = '<span class="badge ' + behClass + '">' + (v.label.startsWith('BOT') ? 'BOT' : v.label.startsWith('LEGIT') ? 'HUMAN' : 'UNCERTAIN') + '</span>';
    vv.innerHTML =
      '<div class="row">' +
        '<span class="label">' + v.label + '</span>' + vBadge +
        '<span>score <b>' + v.score + '</b></span>' +
        '<span>confidence <b>' + v.confidence + '</b></span>' +
      '</div>' +
      '<div class="signals">' + (v.signals.length ? v.signals.map(s => '<span class="chip">' + s + '</span>').join('') : '<span class="chip">no strong signals</span>') + '</div>';

    // reply evidence
    const re = document.getElementById('replyev');
    const rws = PAYLOAD.replyByAcct[aid] || [];
    re.innerHTML = rws.length
      ? rws.map(r => '<div class="evt"><span class="ts">' + (r.created_at||'').slice(0,10) + '</span><span>' + esc(r.text) + '</span></div>').join('')
      : '<div class="evt">(no replies captured in window)</div>';

    // timeline
    const tlEl = document.getElementById('timeline');
    const tl = PAYLOAD.timelines[aid] || [];
    tlEl.innerHTML = tl.length
      ? tl.map(p => '<div class="evt"><span class="ts">' + (p.created_at||'').slice(0,10) + '</span>' +
          (p.reply_to_user_id ? '<span class="who">R→</span>' : '<span class="who">OWN</span>') +
          '<span>' + esc(p.text) + '</span></div>').join('')
      : '<div class="evt">(no timeline captured)</div>';

    // judgment state
    document.querySelectorAll('#behrow button').forEach(b =>
      b.classList.toggle('active', d.behavioral === b.dataset.beh));
    document.querySelectorAll('#introw button').forEach(b =>
      b.classList.toggle('active', d.intent === b.dataset.int));
    document.getElementById('reason').value = d.reason || '';
    document.getElementById('status').textContent = d.updatedAt
      ? 'Decided ' + d.updatedAt : '';
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  document.getElementById('prev').onclick = () => { if (idx > 0) { idx--; render(); } };
  document.getElementById('next').onclick = () => { if (idx < order.length - 1) { idx++; render(); } };
  document.getElementById('auto').onclick = () => {
    for (let i = 0; i < order.length; i++) {
      const j = (idx + i) % order.length;
      const s = store[order[j]] || {};
      if (!(s.behavioral || s.intent)) { idx = j; render(); return; }
    }
    document.getElementById('status').textContent = 'All decided.';
  };

  document.querySelectorAll('#behrow button').forEach(b => b.onclick = () => {
    store[order[idx]] = store[order[idx]] || {};
    store[order[idx]].behavioral = b.dataset.beh;
    store[order[idx]].updatedAt = new Date().toISOString();
    save(); render();
  });
  document.querySelectorAll('#introw button').forEach(b => b.onclick = () => {
    store[order[idx]] = store[order[idx]] || {};
    store[order[idx]].intent = b.dataset.int;
    store[order[idx]].updatedAt = new Date().toISOString();
    save(); render();
  });
  document.getElementById('reason').addEventListener('input', () => {
    store[order[idx]] = store[order[idx]] || {};
    store[order[idx]].reason = document.getElementById('reason').value;
    store[order[idx]].updatedAt = new Date().toISOString();
    save();
  });

  document.getElementById('export').onclick = () => {
    const out = { generated: new Date().toISOString(), decisions: {} };
    for (const aid of order) {
      const d = store[aid];
      if (!d || !(d.behavioral || d.intent || d.reason)) continue;
      out.decisions[aid] = {
        handle: (PAYLOAD.accounts[aid]||{}).username || aid,
        behavioral: d.behavioral || null,
        intent: d.intent || null,
        reason: d.reason || '',
        updatedAt: d.updatedAt || null,
      };
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bipu-bot-review-decisions.json';
    a.click();
    document.getElementById('status').textContent = 'Exported ' + Object.keys(out.decisions).length + ' decisions.';
  };

  render();
})();
</script>
</body>
</html>`;

const outDir = path.join(ROOT, 'review');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'bot-review.html'), html);
console.log('wrote', path.join(outDir, 'bot-review.html'), (html.length/1024).toFixed(1), 'KB');
