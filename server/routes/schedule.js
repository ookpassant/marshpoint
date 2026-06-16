const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { autoAssignOra } = require('../util/oraAssign');
const { autoAssignStage } = require('../util/stageAssign');
const { sendMail } = require('../email/mailer');
const { renderTemplate } = require('../email/render');
const { buildMergeFields } = require('../util/helpers');
const { toCsv } = require('./applications');

const router = express.Router();

// GET /api/admin/events/:id/schedule — full grid
router.get('/admin/events/:id/schedule', requireAuth, async (req, res) => {
  const eventId = req.params.id;
  try {
    const days = await db.query('SELECT * FROM event_days WHERE event_id = $1 ORDER BY date', [eventId]);
    const apps = await db.query(
      `SELECT a.id, a.ora_team, a.role_preference, a.schedule_provisional,
              a.stage_shift_preference, a.marshalling_days,
              m.surname, m.forenames, m.preferred_name, m.phone_mobile, m.ora_experienced,
              a.accommodation_type
       FROM applications a JOIN marshals m ON m.id = a.marshal_id
       WHERE a.event_id = $1 AND a.status NOT IN ('cancelled','no_show')
       ORDER BY a.ora_team NULLS LAST, m.surname`,
      [eventId]
    );
    const assignments = await db.query(
      `SELECT sa.* FROM schedule_assignments sa
       JOIN applications a ON a.id = sa.application_id
       WHERE a.event_id = $1`,
      [eventId]
    );
    // Group assignments by application id.
    const byApp = {};
    for (const a of assignments.rows) {
      (byApp[a.application_id] = byApp[a.application_id] || []).push(a);
    }
    res.json({
      days: days.rows,
      marshals: apps.rows.map((a) => ({ ...a, assignments: byApp[a.id] || [] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load schedule' });
  }
});

// POST /api/admin/events/:id/schedule — upsert a cell assignment
router.post('/admin/events/:id/schedule', requireAuth, requireCoordinator, async (req, res) => {
  const { application_id, event_day_id, role, post, provisional, notes } = req.body || {};
  if (!application_id || !event_day_id || !role) {
    return res.status(400).json({ error: 'application_id, event_day_id and role are required' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO schedule_assignments
        (application_id, event_day_id, role, post, provisional, notes, assigned_by)
       VALUES ($1,$2,$3,$4,COALESCE($5,true),$6,$7)
       ON CONFLICT (application_id, event_day_id)
       DO UPDATE SET role = EXCLUDED.role, post = EXCLUDED.post,
                     provisional = EXCLUDED.provisional, notes = EXCLUDED.notes,
                     assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
       RETURNING *`,
      [application_id, event_day_id, role, post || null, provisional, notes || null, req.user.userId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save assignment' });
  }
});

// PUT /api/admin/schedule/:assignmentId — update single assignment
router.put('/admin/schedule/:assignmentId', requireAuth, requireCoordinator, async (req, res) => {
  const b = req.body || {};
  const allowed = ['role', 'post', 'provisional', 'notes'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(b, k)) { sets.push(`${k} = $${i++}`); vals.push(b[k]); }
  }
  if (!sets.length) return res.status(400).json({ error: 'No updatable fields supplied' });
  sets.push(`assigned_by = $${i++}`, 'assigned_at = NOW()');
  vals.push(req.user.userId);
  vals.push(req.params.assignmentId);
  try {
    const { rows } = await db.query(
      `UPDATE schedule_assignments SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Assignment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

// DELETE /api/admin/schedule/:assignmentId
router.delete('/admin/schedule/:assignmentId', requireAuth, requireCoordinator, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM schedule_assignments WHERE id = $1', [req.params.assignmentId]);
    if (!rowCount) return res.status(404).json({ error: 'Assignment not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// POST /api/admin/events/:id/schedule/auto-assign — ORA algorithm (preview or commit)
router.post('/admin/events/:id/schedule/auto-assign', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  const commit = req.body && req.body.commit === true;
  try {
    const ev = await db.query('SELECT ora_team_size_target FROM events WHERE id = $1', [eventId]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const target = ev.rows[0].ora_team_size_target || 20;

    const { rows } = await db.query(
      `SELECT a.id, a.ora_team, a.departure_option, a.marshalling_days,
              a.travelling_with_names, a.sharing_with_names, a.role_preference,
              m.preferred_name, (m.forenames || ' ' || m.surname) AS full_name
       FROM applications a JOIN marshals m ON m.id = a.marshal_id
       WHERE a.event_id = $1
         AND a.role_preference IN ('ora','flexible')
         AND a.status NOT IN ('cancelled','no_show')`,
      [eventId]
    );

    const result = autoAssignOra(rows, target);

    // Compute the diff vs current assignment.
    const flaggedIds = new Set(result.flagged.map((f) => f.id));
    let changes = 0;
    const diff = [];
    for (const a of rows) {
      if (flaggedIds.has(a.id)) continue;
      const proposed = result.assignments[a.id];
      if (proposed && proposed !== a.ora_team) {
        changes++;
        diff.push({ id: a.id, name: a.full_name, from: a.ora_team || null, to: proposed });
      }
    }

    const summary = {
      teamA: result.teamA,
      teamB: result.teamB,
      target,
      flagged: result.flagged,
      changes,
      diff,
    };

    if (!commit) {
      return res.json({ committed: false, ...summary });
    }

    // Commit: write proposed teams, all provisional.
    for (const [appId, team] of Object.entries(result.assignments)) {
      await db.query(
        'UPDATE applications SET ora_team = $1, schedule_provisional = TRUE, updated_at = NOW() WHERE id = $2',
        [team, appId]
      );
    }
    res.json({ committed: true, ...summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Auto-assignment failed' });
  }
});

// POST /api/admin/events/:id/schedule/auto-assign-stage — stage AM/PM (preview or commit)
router.post('/admin/events/:id/schedule/auto-assign-stage', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  const commit = req.body && req.body.commit === true;
  try {
    const ev = await db.query('SELECT stage_shift_target FROM events WHERE id = $1', [eventId]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const target = ev.rows[0].stage_shift_target || 10;

    const days = await db.query('SELECT id, day_name, date FROM event_days WHERE event_id = $1 ORDER BY date', [eventId]);

    // Candidates: stage marshals, plus flexible marshals not already on an ORA team.
    const cand = await db.query(
      `SELECT a.id, a.marshalling_days, a.stage_shift_preference, a.role_preference, a.ora_team,
              (m.forenames || ' ' || m.surname) AS name
       FROM applications a JOIN marshals m ON m.id = a.marshal_id
       WHERE a.event_id = $1
         AND a.status NOT IN ('cancelled','no_show')
         AND (a.role_preference = 'stage' OR (a.role_preference = 'flexible' AND a.ora_team IS NULL))`,
      [eventId]
    );

    // Existing assignments to avoid clobbering locked cells and to compute the diff.
    const existRows = await db.query(
      `SELECT sa.application_id, sa.event_day_id, sa.role, sa.provisional
       FROM schedule_assignments sa JOIN applications a ON a.id = sa.application_id
       WHERE a.event_id = $1`,
      [eventId]
    );
    const existing = new Map(existRows.rows.map((r) => [`${r.application_id}:${r.event_day_id}`, { role: r.role, provisional: r.provisional }]));

    const result = autoAssignStage(cand.rows, days.rows, target, existing);

    const summary = {
      target,
      perDay: Object.values(result.perDay),
      flagged: result.flagged,
      changes: result.changes,
      candidates: cand.rows.length,
    };

    if (!commit) return res.json({ committed: false, ...summary });

    for (const as of result.assignments) {
      await db.query(
        `INSERT INTO schedule_assignments (application_id, event_day_id, role, provisional, assigned_by)
         VALUES ($1,$2,$3,TRUE,$4)
         ON CONFLICT (application_id, event_day_id)
         DO UPDATE SET role = EXCLUDED.role, provisional = TRUE, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
        [as.application_id, as.event_day_id, as.role, req.user.userId]
      );
    }
    res.json({ committed: true, ...summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Stage auto-assignment failed' });
  }
});

// PUT /api/admin/events/:id/schedule/lock — mark all non-provisional + notify
router.put('/admin/events/:id/schedule/lock', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  const notify = req.body ? req.body.notify !== false : true;
  try {
    const ev = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const event = ev.rows[0];

    // Which marshals currently have provisional assignments (to notify them).
    const affected = await db.query(
      `SELECT DISTINCT a.id, a.invitation_id, m.id AS marshal_id, m.forenames, m.preferred_name,
              m.surname, m.email, i.token
       FROM applications a
       JOIN marshals m ON m.id = a.marshal_id
       LEFT JOIN invitations i ON i.id = a.invitation_id
       WHERE a.event_id = $1 AND a.status = 'confirmed'
         AND (a.schedule_provisional = TRUE
              OR EXISTS (SELECT 1 FROM schedule_assignments sa WHERE sa.application_id = a.id AND sa.provisional = TRUE))`,
      [eventId]
    );

    await db.query('UPDATE applications SET schedule_provisional = FALSE, updated_at = NOW() WHERE event_id = $1', [eventId]);
    await db.query(
      `UPDATE schedule_assignments sa SET provisional = FALSE
       FROM applications a WHERE sa.application_id = a.id AND a.event_id = $1`,
      [eventId]
    );

    let notified = 0;
    if (notify) {
      for (const m of affected.rows) {
        if (!m.email || !m.token) continue;
        const fields = buildMergeFields({ marshal: m, event, token: m.token });
        const { subject, text } = await renderTemplate('schedule_update', eventId, fields);
        const r = await sendMail({
          to: m.email, subject, text, type: 'schedule_update',
          eventId, marshalId: m.marshal_id, applicationId: m.id, sentBy: req.user.userId,
        });
        if (r.ok) notified++;
      }
    }
    res.json({ ok: true, locked: true, notified });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to lock schedule' });
  }
});

// GET /api/admin/events/:id/schedule/export — CSV of all assignments
router.get('/admin/events/:id/schedule/export', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.surname, m.forenames, m.phone_mobile, a.ora_team,
              ed.day_name, ed.date, sa.role, sa.post, sa.provisional
       FROM schedule_assignments sa
       JOIN applications a ON a.id = sa.application_id
       JOIN marshals m ON m.id = a.marshal_id
       JOIN event_days ed ON ed.id = sa.event_day_id
       WHERE a.event_id = $1
       ORDER BY ed.date, m.surname`,
      [req.params.id]
    );
    const cols = ['surname', 'forenames', 'phone_mobile', 'ora_team', 'day_name', 'date', 'role', 'post', 'provisional'];
    const csv = toCsv(rows, cols);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-event-${req.params.id}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export schedule' });
  }
});

module.exports = router;
