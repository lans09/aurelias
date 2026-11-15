const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SITE_URL = 'https://www.evmsync.live/';
const RAW_BASE_URL = (
  process.env.RAW_BASE_URL ||
  'https://raw.githubusercontent.com/lans09/aurelias/main'
).replace(/\/$/, '');

const IMAGE_BASE_URL = `${RAW_BASE_URL}/assets/social`;

const POST_THEMES = [
  {
    image: 'aurelias-pool-50k.jpg',
    openers: [
      'AURELIAS Season 04 is open.',
      '50,000 USDC prize pool is live in Season 04.',
      'One $2 entry unlocks the 50,000 USDC Season 04 draw.',
    ],
    bodies: [
      '36 winners share the pool, from the 20,000 USDC Grand Prize to 30 community rewards.',
      'Transparent tiered payouts, 15-minute payment window, and verifiable randomness.',
    ],
  },
  {
    image: 'aurelias-tiers-36.jpg',
    openers: [
      '36 winners share 50,000 USDC in Season 04.',
      'Season 04 tiered prize architecture is live.',
      'One $2 entry unlocks 36 winning tiers.',
    ],
    bodies: [
      '1x 20,000 USDC grand prize, 5x 3,000 USDC runner-up spots, and 30x 500 USDC community rewards.',
      '40% Grand Prize (20,000 USDC), 30% Runner-Up (5x 3,000 USDC), 30% Community (30x 500 USDC).',
      '30 community winners take 500 USDC each, a 250x return on a $2 entry.',
    ],
  },
  {
    image: 'aurelias-multichain-vrf.jpg',
    openers: [
      'Multi-chain raffle live now on AURELIAS.',
      'Fair, verifiable, and multi-chain.',
      'Enter AURELIAS Season 04 in under 60 seconds.',
    ],
    bodies: [
      'Enter with ETH, BNB, USDT, TON, Solana, or Bitcoin in under a minute.',
      'Built around Chainlink VRF v2.5 randomness with a simple 15-minute payment window.',
      'No complicated wallet popups. Submit your sending address, send $2, and lock in your spot.',
    ],
  },
];

const CTAS = [
  'Join now:',
  'Enter the draw:',
  'Check the live countdown:',
  'Lock in your entry:',
];

function buildPost(siteUrl) {
  const theme = POST_THEMES[Math.floor(Math.random() * POST_THEMES.length)];
  const opener = theme.openers[Math.floor(Math.random() * theme.openers.length)];
  const body = theme.bodies[Math.floor(Math.random() * theme.bodies.length)];
  const cta = CTAS[Math.floor(Math.random() * CTAS.length)];
  const url = siteUrl || DEFAULT_SITE_URL;

  let text = `${opener} ${body} ${cta} ${url}`;
  if (text.length > 275) {
    text = `${opener} 50,000 USDC pool across 36 winners for $2. ${cta} ${url}`;
  }
  return {
    text,
    imageUrl: `${IMAGE_BASE_URL}/${theme.image}`,
  };
}

function loadPostPayload(siteUrl) {
  const generatedFile = path.join(__dirname, '..', '.generated-post.json');
  if (fs.existsSync(generatedFile)) {
    const data = JSON.parse(fs.readFileSync(generatedFile, 'utf8'));
    if (data?.text && data?.imagePath) {
      const cleanPath = String(data.imagePath).replace(/^\/+/, '');
      return {
        text: data.text,
        imageUrl: `${RAW_BASE_URL}/${cleanPath}`,
      };
    }
  }
  return buildPost(siteUrl);
}

async function bufferGraphQL(apiKey, query, variables = {}) {
  const res = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Buffer GraphQL error (${res.status}): ${JSON.stringify(json.errors || json)}`);
  }
  return json.data;
}

async function resolveChannelId(apiKey) {
  if (process.env.BUFFER_CHANNEL_ID) {
    return process.env.BUFFER_CHANNEL_ID.trim();
  }

  const orgData = await bufferGraphQL(
    apiKey,
    `query GetOrganizations {
      account {
        organizations {
          id
          name
        }
      }
    }`
  );

  const orgs = orgData?.account?.organizations || [];
  if (orgs.length === 0) {
    throw new Error('No organizations found in Buffer account.');
  }

  let channels = [];
  for (const org of orgs) {
    const channelsData = await bufferGraphQL(
      apiKey,
      `query GetChannels($orgId: OrganizationId!) {
        channels(input: { organizationId: $orgId }) {
          id
          name
          service
        }
      }`,
      { orgId: org.id }
    );
    if (Array.isArray(channelsData?.channels)) {
      channels = channels.concat(channelsData.channels);
    }
  }

  if (channels.length === 0) {
    throw new Error('No connected channels found in Buffer. Connect your X/Twitter account in Buffer -> Channels.');
  }

  const twitter = channels.find((c) => /twitter|x/i.test(c.service || ''));
  return (twitter || channels[0]).id;
}

async function main() {
  const isPreview = process.argv.includes('--preview');
  const apiKey = (process.env.BUFFER_API_KEY || '').trim();
  const siteUrl = (process.env.SITE_URL || DEFAULT_SITE_URL).trim();
  const { text, imageUrl } = loadPostPayload(siteUrl);

  if (isPreview) {
    console.log(JSON.stringify({ text, imageUrl }, null, 2));
    return;
  }

  if (!apiKey) {
    throw new Error('Missing BUFFER_API_KEY secret.');
  }

  const channelId = await resolveChannelId(apiKey);

  console.log('Sending post to Buffer with image:', imageUrl);

  const data = await bufferGraphQL(
    apiKey,
    `mutation CreateNewPost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post {
            id
            text
            status
            assets {
              id
              mimeType
            }
          }
        }
        ... on MutationError {
          message
        }
      }
    }`,
    {
      input: {
        text,
        channelId,
        schedulingType: 'automatic',
        mode: 'shareNow',
        assets: [
          {
            image: {
              url: imageUrl,
            },
          },
        ],
      },
    }
  );

  const result = data?.createPost;
  if (result?.message) {
    throw new Error(`Buffer rejected post: ${result.message}`);
  }

  console.log('Successfully queued post in Buffer:', result?.post || { text, imageUrl });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
