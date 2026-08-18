#!/usr/bin/env node
// Classify the 10 real bot accounts using their actual timelines from the VPS
// cohort pull. Each case passes sample (replies to leo/marvin) + timeline (own posts).
const fp = require('./lib/bot-fingerprint.js');
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, 'data', 'fingerprint');
const timelines = JSON.parse(fs.readFileSync(path.join(DATA, 'bot_timelines.json'), 'utf8'));
const accounts = JSON.parse(fs.readFileSync(path.join(DATA, 'live_bot_accounts.json'), 'utf8'));
const replies = JSON.parse(fs.readFileSync(path.join(DATA, 'ext_replies.json'), 'utf8'));

const byAcct = {};
for (const r of replies) { (byAcct[r.account_id] = byAcct[r.account_id] || []).push(r.full_text); }

// ground truth from reading each account's full own-timeline + live bio (Aug 2026)
const truth = {
  '4895618824':                 'BOT',   // @MemeForTrees token-shill: $MfT, $Method, "24/7 automation"
  '1766194375044804608':        'BOT',   // @boardyai coordinated bot cohort (SIRISYS network, "AI superconnector")
  '862488191638671360':         'BOT',   // @alchemicAV link/content bot, SIRISYS bio
  '48606995':                   'BOT',   // @garcia590 link-poster
  '18842214':                   'BOT',   // @AlmostMedia daily-countdown cadence
  '8537442':                    'HUMAN', // @lilchiva real debating/cybernetics
  '1041016105':                 'HUMAN', // @Steph_Curdy substantive Quai/energy
  '1485978825787858946':        'HUMAN', // @Shadow_Rebbe researcher
  '1400492097082327040':        'HUMAN', // @jessyka_boat real exec
  '1827773478600359936':        'HUMAN', // @Aikun011 opinionated replies
};

let pass = 0, fail = 0;
for (const [aid, tl] of Object.entries(timelines)) {
  const sample = byAcct[aid] || [];
  const account = accounts[aid] || {};
  const r = fp.classify(account, sample, tl);
  const isBot = r.label.startsWith('BOT');
  const expBot = truth[aid] === 'BOT';
  const ok = isBot === expBot;
  ok ? pass++ : fail++;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${aid}  @${account.username||'?'}  exp=${truth[aid]}  got="${r.label}" s=${r.score} conf=${r.confidence}`);
  console.log(`      f/f=${account.followers}/${account.following}  [${r.signals.join(', ')||'-'}]`);
}
console.log(`\n${pass}/${pass+fail} correct on human-vs-bot (timeline-aware)`);
