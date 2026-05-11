// api/get-templates.js
// GET /api/get-templates
// Returns list of all templates from the /templates/ folder in GitHub

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const GH = (path) =>
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

const ghHeaders = {
  Authorization: `token ${GITHUB_TOKEN}`,
  'User-Agent': 'Orvia-Invitation',
  Accept: 'application/vnd.github.v3+json',
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // List the /templates/ directory
    const listRes = await fetch(GH('templates'), { headers: ghHeaders });

    if (listRes.status === 404) {
      // templates/ folder doesn't exist yet – return empty list
      return res.status(200).json([]);
    }
    if (!listRes.ok) {
      throw new Error(`GitHub ${listRes.status}: ${await listRes.text()}`);
    }

    const items = await listRes.json();
    const folders = items.filter((i) => i.type === 'dir');

    // For each folder, try to fetch design.json for metadata
    const templates = await Promise.all(
      folders.map(async (folder) => {
        const base = {
          id: folder.name,
          displayName: folder.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          updatedAt: null,
          createdAt: null,
          layers: 0,
        };
        try {
          const metaRes = await fetch(
            GH(`templates/${folder.name}/design.json`),
            { headers: ghHeaders }
          );
          if (metaRes.ok) {
            const metaData = await metaRes.json();
            const content = JSON.parse(
              Buffer.from(metaData.content, 'base64').toString('utf8')
            );
            const meta = content.meta || {};
            return {
              ...base,
              displayName: meta.displayName || base.displayName,
              updatedAt: meta.updatedAt || null,
              createdAt: meta.createdAt || null,
              layers: (content.layers || []).length,
            };
          }
        } catch (_) {}
        return base;
      })
    );

    // Sort: most recently updated first
    templates.sort((a, b) => {
      if (!a.updatedAt && !b.updatedAt) return 0;
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return res.status(200).json(templates);
  } catch (e) {
    console.error('[get-templates]', e);
    return res.status(500).json({ error: e.message });
  }
}
