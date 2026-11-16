const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Resvg } = require('@resvg/resvg-js');

const GENERATED_DIR = path.join(__dirname, '..', 'assets', 'social', 'generated');

const EXCLUDED_SYMBOLS = new Set([
  'BTC', 'WBTC', 'ETH', 'WETH', 'STETH', 'SOL', 'WSOL', 'USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDG', 'BUSD', 'BNB', 'WBNB', 'PEPE', 'SHIB', 'DOGE', 'BONK', 'FLOKI',
]);

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
  const n = Number(val || 0);
  const d = decimals === null ? inferDecimals(n) : decimals;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })}`;
}

function fmtCompactUsd(val) {
  const n = Number(val || 0);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function shortAddr(addr = '') {
  const s = String(addr);
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
}

function computePoolGrade(pool) {
  const liq = Number(pool.liqUsd || 0);
  const fdv = Math.max(Number(pool.fdvUsd || 0), liq);
  const vol = Number(pool.vol24hUsd || 0);
  const buys = Number(pool.buys24h || 0);
  const sells = Number(pool.sells24h || 0);
  const totalTx = buys + sells;
  const buyPct = totalTx > 0 ? Math.round((buys / totalTx) * 100) : 50;
  const depthPct = fdv > 0 ? (liq / fdv) * 100 : 0;

  if (liq >= 350000 && depthPct >= 1.2 && buyPct >= 50) {
    return {
      grade: 'A',
      color: '#84cc16',
      bg: 'rgba(132,204,22,0.16)',
      verdict: 'Deep liquidity & net spot absorption',
      depthPct,
      buyPct,
    };
  }
  if (liq >= 150000 && depthPct >= 0.9) {
    return {
      grade: buyPct >= 52 ? 'B+' : 'B',
      color: '#34d399',
      bg: 'rgba(52,211,153,0.15)',
      verdict: 'Healthy pool depth, active two-way flow',
      depthPct,
      buyPct,
    };
  }
  if (liq >= 75000) {
    return {
      grade: 'C',
      color: '#f59e0b',
      bg: 'rgba(245,158,11,0.16)',
      verdict: 'Moderate depth, size entries carefully',
      depthPct,
      buyPct,
    };
  }
  return {
    grade: 'D',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.16)',
    verdict: 'Thin liquidity vs FDV, high slippage risk',
    depthPct,
    buyPct,
  };
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
  const snapshot = { pools: [], chartCoins: [], trending: [], headlines: [] };

  try {
    const d = await fetchJson('https://api.geckoterminal.com/api/v2/networks/trending_pools?page=1');
    const rawPools = d.data || [];

    for (const p of rawPools) {
      const attr = p.attributes || {};
      const rawName = String(attr.name || '');
      const baseSymbol = rawName.split('/')[0].trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!baseSymbol || EXCLUDED_SYMBOLS.has(baseSymbol)) continue;

      const [network, poolAddress] = String(p.id || '').split('_');
      if (!network || !poolAddress) continue;

      const liqUsd = Number(attr.reserve_in_usd || 0);
      const vol24hUsd = Number(attr.volume_usd?.h24 || 0);
      if (liqUsd < 25000 || vol24hUsd < 80000) continue;

      const buys24h = Number(attr.transactions?.h24?.buys || 0);
      const sells24h = Number(attr.transactions?.h24?.sells || 0);
      const poolObj = {
        id: p.id,
        network,
        poolAddress,
        symbol: baseSymbol,
        pairName: rawName,
        priceUsd: Number(attr.base_token_price_usd || 0),
        change24h: Number(attr.price_change_percentage?.h24 || 0),
        vol24hUsd,
        liqUsd,
        fdvUsd: Number(attr.fdv_usd || attr.market_cap_usd || liqUsd * 10),
        buys24h,
        sells24h,
        whale: null,
      };
      poolObj.gradeInfo = computePoolGrade(poolObj);
      snapshot.pools.push(poolObj);
      if (snapshot.pools.length >= 6) break;
    }
  } catch (err) {
    console.warn('GeckoTerminal trending_pools fetch failed:', err.message);
  }

  // Enrich top 2 pools with live whale trade data
  for (const pool of snapshot.pools.slice(0, 2)) {
    try {
      await new Promise((r) => setTimeout(r, 600));
      const td = await fetchJson(
        `https://api.geckoterminal.com/api/v2/networks/${pool.network}/pools/${pool.poolAddress}/trades`
      );
      const trades = (td.data || [])
        .map((x) => x.attributes)
        .filter((a) => a && Number(a.volume_in_usd) > 250)
        .sort((a, b) => Number(b.volume_in_usd) - Number(a.volume_in_usd));

      if (trades[0]) {
        pool.whale = {
          kind: String(trades[0].kind || 'buy').toUpperCase(),
          usd: Number(trades[0].volume_in_usd),
          wallet: trades[0].tx_from_address || '',
          txHash: trades[0].tx_hash || '',
        };
      }
    } catch {
      // Optional enrichment
    }
  }

  snapshot.chartCoins = snapshot.pools;
  snapshot.trending = snapshot.pools.map((p) => `$${p.symbol} (${p.network})`);

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
        .slice(0, 3)
        .map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim())
        .filter(Boolean);
    }
  } catch {
    // Optional
  }

  return snapshot;
}

async function fetchOhlcCandles(pool) {
  const d = await fetchJson(
    `https://api.geckoterminal.com/api/v2/networks/${pool.network}/pools/${pool.poolAddress}/ohlcv/hour?aggregate=1&limit=34`
  );
  const list = d?.data?.attributes?.ohlcv_list;
  if (!Array.isArray(list) || list.length < 10) {
    throw new Error(`Insufficient 1H OHLCV candles for ${pool.symbol}`);
  }
  return list
    .slice()
    .reverse()
    .map(([ts, o, h, l, c]) => ({ ts: ts * 1000, o: Number(o), h: Number(h), l: Number(l), c: Number(c) }));
}

function renderCandlestickChartPng(pool, candles) {
  const symbol = pool.symbol;
  const change24h = Number(pool.change24h || 0);
  const gradeInfo = pool.gradeInfo || computePoolGrade(pool);
  const width = 1200;
  const height = 675;
  const padLeft = 48;
  const padRight = 148;
  const padTop = 132;
  const padBottom = 56;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const highs = candles.map((c) => c.h);
  const lows = candles.map((c) => c.l);
  const rawMax = Math.max(...highs);
  const rawMin = Math.min(...lows);
  const span = Math.max(rawMax - rawMin, rawMax * 0.01);
  const maxP = rawMax + span * 0.1;
  const minP = Math.max(0, rawMin - span * 0.1);

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
      `<text x="${width - padRight + 14}" y="${Number(y) + 4}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="13">${fmtPrice(p, decimals)}</text>`
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

  const whaleStrip = pool.whale
    ? `TOP WHALE CLIP: ${pool.whale.kind} ${fmtCompactUsd(pool.whale.usd)} (${shortAddr(pool.whale.wallet)})`
    : `BUY RATIO: ${gradeInfo.buyPct}% (${pool.buys24h}B / ${pool.sells24h}S)`;

  const metricsLine = `FDV ${fmtCompactUsd(pool.fdvUsd)}   ·   24H VOL ${fmtCompactUsd(pool.vol24hUsd)}   ·   LIQ ${fmtCompactUsd(pool.liqUsd)} (${gradeInfo.depthPct.toFixed(1)}%)   ·   ${whaleStrip}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#0b0c10"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <text x="${padLeft}" y="44" fill="#f4f4f5" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="700">$${symbol} / ${String(pool.network).toUpperCase()}  ·  1H DEX AUDIT</text>
  <text x="${padLeft}" y="76" fill="#ffffff" font-family="DejaVu Sans Mono, monospace" font-size="28" font-weight="700">${fmtPrice(lastPrice, decimals)}</text>

  <rect x="280" y="52" width="112" height="28" rx="6" fill="${chgBg}"/>
  <text x="336" y="71" text-anchor="middle" fill="${chgColor}" font-family="DejaVu Sans Mono, monospace" font-size="15" font-weight="700">${chgSign}${change24h.toFixed(1)}%</text>

  <rect x="${width - padRight - 160}" y="24" width="160" height="32" rx="6" fill="${gradeInfo.bg}" stroke="${gradeInfo.color}" stroke-width="1"/>
  <text x="${width - padRight - 80}" y="45" text-anchor="middle" fill="${gradeInfo.color}" font-family="DejaVu Sans Mono, monospace" font-size="15" font-weight="700">DESK GRADE: ${gradeInfo.grade}</text>

  <rect x="${padLeft}" y="88" width="${width - padLeft - padRight}" height="28" rx="4" fill="rgba(255,255,255,0.04)"/>
  <text x="${padLeft + 12}" y="107" fill="#d4d4d8" font-family="DejaVu Sans Mono, monospace" font-size="13">${metricsLine}</text>

  ${gridLines.join('\n  ')}

  <line x1="${padLeft}" y1="${resY}" x2="${width - padRight}" y2="${resY}" stroke="#ef4444" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="${padLeft + 8}" y="${Number(resY) - 8}" fill="#ef4444" font-family="DejaVu Sans Mono, monospace" font-size="13">12H HIGH  ${fmtPrice(resistance, decimals)}</text>

  <line x1="${padLeft}" y1="${supY}" x2="${width - padRight}" y2="${supY}" stroke="#84cc16" stroke-opacity="0.55" stroke-width="1.5" stroke-dasharray="6 5"/>
  <text x="${padLeft + 8}" y="${Number(supY) + 18}" fill="#84cc16" font-family="DejaVu Sans Mono, monospace" font-size="13">12H LOW   ${fmtPrice(support, decimals)}</text>

  ${candleSvg}

  <line x1="${padLeft}" y1="${curY}" x2="${width - padRight}" y2="${curY}" stroke="#a1a1aa" stroke-opacity="0.4" stroke-width="1" stroke-dasharray="3 3"/>
  <rect x="${width - padRight + 8}" y="${Number(curY) - 13}" width="128" height="26" rx="4" fill="#f4f4f5"/>
  <text x="${width - padRight + 72}" y="${Number(curY) + 5}" text-anchor="middle" fill="#0b0c10" font-family="DejaVu Sans Mono, monospace" font-size="13" font-weight="700">${fmtPrice(lastPrice, decimals)}</text>
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
    network: pool.network,
    price: lastPrice,
    decimals,
    support,
    resistance,
    change24h,
    vol24hUsd: pool.vol24hUsd,
    liqUsd: pool.liqUsd,
    fdvUsd: pool.fdvUsd,
    buys24h: pool.buys24h,
    sells24h: pool.sells24h,
    whale: pool.whale,
    gradeInfo,
  };
}

function renderDeskScorecardPng(pools) {
  const top4 = pools.slice(0, 4);
  const width = 1200;
  const height = 675;

  const rowsSvg = top4
    .map((p, idx) => {
      const y = 180 + idx * 112;
      const g = p.gradeInfo || computePoolGrade(p);
      const chgSign = p.change24h >= 0 ? '+' : '';
      const chgColor = p.change24h >= 0 ? '#84cc16' : '#ef4444';

      return `<g>
        <rect x="48" y="${y}" width="1104" height="94" rx="8" fill="#12131a" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
        <text x="76" y="${y + 42}" fill="#ffffff" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="700">$${p.symbol}</text>
        <text x="76" y="${y + 68}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="13">${String(p.network).toUpperCase()}  ·  ${fmtPrice(p.priceUsd)}</text>

        <text x="275" y="${y + 42}" fill="${chgColor}" font-family="DejaVu Sans Mono, monospace" font-size="20" font-weight="700">${chgSign}${p.change24h.toFixed(1)}%</text>
        <text x="275" y="${y + 68}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="12">24H CHANGE</text>

        <text x="455" y="${y + 42}" fill="#f4f4f5" font-family="DejaVu Sans Mono, monospace" font-size="20" font-weight="700">${fmtCompactUsd(p.vol24hUsd)}</text>
        <text x="455" y="${y + 68}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="12">24H VOLUME</text>

        <text x="645" y="${y + 42}" fill="#f4f4f5" font-family="DejaVu Sans Mono, monospace" font-size="20" font-weight="700">${fmtCompactUsd(p.liqUsd)}</text>
        <text x="645" y="${y + 68}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="12">LIQUIDITY (${g.depthPct.toFixed(1)}%)</text>

        <text x="845" y="${y + 42}" fill="#f4f4f5" font-family="DejaVu Sans Mono, monospace" font-size="20" font-weight="700">${fmtCompactUsd(p.fdvUsd)}</text>
        <text x="845" y="${y + 68}" fill="#71717a" font-family="DejaVu Sans Mono, monospace" font-size="12">FDV  ·  ${g.buyPct}% BUYS</text>

        <rect x="1015" y="${y + 22}" width="110" height="50" rx="8" fill="${g.bg}" stroke="${g.color}" stroke-width="1.5"/>
        <text x="1070" y="${y + 54}" text-anchor="middle" fill="${g.color}" font-family="DejaVu Sans Mono, monospace" font-size="24" font-weight="700">${g.grade}</text>
      </g>`;
    })
    .join('\n  ');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#08090c"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

  <text x="48" y="54" fill="#84cc16" font-family="DejaVu Sans Mono, monospace" font-size="14" font-weight="700">AURELIAS ON-CHAIN DESK  ·  LIQUIDITY &amp; FLOW AUDIT</text>
  <text x="48" y="96" fill="#ffffff" font-family="DejaVu Sans, sans-serif" font-size="34" font-weight="700">Top Trending DEX Runners Scorecard</text>
  <text x="48" y="130" fill="#a1a1aa" font-family="DejaVu Sans Mono, monospace" font-size="14">Graded live on Liquidity-to-FDV Depth, 24h Volume Velocity, and Net Buy Orderflow</text>

  ${rowsSvg}
</svg>`;

  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } });
  const pngBuffer = resvg.render().asPng();

  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  const filename = `scorecard-${stamp}-${rand}.png`;
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(path.join(GENERATED_DIR, filename), pngBuffer);

  return `assets/social/generated/${filename}`;
}

module.exports = {
  fmtPrice,
  fmtCompactUsd,
  shortAddr,
  computePoolGrade,
  fetchLiveMarketSnapshot,
  fetchOhlcCandles,
  renderCandlestickChartPng,
  renderDeskScorecardPng,
};
