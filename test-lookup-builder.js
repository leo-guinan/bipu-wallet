#!/usr/bin/env node
// Verify scripts/build-lookup.js produces a correct lookup artifact from a
// synthetic bipu.train_capture.v1 dump.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const dump = path.join(os.tmpdir(), 'lookup-test-capture.jsonl');
const out = path.join(os.tmpdir(), 'lookup-test-out.json');

const lines = [
  { schema:'bipu.train_capture.v1', captured_at:'2026-08-18T00:00:00Z', source:'home', page_url:'https://x.com/home',
    tweet:{ handle:'pumpbot1', name:'PUMP MACHINE', text:'check inbox 📥', url:'https://x.com/pumpbot1/status/1' },
    classifier:{ label:'BOT · pump/farm (name + inbox)', score:100, confidence:'high', signals:['pump/shill-name','inbox-farm-text'] } },
  { schema:'bipu.train_capture.v1', captured_at:'2026-08-18T00:00:01Z', source:'home', page_url:'https://x.com/home',
    tweet:{ handle:'pumpbot1', name:'PUMP MACHINE', text:'follow me back, pump your project', url:'https://x.com/pumpbot1/status/2' },
    classifier:{ label:'BOT · pump (name + numeric suffix)', score:100, confidence:'high', signals:['pump/shill-name'] } },
  { schema:'bipu.train_capture.v1', captured_at:'2026-08-18T00:00:02Z', source:'notifications', page_url:'https://x.com/notifications',
    tweet:{ handle:'realperson', name:'Real Person', text:'systems modeling and graphing', url:'https://x.com/realperson/status/3' },
    classifier:{ label:'UNCERTAIN · review', score:40, confidence:'low', signals:[] } },
  { schema:'bipu.train_capture.v1', captured_at:'2026-08-18T00:00:03Z', source:'home', page_url:'https://x.com/home',
    tweet:{ handle:'realperson', name:'Real Person', text:'another thought about cybernetics', url:'https://x.com/realperson/status/4' },
    classifier:{ label:'UNCERTAIN · review', score:45, confidence:'medium', signals:[] } },
];
fs.writeFileSync(dump, lines.map(l => JSON.stringify(l)).join('\n') + '\n');

let pass = 0, fail = 0;
function check(name, ok, detail) { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  ' + detail : '')); }

execFileSync('node', ['scripts/build-lookup.js', dump, out], { cwd: __dirname });
const art = JSON.parse(fs.readFileSync(out, 'utf8'));

check('schema is bipu.lookup.v1', art.schema === 'bipu.lookup.v1');
check('totals records = 4', art.totals.records === 4);
check('totals accounts = 2', art.totals.accounts === 2);
check('pumpbot1 verdict = bot', art.accounts.pumpbot1 && art.accounts.pumpbot1.verdict === 'bot');
check('pumpbot1 topScore = 100', art.accounts.pumpbot1 && art.accounts.pumpbot1.topScore === 100);
check('pumpbot1 topLabel has pump', art.accounts.pumpbot1 && /pump/i.test(art.accounts.pumpbot1.topLabel));
check('pumpbot1 topSignals has pump/shill-name', art.accounts.pumpbot1 && art.accounts.pumpbot1.topSignals.includes('pump/shill-name'));
check('realperson verdict = uncertain (2 all-uncertain)', art.accounts.realperson && art.accounts.realperson.verdict === 'uncertain');
check('realperson seen = 2', art.accounts.realperson && art.accounts.realperson.seen === 2);

fs.unlinkSync(dump); fs.unlinkSync(out);
console.log(`\n${pass}/${pass+fail} lookup-builder checks passed`);
process.exit(fail ? 1 : 0);
