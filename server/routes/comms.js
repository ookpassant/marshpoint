const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { sendMail } = require('../email/mailer');
const { templates } = require('../email/templates');
const { buildMergeFields, calculateTotal } = require('../util/helpers');

const router = express.Router();

// GET /api/admin/events/:id/comms — comms log (filterable by type)
router.get('/admin/events/:id/comms', requireAuth, async (req, res) => {
  const params = [req.params.id];
  let sql = `SELECT c.*, u.name AS sent_by_name
             FROM comms_log c LEFT JOIN users u ON u.id = c.sent_by
             WHERE c.event_id = $1`;
  if (req.query.type) { sql += ' AND c.type = $2'; params.push(req.query.type); }
  sql += ' ORDER BY c.sent_at DESC';
  try {
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load comms log' });
  }
});

// Resolve recipients for an event given a recipient group or explicit ids.
// Returns rows with marshal + invitation + application context.
async function resolveRecipients(eventId, body) {
  const group = body.recipients || 'specific';
  const base = `
    SELECT a.id AS application_id, a.total_due, a.payment_received, a.barbie_attending,
           m.id AS marshal_id, m.forenames, m.preferred_name, m.surname, m.email,
           m.licence_upload_path, m.licence_verified,
           i.token, i.status AS invite_status,
           a.status AS app_status
    FROM invitations i
    LEFT JOIN marshals m ON m.id = i.marshal_id
    LEFT JOIN applications a ON a.invitation_id = i.id
    WHERE i.event_id = $1`;
  const params = [eventId];

  let sql = base;
  if (group === 'all') {
    // all invited
  } else if (group === 'non_responders') {
    sql += ` AND i.status IN ('sent','opened')`;
  } else if (group === 'confirmed') {
    sql += ` AND a.status = 'confirmed'`;
  } else if (group === 'unpaid') {
    sql += ` AND a.status = 'confirmed' AND a.payment_received = FALSE`;
  } else if (group === 'licence_missing') {
    sql += ` AND (m.licence_upload_path IS NULL OR m.licence_verified = FALSE)`;
  } else if (group === 'specific') {
    if (Array.isArray(body.marshal_ids) && body.marshal_ids.length) {
      sql += ` AND m.id = ANY($2)`;
      params.push(body.marshal_ids);
    } else {
      return [];
    }
  }
  const { rows } = await db.query(sql, params);
  return rows;
}

// Generic template send to a resolved recipient list.
async function sendToRecipients({ eventId, event, recipients, templateName, type, userId, customSubject, customBody }) {
  let sent = 0;
  const errors = [];
  for (const r of recipients) {
    if (!r.email) continue;
    const fields = buildMergeFields({
      marshal: { forenames: r.forenames, preferred_name: r.preferred_name, surname: r.surname, email: r.email },
      event,
      token: r.token,
    });

    let subject, text;
    if (templateName === 'custom') {
      subject = renderMerge(customSubject || '', fields);
      text = renderMerge(customBody || '', fields);
    } else if (templateName === 'payment_request') {
      const shirtTotal = Number(r.total_due || 0) - (r.barbie_attending ? Number(event.barbie_price) : 0);
      const built = templates.payment_request({
        ...fields,
        total_due: Number(r.total_due || 0).toFixed(2),
        shirt_total: Math.max(0, shirtTotal).toFixed(2),
        barbie_total: (r.barbie_attending ? Number(event.barbie_price) : 0).toFixed(2),
        bacs_account_name: event.bacs_account_name,
        bacs_sort_code: event.bacs_sort_code,
        bacs_account_number: event.bacs_account_number,
      });
      subject = built.subject; text = built.text;
    } else {
      const built = templates[templateName](fields);
      subject = built.subject; text = built.text;
    }

    const result = await sendMail({
      to: r.email, subject, text, type,
      eventId, marshalId: r.marshal_id, applicationId: r.application_id, sentBy: userId,
    });
    if (result.ok) sent++;
    else errors.push({ email: r.email, error: result.error });
  }
  return { sent, total: recipients.length, errors };
}

function renderMerge(str, fields) {
  return String(str).replace(/\{\{(\w+)\}\}/g, (_, k) => (fields[k] != null ? fields[k] : ''));
}

async function loadEvent(eventId) {
  const r = await db.query('SELECT * FROM events WHERE id = $1', [eventId]);
  return r.rows[0] || null;
}

// POST /api/admin/events/:id/comms/invite
router.post('/admin/events/:id/comms/invite', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  try {
    const event = await loadEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const recipients = await resolveRecipients(eventId, req.body);
    const out = await sendToRecipients({ eventId, event, recipients, templateName: 'invitation', type: 'invitation', userId: req.user.userId });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send invitations' });
  }
});

// POST /api/admin/events/:id/comms/remind
router.post('/admin/events/:id/comms/remind', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  try {
    const event = await loadEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const recipients = await resolveRecipients(eventId, { recipients: req.body.recipients || 'non_responders', marshal_ids: req.body.marshal_ids });
    const out = await sendToRecipients({ eventId, event, recipients, templateName: 'reminder', type: 'reminder', userId: req.user.userId });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

// POST /api/admin/events/:id/comms/payment-request (blocked until shirts ordered)
router.post('/admin/events/:id/comms/payment-request', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  try {
    const event = await loadEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (!event.shirts_ordered) {
      return res.status(409).json({ error: 'Payment requests are blocked until shirts have been ordered. Tick "shirts ordered" on the event first.' });
    }
    const recipients = await resolveRecipients(eventId, { recipients: req.body.recipients || 'unpaid', marshal_ids: req.body.marshal_ids });
    const out = await sendToRecipients({ eventId, event, recipients, templateName: 'payment_request', type: 'payment_request', userId: req.user.userId });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send payment requests' });
  }
});

// POST /api/admin/events/:id/comms/schedule-update
router.post('/admin/events/:id/comms/schedule-update', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  try {
    const event = await loadEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const recipients = await resolveRecipients(eventId, { recipients: req.body.recipients || 'confirmed', marshal_ids: req.body.marshal_ids });
    const out = await sendToRecipients({ eventId, event, recipients, templateName: 'schedule_update', type: 'schedule_update', userId: req.user.userId });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send schedule updates' });
  }
});

// POST /api/admin/events/:id/comms/send — generic template+recipients (Send tab)
router.post('/admin/events/:id/comms/send', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.params.id;
  const { template, subject, body } = req.body || {};
  const typeMap = {
    invitation: 'invitation', reminder: 'reminder', confirmation: 'confirmation',
    schedule_update: 'schedule_update', payment_request: 'payment_request',
    licence_nudge: 'licence_nudge', custom: 'general',
  };
  if (!template || !typeMap[template]) return res.status(400).json({ error: 'Unknown template' });
  try {
    const event = await loadEvent(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (template === 'payment_request' && !event.shirts_ordered) {
      return res.status(409).json({ error: 'Payment requests are blocked until shirts have been ordered.' });
    }
    const recipients = await resolveRecipients(eventId, req.body);
    const out = await sendToRecipients({
      eventId, event, recipients,
      templateName: template, type: typeMap[template], userId: req.user.userId,
      customSubject: subject, customBody: body,
    });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send emails' });
  }
});

// POST /api/admin/comms/individual — email a specific marshal (needs event + marshal)
router.post('/admin/comms/individual', requireAuth, requireCoordinator, async (req, res) => {
  const { event_id, marshal_id, subject, body, type } = req.body || {};
  if (!event_id || !marshal_id || !subject || !body) {
    return res.status(400).json({ error: 'event_id, marshal_id, subject and body are required' });
  }
  try {
    const event = await loadEvent(event_id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const mr = await db.query('SELECT * FROM marshals WHERE id = $1', [marshal_id]);
    if (!mr.rows[0]) return res.status(404).json({ error: 'Marshal not found' });
    const marshal = mr.rows[0];
    const inv = await db.query('SELECT token FROM invitations WHERE event_id = $1 AND marshal_id = $2 LIMIT 1', [event_id, marshal_id]);
    const app = await db.query('SELECT id FROM applications WHERE event_id = $1 AND marshal_id = $2 LIMIT 1', [event_id, marshal_id]);
    const fields = buildMergeFields({ marshal, event, token: inv.rows[0] && inv.rows[0].token });
    const result = await sendMail({
      to: marshal.email,
      subject: renderMerge(subject, fields),
      text: renderMerge(body, fields),
      type: type || 'general',
      eventId: event_id, marshalId: marshal_id,
      applicationId: app.rows[0] && app.rows[0].id,
      sentBy: req.user.userId,
    });
    if (!result.ok) return res.status(502).json({ error: 'Email failed', detail: result.error });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
