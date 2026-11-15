const RAFFLE_ETH_CONTRACT = '0x610178dA211FEF7D417bC0e6FeD39F05609AD788';
const ENTRY_FEE_USD = 2;
const BASE_POOL_USDC = 50000;
const PAYMENT_WINDOW_SECONDS = 15 * 60;
const ROUND_DEADLINE_KEY = 'aurelias_round_deadline_v1';

const EVM_RECEIVING = '0xf2B57a41c76a9AA721B4b3238B255bD68D52CDE2';
const SOL_RECEIVING = 'f5diEdws555ShFASuqxT1KBYjtZLRdWBAEvgy6DMAGY';
const BTC_RECEIVING = 'bc1qkx0y0yhmx8se9h9035g4qdmh0ulay8yj3lwx8k';
const TON_RECEIVING = 'UQCU7yEFzHJqQc-x0YOuPWXX7LFnNvtDnbjs7dxLMQfgM9oj';

const ASSETS = {
  ETH: {
    name: 'ETH',
    coingeckoId: 'ethereum',
    symbol: 'ETH',
    decimals: 5,
    amountLabel: '0.00111 ETH',
    receivingAddress: EVM_RECEIVING,
    placeholder: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    hint: 'Enter the EVM address you will send $2 (0.00111 ETH) from.',
    hintTemplate: (amt) => `Enter the EVM address you will send $2 (${amt}) from.`,
    pattern: /^0x[a-fA-F0-9]{40}$/,
    errorMsg: 'Enter a valid 42-character EVM address starting with 0x.',
  },
  BNB: {
    name: 'BNB',
    coingeckoId: 'binancecoin',
    symbol: 'BNB',
    decimals: 5,
    amountLabel: '0.00339 BNB',
    receivingAddress: EVM_RECEIVING,
    placeholder: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    hint: 'Enter the BSC address you will send $2 (0.00339 BNB) from.',
    hintTemplate: (amt) => `Enter the BSC address you will send $2 (${amt}) from.`,
    pattern: /^0x[a-fA-F0-9]{40}$/,
    errorMsg: 'Enter a valid 42-character BSC address starting with 0x.',
  },
  USDT_EVM: {
    name: 'USDT (ERC-20 / BEP-20)',
    amountLabel: '2 USDT',
    receivingAddress: EVM_RECEIVING,
    placeholder: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    hint: 'Enter the EVM address you will send $2 (2 USDT) from.',
    pattern: /^0x[a-fA-F0-9]{40}$/,
    errorMsg: 'Enter a valid 42-character EVM address starting with 0x.',
  },
  USDT_SOL: {
    name: 'USDT (Solana)',
    amountLabel: '2 USDT',
    receivingAddress: SOL_RECEIVING,
    placeholder: 'f5diEdws555ShFASuqxT1KBYjtZLRdWBAEvgy6DMAGY',
    hint: 'Enter your Solana address (32–44 base58 chars) sending $2 (2 USDT).',
    pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    errorMsg: 'Enter a valid Solana base58 address (32–44 characters).',
  },
  TON: {
    name: 'TON',
    coingeckoId: 'the-open-network',
    symbol: 'TON',
    decimals: 2,
    amountLabel: '1.91 TON',
    receivingAddress: TON_RECEIVING,
    placeholder: 'UQCU7yEFzHJqQc-x0YOuPWXX7LFnNvtDnbjs7dxLMQfgM9oj',
    hint: 'Enter your TON address (starting with EQ or UQ) sending $2 (1.91 TON).',
    hintTemplate: (amt) => `Enter your TON address (starting with EQ or UQ) sending $2 (${amt}).`,
    pattern: /^(EQ|UQ)[A-Za-z0-9_-]{46}$/,
    errorMsg: 'Enter a valid 48-character TON address starting with EQ or UQ.',
  },
  SOL: {
    name: 'Solana',
    coingeckoId: 'solana',
    symbol: 'SOL',
    decimals: 4,
    amountLabel: '0.0281 SOL',
    receivingAddress: SOL_RECEIVING,
    placeholder: 'f5diEdws555ShFASuqxT1KBYjtZLRdWBAEvgy6DMAGY',
    hint: 'Enter your Solana address (32–44 base58 chars) sending $2 (0.0281 SOL).',
    hintTemplate: (amt) => `Enter your Solana address (32–44 base58 chars) sending $2 (${amt}).`,
    pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    errorMsg: 'Enter a valid Solana base58 address (32–44 characters).',
  },
  BTC: {
    name: 'Bitcoin',
    coingeckoId: 'bitcoin',
    symbol: 'BTC',
    decimals: 6,
    amountLabel: '0.000031 BTC',
    receivingAddress: BTC_RECEIVING,
    placeholder: 'bc1qkx0y0yhmx8se9h9035g4qdmh0ulay8yj3lwx8k',
    hint: 'Enter your Bitcoin address (bc1, tb1, 1, or 3) sending $2 (0.000031 BTC).',
    hintTemplate: (amt) => `Enter your Bitcoin address (bc1, tb1, 1, or 3) sending $2 (${amt}).`,
    pattern: /^(bc1|tb1)[a-z0-9]{25,59}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/,
    errorMsg: 'Enter a valid Bitcoin address starting with bc1, tb1, 1, or 3.',
  },
};

const stepRegister = document.getElementById('step-register');
const stepReceiving = document.getElementById('step-receiving');
const stepConfirmed = document.getElementById('step-confirmed');

const registerForm = document.getElementById('register-form');
const senderInput = document.getElementById('sender-address');
const telegramInput = document.getElementById('telegram-handle');
const addressHintEl = document.getElementById('address-hint');
const formError = document.getElementById('form-error');
const assetPills = document.querySelectorAll('.asset-pill');

const headAssetAmtEl = document.getElementById('head-asset-amt');
const pendingAmountEl = document.getElementById('pending-amount');
const pendingSenderEl = document.getElementById('pending-sender');
const receivingAddrLabelEl = document.getElementById('receiving-addr-label');
const receivingAddrEl = document.getElementById('receiving-address');
const waitingBannerEl = document.getElementById('waiting-banner');
const confirmedAmountEl = document.getElementById('confirmed-amount');
const confirmedSenderEl = document.getElementById('confirmed-sender');
const confirmedTicketEl = document.getElementById('confirmed-ticket');
const paymentTimerEl = document.getElementById('payment-timer');
const qrContainer = document.getElementById('qr-container');

const cancelPaymentBtn = document.getElementById('cancel-payment-btn');
const newEntryBtn = document.getElementById('new-entry-btn');
const copyAddressBtn = document.getElementById('copy-address-btn');

const statPool = document.getElementById('stat-pool');
const statFee = document.getElementById('stat-fee');
const statPlayers = document.getElementById('stat-players');
const roundCountdownEl = document.getElementById('round-countdown');

let selectedAssetKey = 'ETH';
let timerInterval = null;
let pollInterval = null;
let pendingEntryId = '';
let pendingSender = '';
let pendingTelegram = '';

function shortAddress(addr) {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function syncStats() {
  try {
    const res = await fetch('/api/entries');
    if (!res.ok) return;
    const data = await res.json();
    statPlayers.textContent = String(data.totalPlayers ?? 7);
    statPool.textContent = `${Number(data.totalPoolUsdc ?? BASE_POOL_USDC).toLocaleString()} USDC`;
    statFee.textContent = `$${ENTRY_FEE_USD}`;
  } catch {
    // Ignore transient network errors
  }
}

function setAsset(assetKey) {
  selectedAssetKey = assetKey;
  const cfg = ASSETS[assetKey];

  assetPills.forEach((pill) => {
    const active = pill.dataset.asset === assetKey;
    pill.classList.toggle('is-active', active);
    pill.setAttribute('aria-pressed', String(active));
  });

  headAssetAmtEl.textContent = cfg.amountLabel;
  senderInput.placeholder = cfg.placeholder;
  addressHintEl.textContent = cfg.hint;
  formError.hidden = true;
}

function showStep(step) {
  stepRegister.hidden = step !== 'register';
  stepReceiving.hidden = step !== 'receiving';
  stepConfirmed.hidden = step !== 'confirmed';
}

function stopTimers() {
  if (timerInterval) clearInterval(timerInterval);
  if (pollInterval) clearInterval(pollInterval);
  timerInterval = null;
  pollInterval = null;
}

function startPaymentTimer() {
  if (timerInterval) clearInterval(timerInterval);
  let remaining = PAYMENT_WINDOW_SECONDS;

  const tick = () => {
    const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    paymentTimerEl.textContent = `${mins}:${secs}`;
    if (remaining <= 0) {
      stopTimers();
      paymentTimerEl.textContent = 'EXPIRED';
      waitingBannerEl.textContent = 'Payment window expired. Please start a new entry.';
      return;
    }
    remaining -= 1;
  };

  tick();
  timerInterval = setInterval(tick, 1000);
}

function startStatusPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    if (!pendingEntryId) return;
    try {
      const res = await fetch(`/api/entries?id=${encodeURIComponent(pendingEntryId)}`);
      if (!res.ok) return;
      const { entry } = await res.json();
      if (!entry) return;

      if (entry.status === 'confirmed') {
        stopTimers();
        const cfg = ASSETS[selectedAssetKey];
        const senderLabel = pendingTelegram
          ? `${shortAddress(pendingSender)} (${pendingTelegram})`
          : shortAddress(pendingSender);
        confirmedTicketEl.textContent = entry.id;
        confirmedAmountEl.textContent = `$${ENTRY_FEE_USD} (${cfg.amountLabel})`;
        confirmedSenderEl.textContent = senderLabel;
        await syncStats();
        showStep('confirmed');
      } else if (entry.status === 'rejected') {
        stopTimers();
        waitingBannerEl.textContent = 'Payment was not verified. Please try again.';
      }
    } catch {
      // Retry on next poll
    }
  }, 3000);
}

function renderQrCode(address) {
  qrContainer.innerHTML = '';
  if (typeof window.QRCode === 'function') {
    new window.QRCode(qrContainer, {
      text: address,
      width: 148,
      height: 148,
      colorDark: '#08080a',
      colorLight: '#ffffff',
    });
  }
}

async function copyCurrentAddress(button) {
  const cfg = ASSETS[selectedAssetKey];
  try {
    await navigator.clipboard.writeText(cfg.receivingAddress);
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  } catch {
    // Clipboard blocked
  }
}

assetPills.forEach((pill) => {
  pill.addEventListener('click', () => setAsset(pill.dataset.asset));
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.hidden = true;

  const cfg = ASSETS[selectedAssetKey];
  const addr = senderInput.value.trim();
  const tg = telegramInput.value.trim();

  if (!cfg.pattern.test(addr)) {
    formError.textContent = cfg.errorMsg;
    formError.hidden = false;
    return;
  }

  pendingSender = addr;
  pendingTelegram = tg ? (tg.startsWith('@') ? tg : `@${tg}`) : '';

  try {
    const res = await fetch('/api/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: pendingSender,
        telegram: pendingTelegram,
        asset: cfg.name,
        amountLabel: cfg.amountLabel,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.entry) {
      throw new Error(data.error || 'Could not create entry.');
    }

    pendingEntryId = data.entry.id;
    const senderLabel = pendingTelegram
      ? `${shortAddress(addr)} (${pendingTelegram})`
      : shortAddress(addr);
    pendingAmountEl.textContent = `$${ENTRY_FEE_USD} (${cfg.amountLabel})`;
    pendingSenderEl.textContent = senderLabel;
    receivingAddrLabelEl.textContent = `Send $${ENTRY_FEE_USD} (${cfg.amountLabel}) To This ${cfg.name} Address`;
    receivingAddrEl.textContent = cfg.receivingAddress;
    waitingBannerEl.textContent = 'Waiting for incoming payment confirmation...';

    renderQrCode(cfg.receivingAddress);
    startPaymentTimer();
    startStatusPolling();
    showStep('receiving');
  } catch (err) {
    formError.textContent = err.message || 'Failed to start payment.';
    formError.hidden = false;
  }
});

cancelPaymentBtn.addEventListener('click', () => {
  stopTimers();
  pendingEntryId = '';
  showStep('register');
});

newEntryBtn.addEventListener('click', () => {
  registerForm.reset();
  pendingEntryId = '';
  showStep('register');
});

copyAddressBtn.addEventListener('click', () => copyCurrentAddress(copyAddressBtn));

function updateRoundCountdown() {
  if (!roundCountdownEl) return;
  let deadline = Number(localStorage.getItem(ROUND_DEADLINE_KEY) || 0);
  const now = Date.now();
  if (!deadline || deadline <= now) {
    deadline = now + 72 * 60 * 60 * 1000;
    localStorage.setItem(ROUND_DEADLINE_KEY, String(deadline));
  }
  const diff = Math.max(0, deadline - now);
  const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
  const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
  const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  roundCountdownEl.textContent = `${hours}:${mins}:${secs}`;
}

function recordVisit() {
  fetch('/api/visit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: window.location.pathname || '/',
      referrer: document.referrer || '',
    }),
  }).catch(() => {});
}

async function syncLiveAssetPrices() {
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,binancecoin,the-open-network,solana&vs_currencies=usd'
    );
    if (!res.ok) return;
    const prices = await res.json();
    Object.values(ASSETS).forEach((cfg) => {
      if (!cfg.coingeckoId || !prices[cfg.coingeckoId]?.usd) return;
      const usdPrice = Number(prices[cfg.coingeckoId].usd);
      if (!usdPrice || usdPrice <= 0) return;
      const rawAmount = ENTRY_FEE_USD / usdPrice;
      const formatted = rawAmount.toFixed(cfg.decimals);
      cfg.amountLabel = `${formatted} ${cfg.symbol}`;
      if (typeof cfg.hintTemplate === 'function') {
        cfg.hint = cfg.hintTemplate(cfg.amountLabel);
      }
    });
    setAsset(selectedAssetKey);
  } catch {
    // Keep fallback amounts if offline or rate-limited
  }
}

setAsset('ETH');
updateRoundCountdown();
setInterval(updateRoundCountdown, 1000);
syncStats();
setInterval(syncStats, 5000);
recordVisit();
syncLiveAssetPrices();
