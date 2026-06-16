const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/events/:id/reports/shirt-order — sizes + quantities grouped
router.get('/admin/events/:id/reports/shirt-order', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  try {
    const sizes = await db.query(
      `SELECT s.size, SUM(s.quantity)::int AS quantity, SUM(s.quantity * s.unit_price) AS value
       FROM shirt_orders s JOIN applications a ON a.id = s.application_id
       WHERE a.event_id = $1
       GROUP BY s.size
       ORDER BY ARRAY_POSITION(ARRAY['S','M','L','XL','2XL','3XL','4XL'], s.size)`,
      [eventId]
    );
    // Confirmed marshals with no shirts on record (export should warn).
    const missing = await db.query(
      `SELECT m.surname, m.forenames, m.email
       FROM applications a JOIN marshals m ON m.id = a.marshal_id
       WHERE a.event_id = $1 AND a.status = 'confirmed'
         AND NOT EXISTS (SELECT 1 FROM shirt_orders s WHERE s.application_id = a.id)
       ORDER BY m.surname`,
      [eventId]
    );
    const total = sizes.rows.reduce((t, r) => t + r.quantity, 0);
    res.json({
      bySize: sizes.rows.map((r) => ({ size: r.size, quantity: r.quantity, value: Number(r.value) })),
      total,
      missing_sizes: missing.rows,
      locked: missing.rows.length === 0,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build shirt-order report' });
  }
});

// GET /api/admin/events/:id/reports/barbie-count
router.get('/admin/events/:id/reports/barbie-count', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.surname, m.forenames, m.preferred_name
       FROM applications a JOIN marshals m ON m.id = a.marshal_id
       WHERE a.event_id = $1 AND a.barbie_attending = TRUE AND a.status NOT IN ('cancelled','no_show')
       ORDER BY m.surname`,
      [req.params.id]
    );
    const ev = await db.query('SELECT barbie_price FROM events WHERE id = $1', [req.params.id]);
    const price = ev.rows[0] ? Number(ev.rows[0].barbie_price) : 0;
    res.json({ count: rows.length, attendees: rows, value: Number((rows.length * price).toFixed(2)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build barbie report' });
  }
});

// GET /api/admin/events/:id/reports/financials
router.get('/admin/events/:id/reports/financials', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'confirmed')::int AS confirmed,
         COALESCE(SUM(total_due) FILTER (WHERE status = 'confirmed'), 0) AS total_due,
         COALESCE(SUM(total_due) FILTER (WHERE payment_received), 0) AS total_received,
         COUNT(*) FILTER (WHERE status = 'confirmed' AND payment_received)::int AS paid_count,
         COUNT(*) FILTER (WHERE status = 'confirmed' AND NOT payment_received)::int AS unpaid_count
       FROM applications WHERE event_id = $1`,
      [req.params.id]
    );
    const r = rows[0];
    const due = Number(r.total_due);
    const received = Number(r.total_received);
    res.json({
      confirmed: r.confirmed,
      total_due: Number(due.toFixed(2)),
      total_received: Number(received.toFixed(2)),
      outstanding: Number((due - received).toFixed(2)),
      paid_count: r.paid_count,
      unpaid_count: r.unpaid_count,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build financials report' });
  }
});

// GET /api/admin/events/:id/reports/daily-roster?day=Thursday
router.get('/admin/events/:id/reports/daily-roster', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  const day = req.query.day;
  try {
    const params = [eventId];
    let dayFilter = '';
    if (day) { dayFilter = ' AND ed.day_name = $2'; params.push(day); }
    const { rows } = await db.query(
      `SELECT ed.day_name, ed.date, m.surname, m.forenames, m.preferred_name, m.phone_mobile,
              a.ora_team, sa.role, sa.post, sa.provisional, a.accommodation_type
       FROM schedule_assignments sa
       JOIN applications a ON a.id = sa.application_id
       JOIN marshals m ON m.id = a.marshal_id
       JOIN event_days ed ON ed.id = sa.event_day_id
       WHERE a.event_id = $1${dayFilter}
       ORDER BY ed.date, sa.role, m.surname`,
      params
    );
    // Group by day.
    const byDay = {};
    for (const r of rows) {
      (byDay[r.day_name] = byDay[r.day_name] || []).push(r);
    }
    res.json({ byDay });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build daily roster' });
  }
});

module.exports = router;
