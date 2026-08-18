#!/usr/bin/env node
// Build a fast account-lookup artifact from a BIPU training-capture JSONL dump.
//
// Input : a `.jsonl` file exported from the extension's Developer mode
//         (schema bipu.train_capture.v1, one tweet record per line).
// Output: `lookup.json` — compact per-handle summary the extension can bundle
//         for fast account lookup (handle -> label/count/signals) without
//         re-classifying every tweet. This is the "quick lookup service" seed:
//         local, deterministic, regenerable from a fresh dump.
//
// Usage:
//   node scripts/build-lookup.js path/to/capture.jsonl [out.json]
//
// The artifact is NOT a verdict store — it's a triage summary. It records what
// the classifier saw across the dump so the extension can short-circuit
// re-classification of accounts it has already seen this session/dump.
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const inFile = process.argv[2];
if (!inFile) { console.error('usage: node scripts/build-lookup.js <capture.jsonl> [out.json]'); process.exit(2); }
const outFile = process.argv[3] || path.join(path.dirname(inFile), 'lookup.json');

const byHandle = new Map();
let total = 0, bad = 0, schemaOk = 0;

const rl = readline.createInterface({ input: fs.createReadStream(inFile), crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  total++;
  let rec;
  try { rec = JSON.parse(line); } catch (e) { bad++; return; }
  if (rec.schema !== 'bipu.train_capture.v1') { return; }
  schemaOk++;
  const handle = rec.tweet && rec.tweet.handle;
  if (!handle) return;

  let e = byHandle.get(handle);
  if (!e) {
    e = {
      handle,
      name: (rec.tweet && rec.tweet.name) || '',
      seen: 0,
      bot: 0, human: 0, uncertain: 0,
      topLabel: null, topScore: 0,
      signals: new Map(),
      firstSeen: rec.captured_at,
      lastSeen: rec.captured_at,
      urls: [],
    };
    byHandle.set(handle, e);
  }
  e.seen++;
  if (rec.captured_at < e.firstSeen) e.firstSeen = rec.captured_at;
  if (rec.captured_at > e.lastSeen) e.lastSeen = rec.captured_at;
  if (rec.tweet && rec.tweet.url) e.urls.push(rec.tweet.url);

  const c = rec.classifier;
  if (!c || !c.label) return;
  if (c.label.indexOf('BOT') === 0) e.bot++;
  else if (c.label.indexOf('LEGIT') === 0) e.human++;
  else e.uncertain++;
  if (c.score > e.topScore) { e.topScore = c.score; e.topLabel = c.label; }
  for (const s of (c.signals || [])) e.signals.set(s, (e.signals.get(s) || 0) + 1);
});

rl.on('close', () => {
  const lookup = {};
  for (const e of byHandle.values()) {
    // classify the account-level aggregate: majority vote weighted by confidence
    let verdict;
    if (e.bot >= 2 && e.bot >= e.human && e.bot >= e.uncertain) verdict = 'bot';
    else if (e.human >= 2 && e.human > e.bot) verdict = 'human';
    else if (e.uncertain >= 2 && e.bot === 0 && e.human === 0) verdict = 'uncertain';
    else if (e.seen >= 2) verdict = 'mixed';
    else verdict = 'thin';

    // top signals sorted by frequency
    const topSignals = Array.from(e.signals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);

    lookup[e.handle] = {
      name: e.name,
      seen: e.seen,
      verdict,
      bot: e.bot, human: e.human, uncertain: e.uncertain,
      topLabel: e.topLabel,
      topScore: e.topScore,
      topSignals,
      firstSeen: e.firstSeen,
      lastSeen: e.lastSeen,
      urls: e.urls.slice(0, 5),
    };
  }

  const out = {
    schema: 'bipu.lookup.v1',
    built_at: new Date().toISOString(),
    source_file: path.basename(inFile),
    totals: { records: total, parsed: schemaOk, bad_lines: bad, accounts: Object.keys(lookup).length },
    accounts: lookup,
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log('built', outFile);
  console.log('  records:', total, 'parsed:', schemaOk, 'bad:', bad, 'accounts:', Object.keys(lookup).length);
  const vc = {};
  for (const a of Object.values(lookup)) vc[a.verdict] = (vc[a.verdict] || 0) + 1;
  console.log('  verdict distribution:', JSON.stringify(vc));
});
