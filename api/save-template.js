// api/save-template.js
// POST /api/save-template
// Body: { templateId, displayName, designConfig, templateHtml? }
// Saves design.json (and optionally index.html) for a template to GitHub

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
  'Content-Type': 'application/json',
};

async function getFileSha(path) {
  const r = await fetch(GH(path), {
    headers: { ...ghHeaders, 'Content-Type': undefined },
  });
  if (!r.ok) return null;
  const data = await r.json();
  return data.sha || null;
}

async function commitFile(path, content, message) {
  const sha = await getFileSha(path);
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    ...(sha ? { sha } : {}),
  };
  const r = await fetch(GH(path), {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`GitHub commit failed (${r.status}): ${err}`);
  }
  return await r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { templateId, displayName, designConfig, templateHtml } = req.body || {};

  if (!templateId) return res.status(400).json({ error: 'templateId wajib diisi' });
  if (!/^[a-z0-9-]+$/.test(templateId))
    return res.status(400).json({ error: 'templateId hanya boleh huruf kecil, angka, dan strip' });

  try {
    const now = new Date().toISOString();

    // --- Save design.json ---
    const existingDesign = designConfig || {};
    const meta = {
      id: templateId,
      displayName: displayName || (existingDesign.meta && existingDesign.meta.displayName) || templateId,
      createdAt: (existingDesign.meta && existingDesign.meta.createdAt) || now,
      updatedAt: now,
    };

    const designJson = JSON.stringify(
      { meta, ...existingDesign, meta },   // meta last so it always wins
      null,
      2
    );

    await commitFile(
      `templates/${templateId}/design.json`,
      designJson,
      `✏️ Update design: ${templateId} – ${meta.displayName}`
    );

    const results = { designJson: true, templateHtml: false };

    // --- Save index.html if provided ---
    if (templateHtml) {
      await commitFile(
        `templates/${templateId}/index.html`,
        templateHtml,
        `✏️ Update template HTML: ${templateId}`
      );
      results.templateHtml = true;
    }

    return res.status(200).json({
      success: true,
      templateId,
      displayName: meta.displayName,
      url: `/templates/${templateId}/index.html`,
      committed: results,
    });
  } catch (e) {
    console.error('[save-template]', e);
    return res.status(500).json({ error: e.message });
  }
}
