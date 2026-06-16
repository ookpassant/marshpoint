// GDPR helpers: processing-log audit trail, licence-file deletion, and
// marshal anonymisation.

const fs = require('fs');
const path = require('path');
const db = require('../db/pool');

// Current privacy-notice version presented to applicants. Bump when the policy
// text changes so you can see which version each person consented to.
const PRIVACY_POLICY_VERSION = process.env.PRIVACY_POLICY_VERSION || '1.0';

// Default retention window for the purge job (days). ~3 years by default.
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS, 10) || 1095;

// Append an entry to the processing log (best-effort; never throws).
async function logProcessing(action, { marshalId = null, applicationId = null, eventId = null, performedBy = null, detail = null } = {}) {
  try {
    await db.query(
      `INSERT INTO processing_log (action, marshal_id, application_id, event_id, performed_by, detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [action, marshalId, applicationId, eventId, performedBy, detail]
    );
  } catch (err) {
    console.error('processing_log write failed:', err.message);
  }
}

// Permanently delete a marshal's licence file and any retained .superseded
// copies in the same directory. Returns the number of files removed.
function deleteLicenceFiles(licencePath) {
  let removed = 0;
  if (!licencePath) return removed;
  try {
    const dir = path.dirname(licencePath);
    const baseName = path.basename(licencePath);
    if (fs.existsSync(licencePath)) { fs.unlinkSync(licencePath); removed += 1; }
    // Remove superseded copies: "<original>.superseded.<ts>".
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith(`${baseName}.superseded`)) {
          fs.unlinkSync(path.join(dir, f));
          removed += 1;
        }
      }
    }
  } catch (err) {
    console.error('Licence file deletion failed:', err.message);
  }
  return removed;
}

// Anonymise a marshal: scrub all PII, delete licence files, keep the row so
// applications/schedule history stays referentially intact. Idempotent.
// Returns { alreadyAnonymised } or throws on DB error.
async function anonymiseMarshal(marshalId, performedBy, reason = 'erasure') {
  const cur = await db.query('SELECT licence_upload_path, anonymised_at FROM marshals WHERE id = $1', [marshalId]);
  if (!cur.rows[0]) return { notFound: true };
  if (cur.rows[0].anonymised_at) return { alreadyAnonymised: true };

  const filesRemoved = deleteLicenceFiles(cur.rows[0].licence_upload_path);

  // Unique non-identifying placeholder email to preserve the UNIQUE constraint.
  const placeholderEmail = `erased+${marshalId}@anonymised.invalid`;
  await db.query(
    `UPDATE marshals SET
       surname = 'Erased', forenames = 'Erased', preferred_name = NULL,
       address_line1 = NULL, address_line2 = NULL, address_town = NULL, address_postcode = NULL,
       phone_home = NULL, phone_work = NULL, phone_mobile = 'erased',
       email = $2,
       msuk_licence_number = NULL, msuk_licence_grades = NULL, msuk_licence_expiry = NULL,
       licence_upload_path = NULL, licence_verified = FALSE,
       wdmc_member_number = NULL, motorsport_interests = NULL,
       notes = NULL, is_active = FALSE, anonymised_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [marshalId, placeholderEmail]
  );
  // Scrub free-text PII held on the marshal's applications too.
  await db.query(
    `UPDATE applications SET
       sharing_with_names = NULL, travelling_with_names = NULL,
       unavailable_notes = NULL, coordinator_notes = NULL, signature_name = 'Erased', updated_at = NOW()
     WHERE marshal_id = $1`,
    [marshalId]
  );

  await logProcessing(reason, { marshalId, performedBy, detail: `Anonymised; ${filesRemoved} licence file(s) deleted` });
  return { ok: true, filesRemoved };
}

// Assemble everything held about a marshal, for a subject-access request.
async function buildDataPack(marshalId) {
  const [marshal, apps, shirts, schedule, invites, comms, processing] = await Promise.all([
    db.query('SELECT * FROM marshals WHERE id = $1', [marshalId]),
    db.query('SELECT * FROM applications WHERE marshal_id = $1', [marshalId]),
    db.query(
      `SELECT s.* FROM shirt_orders s JOIN applications a ON a.id = s.application_id WHERE a.marshal_id = $1`,
      [marshalId]
    ),
    db.query(
      `SELECT sa.*, ed.day_name, ed.date FROM schedule_assignments sa
       JOIN applications a ON a.id = sa.application_id
       JOIN event_days ed ON ed.id = sa.event_day_id WHERE a.marshal_id = $1`,
      [marshalId]
    ),
    db.query('SELECT id, event_id, email, status, sent_at, responded_at FROM invitations WHERE marshal_id = $1', [marshalId]),
    db.query('SELECT id, type, subject, sent_to, sent_at FROM comms_log WHERE marshal_id = $1 ORDER BY sent_at', [marshalId]),
    db.query('SELECT action, detail, created_at FROM processing_log WHERE marshal_id = $1 ORDER BY created_at', [marshalId]),
  ]);

  if (!marshal.rows[0]) return null;
  const m = marshal.rows[0];

  // Present the marshal record without server-internal fields; note (don't
  // expose the path of) any licence document held.
  const { licence_upload_path, ...marshalSafe } = m;

  return {
    generated_at: new Date().toISOString(),
    notice: 'This is a copy of the personal data Marshpoint holds about you.',
    personal_details: marshalSafe,
    licence_document_held: !!licence_upload_path,
    applications: apps.rows,
    shirt_orders: shirts.rows,
    schedule_assignments: schedule.rows,
    invitations: invites.rows,
    emails_sent_to_you: comms.rows,
    processing_history: processing.rows,
  };
}

module.exports = {
  PRIVACY_POLICY_VERSION,
  RETENTION_DAYS,
  logProcessing,
  deleteLicenceFiles,
  anonymiseMarshal,
  buildDataPack,
};
