const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');

const router = express.Router();

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Generate one event_days row per calendar day in [start, end].
async function generateEventDays(client, eventId, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dayName = DAY_NAMES[d.getUTCDay()];
    await client.query(
      `INSERT INTO event_days (event_id, date, day_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, date) DO NOTHING`,
      [eventId, iso, dayName]
    );
  }
}

// GET /api/admin/events — list all events
router.get('/admin/events', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM events ORDER BY year DESC, start_date DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list events' });
  }
});

// POST /api/admin/events — create event (+ event_days)
router.post('/admin/events', requireAuth, requireCoordinator, async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.year || !b.start_date || !b.end_date) {
    return res.status(400).json({ error: 'name, year, start_date and end_date are required' });
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO events
        (name, year, start_date, end_date, location, description, status,
         ora_team_size_target, stage_shifts_per_day, stage_changeover_time,
         stage_direction, shirt_price, barbie_price, shirts_ordered,
         bacs_account_name, bacs_sort_code, bacs_account_number)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'draft'),
         COALESCE($8,20),COALESCE($9,2),COALESCE($10,'12:30'),
         COALESCE($11,'anticlockwise'),COALESCE($12,15.00),COALESCE($13,15.00),
         COALESCE($14,false),$15,$16,$17)
       RETURNING *`,
      [
        b.name, b.year, b.start_date, b.end_date, b.location || null, b.description || null,
        b.status, b.ora_team_size_target, b.stage_shifts_per_day, b.stage_changeover_time,
        b.stage_direction, b.shirt_price, b.barbie_price, b.shirts_ordered,
        b.bacs_account_name || null, b.bacs_sort_code || null, b.bacs_account_number || null,
      ]
    );
    const event = rows[0];
    await generateEventDays(client, event.id, event.start_date, event.end_date);
    await client.query('COMMIT');
    res.status(201).json(event);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to create event' });
  } finally {
    client.release();
  }
});

// GET /api/admin/events/:id — event detail (+ days)
router.get('/admin/events/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' });
    const days = await db.query(
      'SELECT * FROM event_days WHERE event_id = $1 ORDER BY date',
      [req.params.id]
    );
    res.json({ ...rows[0], days: days.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load event' });
  }
});

// PUT /api/admin/events/:id — update event
router.put('/admin/events/:id', requireAuth, requireCoordinator, async (req, res) => {
  const b = req.body || {};
  const allowed = [
    'name', 'year', 'start_date', 'end_date', 'location', 'description', 'status',
    'ora_team_size_target', 'stage_shifts_per_day', 'stage_changeover_time',
    'stage_direction', 'shirt_price', 'barbie_price', 'shirts_ordered',
    'bacs_account_name', 'bacs_sort_code', 'bacs_account_number',
  ];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(b, key)) {
      sets.push(`${key} = $${i++}`);
      vals.push(b[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No updatable fields supplied' });
  sets.push(`updated_at = NOW()`);
  vals.push(req.params.id);
  try {
    const { rows } = await db.query(
      `UPDATE events SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Event not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// GET /api/admin/events/:id/summary — dashboard stats
router.get('/admin/events/:id/summary', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  try {
    const [event, invites, apps, shirts] = await Promise.all([
      db.query('SELECT * FROM events WHERE id = $1', [eventId]),
      db.query('SELECT status, COUNT(*)::int AS n FROM invitations WHERE event_id = $1 GROUP BY status', [eventId]),
      db.query(
        `SELECT a.*, m.licence_verified, m.licence_upload_path
         FROM applications a JOIN marshals m ON m.id = a.marshal_id
         WHERE a.event_id = $1`,
        [eventId]
      ),
      db.query(
        `SELECT s.size, SUM(s.quantity)::int AS qty
         FROM shirt_orders s
         JOIN applications a ON a.id = s.application_id
         WHERE a.event_id = $1
         GROUP BY s.size`,
        [eventId]
      ),
    ]);

    if (!event.rows[0]) return res.status(404).json({ error: 'Event not found' });

    const applications = apps.rows;
    const target = event.rows[0].ora_team_size_target || 20;

    const invitesByStatus = {};
    let totalInvited = 0;
    for (const r of invites.rows) {
      invitesByStatus[r.status] = r.n;
      totalInvited += r.n;
    }

    const statusCounts = { applied: 0, licence_pending: 0, confirmed: 0, cancelled: 0, no_show: 0 };
    let teamA = 0, teamB = 0;
    let roleOra = 0, roleStage = 0, roleFlexible = 0;
    let licVerified = 0, licUploaded = 0, licMissing = 0;
    let barbie = 0;
    let totalDue = 0, totalReceived = 0;

    for (const a of applications) {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status]++;
      if (a.ora_team === 'A') teamA++;
      if (a.ora_team === 'B') teamB++;
      if (a.role_preference === 'ora') roleOra++;
      else if (a.role_preference === 'stage') roleStage++;
      else if (a.role_preference === 'flexible') roleFlexible++;
      if (a.licence_verified) licVerified++;
      else if (a.licence_upload_path) licUploaded++;
      else licMissing++;
      if (a.barbie_attending) barbie++;
      totalDue += Number(a.total_due || 0);
      if (a.payment_received) totalReceived += Number(a.total_due || 0);
    }

    const shirtsBySize = {};
    let shirtTotalQty = 0;
    for (const r of shirts.rows) {
      shirtsBySize[r.size] = r.qty;
      shirtTotalQty += r.qty;
    }

    res.json({
      event: event.rows[0],
      invitations: { total: totalInvited, byStatus: invitesByStatus },
      applications: {
        total: applications.length,
        byStatus: statusCounts,
        confirmed: statusCounts.confirmed,
        paid: applications.filter((a) => a.payment_received).length,
      },
      ora: { teamA, teamB, target, teamABelow: teamA < target, teamBBelow: teamB < target },
      roles: { ora: roleOra, stage: roleStage, flexible: roleFlexible },
      licences: { verified: licVerified, pending: licUploaded, missing: licMissing },
      shirts: { bySize: shirtsBySize, totalQty: shirtTotalQty },
      barbie: { attending: barbie },
      revenue: { due: Number(totalDue.toFixed(2)), received: Number(totalReceived.toFixed(2)) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build summary' });
  }
});

module.exports = router;
