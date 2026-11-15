const ADMIN_KEY_STORAGE = 'aurelias_admin_key_v1';

const authGate = document.getElementById('auth-gate');
const authForm = document.getElementById('auth-form');
const adminKeyInput = document.getElementById('admin-key');
const authError = document.getElementById('auth-error');

const adminDashboard = document.getElementById('admin-dashboard');
const adminPoolEl = document.getElementById('admin-pool');
const adminPendingEl = document.getElementById('admin-pending-count');
const adminConfirmedEl = document.getElementById('admin-confirmed-count');
const entriesListEl = document.getElementById('entries-list');

let adminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
let pollTimer = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchAdminEntries() {
  const res = await fetch('/api/entries', {
    headers: { 'x-admin-key': adminKey },
  });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.entries)) {
    throw new Error(data.error || 'Unauthorized');
  }
  return data;
}

function renderEntries(data) {
  const entries = data.entries || [];
  const pendingCount = entries.filter((e) => e.status === 'pending').length;
  const confirmedCount = entries.filter((e) => e.status === 'confirmed').length;

  adminPoolEl.textContent = `${Number(data.totalPoolUsdc || 50000).toLocaleString()} USDC`;
  adminPendingEl.textContent = String(pendingCount);
  adminConfirmedEl.textContent = String(confirmedCount);

  if (entries.length === 0) {
    entriesListEl.innerHTML = '<div class="empty-state">No raffle submissions yet.</div>';
    return;
  }

  entriesListEl.innerHTML = entries
    .map((entry) => {
      const badgeClass =
        entry.status === 'confirmed'
          ? 'badge-confirmed'
          : entry.status === 'rejected'
          ? 'badge-rejected'
          : 'badge-pending';

      const actions =
        entry.status === 'pending'
          ? `
            <button type="button" class="btn-lime btn-sm" data-action="confirmed" data-id="${escapeHtml(entry.id)}">Mark Received</button>
            <button type="button" class="btn-outline btn-sm" data-action="rejected" data-id="${escapeHtml(entry.id)}">Reject</button>
          `
          : `<span class="mono-tag">${escapeHtml(entry.id)}</span>`;

      return `
        <div class="entry-row">
          <span class="mono-input" style="word-break:break-all;">${escapeHtml(entry.address)}</span>
          <span>${entry.telegram ? escapeHtml(entry.telegram) : '<span class="mono-tag">—</span>'}</span>
          <span class="mono-input">${escapeHtml(entry.asset)} · ${escapeHtml(entry.amountLabel)}</span>
          <span class="${badgeClass}">${escapeHtml(entry.status.toUpperCase())}</span>
          <div class="row-actions">${actions}</div>
        </div>
      `;
    })
    .join('');
}

async function refreshDashboard() {
  try {
    const data = await fetchAdminEntries();
    renderEntries(data);
  } catch (err) {
    if (pollTimer) clearInterval(pollTimer);
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    adminDashboard.hidden = true;
    authGate.hidden = false;
    authError.textContent = err.message || 'Invalid admin passcode.';
    authError.hidden = false;
  }
}

async function unlockAdmin(key) {
  adminKey = key;
  const res = await fetch('/api/entries', {
    headers: { 'x-admin-key': adminKey },
  });
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.entries)) {
    throw new Error('Invalid admin passcode.');
  }

  sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
  authGate.hidden = true;
  adminDashboard.hidden = false;
  renderEntries(data);

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refreshDashboard, 3000);
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authError.hidden = true;
  try {
    await unlockAdmin(adminKeyInput.value.trim());
  } catch (err) {
    authError.textContent = err.message;
    authError.hidden = false;
  }
});

entriesListEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-id]');
  if (!btn) return;
  btn.disabled = true;

  try {
    await fetch('/api/entries', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-key': adminKey,
      },
      body: JSON.stringify({
        id: btn.dataset.id,
        status: btn.dataset.action,
      }),
    });
    await refreshDashboard();
  } finally {
    btn.disabled = false;
  }
});

if (adminKey) {
  unlockAdmin(adminKey).catch(() => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  });
}
