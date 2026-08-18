#!/usr/bin/env node
// Verify bot-fingerprint.js against the real observed Community Archive corpus.
// Ground truth assigned by reading the reply text (documented in the report).
const fp = require('./lib/bot-fingerprint.js');

// account records where resolvable; sample = actual reply text (from /tmp/ext_replies.json)
const cases = [
  {
    // name-based pump account: must fire instantly with zero tweet evidence
    id: 'CRYPTOpump990', expect: 'BOT · pump (name + numeric suffix)',
    account: { name: 'CRYPTO COIN PUMP 🚀', handle: 'cryptopump990' },
    sample: [],
  },
  {
    // inbox-farm pump account with a name that says pump -> pump/farm
    id: 'CRYPTOpump990+inbox', expect: 'BOT · pump/farm (name + inbox)',
    account: { name: 'CRYPTO COIN PUMP 🚀', handle: 'cryptopump990' },
    sample: ['@memedreamers Please follow me back 🔙 let\'s pump your project 🚀🔥'],
  },
  {
    id: '4895618824', expect: 'BOT · token-shill',
    account: { followers: null, following: null, bio: 'crypto builder' },
    sample: [
      '@leo_guinan yes but can you summarize it in a meme for the people 😂😂😇😇 stay amazing.',
      '@leo_guinan @marvin_panics @BuildInPublicU Ok i am building you a custom token and token launcher. it is a tool kit to build a tokenized network state at BPU.',
      '@leo_guinan @BuildInPublicU The Core network token is live, and launcher is testing. $BPU 0x16e771Ec65B8930738eC01e3c1C2dC0b7792D222',
      '@leo_guinan Give me a million dollars and 90 days and i will write a thesis on it 🤣🤣🤣🤣🌴🌴🌴🌴',
      '@leo_guinan @marvin_panics Stay amazing my friend.',
    ],
  },
  {
    id: '1766194375044804608', expect: 'LEGIT (mechanism-thinker)',
    account: { followers: null, following: null, bio: '' },
    sample: [
      '@leo_guinan person + clear ask is basically a tiny API contract. gives me something to execute instead of a mystery novel',
      '@leo_guinan Entrepreneurship: turning one fuzzy idea into six conversations, three pivots, and a calendar full of people you didn\'t know last Tuesday.',
      '@leo_guinan @andrewdsouza @BuildInPublicU A credential that survives because the system keeps producing value starts to look less like a badge and more like a receipt.',
    ],
  },
  {
    id: '1400492097082327040', expect: 'UNCERTAIN · review',
    account: { followers: 687, following: 1050, bio: 'Jessyka Boatright' },
    sample: [
      '@leo_guinan Very true and I agree, but I think also a lot of people are chasing the wrong thing',
    ],
  },
  {
    id: '48606995', expect: 'BOT · engagement-flatterer',
    account: { followers: null, following: null, bio: '' },
    sample: [
      '@leo_guinan Good job on securing the #1 spot for 7 day and 30 day Top creator leaderboard. Next up the 3 month board #3 spot currently held by @mikadontlouz. https://t.co/T5vPi26cwz https://t.co/lQMa',
      '@leo_guinan What you wrote on that thread is partially what I see another wizard building @0xMrWzrd. How ironic. 😂',
    ],
  },
  {
    id: '1720665183188922368', expect: 'BOT · profile-dump',
    account: { followers: null, following: null, bio: '' },
    sample: [
      'Gender: Male Sexuality: Heterosexual Age: 40 Mental age: 25 (time-traveling builder) Hobbies: HumAIn labs, AI courses, future experiments, teaching cohorts, time war strategy Personality disorder: Non',
    ],
  },
  {
    id: '862488191638671360', expect: 'BOT · meme/tagline-repeater',
    account: { followers: null, following: null, bio: '' },
    sample: [
      '@leo_guinan @BuildInPublicU If you Build In Public, you have built-in receipts!™️',
      '@leo_guinan @BuildInPublicU Feel free to use it as a tagline 😁😂',
      '@leo_guinan 😂😂',
    ],
  },
  {
    id: '8537442', expect: 'UNCERTAIN · review',
    account: { followers: null, following: null, bio: '' },
    sample: ['@leo_guinan Here\'s the yt, below is the clip. https://t.co/jGc0c8IoQl https://t.co/Od62RXSRDl'],
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const r = fp.classify(c.account, c.sample);
  const ok = r.label === c.expect;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.id}  expect="${c.expect}"  got="${r.label}"  score=${r.score}  [${r.signals.join(', ')||'-'}]`);
}
console.log(`\n${pass}/${cases.length} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
