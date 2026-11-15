const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns');

dns.setDefaultResultOrder('ipv4first');

const DEFAULT_SITE_URL = 'https://www.evmsync.live/';
const GENERATED_DIR = path.join(__dirname, '..', 'assets', 'social', 'generated');
const HISTORY_FILE = path.join(__dirname, '..', 'assets', 'social', '.post-history.json');
const FALLBACK_IMAGES = [
  'assets/social/aurelias-pool-50k.jpg',
  'assets/social/aurelias-tiers-36.jpg',
  'assets/social/aurelias-multichain-vrf.jpg',
];

const BANNED_PATTERNS = [
  /[\u2014\u2013]/,
  /#[a-z0-9_]+/i,
  /\b(lfg|wagmi|ngmi|gm frens|to the moon|100x gem|delve|tapestry|game[- ]changer|revolutionize|elevate|unleash|in a world where|here'?s why|let'?s dive|buckle up|don'?t miss out|act fast)\b/i,
  /[\u{1F680}\u{1F525}\u{1F48E}\u{2728}]/u,
];

const PILLARS = [
  {
    id: 'onchain',
    weight: 25,
    isPromo: false,
    angles: [
      {
        name: 'Stablecoin Settlement Reality',
        brief: 'Make a sharp, grounded observation about how USDC and stablecoins quietly became crypto’s real killer app for global settlement.',
        visualSeed: 'Minimalist macro studio photograph of translucent smoked glass blocks stacked on matte black basalt stone with a single razor-thin lime (#84cc16) light edge. No text.',
      },
      {
        name: 'Multi-Chain UX Friction',
        brief: 'Comment on why normal users should never have to care about RPCs, bridges, or gas tokens just to send $2 across ETH, Solana, TON, or Bitcoin.',
        visualSeed: 'Clean architectural 3D render of six dark brushed-titanium rails converging smoothly into a single illuminated obsidian hub on a velvet black background. No text.',
      },
      {
        name: 'Speed vs Finality',
        brief: 'Short technical-but-readable note comparing how fast modern L1/L2 settlement feels compared to 3-day bank wires.',
        visualSeed: 'High-contrast dark editorial still life of a precision mechanical chronograph resting on matte obsidian slate under moody directional studio light. No text.',
      },
    ],
  },
  {
    id: 'fairness',
    weight: 20,
    isPromo: false,
    angles: [
      {
        name: 'Why Trust Me Fails',
        brief: 'Explain in plain English why verifiable on-chain randomness (like Chainlink VRF) beats opaque backend databases where users just have to trust the operator.',
        visualSeed: 'Precision dark titanium cryptographic gyroscope suspended inside smoked obsidian glass with subtle emerald-lime rim light, luxury Swiss watchmaking photography. No text.',
      },
      {
        name: 'Public Auditability',
        brief: 'Sharp 1-2 line take on how open ledgers change incentives: when every payout and timestamp is verifiable, reputation becomes math instead of marketing.',
        visualSeed: 'Minimalist dark geometric sculpture of interlocking matte carbon and brushed steel rings catching crisp studio highlights on deep black. No text.',
      },
    ],
  },
  {
    id: 'psychology',
    weight: 25,
    isPromo: false,
    angles: [
      {
        name: 'Asymmetric Risk',
        brief: 'Thoughtful observation on asymmetric bets: risking a tiny, capped amount for outsized upside only works when you respect your downside.',
        visualSeed: 'Moody luxury editorial photography of a single sleek dark obsidian prism casting a sharp electric-lime light refraction across matte black stone. No text.',
      },
      {
        name: 'Signal Over Noise',
        brief: 'Crisp, human remark about how quiet execution and clean design always outlast loud hype in crypto cycles.',
        visualSeed: 'Ultra-minimalist dark architectural interior bathed in deep shadows with one thin vertical slit of crisp warm-lime light on concrete. No text.',
      },
      {
        name: 'Patience in Markets',
        brief: 'Short, relatable reflection for traders on why sitting on your hands is often the hardest position to hold.',
        visualSeed: 'Dark luxury studio still life of matte black ceramic spheres balanced on a brushed titanium beam, calm moody lighting. No text.',
      },
    ],
  },
  {
    id: 'aurelias_promo',
    weight: 30,
    isPromo: true,
    angles: [
      {
        name: '36 Winners Architecture',
        brief: 'Highlight AURELIAS Season 04: 50,000 USDC split across 36 winners (1x 20,000 USDC, 5x 3,000 USDC, 30x 500 USDC) for a $2 entry.',
        visualSeed: 'Dark obsidian (#08080a) editorial card with brushed titanium rows showing "36 WINNERS • $2 ENTRY" and "50,000 USDC" with hairline #84cc16 lime accents.',
      },
      {
        name: '60-Second Multi-Chain Entry',
        brief: 'Focus on how fast AURELIAS Season 04 is: no wallet popups, enter with ETH, BNB, USDT, TON, Solana, or BTC inside a 15-minute window.',
        visualSeed: 'Luxury macro studio render of a dark titanium chronometer surrounded by matte metallic chain marks on deep obsidian, crisp minimal text "ENTER IN 60 SECONDS".',
      },
      {
        name: '250x Community Tier Odds',
        brief: 'Spotlight that 30 community winners each take 500 USDC on a $2 entry, alongside the 20,000 USDC grand prize.',
        visualSeed: 'High-contrast dark studio graphic featuring a brushed-titanium vault orb with #84cc16 rim light and sharp editorial typography "50,000 USDC | 36 WINNERS".',
      },
    ],
  },
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

function pickWeightedPillar() {
  const total = PILLARS.reduce((sum, p) => sum + p.weight, 0);
  let r = Math.random() * total;
  for (const pillar of PILLARS) {
    r -= pillar.weight;
    if (r <= 0) return pillar;
  }
  return PILLARS[0];
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

function saveHistory(history, entry) {
  const updated = [...history, entry].slice(-15);
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(updated, null, 2));
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

function buildFallbackPost(siteUrl, pillar, angle, timing) {
  if (!pillar.isPromo) {
    const organicPool = [
      'Most people still underestimate how much cross-border volume now settles in USDC instead of traditional bank rails. Speed and transparency compound quietly.',
      'Good crypto UX means you should never think about bridges, RPCs, or gas tokens just to move $2.',
      'In markets, sitting on your hands is usually harder than clicking buy. Patience is still the rarest edge.',
      'Verifiable randomness matters because "trust the backend" is not a security model.',
      'Quiet execution and clean design always outlast loud hype.',
    ];
    const text = organicPool[Math.floor(Math.random() * organicPool.length)];
    return { text, angle: angle.name, imagePrompt: angle.visualSeed };
  }

  const promoPool = [
    `${timing.label}. 36 winners share 50,000 USDC in AURELIAS Season 04 for a $2 entry. ${siteUrl}`,
    `${timing.label}. Enter AURELIAS Season 04 in under a minute using ETH, BNB, USDT, TON, Solana, or Bitcoin (15-min payment window). ${siteUrl}`,
    `${timing.label}. 30 community winners take 500 USDC each in Season 04, alongside the 20,000 USDC grand prize. ${siteUrl}`,
  ];
  const text = sanitizeTweet(promoPool[Math.floor(Math.random() * promoPool.length)], siteUrl, true);
  return { text, angle: angle.name, imagePrompt: angle.visualSeed };
}

async function generateCopyWithGemini(apiKey, siteUrl, pillar, angle, history, timing) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

  const recentTexts = history.slice(-8).map((h, i) => `${i + 1}. ${h.text}`).join('\n');

  const rules = [
    'You write crisp, human, high-taste X (Twitter) posts for an editorial crypto & fintech brand account.',
    'Write like a sharp founder or macro observer, NEVER like an AI copywriter or hype marketer.',
    'Hard bans (violating ANY of these is an instant fail):',
    '- NO em-dashes or en-dashes.',
    '- NO hashtags (#).',
    '- NO generic AI filler words: delve, tapestry, landscape, unlock, elevate, unleash, game-changer, revolutionize, buckle up, here is why, in a world where.',
    '- NO crypto bro slang or emojis: LFG, WAGMI, GM frens, to the moon, gem, rocket/fire/sparkle emojis.',
    '- Under 255 characters total.',
    pillar.isPromo
      ? `This is a PROMO post for AURELIAS Season 04. Facts: 50,000 USDC pool, 36 winners (1x 20,000, 5x 3,000, 30x 500 USDC), $2 entry, ETH/BNB/USDT/TON/Solana/BTC, Chainlink VRF v2.5, 15-minute payment window. Timing urgency to include naturally: "${timing.label}". MUST include exact URL: ${siteUrl}`
      : 'This is an ORGANIC post. Do NOT mention AURELIAS, giveaways, raffles, or include any URL. Sound like a genuine, thoughtful account.',
    recentTexts ? `Recent posts (DO NOT repeat these openers, phrasing, or angles):\n${recentTexts}` : '',
    'Task: Draft 3 distinct candidates, score each 1-10 on originality and human naturalness, and output ONLY the highest-scoring candidate in JSON: { "bestTweet": "...", "score": 9, "imagePrompt": "..." }.',
    'For "imagePrompt", describe a fresh 16:9 ultra-luxury dark obsidian (#08080a) editorial visual matching the tweet, with electric lime (#84cc16) accents. For organic posts, avoid putting promo text on the image.',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = `Pillar: ${pillar.id}\nAngle: ${angle.name}\nBrief: ${angle.brief}\nVisual seed: ${angle.visualSeed}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: rules }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.9,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            bestTweet: { type: 'STRING' },
            score: { type: 'NUMBER' },
            imagePrompt: { type: 'STRING' },
          },
          required: ['bestTweet', 'score', 'imagePrompt'],
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
  const cleaned = sanitizeTweet(parsed.bestTweet, siteUrl, pillar.isPromo);

  if (hasBannedPattern(cleaned)) {
    throw new Error(`Generated tweet triggered anti-slop filter: "${cleaned}"`);
  }

  return {
    text: cleaned,
    angle: angle.name,
    score: parsed.score,
    imagePrompt: parsed.imagePrompt || angle.visualSeed,
  };
}

async function generateImageWithGemini(apiKey, imagePrompt) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

  const fullPrompt = [
    'Create a 16:9 ultra-luxury dark editorial visual.',
    'Aesthetic: Deep matte obsidian (#08080a), brushed dark titanium, smoked glass, subtle electric lime (#84cc16) rim lighting, Porsche Design / Swiss watchmaking precision.',
    'Rules: High contrast, clean composition, NO cartoons, NO rockets, NO falling coins, NO em-dashes, NO cluttered text.',
    `Scene: ${imagePrompt}`,
  ].join(' ');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini image API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData?.data);
  if (!imgPart) throw new Error('Gemini image API did not return inline image data.');

  const mimeType = imgPart.inlineData.mimeType || 'image/png';
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  const filename = `post-${stamp}-${rand}.${ext}`;

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(path.join(GENERATED_DIR, filename), Buffer.from(imgPart.inlineData.data, 'base64'));

  return `assets/social/generated/${filename}`;
}

async function generateImageWithPollinations(imagePrompt) {
  const seed = Math.floor(Math.random() * 9999999);
  const fullPrompt = `${imagePrompt} Ultra-luxury dark obsidian studio photography, brushed titanium, subtle electric lime #84cc16 rim lighting, high contrast, 16:9, no watermark`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1280&height=720&seed=${seed}&nologo=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Pollinations image error (${res.status})`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Pollinations returned non-image content-type: ${contentType}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5000) {
      throw new Error(`Pollinations returned unexpectedly small image (${buf.length} bytes)`);
    }
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const rand = crypto.randomBytes(3).toString('hex');
    const filename = `post-${stamp}-${rand}.${ext}`;

    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    fs.writeFileSync(path.join(GENERATED_DIR, filename), buf);
    return `assets/social/generated/${filename}`;
  } finally {
    clearTimeout(timeout);
  }
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
  const lagosOffsetMs = 60 * 60 * 1000; // UTC+1
  const nowLagos = new Date(now + lagosOffsetMs);
  const y = nowLagos.getUTCFullYear();
  const m = nowLagos.getUTCMonth();
  const d = nowLagos.getUTCDate();

  // Window: 07:00 to 23:00 Africa/Lagos today (or tomorrow if past 22:00 Lagos)
  let dayShift = nowLagos.getUTCHours() >= 22 ? 1 : 0;
  const windowStart = Date.UTC(y, m, d + dayShift, 7, 0, 0) - lagosOffsetMs;
  const windowEnd = Date.UTC(y, m, d + dayShift, 23, 0, 0) - lagosOffsetMs;

  const effectiveStart = Math.max(now + 10 * 60 * 1000, windowStart);
  const effectiveEnd = Math.max(effectiveStart + count * 20 * 60 * 1000, windowEnd);
  const step = count > 1 ? (effectiveEnd - effectiveStart) / (count - 1) : 0;

  const slots = [];
  for (let i = 0; i < count; i += 1) {
    const jitter = Math.floor((Math.random() - 0.5) * 12 * 60 * 1000);
    const ts = Math.max(
      now + (i * 5 + 8) * 60 * 1000,
      Math.round(effectiveStart + i * step + jitter)
    );
    slots.push(new Date(ts).toISOString());
  }
  return slots;
}

async function generateSinglePost({ apiKey, siteUrl, history, timing, isPreview, dueAt }) {
  const pillar = pickWeightedPillar();
  const angle = pillar.angles[Math.floor(Math.random() * pillar.angles.length)];

  let post;
  let copySource = 'fallback';
  if (apiKey) {
    try {
      post = await generateCopyWithGemini(apiKey, siteUrl, pillar, angle, history, timing);
      copySource = 'gemini-3.8-flash';
    } catch (err) {
      console.warn('Gemini copy generation failed, using fallback:', err.message);
      post = buildFallbackPost(siteUrl, pillar, angle, timing);
    }
  } else {
    post = buildFallbackPost(siteUrl, pillar, angle, timing);
  }

  let imagePath = FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
  let imageSource = 'fallback-static';
  if (!isPreview) {
    if (apiKey) {
      try {
        imagePath = await generateImageWithGemini(apiKey, post.imagePrompt);
        imageSource = 'gemini-2.5-flash-image';
      } catch (err) {
        console.warn('Gemini image generation failed, trying Pollinations:', err.message);
      }
    } else {
      console.warn('GEMINI_API_KEY is not set; using Pollinations for unique image generation.');
    }

    if (imageSource === 'fallback-static') {
      try {
        imagePath = await generateImageWithPollinations(post.imagePrompt);
        imageSource = 'pollinations';
      } catch (err) {
        console.warn('Pollinations image generation failed, using static fallback:', err.message);
      }
    }
  }

  return {
    pillar: pillar.id,
    isPromo: pillar.isPromo,
    text: post.text,
    angle: post.angle,
    score: post.score || null,
    imagePrompt: post.imagePrompt,
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
  const siteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).trim() || DEFAULT_SITE_URL;
  let history = loadHistory();
  const timing = getTimingContext();
  const slots = buildScheduleSlots(count);

  if (!isPreview) {
    pruneOldGeneratedImages(14);
  }

  const batch = [];
  for (let i = 0; i < count; i += 1) {
    const item = await generateSinglePost({
      apiKey,
      siteUrl,
      history,
      timing,
      isPreview,
      dueAt: slots[i],
    });
    batch.push(item);
    history = [...history, { at: new Date().toISOString(), pillar: item.pillar, angle: item.angle, text: item.text }].slice(-15);
    if (!isPreview && i < count - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
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
