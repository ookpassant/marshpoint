const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireCoordinator } = require('../middleware/auth');
const { defaultStrings, EDITABLE_TYPES, TYPE_LABELS } = require('../email/templates');

const router = express.Router();

// GET /api/admin/email-templates?event_id=<id>  (omit event_id for the global set)
// Returns each editable template's effective text for the requested scope,
// the built-in default (for "reset"), and whether an override exists here.
router.get('/admin/email-templates', requireAuth, async (req, res) => {
  const eventId = req.query.event_id ? Number(req.query.event_id) : null;
  try {
    const { rows } = await db.query(
      'SELECT event_id, type, subject, body, updated_at FROM email_templates WHERE event_id IS NULL OR event_id = $1',
      [eventId]
    );
    const globals = {};
    const eventOv = {};
    for (const r of rows) {
      if (r.event_id === null) globals[r.type] = r;
      else eventOv[r.type] = r;
    }

    const out = EDITABLE_TYPES.map((type) => {
      const def = defaultStrings[type];
      if (eventId) {
        const ov = eventOv[type];
        const inheritedBase = globals[type] || def;
        return {
          type,
          label: TYPE_LABELS[type],
          subject: (ov || inheritedBase).subject,
          body: (ov || inheritedBase).body,
          default_subject: def.subject,
          default_body: def.body,
          has_override: !!ov,
          inherits: globals[type] ? 'global' : 'default',
          scope: 'event',
        };
      }
      const ov = globals[type];
      return {
        type,
        label: TYPE_LABELS[type],
        subject: (ov || def).subject,
        body: (ov || def).body,
        default_subject: def.subject,
        default_body: def.body,
        has_override: !!ov,
        inherits: 'default',
        scope: 'global',
      };
    });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// PUT /api/admin/email-templates  { type, event_id?, subject, body } — upsert override
router.put('/admin/email-templates', requireAuth, requireCoordinator, async (req, res) => {
  const { type, subject, body } = req.body || {};
  const eventId = req.body.event_id ? Number(req.body.event_id) : null;
  if (!EDITABLE_TYPES.includes(type)) return res.status(400).json({ error: 'Unknown template type' });
  if (!subject || !body) return res.status(400).json({ error: 'Subject and body are required' });
  try {
    // Manual upsert keyed on the (partial-unique) scope, since the unique
    // constraint differs for global vs per-event rows.
    const existing = await db.query(
      `SELECT id FROM email_templates WHERE type = $1 AND ${eventId ? 'event_id = $2' : 'event_id IS NULL'}`,
      eventId ? [type, eventId] : [type]
    );
    if (existing.rows[0]) {
      await db.query(
        'UPDATE email_templates SET subject = $1, body = $2, updated_by = $3, updated_at = NOW() WHERE id = $4',
        [subject, body, req.user.userId, existing.rows[0].id]
      );
    } else {
      await db.query(
        'INSERT INTO email_templates (event_id, type, subject, body, updated_by) VALUES ($1,$2,$3,$4,$5)',
        [eventId, type, subject, body, req.user.userId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// DELETE /api/admin/email-templates/:type?event_id=<id> — remove override (reset/inherit)
router.delete('/admin/email-templates/:type', requireAuth, requireCoordinator, async (req, res) => {
  const eventId = req.query.event_id ? Number(req.query.event_id) : null;
  try {
    await db.query(
      `DELETE FROM email_templates WHERE type = $1 AND ${eventId ? 'event_id = $2' : 'event_id IS NULL'}`,
      eventId ? [req.params.type, eventId] : [req.params.type]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset template' });
  }
});

module.exports = router;
