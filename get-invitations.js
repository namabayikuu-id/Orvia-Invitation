// api/get-invitations.js
// GET /api/get-invitations          → semua undangan (array, urut terbaru)
// GET /api/get-invitations?slug=x   → satu undangan (object)

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const BRANCH       = process.env.GITHUB_BRANCH || 'main';

async function readJsonFromGitHub(filePath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${BRANCH}`;
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (r.status === 404) return []; // file belum ada → array kosong
  if (!r.ok) throw new Error(`GitHub API error ${r.status}: ${await r.text()}`);

  const data = await r.json();
  const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Env check
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return res.status(500).json({
      error: 'Environment variables belum dikonfigurasi (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)',
    });
  }

  try {
    const db = await readJsonFromGitHub('data/invitations.json');
    const { slug } = req.query;

    if (slug) {
      const item = db.find(i => i.slug === slug);
      if (!item) return res.status(404).json({ error: `Undangan "${slug}" tidak ditemukan` });
      return res.status(200).json(item);
    }

    // Semua undangan, urut terbaru dulu
    const sorted = [...db].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.status(200).json(sorted);

  } catch (err) {
    console.error('[get-invitations]', err);
    return res.status(500).json({ error: err.message });
  }
}
