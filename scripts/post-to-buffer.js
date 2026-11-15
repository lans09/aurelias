const fs = require('fs');
const path = require('path');

const OPENERS = [
  'AURELIAS Season 04 is open.',
  '36 winners share 50,000 USDC in Season 04.',
  'One $2 entry unlocks 36 winning tiers.',
  'Multi-chain raffle live now on AURELIAS.',
  'Season 04 tiered prize pool is live.',
  'Fair, verifiable, and multi-chain.',
];

const BODIES = [
  '1x 20,000 USDC grand prize, 5x 3,000 USDC runner-up spots, and 30x 500 USDC community rewards.',
  'Enter with ETH, BNB, USDT, TON, Solana, or Bitcoin in under a minute.',
  '40% Grand Prize (20,000 USDC), 30% Runner-Up (5x 3,000 USDC), 30% Community (30x 500 USDC).',
  'Built around Chainlink VRF v2.5 randomness with a simple 15-minute payment window.',
  'No complicated wallet popups. Submit your sending address, send $2, and lock in your spot.',
  '30 community winners take 500 USDC each, a 250x return on a $2 entry.',
];

const CTAS = [
  'Join now:',
  'Enter the draw:',
  'Check the live countdown:',
  'Lock in your entry:',
];

function buildPost(siteUrl) {
  const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
  const body = BODIES[Math.floor(Math.random() * BODIES.length)];
  const cta = CTAS[Math.floor(Math.random() * CTAS.length)];
  const url = siteUrl || 'https://your-site.vercel.app';

  let text = `${opener} ${body} ${cta} ${url}`;
  if (text.length > 275) {
    text = `${opener} 50,000 USDC pool across 36 winners for $2. ${cta} ${url}`;
  }
  return text;
}

async function main() {
  const webhookUrl = process.env.BUFFER_WEBHOOK_URL;
  const siteUrl = (process.env.SITE_URL || '').trim();

  if (!webhookUrl) {
    throw new Error('Missing BUFFER_WEBHOOK_URL secret.');
  }

  const text = buildPost(siteUrl);
  const payload = {
    text,
    scheduled_at: new Date().toISOString(),
    source: 'aurelias-github-actions',
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Webhook failed (${res.status}): ${errText}`);
  }

  console.log('Successfully sent post to Buffer webhook:', text);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
