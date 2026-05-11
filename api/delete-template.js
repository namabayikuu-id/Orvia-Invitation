// api/delete-template.js
// DELETE /api/delete-template
// Body: { templateId }
// Deletes all files inside templates/{templateId}/ from GitHub

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const GH = (path) =>
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

const ghGet = { Authorization: `token ${GITHUB_TOKEN}`, 'User-Agent': 'Orvia-Invitation', Accept: 'application/vnd.github.v3+json' };
const ghDel = { ...ghGet, 'Content-Type': 'application/json' };

async function deleteFile(path, message) {
  // Get SHA first
  const r = await fetch(GH(path), { headers: ghGet });
  if (!r.ok) return; // file doesn't exist, skip
  const { sha } = await r.json();
  const del = await fetch(GH(path), {
    method: 'DELETE',
    headers: ghDel,
    body: JSON.stringify({ message, sha }),
  });
  if (!del.ok) throw new Error(`GitHub ${del.status}: ${await del.text()}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { templateId } = req.body || {};
  if (!templateId) return res.status(400).json({ error: 'templateId wajib diisi' });
  if (!/^[a-z0-9-]+$/.test(templateId))
    return res.status(400).json({ error: 'templateId tidak valid' });

  // Safety: jangan hapus template default
  if (templateId === 'template-elegant')
    return res.status(403).json({ error: 'Template default tidak bisa dihapus' });

  try {
    // List all files inside the template folder
    const listRes = await fetch(GH(`templates/${templateId}`), { headers: ghGet });
    if (listRes.status === 404)
      return res.status(404).json({ error: `Template "${templateId}" tidak ditemukan` });
    if (!listRes.ok)
      throw new Error(`GitHub ${listRes.status}: ${await listRes.text()}`);

    const files = await listRes.json();
    const fileList = Array.isArray(files) ? files : [];

    // Delete each file
    const msg = `🗑️ Hapus template: ${templateId}`;
    for (const file of fileList) {
      if (file.type === 'file') {
        await deleteFile(`templates/${templateId}/${file.name}`, msg);
      }
    }

    // Note: GitHub API doesn't support deleting empty folders — they disappear automatically

    return res.status(200).json({
      success: true,
      templateId,
      deletedFiles: fileList.filter(f => f.type === 'file').map(f => f.name),
    });
  } catch (e) {
    console.error('[delete-template]', e);
    return res.status(500).json({ error: e.message });
  }
}
