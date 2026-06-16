const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { sendMail } = require('../email/mailer');
const { renderTemplate } = require('../email/render');
const { buildMergeFields } = require('../util/helpers');

const router = express.Router();

// GET /api/admin/events/:id/invitations — list invitations for event
router.get('/admin/events/:id/invitations', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT i.*, m.surname, m.forenames, m.preferred_name,
              (SELECT id FROM applications a WHERE a.invitation_id = i.id LIMIT 1) AS application_id
       FROM invitations i
       LEFT JOIN marshals m ON m.id = i.marshal_id
       WHERE i.event_id = $1
       ORDER BY i.sent_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list invitations' });
  }
});

// Create one invitation row and (optionally) send the invite email.
async function createOne(eventId, item, userId, event, sendEmail) {
  const email = (item.email || '').toLowerCase().trim();
  if (!email) return { error: 'Missing email', email };

  // Link to an existing marshal by id or matching email.
  let marshalId = item.marshal_id || null;
  let marshal = null;
  if (marshalId) {
    const r = await db.query('SELECT * FROM marshals WHERE id = $1', [marshalId]);
    marshal = r.rows[0] || null;
  } else {
    const r = await db.query('SELECT * FROM marshals WHERE email = $1', [email]);
    if (r.rows[0]) { marshal = r.rows[0]; marshalId = marshal.id; }
  }

  const token = uuidv4();
  const { rows } = await db.query(
    `INSERT INTO invitations (event_id, marshal_id, email, token, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [eventId, marshalId, email, token, userId]
  );
  const invitation = rows[0];

  if (sendEmail) {
    const fields = buildMergeFields({
      marshal: marshal || { forenames: email.split('@')[0], preferred_name: null, surname: '', email },
      event,
      token,
    });
    const { subject, text } = await renderTemplate('invitation', eventId, fields);
    await sendMail({
      to: email, subject, text, type: 'invitation',
      eventId, marshalId, sentBy: userId,
    });
  }

  return { invitation };
}

// POST /api/admin/events/:id/invitations — single or bulk (array in body.invitations)
router.post('/admin/events/:id/invitations', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  const sendEmail = req.body.send !== false; // default: send
  try {
    const ev = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const event = ev.rows[0];

    const items = Array.isArray(req.body.invitations)
      ? req.body.invitations
      : [{ email: req.body.email, marshal_id: req.body.marshal_id }];

    const created = [];
    const errors = [];
    for (const item of items) {
      try {
        const r = await createOne(eventId, item, req.user.userId, event, sendEmail);
        if (r.error) errors.push(r);
        else created.push(r.invitation);
      } catch (e) {
        errors.push({ email: item.email, error: e.message });
      }
    }
    res.status(201).json({ created, errors, count: created.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create invitations' });
  }
});

// POST /api/admin/events/:id/invitations/remind — remind non-responders
router.post('/admin/events/:id/invitations/remind', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  try {
    const ev = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
    if (!ev.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const event = ev.rows[0];

    // Optionally restrict to specific invitation ids.
    const ids = Array.isArray(req.body.invitation_ids) ? req.body.invitation_ids : null;
    const params = [eventId];
    let sql = `SELECT i.*, m.forenames, m.preferred_name, m.surname
               FROM invitations i LEFT JOIN marshals m ON m.id = i.marshal_id
               WHERE i.event_id = $1 AND i.status IN ('sent','opened')`;
    if (ids && ids.length) {
      sql += ` AND i.id = ANY($2)`;
      params.push(ids);
    }
    const { rows } = await db.query(sql, params);

    let sent = 0;
    for (const inv of rows) {
      const fields = buildMergeFields({
        marshal: { forenames: inv.forenames || inv.email.split('@')[0], preferred_name: inv.preferred_name, surname: inv.surname || '', email: inv.email },
        event,
        token: inv.token,
      });
      const { subject, text } = await renderTemplate('reminder', eventId, fields);
      const r = await sendMail({
        to: inv.email, subject, text, type: 'reminder',
        eventId, marshalId: inv.marshal_id, sentBy: req.user.userId,
      });
      if (r.ok) {
        sent++;
        await db.query(
          'UPDATE invitations SET reminder_count = reminder_count + 1, last_reminder = NOW() WHERE id = $1',
          [inv.id]
        );
      }
    }
    res.json({ sent, total: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

// PUT /api/admin/invitations/:id — update status
router.put('/admin/invitations/:id', requireAuth, requireCoordinator, async (req, res) => {
  const { status } = req.body || {};
  const valid = ['sent', 'opened', 'accepted', 'declined', 'expired'];
  if (status && !valid.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE invitations
       SET status = COALESCE($1, status),
           responded_at = CASE WHEN $1 IN ('accepted','declined') THEN NOW() ELSE responded_at END
       WHERE id = $2 RETURNING *`,
      [status || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Invitation not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update invitation' });
  }
});

// DELETE /api/admin/invitations/:id — revoke
router.delete('/admin/invitations/:id', requireAuth, requireCoordinator, async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM invitations WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Invitation not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to revoke invitation' });
  }
});

module.exports = router;
