// Resolve and render the six editable email templates:
//   per-event override -> global override -> built-in default,
// then substitute {{merge}} fields.

const db = require('../db/pool');
const { defaultStrings } = require('./templates');

// Replace {{field}} tokens; unknown/empty tokens render as ''.
function renderMerge(str, data) {
  return String(str == null ? '' : str).replace(/\{\{(\w+)\}\}/g, (_, k) => (data[k] != null ? data[k] : ''));
}

// Fetch the most specific stored template for (type, eventId): the per-event
// row if present, otherwise the global row, otherwise null.
async function getOverride(type, eventId) {
  const { rows } = await db.query(
    `SELECT event_id, subject, body FROM email_templates
     WHERE type = $1 AND (event_id = $2 OR event_id IS NULL)
     ORDER BY event_id NULLS LAST
     LIMIT 1`,
    [type, eventId || null]
  );
  return rows[0] || null;
}

// Returns { subject, text } for a recipient. `data` is the full merge object.
async function renderTemplate(type, eventId, data) {
  const tpl = (await getOverride(type, eventId)) || defaultStrings[type];
  if (!tpl) throw new Error(`Unknown email template: ${type}`);
  return { subject: renderMerge(tpl.subject, data), text: renderMerge(tpl.body, data) };
}

module.exports = { renderMerge, getOverride, renderTemplate };
