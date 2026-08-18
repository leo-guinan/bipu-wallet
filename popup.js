// BIPU Wallet popup — v0.2. Shows BIPU attestation identity + Phantom funds
// wallet. Phantom detection requires an active tab to probe (Phantom injects
// window.solana into page MAIN worlds only, not into extension pages).

(function () {
  const $ = (id) => document.getElementById(id);

  function setError(msg) {
    const el = $('error');
    if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
    else el.classList.add('hidden');
  }

  function short(addr) {
    if (!addr) return '(none)';
    return addr.slice(0, 4) + '…' + addr.slice(-4);
  }

  async function refreshStatus() {
    setError(null);
    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      $('bipu-address').textContent = status.bipu.publicKeyBase58 || '(none)';
      if (status.phantom && status.phantom.connected) {
        renderPhantomConnected(status.phantom.publicKey);
      } else {
        renderPhantomNotConnected();
      }
    } catch (e) {
      setError('Failed to load: ' + (e?.message || e));
    }
  }

  function renderPhantomConnected(pub) {
    $('phantom-state').innerHTML =
      '<p class="address">' + (pub || '(unknown)') + '</p>' +
      '<p class="small connected">Connected. Funds route through this wallet.</p>';
    $('phantom-actions').innerHTML =
      '<button id="btn-disconnect-phantom">Disconnect</button>';
    $('btn-disconnect-phantom').addEventListener('click', async () => {
      setError(null);
      try { await chrome.runtime.sendMessage({ type: 'PHANTOM_DISCONNECT' }); renderPhantomNotConnected(); }
      catch (e) { setError('Disconnect failed: ' + (e?.message || e)); }
    });
  }

  function renderPhantomNotConnected() {
    $('phantom-state').innerHTML =
      '<p class="small">Not connected.</p>' +
      '<p class="small">Needs an active tab to detect Phantom.</p>';
    $('phantom-actions').innerHTML = '';
    const btn = document.createElement('button');
    btn.id = 'btn-connect-phantom';
    btn.textContent = 'Connect Phantom';
    btn.addEventListener('click', connectPhantom);
    $('phantom-actions').appendChild(btn);
  }

  async function connectPhantom() {
    setError(null);
    $('phantom-state').innerHTML = '<p class="small">Detecting Phantom on the active tab…</p>';
    $('phantom-actions').innerHTML = '';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'PHANTOM_CONNECT' });
      if (res && res.connected && res.publicKey) {
        renderPhantomConnected(res.publicKey);
      } else {
        $('phantom-state').innerHTML = '<p class="small">Phantom not detected on this page.</p>';
        setError(res && res.error ? ('Connect failed: ' + res.error) : 'No public key returned');
        renderPhantomNotConnected();
      }
    } catch (e) {
      $('phantom-state').innerHTML = '<p class="small">Phantom connect failed.</p>';
      setError('Connect failed: ' + (e?.message || e));
      renderPhantomNotConnected();
    }
  }

  $('btn-copy-bipu').addEventListener('click', async () => {
    const addr = $('bipu-address').textContent;
    try {
      await navigator.clipboard.writeText(addr);
      $('btn-copy-bipu').textContent = 'Copied!';
      setTimeout(() => ($('btn-copy-bipu').textContent = 'Copy address'), 1500);
    } catch (e) { setError('Copy failed: ' + (e?.message || e)); }
  });

  // ---- Marvin go long: DISABLED until MARVIN graduates ----
  // The button is disabled in HTML. This guard makes it impossible to trigger a
  // swap even if the button were somehow re-enabled, until a release re-enables
  // the feature after MARVIN graduates on pump.fun.
  const goBtn = $('btn-go-long');
  const resultEl = $('go-long-result');
  goBtn.addEventListener('click', async () => {
    showResult(
      '<p class="err-title">Marvin go long is disabled.</p>' +
      '<p class="small">It will be enabled after MARVIN graduates on pump.fun, when the pool becomes routable.</p>',
      false
    );
  });

  function showResult(html, ok) {
    resultEl.innerHTML = html;
    resultEl.classList.remove('hidden');
    resultEl.className = 'result' + (ok ? ' ok' : ' err');
  }

  // ---- Phone home: explicit opt-in presence signal ----
  const phBtn = $('btn-phone-home');
  const phResult = $('phone-home-result');

  phBtn.addEventListener('click', async () => {
    setError(null);
    phBtn.disabled = true;
    phBtn.textContent = 'Phoning home…';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'PHONE_HOME' });
      if (res && res.error) throw new Error(res.error);
      const n = Number(res.distinct_count);
      phResult.innerHTML =
        '<p class="ok-title">You\'re counted.</p>' +
        '<p class="small">' + (Number.isFinite(n) ? 'Distinct network members: <b>' + n + '</b>' : 'Presence recorded.') + '</p>' +
        '<p class="small">Only your BIPU ID, version, and timestamp were sent.</p>';
      phResult.classList.remove('hidden');
      phResult.className = 'result ok';
    } catch (e) {
      phResult.innerHTML =
        '<p class="err-title">Phone home failed: ' + (e?.message || e) + '</p>' +
        '<p class="small">No collector configured yet, or it\'s unreachable. Nothing was sent.</p>';
      phResult.classList.remove('hidden');
      phResult.className = 'result err';
    } finally {
      phBtn.disabled = false;
      phBtn.textContent = 'Phone home';
    }
  });

  // ---- Developer mode / training capture ----
  const trainToggle = $('train-toggle');
  const trainStatusEl = $('train-status');
  const trainResult = $('train-result');

  async function trainActiveTab(type, payload) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs && tabs[0];
    if (!tab || typeof tab.id !== 'number') throw new Error('No active tab to capture from. Open x.com first.');
    return await chrome.tabs.sendMessage(tab.id, { type, ...(payload || {}) });
  }

  function renderTrainStatus() {
    trainActiveTab('TRAIN_STATUS').then((s) => {
      trainToggle.checked = !!(s && s.enabled);
      trainStatusEl.textContent = (s && s.enabled ? 'on' : 'off') + ' · ' + (s ? s.captured : 0) + ' captured';
    }).catch(() => {
      trainToggle.checked = false;
      trainStatusEl.textContent = 'off · 0 captured (no x.com tab)';
    });
  }

  trainToggle.addEventListener('change', async () => {
    try {
      await trainActiveTab('TRAIN_SET_MODE', { on: trainToggle.checked });
      renderTrainStatus();
    } catch (e) {
      trainToggle.checked = false;
      setError('Training mode needs an x.com tab open: ' + (e?.message || e));
    }
  });

  $('btn-train-capture').addEventListener('click', async () => {
    try {
      const res = await trainActiveTab('TRAIN_CAPTURE_NOW');
      renderTrainStatus();
      trainResult.innerHTML = '<p class="small ok-title">Captured. Total in buffer: <b>' + (res && res.captured) + '</b>.</p>';
      trainResult.classList.remove('hidden'); trainResult.className = 'result ok';
    } catch (e) {
      setError('Capture failed: ' + (e?.message || e));
    }
  });

  $('btn-train-clear').addEventListener('click', async () => {
    try {
      await trainActiveTab('TRAIN_CLEAR');
      renderTrainStatus();
      trainResult.innerHTML = '<p class="small">Buffer cleared.</p>';
      trainResult.classList.remove('hidden'); trainResult.className = 'result';
    } catch (e) { setError('Clear failed: ' + (e?.message || e)); }
  });

  $('btn-train-export').addEventListener('click', async () => {
    try {
      const res = await trainActiveTab('TRAIN_GET_RECORDS');
      const records = (res && res.records) || [];
      if (!records.length) { setError('Nothing to export. Turn on training capture and view some tweets first.'); return; }
      const body = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const url = 'data:application/x-ndjson;charset=utf-8,' + encodeURIComponent(body);
      await chrome.downloads.download({ url, filename: 'bipu-train-capture-' + stamp + '.jsonl', saveAs: true });
      trainResult.innerHTML = '<p class="small ok-title">Exported <b>' + records.length + '</b> records.</p>';
      trainResult.classList.remove('hidden'); trainResult.className = 'result ok';
    } catch (e) { setError('Export failed: ' + (e?.message || e)); }
  });

  renderTrainStatus();
  // ---- Trust Vault battery ----
  const VAULT_URL = 'https://rendezvous.metaspn.network/v1/vault/battery';
  const fill = $('battery-fill');
  const batteryText = $('battery-text');
  const contribBtn = $('btn-contribute');
  const vaultResult = $('vault-result');

  function renderBattery(body) {
    const pct = Math.min(100, Number(body.percent) || 0);
    fill.style.width = pct + '%';
    batteryText.textContent =
      'Committed $' + Number(body.committed_usd || 0).toLocaleString() +
      ' of $' + Number(body.threshold_usd || 0).toLocaleString() +
      ' (' + Number(body.percent || 0).toFixed(1) + '%) · ' +
      (Number(body.contributors) || 0) + ' contributors';
  }

  async function loadBattery() {
    try {
      const r = await fetch(VAULT_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const body = await r.json();
      renderBattery(body);
    } catch (e) {
      batteryText.textContent = 'Battery unavailable: ' + (e?.message || e);
    }
  }

  contribBtn.addEventListener('click', async () => {
    setError(null);
    let amount = 42;
    const sel = $('contribute-amount');
    if (sel && sel.value === 'custom') {
      amount = parseFloat($('contribute-custom').value);
      if (!Number.isFinite(amount) || amount < 1 || amount > 500) {
        vaultResult.innerHTML = '<p class="err-title">Enter a custom amount between $1 and $500.</p>';
        vaultResult.classList.remove('hidden');
        vaultResult.className = 'result err';
        return;
      }
    }
    contribBtn.disabled = true;
    contribBtn.textContent = 'Opening checkout…';
    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      const pk = status?.bipu?.publicKeyBase58 || '';
      const res = await chrome.runtime.sendMessage({ type: 'VAULT_CONTRIBUTE', publicKey: pk, amountUsd: amount });
      if (res && res.error) {
        vaultResult.innerHTML =
          '<p class="err-title">Contribution not available: ' + (res.error) + '</p>' +
          '<p class="small">The vault is not armed yet. You can still view the battery; no money moves until the vault is enabled.</p>';
        vaultResult.classList.remove('hidden');
        vaultResult.className = 'result err';
        return;
      }
      if (res && res.checkout_url) {
        chrome.tabs.create({ url: res.checkout_url });
        vaultResult.innerHTML =
          '<p class="ok-title">Checkout opened.</p>' +
          '<p class="small">Your $' + amount + ' contribution charges the battery as support — not an investment.</p>';
        vaultResult.classList.remove('hidden');
        vaultResult.className = 'result ok';
      }
    } catch (e) {
      vaultResult.innerHTML =
        '<p class="err-title">Failed: ' + (e?.message || e) + '</p>' +
        '<p class="small">The vault may not be deployed or armed yet. Nothing was charged.</p>';
      vaultResult.classList.remove('hidden');
      vaultResult.className = 'result err';
    } finally {
      contribBtn.disabled = false;
      contribBtn.textContent = 'Charge the battery';
    }
  });

  // toggle custom amount input
  $('contribute-amount').addEventListener('change', () => {
    $('contribute-custom').classList.toggle('hidden', $('contribute-amount').value !== 'custom');
  });

  // ---- Proof badges ----
  const BADGES_URL = 'https://rendezvous.metaspn.network/v1/vault/badges';
  const badgesList = $('badges-list');

  function renderBadges(data) {
    const badges = (data && data.badges) || [];
    if (!badges.length) {
      badgesList.innerHTML = '<p class="small">No badges yet.</p>';
      return;
    }
    badgesList.innerHTML = badges.map((b) =>
      '<div class="badge">' +
        '<div class="badge-row">' +
          '<span class="badge-dot ' + (b.verified ? 'v' : 'u') + '"></span>' +
          '<span class="badge-label">' + (b.label || 'Badge') + '</span>' +
        '</div>' +
        '<p class="badge-claim">' + (b.claim || '') + '</p>' +
        (b.evidence_url
          ? '<a class="badge-link" href="' + b.evidence_url + '" target="_blank" rel="noopener">View evidence →</a>'
          : '<p class="badge-unverified">Unverified — evidence pending</p>') +
      '</div>'
    ).join('');
  }

  async function loadBadges() {
    try {
      const r = await fetch(BADGES_URL, { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      renderBadges(await r.json());
    } catch (e) {
      badgesList.innerHTML = '<p class="small">Badges unavailable: ' + (e?.message || e) + '</p>';
    }
  }

  loadBattery();
  loadBadges();

  refreshStatus();
})();
