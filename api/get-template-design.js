// api/get-template-design.js
// GET /api/get-template-design?templateId=template-elegant
// Returns the design.json content for a specific template

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { templateId } = req.query;
  if (!templateId) return res.status(400).json({ error: 'templateId wajib diisi' });
  if (!/^[a-z0-9-]+$/.test(templateId))
    return res.status(400).json({ error: 'templateId tidak valid' });

  try {
    const r = await fetch(GH(`templates/${templateId}/design.json`), { headers: ghHeaders });

    if (r.status === 404) {
      // Template exists but has no design.json yet → return empty design
      return res.status(200).json({
        meta: { id: templateId, displayName: templateId },
        layers: [],
        sectionBgs: {},
        customFonts: [],
      });
    }
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${await r.text()}`);

    const fileData = await r.json();
    const content = JSON.parse(
      Buffer.from(fileData.content, 'base64').toString('utf8')
    );

    return res.status(200).json(content);
  } catch (e) {
    console.error('[get-template-design]', e);
    return res.status(500).json({ error: e.message });
  }
}
