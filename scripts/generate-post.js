const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const {
  fmtPrice,
  fmtCompactUsd,
  shortAddr,
  fetchLiveMarketSnapshot,
  fetchOhlcCandles,
  renderCandlestickChartPng,
  renderDeskScorecardPng,
} = require('./market-chart');

dns.setDefaultResultOrder('ipv4first');

const DEFAULT_SITE_URL = 'https://www.evmsync.live/?ref=x';
const GENERATED_DIR = path.join(__dirname, '..', 'assets', 'social', 'generated');
const HISTORY_FILE = path.join(__dirname, '..', 'assets', 'social', '.post-history.json');

const ORGANIC_POOL_IMAGES = [
  'assets/social/pool/organic-obsidian-basalt.jpg',
  'assets/social/pool/organic-obsidian-hero.jpg',
  'assets/social/pool/organic-obsidian-prism.jpg',
  'assets/social/pool/organic-titanium-chronograph.jpg',
  'assets/social/pool/organic-titanium-rings.jpg',
];

const PROMO_POOL_IMAGES = [
  'assets/social/pool/promo-50k-pool.jpg',
  'assets/social/pool/promo-36-tiers.jpg',
  'assets/social/pool/promo-multichain-vrf.jpg',
  'assets/social/pool/promo-20k-grand-prize.jpg',
];

const BANNED_PATTERNS = [
  /[\u2014\u2013]/,
  /#[a-z0-9_]+/i,
  /\b(lfg|wagmi|ngmi|gm frens|to the moon|100x gem|delve|tapestry|game[- ]changer|revolutionize|elevate|unleash|in a world where|here'?s why|let'?s dive|buckle up|don'?t miss out|act fast)\b/i,
  /[\u{1F680}\u{1F525}\u{1F48E}\u{2728}]/u,
];

function getTimingContext() {
  const ROUND_MS = 72 * 60 * 60 * 1000;
  const customDeadline = process.env.ROUND_DEADLINE_ISO
    ? Date.parse(process.env.ROUND_DEADLINE_ISO)
    : NaN;

  let remainingMs;
  if (!Number.isNaN(customDeadline) && customDeadline > Date.now()) {
    remainingMs = customDeadline - Date.now();
  } else {
    const anchor = Date.UTC(2026, 10, 15, 0, 0, 0);
    const elapsed = (Date.now() - anchor) % ROUND_MS;
    remainingMs = ROUND_MS - (elapsed < 0 ? elapsed + ROUND_MS : elapsed);
  }

  const hoursLeft = Math.max(1, Math.floor(remainingMs / (60 * 60 * 1000)));
  const label =
    hoursLeft <= 6
      ? `Final ${hoursLeft}h left in this 72h round`
      : hoursLeft <= 24
        ? `Under ${hoursLeft}h left in the 72h Season 04 round`
        : `${hoursLeft}h remaining in the current 72h Season 04 window`;

  return { hoursLeft, label };
}

function loadHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function hasBannedPattern(text) {
  return BANNED_PATTERNS.some((rx) => rx.test(text));
}

function sanitizeTweet(raw, siteUrl, includeUrl) {
  let text = String(raw || '')
    .replace(/[\u2014\u2013]/g, ', ')
    .replace(/#[a-z0-9_]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (includeUrl && !text.includes(siteUrl)) {
    text = `${text} ${siteUrl}`.trim();
  }

  if (text.length > 275) {
    if (includeUrl) {
      const withoutUrl = text.replace(siteUrl, '').trim();
      const maxBody = 274 - siteUrl.length;
      const trimmed = withoutUrl.slice(0, maxBody).replace(/[,:;.\s]+$/, '');
      text = `${trimmed}. ${siteUrl}`;
    } else {
      text = `${text.slice(0, 272).replace(/[,:;.\s]+$/, '')}.`;
    }
  }

  return text;
}

function pickUnusedPoolImage(isPromo, history) {
  const candidates = isPromo ? PROMO_POOL_IMAGES : ORGANIC_POOL_IMAGES;
  const recentSet = new Set(
    (Array.isArray(history) ? history : [])
      .slice(-(candidates.length - 1))
      .map((h) => h.imagePath)
      .filter(Boolean)
  );
  const unused = candidates.filter((img) => !recentSet.has(img));
  const pool = unused.length > 0 ? unused : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildFallbackPost({ mode, siteUrl, timing, pool, pools, chartInfo }) {
  if (mode === 'aurelias_promo') {
    const promoPool = [
      `${timing.label}. AURELIAS Season 04 allocates 50,000 USDC across 36 winners (1x 20,000, 5x 3,000, 30x 500 USDC) for a $2 entry. Zero wallet connect. ${siteUrl}`,
      `${timing.label}. Most traders burn $15 a day in DEX slippage. Season 04 is a capped $2 entry for 36 shots at 50,000 USDC. ${siteUrl}`,
    ];
    return sanitizeTweet(promoPool[Math.floor(Math.random() * promoPool.length)], siteUrl, true);
  }

  if (mode === 'desk_scorecard' && pools?.length >= 3) {
    const lines = pools.slice(0, 4).map((p) => {
      const g = p.gradeInfo?.grade || 'B';
      return `$${p.symbol} (${fmtCompactUsd(p.vol24hUsd)} vol / ${fmtCompactUsd(p.liqUsd)} liq): Grade ${g}`;
    });
    return sanitizeTweet(
      `On-chain desk scorecard: ${lines.join(' | ')}. Reply with a ticker + CA to queue it for the next liquidity audit.`,
      siteUrl,
      false
    );
  }

  const target = chartInfo || pool;
  if (target) {
    const sym = target.symbol;
    const g = target.gradeInfo || { grade: 'B', depthPct: 1.5, buyPct: 52, verdict: 'Active flow' };
    const vol = fmtCompactUsd(target.vol24hUsd);
    const liq = fmtCompactUsd(target.liqUsd);
    const fdv = fmtCompactUsd(target.fdvUsd);

    if (mode === 'whale_flow' && target.whale) {
      const w = target.whale;
      return sanitizeTweet(
        `On-chain flow alert on $${sym}: wallet ${shortAddr(w.wallet)} executed a ${fmtCompactUsd(w.usd)} ${w.kind} as 24h volume reached ${vol} against ${liq} liquidity (${fdv} FDV). Desk Grade: ${g.grade} (${g.verdict}).`,
        siteUrl,
        false
      );
    }

    return sanitizeTweet(
      `Liquidity audit on $${sym}: ${vol} 24h volume on ${liq} liquidity (${g.depthPct.toFixed(1)}% of ${fdv} FDV, ${g.buyPct}% buys). Desk Grade: ${g.grade}. ${g.verdict}.`,
      siteUrl,
      false
    );
  }

  return 'AURELIAS Desk: Always verify pool liquidity depth relative to FDV before sizing into trending on-chain runners.';
}

async function generateCopyWithGemini({ apiKey, mode, siteUrl, history, timing, pool, pools, chartInfo }) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

  const recentTexts = history.slice(-6).map((h, i) => `${i + 1}. ${h.text}`).join('\n');
  const target = chartInfo || pool;

  let modeBrief = '';
  if (mode === 'whale_flow' && target) {
    const g = target.gradeInfo || {};
    const whaleStr = target.whale
      ? `Top whale swap: wallet ${shortAddr(target.whale.wallet)} ${target.whale.kind} ${fmtCompactUsd(target.whale.usd)}`
      : `Buy ratio: ${g.buyPct}% (${target.buys24h} buys vs ${target.sells24h} sells)`;
    modeBrief = [
      'Format: Institutional Whale Flow Alert (@lookonchain / @spotonchain style).',
      `Token: $${target.symbol} (${target.network})`,
      `Price: ${fmtPrice(target.price || target.priceUsd)} (${Number(target.change24h || 0).toFixed(1)}% 24h)`,
      `Metrics: 24h Vol ${fmtCompactUsd(target.vol24hUsd)}, Liquidity ${fmtCompactUsd(target.liqUsd)} (${(g.depthPct || 0).toFixed(1)}% of ${fmtCompactUsd(target.fdvUsd)} FDV)`,
      whaleStr,
      `Desk Grade: ${g.grade} (${g.verdict}). State a definitive desk read with these exact numbers. Do NOT ask a question.`,
    ].join('\n');
  } else if (mode === 'liquidity_audit' && target) {
    const g = target.gradeInfo || {};
    modeBrief = [
      'Format: Institutional Liquidity & Slippage Audit (@bubblemaps style).',
      `Token: $${target.symbol} (${target.network})`,
      `Metrics: ${fmtCompactUsd(target.vol24hUsd)} 24h volume vs ${fmtCompactUsd(target.liqUsd)} liquidity (${(g.depthPct || 0).toFixed(1)}% depth against ${fmtCompactUsd(target.fdvUsd)} FDV, ${g.buyPct}% buys).`,
      chartInfo ? `12H Range: ${fmtPrice(chartInfo.support, chartInfo.decimals)} low to ${fmtPrice(chartInfo.resistance, chartInfo.decimals)} high.` : '',
      `Desk Grade: ${g.grade} (${g.verdict}). Publish a hard, number-backed liquidity verdict. Do NOT ask a wishy-washy question.`,
    ].filter(Boolean).join('\n');
  } else if (mode === 'desk_scorecard' && pools?.length) {
    const rows = pools.slice(0, 4).map(
      (p) => `$${p.symbol}: ${fmtCompactUsd(p.vol24hUsd)} vol / ${fmtCompactUsd(p.liqUsd)} liq (${p.gradeInfo?.depthPct.toFixed(1)}% depth) -> Grade ${p.gradeInfo?.grade}`
    );
    modeBrief = [
      'Format: 4-Coin On-Chain Desk Scorecard.',
      `Coins:\n${rows.join('\n')}`,
      'List all 4 $TICKERs with their key volume/liquidity stat and Grade (A to D), and end with: "Reply with a ticker + CA for the next desk audit."',
    ].join('\n');
  } else {
    modeBrief = `Format: AURELIAS Season 04 Promo. Facts: 50,000 USDC pool across 36 winners (1x 20,000, 5x 3,000, 30x 500 USDC), $2 entry, zero wallet connect, 15-min payment window. Timing: "${timing.label}". MUST include exact URL: ${siteUrl}`;
  }

  const rules = [
    'You are the lead analyst for AURELIAS, an institutional crypto trading and on-chain flow desk.',
    'Strict rules:',
    '- Under 255 characters total.',
    '- NO em-dashes or en-dashes.',
    '- NO hashtags (#) and NO emojis.',
    '- Always prefix token symbols with $ (e.g. $CASHCAT, $MIHAO).',
    '- Sound authoritative, sharp, and data-dense. Never use generic AI filler.',
    recentTexts ? `Recent posts (do not repeat):\n${recentTexts}` : '',
    'Return JSON: { "bestTweet": "..." }.',
  ].filter(Boolean).join('\n');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: rules }] },
      contents: [{ role: 'user', parts: [{ text: modeBrief }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { bestTweet: { type: 'STRING' } },
          required: ['bestTweet'],
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini copy API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawJson) throw new Error('Gemini copy API returned empty response.');

  const parsed = JSON.parse(rawJson);
  const cleaned = sanitizeTweet(parsed.bestTweet, siteUrl, mode === 'aurelias_promo');
  if (hasBannedPattern(cleaned)) {
    throw new Error(`Generated tweet triggered anti-slop filter: "${cleaned}"`);
  }
  return cleaned;
}

function pruneOldGeneratedImages(maxAgeDays = 14) {
  if (!fs.existsSync(GENERATED_DIR)) return;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(GENERATED_DIR)) {
    const full = path.join(GENERATED_DIR, file);
    const stat = fs.statSync(full);
    if (stat.isFile() && stat.mtimeMs < cutoff) {
      fs.unlinkSync(full);
    }
  }
}

function getCountArg() {
  const idx = process.argv.indexOf('--count');
  if (idx !== -1 && process.argv[idx + 1]) {
    const parsed = Number.parseInt(process.argv[idx + 1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(parsed, 10);
  }
  const envCount = Number.parseInt(process.env.POST_COUNT || '1', 10);
  return Number.isFinite(envCount) && envCount > 0 ? Math.min(envCount, 10) : 1;
}

function buildScheduleSlots(count) {
  const now = Date.now();
  const lagosOffsetMs = 60 * 60 * 1000;
  const nowLagos = new Date(now + lagosOffsetMs);
  const y = nowLagos.getUTCFullYear();
  const m = nowLagos.getUTCMonth();
  const d = nowLagos.getUTCDate();

  const dayShift = nowLagos.getUTCHours() >= 22 ? 1 : 0;
  const windowStart = Date.UTC(y, m, d + dayShift, 7, 0, 0) - lagosOffsetMs;
  const windowEnd = Date.UTC(y, m, d + dayShift, 23, 0, 0) - lagosOffsetMs;

  const effectiveStart = Math.max(now + 20 * 60 * 1000, windowStart);
  const effectiveEnd = Math.max(effectiveStart + count * 20 * 60 * 1000, windowEnd);
  const step = count > 1 ? (effectiveEnd - effectiveStart) / (count - 1) : 0;

  const slots = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = Math.floor((Math.random() - 0.5) * 10 * 60 * 1000);
    const ts = Math.max(
      now + (i * 5 + 18) * 60 * 1000,
      Math.round(effectiveStart + i * step + jitter)
    );
    slots.push(new Date(ts).toISOString());
  }
  return slots;
}

async function generateSinglePost({ mode, apiKey, siteUrl, history, timing, isPreview, dueAt, pool, pools }) {
  const isPromo = mode === 'aurelias_promo';
  let imagePath = pickUnusedPoolImage(isPromo, history);
  let imageSource = 'curated-pool';
  let chartInfo = null;

  if (!isPromo && !isPreview) {
    try {
      if (mode === 'desk_scorecard' && pools?.length >= 3) {
        imagePath = renderDeskScorecardPng(pools);
        imageSource = 'desk-scorecard-png';
      } else if (pool) {
        const candles = await fetchOhlcCandles(pool);
        chartInfo = renderCandlestickChartPng(pool, candles);
        imagePath = chartInfo.imagePath;
        imageSource = 'dex-1h-audit-png';
      }
    } catch (err) {
      console.warn(`Visual render failed for ${mode}, using curated pool:`, err.message);
    }
  }

  let text;
  let copySource = 'fallback';
  if (apiKey) {
    try {
      text = await generateCopyWithGemini({ apiKey, mode, siteUrl, history, timing, pool, pools, chartInfo });
      copySource = 'gemini-3.8-flash';
    } catch (err) {
      console.warn('Gemini copy generation failed, using fallback:', err.message);
      text = buildFallbackPost({ mode, siteUrl, timing, pool, pools, chartInfo });
    }
  } else {
    text = buildFallbackPost({ mode, siteUrl, timing, pool, pools, chartInfo });
  }

  return {
    pillar: mode,
    isPromo,
    text,
    symbol: pool?.symbol || null,
    imagePath,
    dueAt,
    copySource,
    imageSource,
  };
}

async function main() {
  const isPreview = process.argv.includes('--preview');
  const count = getCountArg();
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const rawSiteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).trim() || DEFAULT_SITE_URL;
  const siteUrl = rawSiteUrl.includes('ref=')
    ? rawSiteUrl
    : `${rawSiteUrl}${rawSiteUrl.includes('?') ? '&' : '?'}ref=x`;
  let history = loadHistory();
  const timing = getTimingContext();
  const slots = buildScheduleSlots(count);
  const market = await fetchLiveMarketSnapshot();
  const pools = market.pools || [];

  if (!isPreview) {
    pruneOldGeneratedImages(14);
  }

  const modes = ['whale_flow', 'desk_scorecard', 'liquidity_audit', 'aurelias_promo'];
  const batch = [];

  for (let i = 0; i < count; i += 1) {
    const mode = modes[i % modes.length];
    const pool = mode === 'liquidity_audit' ? pools[1] || pools[0] : pools[0];
    const item = await generateSinglePost({
      mode,
      apiKey,
      siteUrl,
      history,
      timing,
      isPreview,
      dueAt: slots[i],
      pool,
      pools,
    });
    batch.push(item);
    history = [
      ...history,
      { at: new Date().toISOString(), pillar: item.pillar, imagePath: item.imagePath, text: item.text },
    ].slice(-15);
    if (!isPreview && i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (!isPreview) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
    fs.writeFileSync(path.join(__dirname, '..', '.generated-post.json'), JSON.stringify(batch[0], null, 2));
    fs.writeFileSync(path.join(__dirname, '..', '.generated-batch.json'), JSON.stringify(batch, null, 2));
  }

  console.log(JSON.stringify(count === 1 ? batch[0] : batch, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
