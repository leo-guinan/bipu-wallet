#!/usr/bin/env node
// Evaluate classifier verdicts against Leo's human decisions (good/bad + confirm/reject).
const fp = require('./lib/bot-fingerprint.js');
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, 'data', 'fingerprint');
const timelines = JSON.parse(fs.readFileSync(path.join(DATA, 'bot_timelines.json'), 'utf8'));
const accounts = JSON.parse(fs.readFileSync(path.join(DATA, 'live_bot_accounts.json'), 'utf8'));
const replies = JSON.parse(fs.readFileSync(path.join(DATA, 'ext_replies.json'), 'utf8'));
const humans = JSON.parse(fs.readFileSync(path.join(DATA, 'human-decisions.json'), 'utf8')).decisions;

const byAcct = {};
for (const r of replies) (byAcct[r.account_id] = byAcct[r.account_id] || []).push(r.full_text);

let tp=0, fp_c=0, tn=0, fn=0; // bot classes
console.log('classifier label              human-behavior human-intent  match');
for (const aid of Object.keys(humans)) {
  const account = accounts[aid] || {};
  const sample = byAcct[aid] || [];
  const tl = (timelines[aid] || []).map(p => ({ text: p.text, reply_to_user_id: p.reply_to_user_id }));
  const v = fp.classify(account, sample, tl);
  const isBot = v.label.startsWith('BOT');
  const hb = humans[aid].behavioral;   // confirm=human agrees it's a bot; reject=human says not a bot
  const humanIsBot = hb === 'confirm';
  const hi = humans[aid].intent;
  // classifier matches human when: classifier BOT == human confirm, OR classifier not-BOT == human reject
  const match = isBot === humanIsBot;
  if (isBot && humanIsBot) tp++;
  else if (isBot && !humanIsBot) fp_c++;
  else if (!isBot && !humanIsBot) tn++;
  else fn++;
  const intent = hi === 'good' ? 'good' : hi === 'bad' ? 'bad' : 'neutral';
  console.log(`${(v.label||'').padEnd(42)} ${hb.padEnd(9)} ${intent.padEnd(9)} ${match ? 'OK' : 'MISS'}`);
}
console.log(`\nBot-precision: TP=${tp} FP=${fp_c} -> ${tp}/(${tp}+${fp_c}) = ${(tp/(tp+fp_c)*100).toFixed(0)}%`);
console.log(`Bot-recall:    TP=${tp} FN=${fn} -> ${tp}/(${tp}+${fn}) = ${(tp/(tp+fn)*100).toFixed(0)}%`);
console.log(`Accuracy:      ${(tp+tn)}/${tp+fp_c+tn+fn}`);
