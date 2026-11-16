const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Resvg } = require('@resvg/resvg-js');

const GENERATED_DIR = path.join(__dirname, '..', 'assets', 'social', 'generated');

const EXCLUDED_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'BUSD', 'TUSD', 'WBTC', 'WETH', 'STETH',
]);

const BACKUP_ALTCOINS = [
  { id: 'bittensor', symbol: 'TAO', name: 'Bittensor' },
  { id: 'sui', symbol: 'SUI', name: 'Sui' },
  { id: 'hyperliquid', symbol: 'HYPE', name: 'Hyperliquid' },
  { id: 'ondo-finance', symbol: 'ONDO', name: 'Ondo' },
  { id: 'pendle', symbol: 'PENDLE', name: 'Pendle' },
  { id: 'ethena', symbol: 'ENA', name: 'Ethena' },
];

function inferDecimals(price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return 2;
  if (n >= 1000) return 0;
  if (n >= 10) return 2;
  if (n >= 0.1) return 4;
  if (n >= 0.001) return 5;
  return 6;
}

function fmtPrice(val, decimals = null) {
  const d = decimals === null ? inferDecimals(val) : decimals;
  return `$${Number(val).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })}`;
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveMarketSnapshot() {
  const snapshot = { chartCoins: [], trending: [], headlines: [] };

  try {
    const t = await fetchJson('https://api.coingecko.com/api/v3/search/trending');
    const coins = (t.coins || [])
      .map((c) => ({
        id: c.item?.id,
        symbol: String(c.item?.symbol || '').toUpperCase(),
        name: c.item?.name || '',
        change24h: Number(c.item?.data?.price_change_percentage_24h?.usd || 0),
      }))
      .filter((c) => c.id && c.symbol && !EXCLUDED_SYMBOLS.has(c.symbol));

    snapshot.chartCoins = coins.slice(0, 5);
    snapshot.trending = snapshot.chartCoins.map((c) => `${c.symbol} (${c.name})`);
  } catch (err) {
    console.warn('Trending coins fetch failed:', err.message);
  }

  if (snapshot.chartCoins.length < 3) {
    const existing = new Set(snapshot.chartCoins.map((c) => c.symbol));
    for (const alt of BACKUP_ALTCOINS) {
      if (!existing.has(alt.symbol)) {
        snapshot.chartCoins.push({ ...alt, change24h: 0 });
      }
      if (snapshot.chartCoins.length >= 5) break;
    }
  }

  try {
    const ids = snapshot.chartCoins.map((c) => c.id).join(',');
    const p = await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`
    );
    for (const coin of snapshot.chartCoins) {
      if (p[coin.id]?.usd) {
        coin.usd = Number(p[coin.id].usd);
        coin.change24h = Number(p[coin.id].usd_24h_change ?? coin.change24h ?? 0);
      }
    }
  } catch {
    // OHLC still has latest close price
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const xml = await res.text();
      const matches = [...xml.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)];
      snapshot.headlines = matches
        .slice(0, 4)
        .map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim())
        .filter(Boolean);
    }
  } catch {
    // Optional
  }

  return snapshot;
}

async function fetchOhlcCandles(coin) {
  const rows = await fetchJson(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coin.id)}/ohlc?vs_currency=usd&days=7`
  );
  if (!Array.isArray(rows) || rows.length < 12) {
    throw new Error(`Insufficient OHLC candles for ${coin.symbol}`);
  }
  return rows.slice(-34).map(([ts, o, h, l, c]) => ({ ts, o, h, l, c }));
}

function renderCandlestickChartPng(coin, candles) {
  const symbol = coin.symbol;
  const change24h = Number(coin.change24h || 0);
  const width = 1200;
  const height = 675;
  const padLeft = 48;
  const padRight = 148;
  const padTop = 104;
  const padBottom = 56;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const rawMax = Math.max(...highs);
  const rawMin = Math.min(...lows);
  const span = Math.max(rawMax - rawMin, rawMax * 0.01);
  const maxP = rawMax + span * 0.1;
  const minP = rawMin - span * 0.1;

  const recent12 = candles.slice(-12);
  const resistance = Math.max(...recent12.map((c) => c.h));
  const support = Math.min(...recent12.map((c) => c.l));
  const lastPrice = candles[candles.length - 1].c;
  const decimals = inferDecimals(lastPrice);

  const yOf = (price) => padTop + ((maxP - price) / (maxP - minP)) * plotH;

  const gridLines = [];
  for (let i = 0; i <= 4; i += 1) {
    const p = minP + ((maxP - minP) * i) / 4;
    const y = yOf(p).toFixed(1);
    gridLines.push(
      `<line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`,
      `<text x="${width - padRight + 14}" y="${Number(y) + 4}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="14">${fmtPrice(p, decimals)}</text>`
    );
  }

  const slotW = plotW / candles.length;
  const bodyW = Math.max(8, Math.floor(slotW * 0.58));
  const candleSvg = candles
    .map((c, idx) => {
      const cx = padLeft + slotW * idx + slotW / 2;
      const bull = c.c >= c.o;
      const color = bull ? '#84cc16' : '#ef4444';
      const wickTop = yOf(c.h);
      const wickBot = yOf(c.l);
      const bodyTop = yOf(Math.max(c.o, c.c));
      const bodyBot = yOf(Math.min(c.o, c.c));
      const bodyH = Math.max(2, bodyBot - bodyTop);

      return [
        `<line x1="${cx.toFixed(1)}" y1="${wickTop.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${wickBot.toFixed(1)}" stroke="${color}" stroke-width="2"/>`,
        `<rect x="${(cx - bodyW / 2).toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${bodyW}" height="${bodyH.toFixed(1)}" fill="${color}" rx="1.5"/>`,
      ].join('');
    })
    .join('');

  const resY = yOf(resistance).toFixed(1);
  const supY = yOf(support).toFixed(1);
  const curY = yOf(lastPrice).toFixed(1);
  const chgSign = change24h >= 0 ? '+' : '';
  const chgColor = change24h >= 0 ? '#84cc16' : '#ef4444';
  const chgBg = change24h >= 0 ? 'rgba(132,204,22,0.14)' : 'rgba(239,68,68,0.14)';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0b0c10"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <text x="${padLeft}" y="48" fill="#f4f4f5" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="700">${symbol} / USD  ·  4H</text>
  <text x="${padLeft}" y="78" fill="#ffffff" font-family="DejaVu Sans Mono, monospace" font-size="30" font-weight="700">${fmtPrice(lastPrice, decimals)}</text>

  <rect x="295" y="52" width="112" height="30" rx="6" fill="${chgBg}"/>
  <text x="351" y="72" text-anchor="middle" fill="${chgColor}" font-family="DejaVu Sans Mono, monospace" font-size="16" font-weight="700">${chgSign}${change24h.toFixed(2)}%</text>

  <text x="${width - padRight}" y="48" text-anchor="end" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="14">AURELIAS DESK  ·  TRENDING 4H</text>

  ${gridLines.join('\n  ')}

  <line x1="${padLeft}" y1="${resY}" x2="${width - padRight}" y2="${resY}" stroke="#ef4444" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="${padLeft + 8}" y="${Number(resY) - 8}" fill="#ef4444" font-family="DejaVu Sans Mono, monospace" font-size="13">48H HIGH  ${fmtPrice(resistance, decimals)}</text>

  <line x1="${padLeft}" y1="${supY}" x2="${width - padRight}" y2="${supY}" stroke="#84cc16" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="${padLeft + 8}" y="${Number(supY) + 18}" fill="#84cc16" font-family="DejaVu Sans Mono, monospace" font-size="13">48H LOW   ${fmtPrice(support, decimals)}</text>

  ${candleSvg}

  <line x1="${padLeft}" y1="${curY}" x2="${width - padRight}" y2="${curY}" stroke="#a1a1aa" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="3 3"/>
  <rect x="${width - padRight + 8}" y="${Number(curY) - 13}" width="126" height="26" rx="4" fill="#f4f4f5"/>
  <text x="${width - padRight + 71}" y="${Number(curY) + 5}" text-anchor="middle" fill="#0b0c10" font-family="DejaVu Sans Mono, monospace" font-size="13" font-weight="700">${fmtPrice(lastPrice, decimals)}</text>
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const pngBuffer = resvg.render().asPng();

  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  const filename = `chart-${symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}-${stamp}-${rand}.png`;
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(path.join(GENERATED_DIR, filename), pngBuffer);

  return {
    imagePath: `assets/social/generated/${filename}`,
    symbol,
    name: coin.name,
    price: lastPrice,
    decimals,
    support,
    resistance,
    change24h,
  };
}

module.exports = {
  fmtPrice,
  fetchLiveMarketSnapshot,
  fetchOhlcCandles,
  renderCandlestickChartPng,
};
