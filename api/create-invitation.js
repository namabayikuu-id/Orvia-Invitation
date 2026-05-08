// api/create-invitation.js
// Vercel Serverless Function
// POST /api/create-invitation

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO  = process.env.GITHUB_REPO;
const BRANCH       = process.env.GITHUB_BRANCH || 'main';

const BASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

// ── helpers ──────────────────────────────────────────────────────────────────

function ghHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

async function ghGet(path) {
  const r = await fetch(`${BASE_API}${path}`, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHub GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function ghPut(path, body) {
  const r = await fetch(`${BASE_API}${path}`, {
    method: 'PUT',
    headers: ghHeaders(),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GitHub PUT ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

// Get file SHA (needed to update existing files)
async function getFileSha(filePath) {
  try {
    const data = await ghGet(`/contents/${filePath}?ref=${BRANCH}`);
    return data.sha;
  } catch {
    return null; // file doesn't exist yet
  }
}

// Read raw file content from GitHub
async function readFile(filePath) {
  const data = await ghGet(`/contents/${filePath}?ref=${BRANCH}`);
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

// Write/update a file on GitHub
async function writeFile(filePath, content, message, sha = null) {
  const body = {
    message,
    content: Buffer.from(content, 'utf-8').toString('base64'),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;
  return ghPut(`/contents/${filePath}`, body);
}

// Fill template placeholders
function fillTemplate(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
}

// Slugify client name for directory
function toSlug(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── main handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple auth — admin passes secret key in header
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const data = req.body;

    // Validate required fields
    const required = ['bride_name', 'groom_name', 'client_name', 'template_folder'];
    for (const f of required) {
      if (!data[f]) return res.status(400).json({ error: `Field '${f}' wajib diisi` });
    }

    // Generate slug from names
    const slug = data.slug
      ? toSlug(data.slug)
      : toSlug(`${data.bride_name}-${data.groom_name}`);

    const invPath = `invitations/${slug}/index.html`;
    const templatePath = `templates/${data.template_folder}/index.html`;

    // 1. Read template
    let templateHtml;
    try {
      templateHtml = await readFile(templatePath);
    } catch {
      return res.status(404).json({ error: `Template '${data.template_folder}' tidak ditemukan di repo` });
    }

    // 2. Build placeholder map
    const placeholders = {
      BRIDE_NAME:       data.bride_name     || '',
      GROOM_NAME:       data.groom_name     || '',
      BRIDE_FATHER:     data.bride_father   || '',
      BRIDE_MOTHER:     data.bride_mother   || '',
      GROOM_FATHER:     data.groom_father   || '',
      GROOM_MOTHER:     data.groom_mother   || '',
      BRIDE_PHOTO:      data.bride_photo    || '',
      GROOM_PHOTO:      data.groom_photo    || '',
      AKAD_DATE:        data.akad_date      || '',
      AKAD_MONTH:       data.akad_month     || '',
      AKAD_YEAR:        data.akad_year      || '',
      AKAD_DAY:         data.akad_day       || '',
      AKAD_TIME:        data.akad_time      || '',
      AKAD_VENUE:       data.akad_venue     || '',
      AKAD_ADDRESS:     data.akad_address   || '',
      AKAD_MAPS:        data.akad_maps      || '#',
      RESEPSI_DATE:     data.resepsi_date   || data.akad_date   || '',
      RESEPSI_MONTH:    data.resepsi_month  || data.akad_month  || '',
      RESEPSI_YEAR:     data.resepsi_year   || data.akad_year   || '',
      RESEPSI_TIME:     data.resepsi_time   || '',
      RESEPSI_VENUE:    data.resepsi_venue  || data.akad_venue  || '',
      RESEPSI_ADDRESS:  data.resepsi_address|| data.akad_address|| '',
      RESEPSI_MAPS:     data.resepsi_maps   || data.akad_maps   || '#',
      WEDDING_DATE_ISO: data.wedding_date_iso || '',
      GALLERY_1:        data.gallery_1      || '',
      GALLERY_2:        data.gallery_2      || '',
      GALLERY_3:        data.gallery_3      || '',
      GALLERY_4:        data.gallery_4      || '',
      GALLERY_5:        data.gallery_5      || '',
      STORY_1_YEAR:     data.story_1_year   || '',
      STORY_1_TEXT:     data.story_1_text   || '',
      STORY_2_YEAR:     data.story_2_year   || '',
      STORY_2_TEXT:     data.story_2_text   || '',
      STORY_3_YEAR:     data.story_3_year   || '',
      STORY_3_TEXT:     data.story_3_text   || '',
      BANK_1:           data.bank_1         || '',
      ACCOUNT_1:        data.account_1      || '',
      ACCOUNT_NAME_1:   data.account_name_1 || '',
      BANK_2:           data.bank_2         || '',
      ACCOUNT_2:        data.account_2      || '',
      ACCOUNT_NAME_2:   data.account_name_2 || '',
      WA_NUMBER:        data.wa_number      || '',
      RSVP_DEADLINE:    data.rsvp_deadline  || '',
      MUSIC_URL:        data.music_url      || '',
      VENDOR_NAME:      data.vendor_name    || 'Undangan Digital',
      GUEST_NAME:       'Tamu Undangan',
    };

    // 3. Fill template
    const filledHtml = fillTemplate(templateHtml, placeholders);

    // 4. Push invitation file to GitHub
    const existingSha = await getFileSha(invPath);
    await writeFile(
      invPath,
      filledHtml,
      `feat: undangan ${data.bride_name} & ${data.groom_name} (${slug})`,
      existingSha
    );

    // 5. Update invitations.json database
    const dbPath = 'data/invitations.json';
    let db = [];
    const dbSha = await getFileSha(dbPath);
    if (dbSha) {
      try {
        const raw = await readFile(dbPath);
        db = JSON.parse(raw);
      } catch {
        db = [];
      }
    }

    const existingIdx = db.findIndex(i => i.slug === slug);
    const record = {
      id:           existingIdx >= 0 ? db[existingIdx].id : `INV-${Date.now()}`,
      slug,
      bride_name:   data.bride_name,
      groom_name:   data.groom_name,
      client_name:  data.client_name,
      client_wa:    data.client_wa || '',
      template:     data.template_folder,
      akad_date:    `${data.akad_date} ${data.akad_month} ${data.akad_year}`,
      resepsi_date: `${data.resepsi_date || data.akad_date} ${data.resepsi_month || data.akad_month} ${data.resepsi_year || data.akad_year}`,
      status:       existingIdx >= 0 ? db[existingIdx].status : 'proses',
      path:         `invitations/${slug}/`,
      created_at:   existingIdx >= 0 ? db[existingIdx].created_at : new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };

    if (existingIdx >= 0) db[existingIdx] = record;
    else db.unshift(record);

    await writeFile(dbPath, JSON.stringify(db, null, 2), `data: update invitations.json (${slug})`, dbSha);

    return res.status(200).json({
      success: true,
      slug,
      path: `/invitations/${slug}/`,
      url: `/${slug}/`,
      message: `Undangan berhasil dibuat! Vercel sedang deploy (±30 detik).`,
      record,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
