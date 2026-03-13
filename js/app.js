// ============================================================
// CONSTANTS
// ============================================================
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// ============================================================
// CATEGORY HELPERS (driven by state.categories from DB)
// ============================================================
function getCatIcon(name) {
  const cat = state.categories.find(c => c.name === name);
  return cat ? cat.icon : '✨';
}

function getCatColor(name) {
  const cat = state.categories.find(c => c.name === name);
  return cat ? cat.color : '#ff758f';
}

// ============================================================
// STATE
// ============================================================
let sb = null;
let currentRole = null;
let pinRole = 'sub';
let pinEntry = '';

let selectedCat = 'All';
let flashedChores = new Set();
let modalMode = null;
let modalEdit = null;
let modalAddedBy = 'mistress';
let catModalEdit = null;
let toastTimer = null;
let confirmCallback = null;

let state = {
  points: 0,
  chores: [],
  rewards: [],
  log: [],
  requests: [],
  choreRequests: [],
  categories: [],
  penalties: [],
};

// ============================================================
// SCREENS
// ============================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

// ============================================================
// SETUP
// ============================================================
function getSavedCreds() {
  try {
    return {
      url: localStorage.getItem('sb_url') || '',
      key: localStorage.getItem('sb_key') || '',
    };
  } catch (e) {
    return { url: '', key: '' };
  }
}

async function saveSetup() {
  const url = document.getElementById('setup-url').value.trim();
  const key = document.getElementById('setup-key').value.trim();
  if (!url || !key) { showToast('Please enter both fields', 'error'); return; }
  try {
    localStorage.setItem('sb_url', url);
    localStorage.setItem('sb_key', key);
  } catch (e) {}
  await connectSupabase(url, key);
}

async function connectSupabase(url, key) {
  showScreen('loading');
  try {
    sb = supabase.createClient(url, key);
    const { error } = await sb.from('devotion_state').select('id').eq('id', 'main').single();
    if (error) throw error;
    checkSession();
  } catch (e) {
    showScreen('setup');
    showToast('Connection failed. Check your anon key.', 'error');
  }
}

// ============================================================
// SESSION
// ============================================================
function checkSession() {
  try {
    const session = JSON.parse(localStorage.getItem('devotion_session') || 'null');
    if (session && session.role && Date.now() < session.expires) {
      currentRole = session.role;
      enterApp();
      return;
    }
  } catch (e) {}
  showPinScreen('sub');
}

function saveSession(role) {
  try {
    localStorage.setItem('devotion_session', JSON.stringify({
      role,
      expires: Date.now() + SESSION_DURATION,
    }));
  } catch (e) {}
}

function lockApp() {
  try { localStorage.removeItem('devotion_session'); } catch (e) {}
  currentRole = null;
  showPinScreen('sub');
}

// ============================================================
// PIN AUTH
// ============================================================
function showPinScreen(role) {
  pinRole = role;
  pinEntry = '';
  updatePinDots();
  document.getElementById('pin-error').textContent = '';
  document.getElementById('pin-role-label').textContent = role === 'sub' ? '💋 Sub Login' : '👑 Mistress Login';
  document.getElementById('pin-title').textContent = role === 'sub' ? 'Enter Sub PIN' : 'Enter Mistress PIN';
  document.getElementById('pin-sub').textContent = 'Default: sub=1234, mistress=9999';
  document.getElementById('switch-sub').classList.toggle('active', role === 'sub');
  document.getElementById('switch-mistress').classList.toggle('active', role === 'mistress');
  showScreen('pin');
}

function setPinRole(role) {
  pinEntry = '';
  updatePinDots();
  document.getElementById('pin-error').textContent = '';
  showPinScreen(role);
}

function pinKey(digit) {
  if (pinEntry.length >= 4) return;
  pinEntry += digit;
  updatePinDots();
  if (pinEntry.length === 4) setTimeout(verifyPin, 100);
}

function pinBackspace() {
  pinEntry = pinEntry.slice(0, -1);
  updatePinDots();
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('dot-' + i);
    dot.className = 'pin-dot' + (i < pinEntry.length ? ' filled' : '');
  }
}

async function verifyPin() {
  try {
    const { data, error } = await sb.from('devotion_pins').select('pin').eq('role', pinRole).single();
    if (error || !data) { pinFail('Connection error'); return; }
    if (data.pin === pinEntry) {
      currentRole = pinRole;
      saveSession(pinRole);
      enterApp();
    } else {
      pinFail('Wrong PIN — try again');
    }
  } catch (e) {
    pinFail('Error checking PIN');
  }
}

function pinFail(msg) {
  document.getElementById('pin-error').textContent = msg;
  for (let i = 0; i < 4; i++) document.getElementById('dot-' + i).className = 'pin-dot error';
  setTimeout(() => { pinEntry = ''; updatePinDots(); }, 800);
}

// ============================================================
// APP ENTRY
// ============================================================
async function enterApp() {
  showScreen('loading');
  document.getElementById('view-sub').classList.toggle('active', currentRole === 'sub');
  document.getElementById('view-mistress').classList.toggle('active', currentRole === 'mistress');
  document.getElementById('role-badge').textContent = currentRole === 'sub' ? '💋 Sub' : '👑 Mistress';
  await loadAll();
  showScreen('app');
}

// ============================================================
// DATA
// ============================================================
async function loadAll() {
  try {
    const [stateRes, choresRes, rewardsRes, logRes, requestsRes, choreReqRes, catsRes, penaltiesRes] = await Promise.all([
      sb.from('devotion_state').select('*').eq('id', 'main').single(),
      sb.from('devotion_chores').select('*').order('id'),
      sb.from('devotion_rewards').select('*').order('id'),
      sb.from('devotion_log').select('*').order('created_at', { ascending: false }).limit(100),
      sb.from('devotion_requests').select('*').order('created_at', { ascending: false }),
      sb.from('devotion_chore_requests').select('*').order('created_at', { ascending: false }),
      sb.from('devotion_categories').select('*').order('name'),
      sb.from('devotion_penalties').select('*').order('id'),
    ]);

    if (stateRes.data)      state.points        = stateRes.data.points;
    if (choresRes.data)     state.chores        = choresRes.data;
    if (rewardsRes.data)    state.rewards       = rewardsRes.data;
    if (logRes.data)        state.log           = logRes.data;
    if (requestsRes.data)   state.requests      = requestsRes.data;
    if (choreReqRes.data)   state.choreRequests = choreReqRes.data;
    if (catsRes.data)       state.categories    = catsRes.data;
    if (penaltiesRes.data)  state.penalties     = penaltiesRes.data;

    flashedChores.clear();
    renderAll();
  } catch (e) {
    showToast('Sync failed', 'error');
  }
}

async function refreshAll() {
  setSyncStatus('syncing...');
  await loadAll();
  setSyncStatus('synced');
  showToast('Synced! 🖤');
}

function setSyncStatus(status) {
  const el = document.getElementById('sync-indicator');
  const colors = { synced: '#3a0f18', 'syncing...': '#6b2030', error: '#ff0a54' };
  el.textContent = '● ' + status;
  el.style.color = colors[status] || '#3a0f18';
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = type;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ============================================================
// CONFIRM MODAL
// ============================================================
function showConfirm(msg, callback) {
  confirmCallback = callback;
  document.getElementById('confirm-msg').textContent = msg;
  document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('confirm-modal').style.display = 'none';
  confirmCallback = null;
}

function closeConfirmOutside(e) {
  if (e.target === document.getElementById('confirm-modal')) closeConfirm();
}

function executeConfirm() {
  const cb = confirmCallback;
  closeConfirm();
  if (cb) cb();
}

// ============================================================
// MODAL
// ============================================================
function openModal(mode, id = null, addedBy = 'mistress') {
  modalMode = mode;
  modalEdit = id;
  modalAddedBy = addedBy;
  const isReward  = mode === 'reward';
  const isPenalty = mode === 'penalty';

  document.getElementById('modal-cat-wrap').style.display = isReward ? 'block' : 'none';

  const titles = { chore: ['Add Chore', 'Edit Chore'], reward: ['Add Reward', 'Edit Reward'], penalty: ['Add Penalty', 'Edit Penalty'] };
  document.getElementById('modal-title').textContent = titles[mode][id !== null ? 1 : 0];

  if (isReward) {
    // Populate category options from DB — no hardcoding
    document.getElementById('modal-cat').innerHTML = state.categories
      .map(c => `<option value="${esc(c.name)}">${c.icon} ${esc(c.name)}</option>`)
      .join('');
  }

  if (id !== null) {
    const collection = isReward ? state.rewards : isPenalty ? state.penalties : state.chores;
    const item = collection.find(x => x.id === id);
    if (item) {
      document.getElementById('modal-name').value   = item.name;
      document.getElementById('modal-points').value = item.pts;
      if (isReward) document.getElementById('modal-cat').value = item.cat;
    }
  } else {
    document.getElementById('modal-name').value   = '';
    document.getElementById('modal-points').value = '';
    if (isReward && state.categories.length) {
      document.getElementById('modal-cat').value = state.categories[0].name;
    }
  }

  document.getElementById('modal').style.display = 'flex';
  setTimeout(() => document.getElementById('modal-name').focus(), 100);
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  modalMode = null;
  modalEdit = null;
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}

async function saveModal() {
  const name = document.getElementById('modal-name').value.trim();
  const pts  = parseInt(document.getElementById('modal-points').value);
  const cat  = document.getElementById('modal-cat').value;

  if (!name)        { showToast('Enter a name', 'error');        return; }
  if (!pts || pts < 1) { showToast('Enter valid points', 'error'); return; }

  setSyncStatus('syncing...');
  try {
    if (modalMode === 'chore') {
      modalEdit !== null
        ? await sb.from('devotion_chores').update({ name, pts }).eq('id', modalEdit)
        : await sb.from('devotion_chores').insert({ name, pts, added_by: modalAddedBy });
      showToast(modalEdit !== null ? 'Chore updated 🖤' : 'Chore added 🖤');
    } else if (modalMode === 'penalty') {
      modalEdit !== null
        ? await sb.from('devotion_penalties').update({ name, pts }).eq('id', modalEdit)
        : await sb.from('devotion_penalties').insert({ name, pts });
      showToast(modalEdit !== null ? 'Penalty updated' : 'Penalty added');
    } else {
      modalEdit !== null
        ? await sb.from('devotion_rewards').update({ name, pts, cat }).eq('id', modalEdit)
        : await sb.from('devotion_rewards').insert({ cat, name, pts });
      showToast(modalEdit !== null ? 'Reward updated 🖤' : 'Reward added 🔥');
    }
    closeModal();
    await loadAll();
    setSyncStatus('synced');
  } catch (e) {
    showToast('Save failed', 'error');
    setSyncStatus('error');
  }
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function switchTab(tab) {
  ['chores', 'rewards', 'log'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('content-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'log')     renderLog();
  if (tab === 'rewards') { renderCatFilter(); renderRewards(); }
}

function switchMTab(tab) {
  ['requests', 'manage-chores', 'manage-rewards', 'penalties', 'settings'].forEach(t => {
    document.getElementById('mtab-' + t).classList.toggle('active', t === tab);
    document.getElementById('mcontent-' + t).classList.toggle('active', t === tab);
  });
  if (tab === 'requests')       renderRequests();
  if (tab === 'manage-chores')  renderManageChores();
  if (tab === 'manage-rewards') renderManageRewards();
  if (tab === 'penalties')      renderPenalties();
  if (tab === 'settings')       renderManageCategories();
}

// ============================================================
// RENDER
// ============================================================
function renderAll() {
  updatePoints();
  updateMistressBadge();
  renderChores();
  renderCatFilter();
  renderRewards();
  renderLog();

  if (currentRole === 'mistress') {
    const activeTab = document.querySelector('#view-mistress .tab-content.active');
    const activeId  = activeTab ? activeTab.id : 'mcontent-requests';
    if      (activeId === 'mcontent-requests')       renderRequests();
    else if (activeId === 'mcontent-manage-chores')  renderManageChores();
    else if (activeId === 'mcontent-manage-rewards') renderManageRewards();
    else if (activeId === 'mcontent-penalties')      renderPenalties();
    else if (activeId === 'mcontent-settings')       renderManageCategories();
    else                                             renderRequests();
  }
}

function updatePoints() {
  document.getElementById('points-val').textContent = state.points;
}

function updateMistressBadge() {
  const pendingChores  = state.choreRequests.filter(r => r.status === 'pending').length;
  const pendingRewards = state.requests.filter(r => r.status === 'pending').length;
  const total = pendingChores + pendingRewards;
  const badge = document.getElementById('mtab-badge');
  if (badge) {
    badge.textContent = total > 0 ? total : '';
    badge.style.display = total > 0 ? 'flex' : 'none';
  }
}

// --- Chores (Sub view) ---
function choreCardHTML(chore) {
  const pending = state.choreRequests.find(r => r.chore_id === chore.id && r.status === 'pending');
  const flashed = flashedChores.has(chore.id);
  let btn;
  if (pending) {
    btn = `<span class="btn-pending">⏳ Awaiting</span>`;
  } else if (flashed) {
    btn = `<button class="btn-earn" disabled>Sent ✓</button>`;
  } else {
    btn = `<button class="btn-earn" onclick="submitChore(${chore.id})">Mark Done</button>`;
  }
  const borderColor = chore.added_by === 'mistress' ? '#c9184a' : '#ff758f';
  return `
    <div class="card ${pending || flashed ? 'pending-approval' : ''}" style="border-left: 3px solid ${borderColor}">
      <div style="flex:1">
        <div class="card-title">${esc(chore.name)}</div>
        <div class="card-sub">+${chore.pts} pts${pending ? ' · <span class="awaiting-text">awaiting approval</span>' : ''}</div>
      </div>
      ${btn}
    </div>`;
}

function renderChores() {
  const el = document.getElementById('chores-list');
  const mistressChores = state.chores.filter(c => c.added_by === 'mistress');
  const subChores      = state.chores.filter(c => c.added_by === 'sub');

  let html = '';

  html += `<div class="chore-section mistress-section">
    <div class="chore-section-header">Mistress Chores</div>
    ${mistressChores.length ? mistressChores.map(choreCardHTML).join('') : '<div class="empty-section">No mistress chores yet</div>'}
  </div>`;

  html += `<div class="chore-section sub-section">
    <div class="chore-section-header">Your Chores</div>
    ${subChores.length ? subChores.map(choreCardHTML).join('') : '<div class="empty-section">Nothing added yet</div>'}
    <button class="btn-add" onclick="openModal('chore', null, 'sub')">+ Add Your Chore</button>
  </div>`;

  el.innerHTML = html;
}

// --- Category Filter ---
function renderCatFilter() {
  // Only show categories that actually have rewards assigned
  const usedCats = new Set(state.rewards.map(r => r.cat));
  const cats = ['All', ...state.categories.filter(c => usedCats.has(c.name)).map(c => c.name)];
  if (!cats.includes(selectedCat)) selectedCat = 'All';
  document.getElementById('cat-filter').innerHTML = cats.map(cat =>
    `<button class="cat-btn ${selectedCat === cat ? 'active' : ''}" onclick="selectCat('${escJS(cat)}')">${
      cat === 'All' ? 'All' : getCatIcon(cat) + ' ' + esc(cat)
    }</button>`
  ).join('');
}

function selectCat(cat) {
  selectedCat = cat;
  renderCatFilter();
  renderRewards();
}

// --- Rewards (Sub view) ---
function renderRewards() {
  const list = selectedCat === 'All' ? state.rewards : state.rewards.filter(r => r.cat === selectedCat);
  const el   = document.getElementById('rewards-list');
  if (!list.length) { el.innerHTML = '<div class="empty">No rewards here 🖤</div>'; return; }

  el.innerHTML = list.map(reward => {
    const canAfford = state.points >= reward.pts;
    return `
      <div class="card ${canAfford ? '' : 'locked'}" style="border-left: 3px solid ${getCatColor(reward.cat)}">
        <div style="flex:1;margin-right:10px">
          <span class="card-tag" style="color:${getCatColor(reward.cat)}">${getCatIcon(reward.cat)} ${esc(reward.cat)}</span>
          <div class="card-title">${esc(reward.name)}</div>
          <div class="card-sub">${reward.pts} pts required</div>
        </div>
        <button class="btn-redeem" onclick="redeemReward(${reward.id})" ${canAfford ? '' : 'disabled'}>
          ${canAfford ? 'Redeem 🔥' : '🔒'}
        </button>
      </div>`;
  }).join('');
}

// --- Activity Log ---
function renderLog() {
  const el = document.getElementById('log-list');
  if (!state.log.length) { el.innerHTML = '<div class="empty">No history yet 🖤</div>'; return; }

  el.innerHTML = state.log.map(entry => `
    <div class="log-entry ${entry.type}">
      <div>
        <div class="log-text">${esc(entry.text)}</div>
        <div class="log-date">${fmtDate(entry.created_at)}</div>
      </div>
      ${entry.pts ? `<div class="log-pts">${entry.pts}</div>` : ''}
    </div>`
  ).join('');
}

// --- Requests (Mistress view) ---
function renderRequests() {
  const el         = document.getElementById('requests-list');
  const choreReqs  = state.choreRequests;
  const rewardReqs = state.requests;
  updateMistressBadge();

  if (!choreReqs.length && !rewardReqs.length) {
    el.innerHTML = '<div class="empty">No requests yet 🖤</div>';
    return;
  }

  let html = '';

  if (choreReqs.length) {
    html += `<div class="divider">🧹 Chore Completions</div>`;
    html += choreReqs.map(req => `
      <div class="req-card ${req.status}">
        <div class="req-header ${req.status === 'pending' ? 'has-actions' : ''}">
          <div>
            <span class="req-type-badge chore">CHORE</span>
            <div class="req-date">${fmtDate(req.created_at)}</div>
            <div class="req-name">${esc(req.chore_name)}</div>
            <div class="req-pts">+${req.chore_pts} pts if approved</div>
          </div>
          <span class="status-badge ${req.status}">${req.status.toUpperCase()}</span>
        </div>
        ${req.status === 'pending' ? `
          <div class="req-actions">
            <button class="btn-approve" onclick="decideChore(${req.id}, true)">✅ Approve</button>
            <button class="btn-deny"    onclick="decideChore(${req.id}, false)">❌ Deny</button>
          </div>` : ''}
      </div>`
    ).join('');
  }

  if (rewardReqs.length) {
    html += `<div class="divider">🎁 Reward Requests</div>`;
    html += rewardReqs.map(req => `
      <div class="req-card ${req.status}">
        <div class="req-header ${req.status === 'pending' ? 'has-actions' : ''}">
          <div>
            <span class="req-type-badge reward">REWARD</span>
            <div class="req-date">${getCatIcon(req.reward_cat)} ${esc(req.reward_cat)} · ${fmtDate(req.created_at)}</div>
            <div class="req-name">${esc(req.reward_name)}</div>
            <div class="req-pts">${req.reward_pts} pts</div>
          </div>
          <span class="status-badge ${req.status}">${req.status.toUpperCase()}</span>
        </div>
        ${req.status === 'pending' ? `
          <div class="req-actions">
            <button class="btn-approve" onclick="decideReward(${req.id}, true)">✅ Approve</button>
            <button class="btn-deny"    onclick="decideReward(${req.id}, false)">❌ Deny</button>
          </div>` : ''}
      </div>`
    ).join('');
  }

  el.innerHTML = html;
}

// --- Manage Chores (Mistress view) ---
function manageChoreCardHTML(chore) {
  return `
    <div class="card">
      <div style="flex:1">
        <div class="card-title">${esc(chore.name)}</div>
        <div class="card-sub">${chore.pts} pts</div>
      </div>
      <div class="card-actions">
        <button class="btn-edit" onclick="openModal('chore', ${chore.id})">✏️</button>
        <button class="btn-del"  onclick="deleteChore(${chore.id})">🗑</button>
      </div>
    </div>`;
}

function renderManageChores() {
  const el = document.getElementById('manage-chores-list');
  const mistressChores = state.chores.filter(c => c.added_by === 'mistress');
  const subChores      = state.chores.filter(c => c.added_by === 'sub');

  let html = '';

  html += `<div class="chore-section mistress-section">
    <div class="chore-section-header">Mistress Chores</div>
    ${mistressChores.length ? mistressChores.map(manageChoreCardHTML).join('') : '<div class="empty-section">None yet</div>'}
    <button class="btn-add" onclick="openModal('chore', null, 'mistress')">+ Add Mistress Chore</button>
  </div>`;

  html += `<div class="chore-section sub-section">
    <div class="chore-section-header">Sub Chores</div>
    ${subChores.length ? subChores.map(manageChoreCardHTML).join('') : '<div class="empty-section">None yet</div>'}
    <button class="btn-add" onclick="openModal('chore', null, 'sub')">+ Add Sub Chore</button>
  </div>`;

  el.innerHTML = html;
}

// --- Manage Rewards (Mistress view) ---
function renderManageRewards() {
  const el = document.getElementById('manage-rewards-list');
  if (!state.rewards.length) { el.innerHTML = '<div class="empty">No rewards yet</div>'; return; }

  el.innerHTML = state.rewards.map(reward => `
    <div class="card" style="border-left: 3px solid ${getCatColor(reward.cat)}">
      <div style="flex:1;margin-right:8px">
        <span class="card-tag" style="color:${getCatColor(reward.cat)}">${getCatIcon(reward.cat)} ${esc(reward.cat)}</span>
        <div class="card-title">${esc(reward.name)}</div>
        <div class="card-sub">${reward.pts} pts</div>
      </div>
      <div class="card-actions">
        <button class="btn-edit" onclick="openModal('reward', ${reward.id})">✏️</button>
        <button class="btn-del"  onclick="deleteReward(${reward.id})">🗑</button>
      </div>
    </div>`
  ).join('');
}

// ============================================================
// ACTIONS
// ============================================================

// Submit chore completion (Sub)
async function submitChore(id) {
  const chore = state.chores.find(x => x.id === id);
  if (!chore || flashedChores.has(id)) return;
  const alreadyPending = state.choreRequests.find(r => r.chore_id === id && r.status === 'pending');
  if (alreadyPending) { showToast('Already awaiting approval ⏳'); return; }

  flashedChores.add(id);
  renderChores();
  setSyncStatus('syncing...');
  try {
    await sb.from('devotion_chore_requests').insert({
      chore_id:   chore.id,
      chore_name: chore.name,
      chore_pts:  chore.pts,
      status:     'pending',
    });
    showToast('Sent to Mistress for approval! ⏳');
    setSyncStatus('synced');
    await loadAll();
  } catch (e) {
    showToast('Failed to submit', 'error');
    setSyncStatus('error');
    flashedChores.delete(id);
    renderChores();
  }
}

// Redeem a reward (Sub)
async function redeemReward(id) {
  const reward = state.rewards.find(x => x.id === id);
  if (!reward || state.points < reward.pts) { showToast('Not enough points 😈', 'error'); return; }

  setSyncStatus('syncing...');
  try {
    const newPoints = state.points - reward.pts;
    await Promise.all([
      sb.from('devotion_state').update({ points: newPoints, updated_at: new Date() }).eq('id', 'main'),
      sb.from('devotion_requests').insert({
        reward_id:   reward.id,
        reward_name: reward.name,
        reward_cat:  reward.cat,
        reward_pts:  reward.pts,
        status:      'pending',
      }),
      sb.from('devotion_log').insert({ type: 'redeemed', text: `Requested: ${reward.name}`, pts: `-${reward.pts}` }),
    ]);
    state.points = newPoints;
    updatePoints();
    showToast('Request sent to Mistress! 🔥');
    setSyncStatus('synced');
    await loadAll();
  } catch (e) {
    showToast('Failed', 'error');
    setSyncStatus('error');
  }
}

// Approve or deny a chore completion (Mistress)
async function decideChore(id, approved) {
  const req = state.choreRequests.find(r => r.id === id);
  if (!req) return;

  setSyncStatus('syncing...');
  try {
    const ops = [
      sb.from('devotion_chore_requests').update({ status: approved ? 'approved' : 'denied' }).eq('id', id),
    ];
    if (approved) {
      const newPoints = state.points + req.chore_pts;
      ops.push(sb.from('devotion_state').update({ points: newPoints, updated_at: new Date() }).eq('id', 'main'));
      ops.push(sb.from('devotion_log').insert({ type: 'earned', text: `✅ Approved: ${req.chore_name}`, pts: `+${req.chore_pts}` }));
    } else {
      ops.push(sb.from('devotion_log').insert({ type: 'denied', text: `❌ Denied: ${req.chore_name}`, pts: '' }));
    }
    await Promise.all(ops);
    showToast(approved ? `+${req.chore_pts} pts approved! 🔥` : 'Chore denied 🖤');
    setSyncStatus('synced');
    await loadAll();
  } catch (e) {
    showToast('Failed', 'error');
    setSyncStatus('error');
  }
}

// Approve or deny a reward request (Mistress)
async function decideReward(id, approved) {
  const req = state.requests.find(r => r.id === id);
  if (!req) return;

  setSyncStatus('syncing...');
  try {
    const ops = [
      sb.from('devotion_requests').update({ status: approved ? 'approved' : 'denied' }).eq('id', id),
      sb.from('devotion_log').insert({
        type: approved ? 'approved' : 'denied',
        text: `${approved ? '✅ Approved' : '❌ Denied'}: ${req.reward_name}`,
        pts:  '',
      }),
    ];
    // If denied, refund the points (they were deducted on request)
    if (!approved) {
      ops.push(sb.from('devotion_state').update({ points: state.points + req.reward_pts, updated_at: new Date() }).eq('id', 'main'));
    }
    await Promise.all(ops);
    showToast(approved ? 'Reward approved 🔥' : 'Reward denied 🖤');
    setSyncStatus('synced');
    await loadAll();
  } catch (e) {
    showToast('Failed', 'error');
    setSyncStatus('error');
  }
}

// Delete chore (Mistress)
async function deleteChore(id) {
  showConfirm('Remove this chore?', async () => {
    try {
      await sb.from('devotion_chores').delete().eq('id', id);
      showToast('Removed 🖤');
      await loadAll();
    } catch (e) {
      showToast('Failed', 'error');
    }
  });
}

// Delete reward (Mistress)
async function deleteReward(id) {
  showConfirm('Remove this reward?', async () => {
    try {
      await sb.from('devotion_rewards').delete().eq('id', id);
      showToast('Removed 🖤');
      await loadAll();
    } catch (e) {
      showToast('Failed', 'error');
    }
  });
}

// Change PIN (Mistress)
async function changePIN(role) {
  const input = document.getElementById(`new-${role}-pin`).value.trim();
  if (!/^\d{4}$/.test(input)) { showToast('PIN must be exactly 4 digits', 'error'); return; }
  try {
    await sb.from('devotion_pins').update({ pin: input, updated_at: new Date() }).eq('role', role);
    document.getElementById(`new-${role}-pin`).value = '';
    showToast(`${role === 'sub' ? 'Sub' : 'Mistress'} PIN updated 🖤`);
  } catch (e) {
    showToast('Failed to update PIN', 'error');
  }
}

// Reset points & history (Mistress)
async function resetPoints() {
  showConfirm('Reset points & history? Chores and rewards will be kept.', async () => {
    try {
      await Promise.all([
        sb.from('devotion_state').update({ points: 0 }).eq('id', 'main'),
        sb.from('devotion_log').delete().neq('id', 0),
        sb.from('devotion_requests').delete().neq('id', 0),
        sb.from('devotion_chore_requests').delete().neq('id', 0),
      ]);
      showToast('Reset! Fresh start 🖤');
      await loadAll();
    } catch (e) {
      showToast('Failed', 'error');
    }
  });
}

// ============================================================
// PENALTIES (Mistress only)
// ============================================================

function renderPenalties() {
  const el = document.getElementById('penalties-list');
  if (!state.penalties.length) { el.innerHTML = '<div class="empty">No penalties yet</div>'; return; }

  el.innerHTML = state.penalties.map(p => `
    <div class="card">
      <div style="flex:1">
        <div class="card-title">${esc(p.name)}</div>
        <div class="card-sub penalty-pts">-${p.pts} pts</div>
      </div>
      <div class="card-actions">
        <button class="btn-apply-penalty" onclick="applyPenalty(${p.id})">Apply</button>
        <button class="btn-edit" onclick="openModal('penalty', ${p.id})">✏️</button>
        <button class="btn-del"  onclick="deletePenalty(${p.id})">🗑</button>
      </div>
    </div>`
  ).join('');
}

async function applyPenalty(id) {
  const penalty = state.penalties.find(x => x.id === id);
  if (!penalty) return;

  setSyncStatus('syncing...');
  try {
    const newPoints = state.points - penalty.pts;
    await Promise.all([
      sb.from('devotion_state').update({ points: newPoints, updated_at: new Date() }).eq('id', 'main'),
      sb.from('devotion_log').insert({ type: 'penalty', text: `Penalty: ${penalty.name}`, pts: `-${penalty.pts}` }),
    ]);
    state.points = newPoints;
    updatePoints();
    showToast(`-${penalty.pts} pts penalty applied`);
    setSyncStatus('synced');
    await loadAll();
  } catch (e) {
    showToast('Failed', 'error');
    setSyncStatus('error');
  }
}

async function deletePenalty(id) {
  showConfirm('Remove this penalty?', async () => {
    try {
      await sb.from('devotion_penalties').delete().eq('id', id);
      showToast('Removed');
      await loadAll();
    } catch (e) {
      showToast('Failed', 'error');
    }
  });
}

// ============================================================
// CATEGORY MANAGEMENT (Mistress only)
// ============================================================

function renderManageCategories() {
  const el = document.getElementById('manage-categories-list');
  if (!el) return;
  if (!state.categories.length) { el.innerHTML = '<div class="empty">No categories yet</div>'; return; }

  el.innerHTML = state.categories.map(cat => `
    <div class="card">
      <div class="cat-card-info">
        <span class="cat-swatch" style="background:${esc(cat.color)}"></span>
        <span class="cat-icon-preview">${cat.icon}</span>
        <div class="card-title">${esc(cat.name)}</div>
      </div>
      <div class="card-actions">
        <button class="btn-edit" onclick="openCatModal(${cat.id})">✏️</button>
        <button class="btn-del"  onclick="deleteCategory(${cat.id})">🗑</button>
      </div>
    </div>`
  ).join('');
}

function openCatModal(id = null) {
  catModalEdit = id;
  document.getElementById('cat-modal-title').textContent = id !== null ? 'Edit Category' : 'Add Category';

  if (id !== null) {
    const cat = state.categories.find(c => c.id === id);
    if (cat) {
      document.getElementById('cat-modal-name').value  = cat.name;
      document.getElementById('cat-modal-icon').value  = cat.icon;
      document.getElementById('cat-modal-color').value = cat.color;
      document.getElementById('cat-modal-hex').value   = cat.color;
    }
  } else {
    document.getElementById('cat-modal-name').value  = '';
    document.getElementById('cat-modal-icon').value  = '✨';
    document.getElementById('cat-modal-color').value = '#ff758f';
    document.getElementById('cat-modal-hex').value   = '#ff758f';
  }

  document.getElementById('cat-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('cat-modal-name').focus(), 100);
}

function closeCatModal() {
  document.getElementById('cat-modal').style.display = 'none';
  catModalEdit = null;
}

function closeCatModalOutside(e) {
  if (e.target === document.getElementById('cat-modal')) closeCatModal();
}

function syncCatColor(source) {
  const colorPicker = document.getElementById('cat-modal-color');
  const hexInput    = document.getElementById('cat-modal-hex');
  if (source === 'picker') {
    hexInput.value = colorPicker.value;
  } else {
    const val = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) colorPicker.value = val;
  }
}

async function saveCatModal() {
  const name  = document.getElementById('cat-modal-name').value.trim();
  const icon  = document.getElementById('cat-modal-icon').value.trim() || '✨';
  const color = document.getElementById('cat-modal-color').value;

  if (!name) { showToast('Enter a category name', 'error'); return; }

  setSyncStatus('syncing...');
  try {
    if (catModalEdit !== null) {
      await sb.from('devotion_categories').update({ name, icon, color }).eq('id', catModalEdit);
      showToast('Category updated');
    } else {
      await sb.from('devotion_categories').insert({ name, icon, color });
      showToast('Category added');
    }
    closeCatModal();
    await loadAll();
    setSyncStatus('synced');
  } catch (e) {
    showToast('Save failed', 'error');
    setSyncStatus('error');
  }
}

async function deleteCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  showConfirm(`Remove category "${cat ? cat.name : ''}"? Rewards in this category will keep their data.`, async () => {
    try {
      await sb.from('devotion_categories').delete().eq('id', id);
      showToast('Category removed');
      await loadAll();
    } catch (e) {
      showToast('Failed', 'error');
    }
  });
}

// ============================================================
// HELPERS
// ============================================================
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escJS(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function fmtDate(d) {
  try { return new Date(d).toLocaleString(); } catch (e) { return d || ''; }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('load', () => {
  const { url, key } = getSavedCreds();
  if (url && key) connectSupabase(url, key);
  else showScreen('setup');
});