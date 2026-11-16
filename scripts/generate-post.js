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
  const ROUND_MS = 30 * 24 * 60 * 60 * 1000;
  const customDeadline = process.env.ROUND_DEADLINE_ISO
    ? Date.parse(process.env.ROUND_DEADLINE_ISO)
    : NaN;

  let remainingMs;
  if (!Number.isNaN(customDeadline) && customDeadline > Date.now()) {
    remainingMs = customDeadline - Date.now();
  } else {
    const anchor = Date.UTC(2026, 10, 16, 0, 0, 0);
    const elapsed = (Date.now() - anchor) % ROUND_MS;
    remainingMs = ROUND_MS - (elapsed < 0 ? elapsed + ROUND_MS : elapsed);
  }

  const hoursLeft = Math.max(1, Math.floor(remainingMs / (60 * 60 * 1000)));
  const daysLeft = Math.max(1, Math.ceil(hoursLeft / 24));
  const label =
    hoursLeft <= 24
      ? `Final ${hoursLeft}h left in the 30-day Season 04 round`
      : `${daysLeft} days remaining in the 30-day Season 04 window`;

  return { hoursLeft, daysLeft, label };
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

const HOOK_STYLES = [
  'Lead with the most shocking contrast between paper FDV and real pool cash.',
  'Lead with what smart money / whales are doing while retail chases green candles.',
  'Lead with a blunt 1-sentence reality check on how fast thin pools slip when top holders exit.',
  'Lead with the raw 24h volume turnover multiple vs pool depth, then deliver the verdict.',
  'Lead with a deadpan observation about retail trader psychology on this exact setup.',
  'Open with the exact wallet receipt or buy/sell orderflow skew, then explain what it signals.',
];

function sanitizeTweet(raw, siteUrl, includeUrl) {
  let text = String(raw || '')
    .replace(/[\u2014\u2013]/g, ', ')
    .replace(/#[a-z0-9_]+/gi, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (includeUrl && !text.includes(siteUrl)) {
    text = `${text}\n\n${siteUrl}`.trim();
  }

  if (text.length > 275) {
    if (includeUrl) {
      const withoutUrl = text.replace(siteUrl, '').trim();
      const maxBody = 273 - siteUrl.length;
      const trimmed = withoutUrl.slice(0, maxBody).replace(/[,:;.\s]+$/, '');
      text = `${trimmed}.\n${siteUrl}`;
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

function buildFallbackPost({ mode, siteUrl, timing, pool, pools, chartInfo, variantIdx = 0 }) {
  if (mode === 'aurelias_promo') {
    const promoVariants = [
      `Traders happily burn $40 in DEX slippage aping thin pools, then overthink a capped $2 asymmetric bet.\n\n${timing.label}.\n• 1x 20,000 USDC\n• 5x 3,000 USDC\n• 30x 500 USDC\n\nZero wallet connect:\n${siteUrl}`,
      `${timing.label}.\n\n50,000 USDC split across 36 winners instead of winner-takes-all:\n• 1x 20,000 USDC\n• 5x 3,000 USDC\n• 30x 500 USDC\n\n$2 entry from your own wallet app:\n${siteUrl}`,
      `Most crypto draws ask for wallet-connect signatures. We don't.\n\nPaste your sending address, send $2, and lock in 36 shots at 50,000 USDC (${timing.daysLeft}d left).\n${siteUrl}`,
    ];
    return sanitizeTweet(promoVariants[variantIdx % promoVariants.length], siteUrl, true);
  }

  if (mode === 'desk_scorecard' && pools?.length >= 3) {
    const lines = pools.slice(0, 4).map((p) => {
      const g = p.gradeInfo?.grade || 'B';
      return `• $${p.symbol}: ${fmtCompactUsd(p.vol24hUsd)} vol / ${fmtCompactUsd(p.liqUsd)} liq (${g})`;
    });
    return sanitizeTweet(
      `Today's on-chain liquidity scorecard:\n\n${lines.join('\n')}\n\nReply with a ticker + CA to queue it for the next desk audit.`,
      siteUrl,
      false
    );
  }

  const target = chartInfo || pool;
  if (target) {
    const sym = target.symbol;
    const g = target.gradeInfo || { grade: 'B', depthPct: 1.5, buyPct: 52 };
    const vol = fmtCompactUsd(target.vol24hUsd);
    const liq = fmtCompactUsd(target.liqUsd);
    const fdv = fmtCompactUsd(target.fdvUsd);
    const chg = Number(target.change24h || 0);

    if (mode === 'whale_flow' && target.whale) {
      const w = target.whale;
      const actionVerb = w.kind === 'SELL' ? 'dumped into' : 'accumulated';
      return sanitizeTweet(
        `Wallet ${shortAddr(w.wallet)} just ${actionVerb} $${sym} (${fmtCompactUsd(w.usd)} clip) while 24h volume hit ${vol}.\n\n• Pool cash: ${liq} (${fdv} FDV)\n• Orderflow: ${g.buyPct}% buys\n\nWhales use high-volume candles for liquidity. Watch ${liq} pool depth closely.`,
        siteUrl,
        false
      );
    }

    if (g.depthPct < 1.2) {
      return sanitizeTweet(
        `Retail is trading $${sym} at a ${fdv} valuation right now.\n\nThere is only ${liq} of real cash in the liquidity pool (${g.depthPct.toFixed(1)}% depth).\n\nIf two early wallets exit at once, that chart drops 50% in one candle. Check depth before chasing.`,
        siteUrl,
        false
      );
    }

    return sanitizeTweet(
      `$${sym} cleared ${vol} in 24h volume (${chg >= 0 ? '+' : ''}${chg.toFixed(1)}%) backed by ${liq} in real pool liquidity.\n\n• Buy ratio: ${g.buyPct}% across 24h trades\n• Valuation: ${fdv} FDV\n\nReal spot absorption instead of paper thin air.`,
      siteUrl,
      false
    );
  }

  return 'Crypto traders will lose $300 aping an unlocked pool in 4 minutes, then spend 3 days overthinking a $2 capped-risk bet.';
}

async function generateCopyWithGemini({ apiKey, mode, siteUrl, history, timing, pool, pools, chartInfo, hookStyle }) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

  const recentTexts = history.slice(-8).map((h, i) => `${i + 1}. ${h.text.replace(/\n+/g, ' / ')}`).join('\n');
  const target = chartInfo || pool;

  let modeBrief = '';
  if (mode === 'whale_flow' && target) {
    const g = target.gradeInfo || {};
    const whaleStr = target.whale
      ? `Live whale trade: wallet ${shortAddr(target.whale.wallet)} executed a ${fmtCompactUsd(target.whale.usd)} ${target.whale.kind}`
      : `Orderflow skew: ${g.buyPct}% buys (${target.buys24h} buys vs ${target.sells24h} sells)`;
    modeBrief = [
      'Archetype: Whale vs. Retail Play-by-Play (@lookonchain style).',
      `Hook style for this post: ${hookStyle}`,
      `Token: $${target.symbol} on ${target.network} (${Number(target.change24h || 0).toFixed(1)}% 24h)`,
      `Anomaly: ${target.anomaly?.headline || ''}`,
      `Numbers: 24h Vol ${fmtCompactUsd(target.vol24hUsd)}, Real Pool Cash ${fmtCompactUsd(target.liqUsd)}, Valuation ${fmtCompactUsd(target.fdvUsd)} FDV (${(g.depthPct || 0).toFixed(1)}% depth)`,
      whaleStr,
      'Write a 3-part tweet separated by blank lines (\\n\\n): 1) Blunt human hook about what this wallet/flow is doing, 2) 2 short bullet points with the key numbers, 3) Sharp 1-line trader takeaway. Do NOT ask a question.',
    ].join('\n');
  } else if (mode === 'liquidity_audit' && target) {
    const g = target.gradeInfo || {};
    modeBrief = [
      'Archetype: Paper Market Cap vs. Real Pool Cash Exposé (@zachxbt / @bubblemaps style).',
      `Hook style for this post: ${hookStyle}`,
      `Token: $${target.symbol} on ${target.network}`,
      `Anomaly: ${target.anomaly?.headline || ''}`,
      `Numbers: ${fmtCompactUsd(target.fdvUsd)} FDV valuation vs ${fmtCompactUsd(target.liqUsd)} real liquidity (${(g.depthPct || 0).toFixed(1)}% depth), ${fmtCompactUsd(target.vol24hUsd)} 24h volume, ${g.buyPct}% buys.`,
      chartInfo ? `12H chart range: ${fmtPrice(chartInfo.support, chartInfo.decimals)} to ${fmtPrice(chartInfo.resistance, chartInfo.decimals)}.` : '',
      'Write a 3-part tweet separated by blank lines (\\n\\n) in plain, blunt human English exposing either the trapdoor liquidity risk or confirming real liquidity backing. Never sound like a robotic scanner log.',
    ].filter(Boolean).join('\n');
  } else if (mode === 'desk_scorecard' && pools?.length) {
    const rows = pools.slice(0, 4).map(
      (p) => `$${p.symbol}: ${fmtCompactUsd(p.vol24hUsd)} vol / ${fmtCompactUsd(p.liqUsd)} liq (${p.gradeInfo?.depthPct.toFixed(1)}% depth) -> Grade ${p.gradeInfo?.grade}`
    );
    modeBrief = [
      'Archetype: 4-Coin On-Chain Liquidity Scorecard.',
      `Coins:\n${rows.join('\n')}`,
      'Format with clean line breaks (\\n): 1 short opener line, 4 bullet lines (• $TICKER: vol / liq · Grade X), and end with: "Reply with a ticker + CA to queue it for the next desk audit."',
    ].join('\n');
  } else {
    modeBrief = [
      'Archetype: Deadpan Retail Psychology -> Season 04 Hook (@cobie style).',
      `Hook style: Contrast how traders casually lose $30-$100 in slippage/gas aping bad pools vs a capped $2 entry for 36 shots at 50,000 USDC (1x 20k, 5x 3k, 30x 500).`,
      `Urgency: ${timing.label}. Zero wallet connect.`,
      `Use clean line breaks (\\n\\n) and end with the exact URL: ${siteUrl}`,
    ].join('\n');
  }

  const rules = [
    'You write high-engagement Crypto Twitter (X) posts for AURELIAS, an on-chain trading and liquidity desk.',
    'Strict formatting & voice rules:',
    '- Under 260 characters total.',
    '- Use line breaks (\\n\\n) between short 1-sentence lines so the tweet is effortless to scan.',
    '- NEVER write robotic scanner logs ("Liquidity audit on $X:", "Desk Grade: B"). Write in blunt, plain-English human prose.',
    '- NEVER repeat the sentence structure or opening phrasing of any recent post listed below.',
    '- NO em-dashes, NO hashtags (#), NO emojis.',
    '- Always prefix token symbols with $ (e.g. $CASHCAT).',
    recentTexts ? `Recent posts (NEVER repeat these openings or structures):\n${recentTexts}` : '',
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

async function generateSinglePost({ mode, apiKey, siteUrl, history, timing, isPreview, dueAt, pool, pools, hookStyle, variantIdx }) {
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
      text = await generateCopyWithGemini({ apiKey, mode, siteUrl, history, timing, pool, pools, chartInfo, hookStyle });
      copySource = 'gemini-3.8-flash';
    } catch (err) {
      console.warn('Gemini copy generation failed, using fallback:', err.message);
      text = buildFallbackPost({ mode, siteUrl, timing, pool, pools, chartInfo, variantIdx });
    }
  } else {
    text = buildFallbackPost({ mode, siteUrl, timing, pool, pools, chartInfo, variantIdx });
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
  const usedSymbols = new Set(history.slice(-12).map((h) => h.symbol).filter(Boolean));
  const timing = getTimingContext();
  const slots = buildScheduleSlots(count);
  const market = await fetchLiveMarketSnapshot(usedSymbols);
  const pools = market.pools || [];

  if (!isPreview) {
    pruneOldGeneratedImages(14);
  }

  const modes = ['whale_flow', 'desk_scorecard', 'liquidity_audit', 'aurelias_promo'];
  const batch = [];
  let poolCursor = 0;

  for (let i = 0; i < count; i += 1) {
    const mode = modes[i % modes.length];
    const pool =
      mode === 'whale_flow' || mode === 'liquidity_audit'
        ? pools[poolCursor++ % Math.max(1, pools.length)]
        : pools[0];
    const hookStyle = HOOK_STYLES[(history.length + i) % HOOK_STYLES.length];
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
      hookStyle,
      variantIdx: history.length + i,
    });
    batch.push(item);
    history = [
      ...history,
      {
        at: new Date().toISOString(),
        pillar: item.pillar,
        symbol: item.symbol,
        imagePath: item.imagePath,
        text: item.text,
      },
    ].slice(-20);
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
