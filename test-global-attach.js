// Verify global-attach path (extension/browser) + a low-confidence spam probe.
require('./lib/bot-fingerprint.js');
const fp = globalThis.BIPU_BOT_FINGERPRINT;
console.log('global attach:', typeof fp);
const shill = fp.classify({followers: 5, following: 400, accountAgeDays: 12}, [
  'gm send it wen moon 100x 🚀🚀',
  'buy now gem to the moon ngmi',
]);
console.log('probe:', shill.label, 'score='+shill.score, shill.signals.join(', '));
