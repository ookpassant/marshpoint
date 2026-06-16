const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { buildDataPack, anonymiseMarshal, logProcessing } = require('../util/gdpr');

const router = express.Router();

const FIELDS = [
  'surname', 'forenames', 'preferred_name', 'address_line1', 'address_line2',
  'address_town', 'address_postcode', 'phone_home', 'phone_work', 'phone_mobile',
  'email', 'msuk_licence_number', 'msuk_licence_grades', 'msuk_licence_expiry',
  'wdmc_member_number', 'motorsport_interests', 'gfos_years_attended',
  'ora_experienced', 'is_active', 'notes',
];

// GET /api/admin/marshals — list (with optional ?search=)
router.get('/admin/marshals', requireAuth, async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    let result;
    if (search) {
      result = await db.query(
        `SELECT * FROM marshals
         WHERE surname ILIKE $1 OR forenames ILIKE $1 OR email ILIKE $1
         ORDER BY surname, forenames`,
        [`%${search}%`]
      );
    } else {
      result = await db.query('SELECT * FROM marshals ORDER BY surname, forenames');
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list marshals' });
  }
});

// GET /api/admin/marshals/:id
router.get('/admin/marshals/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM marshals WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Marshal not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load marshal' });
  }
});

// GET /api/admin/marshals/:id/applications — this marshal's history across events
router.get('/admin/marshals/:id/applications', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.status, a.role_preference, a.ora_team, a.total_due, a.payment_received,
              e.id AS event_id, e.name AS event_name, e.year
       FROM applications a JOIN events e ON e.id = a.event_id
       WHERE a.marshal_id = $1
       ORDER BY e.year DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load marshal history' });
  }
});

// GET /api/admin/marshals/:id/export — subject-access data pack (JSON download)
router.get('/admin/marshals/:id/export', requireAuth, async (req, res) => {
  try {
    const pack = await buildDataPack(req.params.id);
    if (!pack) return res.status(404).json({ error: 'Marshal not found' });
    await logProcessing('export', { marshalId: Number(req.params.id), performedBy: req.user.userId, detail: 'Coordinator data export' });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="marshal-${req.params.id}-data.json"`);
    res.send(JSON.stringify(pack, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export marshal data' });
  }
});

// POST /api/admin/marshals/:id/erase — right to erasure (anonymise + delete files)
router.post('/admin/marshals/:id/erase', requireAuth, requireCoordinator, async (req, res) => {
  try {
    const result = await anonymiseMarshal(Number(req.params.id), req.user.userId, 'erasure');
    if (result.notFound) return res.status(404).json({ error: 'Marshal not found' });
    if (result.alreadyAnonymised) return res.json({ ok: true, already: true });
    res.json({ ok: true, files_removed: result.filesRemoved });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to erase marshal data' });
  }
});

// GET /api/admin/marshals/:id/processing-log — the audit trail for this marshal
router.get('/admin/marshals/:id/processing-log', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.action, p.detail, p.created_at, u.name AS performed_by_name
       FROM processing_log p LEFT JOIN users u ON u.id = p.performed_by
       WHERE p.marshal_id = $1 ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load processing log' });
  }
});

// POST /api/admin/marshals — create
router.post('/admin/marshals', requireAuth, requireCoordinator, async (req, res) => {
  const b = req.body || {};
  if (!b.surname || !b.forenames || !b.phone_mobile || !b.email) {
    return res.status(400).json({ error: 'surname, forenames, phone_mobile and email are required' });
  }
  const cols = [];
  const placeholders = [];
  const vals = [];
  let i = 1;
  for (const f of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(b, f)) {
      cols.push(f);
      placeholders.push(`$${i++}`);
      vals.push(b[f]);
    }
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO marshals (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      vals
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A marshal with that email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create marshal' });
  }
});

// PUT /api/admin/marshals/:id — update
router.put('/admin/marshals/:id', requireAuth, requireCoordinator, async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;
  for (const f of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(b, f)) {
      sets.push(`${f} = $${i++}`);
      vals.push(b[f]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No updatable fields supplied' });
  sets.push('updated_at = NOW()');
  vals.push(req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE marshals SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Marshal not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update marshal' });
  }
});

module.exports = router;
