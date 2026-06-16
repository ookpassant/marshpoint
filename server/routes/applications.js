const express = require('express');
const fs = require('fs');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { upload, supersedeOldLicence } = require('../middleware/upload');

const router = express.Router();

// Build a joined application row used by list and detail views.
const APP_SELECT = `
  SELECT a.*,
         m.surname, m.forenames, m.preferred_name, m.email, m.phone_mobile,
         m.msuk_licence_number, m.msuk_licence_grades, m.wdmc_member_number,
         m.licence_upload_path, m.licence_verified, m.licence_verified_at,
         m.ora_experienced, m.motorsport_interests, m.gfos_years_attended,
         m.address_line1, m.address_line2, m.address_town, m.address_postcode,
         m.phone_home, m.phone_work,
         vb.name AS licence_verified_by_name,
         COALESCE(sh.shirt_qty, 0) AS shirt_qty
  FROM applications a
  JOIN marshals m ON m.id = a.marshal_id
  LEFT JOIN users vb ON vb.id = m.licence_verified_by
  LEFT JOIN (
    SELECT application_id, SUM(quantity)::int AS shirt_qty
    FROM shirt_orders GROUP BY application_id
  ) sh ON sh.application_id = a.id
`;

// GET /api/admin/events/:id/applications — list with filters & sort
router.get('/admin/events/:id/applications', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const { status, role, day, ora_team, licence, payment, search, sort, dir } = req.query;
  const where = ['a.event_id = $1'];
  const params = [eventId];
  let i = 2;

  if (status) {
    const list = String(status).split(',').filter(Boolean);
    if (list.length) { where.push(`a.status = ANY($${i++})`); params.push(list); }
  }
  if (role) { where.push(`a.role_preference = $${i++}`); params.push(role); }
  if (day) { where.push(`$${i++} = ANY(a.marshalling_days)`); params.push(day); }
  if (ora_team) {
    if (ora_team === 'unassigned') where.push('a.ora_team IS NULL');
    else { where.push(`a.ora_team = $${i++}`); params.push(ora_team); }
  }
  if (licence === 'verified') where.push('m.licence_verified = TRUE');
  else if (licence === 'unverified') where.push('m.licence_verified = FALSE AND m.licence_upload_path IS NOT NULL');
  else if (licence === 'missing') where.push('m.licence_upload_path IS NULL');
  if (payment === 'paid') where.push('a.payment_received = TRUE');
  else if (payment === 'unpaid') where.push('a.payment_received = FALSE');
  if (search) {
    where.push(`(m.surname ILIKE $${i} OR m.forenames ILIKE $${i} OR m.email ILIKE $${i})`);
    params.push(`%${search}%`); i++;
  }

  const sortable = { submitted_at: 'a.submitted_at', name: 'm.surname', status: 'a.status', team: 'a.ora_team' };
  const sortCol = sortable[sort] || 'a.submitted_at';
  const sortDir = dir === 'asc' ? 'ASC' : 'DESC';

  try {
    const { rows } = await db.query(
      `${APP_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${sortCol} ${sortDir}`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list applications' });
  }
});

// GET /api/admin/applications/:id — single detail (+ shirts + schedule)
router.get('/admin/applications/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`${APP_SELECT} WHERE a.id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Application not found' });
    const app = rows[0];
    const [shirts, schedule] = await Promise.all([
      db.query('SELECT id, size, quantity, unit_price FROM shirt_orders WHERE application_id = $1 ORDER BY size', [app.id]),
      db.query(
        `SELECT sa.*, ed.day_name, ed.date FROM schedule_assignments sa
         JOIN event_days ed ON ed.id = sa.event_day_id WHERE sa.application_id = $1 ORDER BY ed.date`,
        [app.id]
      ),
    ]);
    res.json({ ...app, shirts: shirts.rows, schedule: schedule.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load application' });
  }
});

// PUT /api/admin/applications/:id — update editable fields
router.put('/admin/applications/:id', requireAuth, requireCoordinator, async (req, res) => {
  const b = req.body || {};
  const allowed = [
    'status', 'ora_team', 'schedule_provisional', 'coordinator_notes',
    'arrival_day', 'arrival_time_approx', 'marshalling_days', 'departure_option',
    'role_preference', 'unavailable_notes', 'stage_shift_preference',
    'accommodation_type', 'accommodation_size_l', 'accommodation_size_w',
    'sharing_with_names', 'travelling_with_names', 'barbie_attending',
    'payment_received', 'payment_received_date', 'payment_method', 'total_due',
  ];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(b, k)) {
      sets.push(`${k} = $${i++}`);
      vals.push(b[k] === '' ? null : b[k]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No updatable fields supplied' });

  // Guard: cannot confirm without a verified licence.
  if (b.status === 'confirmed') {
    const lic = await db.query(
      `SELECT m.licence_verified FROM applications a JOIN marshals m ON m.id = a.marshal_id WHERE a.id = $1`,
      [req.params.id]
    );
    if (!lic.rows[0]) return res.status(404).json({ error: 'Application not found' });
    if (!lic.rows[0].licence_verified) {
      return res.status(409).json({ error: 'Cannot confirm: the licence must be uploaded and verified first.' });
    }
  }

  sets.push('updated_at = NOW()');
  vals.push(req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE applications SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Application not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// PUT /api/admin/applications/:id/verify-licence — mark licence verified
router.put('/admin/applications/:id/verify-licence', requireAuth, requireCoordinator, async (req, res) => {
  const verified = req.body.verified !== false;
  try {
    const appRes = await db.query('SELECT marshal_id FROM applications WHERE id = $1', [req.params.id]);
    if (!appRes.rows[0]) return res.status(404).json({ error: 'Application not found' });
    const marshalId = appRes.rows[0].marshal_id;
    const { rows } = await db.query(
      `UPDATE marshals
       SET licence_verified = $1,
           licence_verified_by = CASE WHEN $1 THEN $2 ELSE NULL END,
           licence_verified_at = CASE WHEN $1 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $3 RETURNING licence_verified, licence_verified_at`,
      [verified, req.user.userId, marshalId]
    );
    res.json({ ok: true, ...rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update licence verification' });
  }
});

// PUT /api/admin/applications/:id/confirm — confirm marshal (needs verified licence)
router.put('/admin/applications/:id/confirm', requireAuth, requireCoordinator, async (req, res) => {
  try {
    const check = await db.query(
      `SELECT m.licence_verified FROM applications a JOIN marshals m ON m.id = a.marshal_id WHERE a.id = $1`,
      [req.params.id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Application not found' });
    if (!check.rows[0].licence_verified) {
      return res.status(409).json({ error: 'Cannot confirm: the licence must be uploaded and verified first.' });
    }
    const { rows } = await db.query(
      "UPDATE applications SET status = 'confirmed', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to confirm marshal' });
  }
});

// PUT /api/admin/applications/:id/payment — mark payment received
router.put('/admin/applications/:id/payment', requireAuth, requireCoordinator, async (req, res) => {
  const received = req.body.payment_received !== false;
  const date = req.body.payment_received_date || (received ? new Date().toISOString().slice(0, 10) : null);
  const method = req.body.payment_method || null;
  try {
    const { rows } = await db.query(
      `UPDATE applications
       SET payment_received = $1,
           payment_received_date = $2,
           payment_method = $3,
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [received, received ? date : null, received ? method : null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Application not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// GET /api/admin/events/:id/applications/export — CSV
router.get('/admin/events/:id/applications/export', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(`${APP_SELECT} WHERE a.event_id = $1 ORDER BY m.surname`, [req.params.id]);
    const cols = [
      'id', 'surname', 'forenames', 'preferred_name', 'email', 'phone_mobile',
      'status', 'role_preference', 'ora_team', 'marshalling_days', 'arrival_day',
      'departure_option', 'accommodation_type', 'barbie_attending', 'shirt_qty',
      'msuk_licence_number', 'licence_verified', 'total_due', 'payment_received',
      'payment_method', 'submitted_at',
    ];
    const csv = toCsv(rows, cols);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="applications-event-${req.params.id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export applications' });
  }
});

// POST /api/admin/applications/:id/licence — coordinator upload on behalf
async function prepAdminUpload(req, res, next) {
  try {
    const r = await db.query('SELECT event_id, marshal_id FROM applications WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Application not found' });
    req.uploadEventId = r.rows[0].event_id;
    req.uploadMarshalId = r.rows[0].marshal_id;
    req._marshalId = r.rows[0].marshal_id;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Upload preparation failed' });
  }
}

router.post('/admin/applications/:id/licence', requireAuth, requireCoordinator, prepAdminUpload, upload.single('licence'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Invalid file (type or size).' });
    const cur = await db.query('SELECT licence_upload_path FROM marshals WHERE id = $1', [req._marshalId]);
    supersedeOldLicence(cur.rows[0] && cur.rows[0].licence_upload_path);
    await db.query(
      'UPDATE marshals SET licence_upload_path = $1, licence_verified = FALSE, licence_verified_by = NULL, licence_verified_at = NULL, updated_at = NOW() WHERE id = $2',
      [req.file.path, req._marshalId]
    );
    res.json({ ok: true, filename: req.file.filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save licence' });
  }
});

// GET /api/admin/applications/:id/licence — download
router.get('/admin/applications/:id/licence', requireAuth, async (req, res) => {
  try {
    const r = await db.query(
      `SELECT m.licence_upload_path FROM applications a JOIN marshals m ON m.id = a.marshal_id WHERE a.id = $1`,
      [req.params.id]
    );
    const p = r.rows[0] && r.rows[0].licence_upload_path;
    if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'No licence on file' });
    res.download(p);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to download licence' });
  }
});

// Minimal CSV serialiser.
function toCsv(rows, cols) {
  const esc = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) v = v.join('; ');
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return `${header}\n${body}\n`;
}

module.exports = { router, toCsv };
