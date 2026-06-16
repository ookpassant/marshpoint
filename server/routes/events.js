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
  // Insert only the columns supplied; let DB defaults cover the rest. This
  // avoids COALESCE type-inference issues against typed columns (time, numeric).
  const optional = [
    'location', 'description', 'organisation_name', 'status', 'ora_team_size_target',
    'stage_shifts_per_day', 'stage_shift_target', 'stage_changeover_time', 'stage_direction',
    'shirt_price', 'barbie_price', 'addon_enabled', 'addon_label', 'shirts_ordered',
    'bacs_account_name', 'bacs_sort_code', 'bacs_account_number',
  ];
  const cols = ['name', 'year', 'start_date', 'end_date'];
  const vals = [b.name, b.year, b.start_date, b.end_date];
  for (const k of optional) {
    if (b[k] !== undefined && b[k] !== null && b[k] !== '') { cols.push(k); vals.push(b[k]); }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO events (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      vals
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
    'name', 'year', 'start_date', 'end_date', 'location', 'description', 'organisation_name', 'status',
    'ora_team_size_target', 'stage_shifts_per_day', 'stage_shift_target', 'stage_changeover_time',
    'stage_direction', 'shirt_price', 'barbie_price', 'addon_enabled', 'addon_label', 'shirts_ordered',
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
    const [event, invites, apps, shirts, stageCover] = await Promise.all([
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
      // Per-day stage staffing from the schedule (stage_full counts to both shifts).
      db.query(
        `SELECT ed.id, ed.day_name, ed.date,
                COUNT(*) FILTER (WHERE sa.role IN ('stage_am','stage_full'))::int AS am,
                COUNT(*) FILTER (WHERE sa.role IN ('stage_pm','stage_full'))::int AS pm
         FROM event_days ed
         LEFT JOIN schedule_assignments sa ON sa.event_day_id = ed.id
         WHERE ed.event_id = $1
         GROUP BY ed.id, ed.day_name, ed.date
         ORDER BY ed.date`,
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

    // Stage coverage: per-day AM/PM assigned vs target.
    const stageTarget = event.rows[0].stage_shift_target || 10;
    const stageDays = stageCover.rows.map((r) => ({
      day_name: r.day_name,
      am: r.am,
      pm: r.pm,
      amBelow: r.am < stageTarget,
      pmBelow: r.pm < stageTarget,
    }));
    const stageAnyBelow = stageDays.some((d) => d.amBelow || d.pmBelow);

    res.json({
      event: event.rows[0],
      invitations: { total: totalInvited, byStatus: invitesByStatus },
      applications: {
        total: applications.length,
        byStatus: statusCounts,
        confirmed: statusCounts.confirmed,
        paid: applications.filter((a) => a.payment_received).length,
      },
      // Stage is the priority team — listed first.
      stage: { target: stageTarget, days: stageDays, anyBelow: stageAnyBelow, applicants: roleStage },
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
