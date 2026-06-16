const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { toCsv } = require('./applications');

const router = express.Router();

// GET /api/admin/events/:id/payments — confirmed marshals + payment detail
router.get('/admin/events/:id/payments', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.total_due, a.payment_received, a.payment_received_date, a.payment_method,
              a.barbie_attending,
              m.surname, m.forenames, m.preferred_name, m.email,
              COALESCE(sh.shirt_total, 0) AS shirt_total
       FROM applications a
       JOIN marshals m ON m.id = a.marshal_id
       LEFT JOIN (
         SELECT application_id, SUM(quantity * unit_price) AS shirt_total
         FROM shirt_orders GROUP BY application_id
       ) sh ON sh.application_id = a.id
       WHERE a.event_id = $1 AND a.status = 'confirmed'
       ORDER BY m.surname, m.forenames`,
      [req.params.id]
    );
    const ev = await db.query('SELECT barbie_price FROM events WHERE id = $1', [req.params.id]);
    const barbiePrice = ev.rows[0] ? Number(ev.rows[0].barbie_price) : 0;

    const enriched = rows.map((r) => ({
      ...r,
      shirt_total: Number(r.shirt_total || 0),
      barbie_total: r.barbie_attending ? barbiePrice : 0,
      total_due: Number(r.total_due || 0),
    }));

    const totals = enriched.reduce(
      (t, r) => {
        t.due += r.total_due;
        t.shirts += r.shirt_total;
        t.barbie += r.barbie_total;
        if (r.payment_received) t.received += r.total_due;
        return t;
      },
      { due: 0, shirts: 0, barbie: 0, received: 0 }
    );
    Object.keys(totals).forEach((k) => { totals[k] = Number(totals[k].toFixed(2)); });

    res.json({ rows: enriched, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load payments' });
  }
});

// PUT /api/admin/payments/:applicationId — mark paid/unpaid inline
router.put('/admin/payments/:applicationId', requireAuth, requireCoordinator, async (req, res) => {
  const received = req.body.payment_received !== false;
  const date = req.body.payment_received_date || (received ? new Date().toISOString().slice(0, 10) : null);
  const method = req.body.payment_method || null;
  try {
    const { rows } = await db.query(
      `UPDATE applications
       SET payment_received = $1, payment_received_date = $2, payment_method = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [received, received ? date : null, received ? method : null, req.params.applicationId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Application not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// GET /api/admin/events/:id/payments/export — CSV
router.get('/admin/events/:id/payments/export', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.surname, m.forenames, m.email, a.total_due, a.payment_received,
              a.payment_received_date, a.payment_method
       FROM applications a JOIN marshals m ON m.id = a.marshal_id
       WHERE a.event_id = $1 AND a.status = 'confirmed'
       ORDER BY m.surname`,
      [req.params.id]
    );
    const cols = ['surname', 'forenames', 'email', 'total_due', 'payment_received', 'payment_received_date', 'payment_method'];
    const csv = toCsv(rows, cols);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payments-event-${req.params.id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export payments' });
  }
});

module.exports = router;
