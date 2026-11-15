const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_SITE_URL = 'https://www.evmsync.live/';
const GENERATED_DIR = path.join(__dirname, '..', 'assets', 'social', 'generated');
const FALLBACK_IMAGES = [
  'assets/social/aurelias-pool-50k.jpg',
  'assets/social/aurelias-tiers-36.jpg',
  'assets/social/aurelias-multichain-vrf.jpg',
];

const ANGLES = [
  {
    name: 'Grand Prize Contrast',
    brief: 'Contrast the $2 ticket price against the 20,000 USDC Grand Prize (a 10,000x upside) in Season 04.',
    visualFocus: 'A dark brushed-titanium monolith and obsidian glass vault orb with subtle electric lime (#84cc16) rim lighting and crisp typography: "20,000 USDC GRAND PRIZE | $2 ENTRY".',
  },
  {
    name: '36 Winners Architecture',
    brief: 'Highlight that 36 separate players win every season: 1x 20,000 USDC, 5x 3,000 USDC, and 30x 500 USDC.',
    visualFocus: 'A minimalist Swiss-precision dark obsidian editorial card showing 3 clean horizontal tiers ("01 x 20,000", "05 x 3,000", "30 x 500 USDC") with hairline #84cc16 lime accents.',
  },
  {
    name: 'Community Tier 250x Return',
    brief: 'Spotlight the 30 community tier spots paying 500 USDC each, giving 30 people a 250x return on $2.',
    visualFocus: 'Thirty precision geometric titanium markers arranged in a subtle radial pattern around a glowing #84cc16 core on matte black, with bold typography "30 x 500 USDC".',
  },
  {
    name: '60-Second Multi-Chain Entry',
    brief: 'Focus on frictionless speed: enter with ETH, BNB, USDT, TON, Solana, or Bitcoin in under 60 seconds with zero wallet popups.',
    visualFocus: 'A luxury macro studio render of a dark titanium chronometer surrounded by six matte metallic crypto chain emblems on deep obsidian, headline "ENTER IN 60 SECONDS".',
  },
  {
    name: 'Chainlink VRF v2.5 Fairness',
    brief: 'Emphasize verifiable on-chain fairness powered by Chainlink VRF v2.5 randomness and transparent multi-chain verification.',
    visualFocus: 'A precision cryptographic gyroscope suspended in dark smoked glass with laser-thin electric lime rings, clean editorial headline "VERIFIABLE RANDOMNESS".',
  },
  {
    name: '15-Minute Payment Window',
    brief: 'Explain the clean 15-minute QR payment window: submit your sending address, send $2, and lock in your Season 04 spot.',
    visualFocus: 'A sleek dark titanium countdown bezel and frosted glass QR frame on matte obsidian (#08080a) with subtle lime accents and text "15-MIN ENTRY WINDOW".',
  },
  {
    name: 'Live Pool Momentum',
    brief: 'Create crisp editorial urgency around the 50,000 USDC Season 04 pool and live countdown without sounding spammy.',
    visualFocus: 'High-contrast dark architectural studio shot of an illuminated #84cc16 horizon line cutting across matte obsidian stone, headline "50,000 USDC LIVE".',
  },
  {
    name: 'Runner-Up Tier Spotlight',
    brief: 'Focus on the 5 Runner-Up spots at 3,000 USDC each (15,000 USDC total in that tier alone).',
    visualFocus: 'Five sleek brushed-steel vertical pillars catching sharp lime-emerald studio rim light on deep velvet black, typography "5 x 3,000 USDC".',
  },
];

const TONES = [
  'Understated luxury editorial, crisp and authoritative',
  'Stat-first analytical breakdown, zero fluff',
  'Punchy two-sentence hook with a sharp contrast',
  'Question-led opener that makes crypto traders pause scrolling',
  'Minimalist product spotlight, clean and direct',
];

function sanitizeTweet(raw, siteUrl) {
  let text = String(raw || '')
    .replace(/[\u2014\u2013]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text.includes(siteUrl)) {
    text = `${text} ${siteUrl}`.trim();
  }

  if (text.length > 275) {
    const withoutUrl = text.replace(siteUrl, '').trim();
    const maxBody = 274 - siteUrl.length;
    const trimmed = withoutUrl.slice(0, maxBody).replace(/[,:;.\s]+$/, '');
    text = `${trimmed}. ${siteUrl}`;
  }

  return text;
}

function buildFallbackPost(siteUrl, angle) {
  const openers = [
    'AURELIAS Season 04 is live.',
    '36 winners share 50,000 USDC in Season 04.',
    'One $2 entry unlocks 36 winning tiers.',
    'Multi-chain raffle live now on AURELIAS.',
    '50,000 USDC on the line for $2.',
    'Fair, verifiable, and multi-chain.',
  ];
  const bodies = [
    '1x 20,000 USDC grand prize, 5x 3,000 USDC runner-up spots, and 30x 500 USDC community rewards.',
    'Enter with ETH, BNB, USDT, TON, Solana, or Bitcoin in under 60 seconds.',
    '30 community winners take 500 USDC each, a 250x return on a $2 entry.',
    'Built around Chainlink VRF v2.5 randomness with a clean 15-minute payment window.',
    'No wallet popups. Submit your sending address, send $2, and lock in your spot.',
  ];
  const ctas = [
    'Enter now:',
    'Join the draw:',
    'Check the live countdown:',
    'Lock in your spot:',
  ];

  const opener = openers[Math.floor(Math.random() * openers.length)];
  const body = bodies[Math.floor(Math.random() * bodies.length)];
  const cta = ctas[Math.floor(Math.random() * ctas.length)];
  const text = sanitizeTweet(`${opener} ${body} ${cta} ${siteUrl}`, siteUrl);

  return {
    text,
    angle: angle.name,
    imagePrompt: angle.visualFocus,
  };
}

async function generateCopyWithGemini(apiKey, siteUrl, angle, tone) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  const systemPrompt = [
    'You write high-converting, luxury editorial X (Twitter) posts for AURELIAS Season 04, a multi-chain crypto raffle.',
    'Facts (use accurately, never invent fake stats):',
    '- Prize pool: 50,000 USDC across 36 winners',
    '- Tiers: 1x 20,000 USDC Grand Prize (40%), 5x 3,000 USDC Runner-Up (30%), 30x 500 USDC Community (30%)',
    '- Entry fee: $2',
    '- Accepted chains/assets: ETH, BNB, USDT, TON, Solana, Bitcoin',
    '- Flow: 15-minute QR payment window, no complex wallet popups, Chainlink VRF v2.5 verifiable randomness',
    `- Live website URL (MUST appear verbatim in the post): ${siteUrl}`,
    'Strict rules:',
    '- Total tweet length MUST be under 265 characters including the URL.',
    '- NEVER use em-dashes or en-dashes.',
    '- NEVER use generic crypto slang or hype slop (no "LFG", "to the moon", "WAGMI", "gem", rocket emojis, or hashtag spam).',
    '- Return valid JSON with two keys: "tweet" and "imagePrompt".',
    '- "imagePrompt" should describe a fresh, bespoke 16:9 ultra-luxury dark obsidian (#08080a) editorial graphic with electric lime (#84cc16) accents, Swiss-horology / Porsche Design precision, and short crisp text matching this post.',
  ].join('\n');

  const userPrompt = `Angle: ${angle.name}\nBrief: ${angle.brief}\nVisual direction seed: ${angle.visualFocus}\nTone: ${tone}\n\nGenerate a completely original post and matching luxury visual prompt.`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.95,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            tweet: { type: 'STRING' },
            imagePrompt: { type: 'STRING' },
          },
          required: ['tweet', 'imagePrompt'],
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
  if (!rawJson) {
    throw new Error('Gemini copy API returned empty response.');
  }

  const parsed = JSON.parse(rawJson);
  return {
    text: sanitizeTweet(parsed.tweet, siteUrl),
    imagePrompt: parsed.imagePrompt || angle.visualFocus,
    angle: angle.name,
  };
}

async function generateImageWithGemini(apiKey, imagePrompt) {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent';

  const fullPrompt = [
    'Create a 16:9 ultra-luxury dark editorial social media graphic for AURELIAS Season 04.',
    'Aesthetic: Deep matte obsidian velvet (#08080a), brushed dark titanium, smoked glass, razor-thin electric lime (#84cc16) rim lighting, Swiss watchmaking / Porsche Design precision.',
    'Rules: High contrast, legible minimal typography, NO cartoons, NO rockets, NO falling coins, NO em-dashes, NO clutter.',
    `Scene & Typography: ${imagePrompt}`,
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
        imageConfig: {
          aspectRatio: '16:9',
        },
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
  if (!imgPart) {
    throw new Error('Gemini image API did not return inline image data.');
  }

  const mimeType = imgPart.inlineData.mimeType || 'image/png';
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = crypto.randomBytes(3).toString('hex');
  const filename = `post-${stamp}-${rand}.${ext}`;

  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const absPath = path.join(GENERATED_DIR, filename);
  fs.writeFileSync(absPath, Buffer.from(imgPart.inlineData.data, 'base64'));

  return `assets/social/generated/${filename}`;
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

async function main() {
  const isPreview = process.argv.includes('--preview');
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const siteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).trim() || DEFAULT_SITE_URL;
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)];
  const tone = TONES[Math.floor(Math.random() * TONES.length)];

  let post;
  let copySource = 'fallback';
  if (apiKey) {
    try {
      post = await generateCopyWithGemini(apiKey, siteUrl, angle, tone);
      copySource = 'gemini-2.5-flash';
    } catch (err) {
      console.warn('Gemini copy generation failed, using fallback:', err.message);
      post = buildFallbackPost(siteUrl, angle);
    }
  } else {
    post = buildFallbackPost(siteUrl, angle);
  }

  let imagePath = FALLBACK_IMAGES[Math.floor(Math.random() * FALLBACK_IMAGES.length)];
  let imageSource = 'fallback-static';
  if (apiKey && !isPreview) {
    try {
      pruneOldGeneratedImages(14);
      imagePath = await generateImageWithGemini(apiKey, post.imagePrompt);
      imageSource = 'gemini-2.5-flash-image';
    } catch (err) {
      console.warn('Gemini image generation failed, using fallback static image:', err.message);
    }
  }

  const output = {
    text: post.text,
    angle: post.angle,
    imagePrompt: post.imagePrompt,
    imagePath,
    copySource,
    imageSource,
  };

  if (!isPreview) {
    const outPath = path.join(__dirname, '..', '.generated-post.json');
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
