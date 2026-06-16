const express = require('express');
const db = require('../db/pool');
const { upload, supersedeOldLicence } = require('../middleware/upload');
const { sendMail } = require('../email/mailer');
const { templates } = require('../email/templates');
const { buildMergeFields, calculateTotal, formatEventDates } = require('../util/helpers');

const router = express.Router();

// Resolve an invitation token to { invitation, event, marshal }.
async function resolveToken(token) {
  const inv = await db.query('SELECT * FROM invitations WHERE token = $1', [token]);
  if (!inv.rows[0]) return null;
  const invitation = inv.rows[0];
  const ev = await db.query('SELECT * FROM events WHERE id = $1', [invitation.event_id]);
  const event = ev.rows[0] || null;
  let marshal = null;
  if (invitation.marshal_id) {
    const m = await db.query('SELECT * FROM marshals WHERE id = $1', [invitation.marshal_id]);
    marshal = m.rows[0] || null;
  }
  return { invitation, event, marshal };
}

// GET /api/apply/:token — validate token, return pre-fill data
router.get('/apply/:token', async (req, res) => {
  try {
    const ctx = await resolveToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'This invitation link is not valid.' });
    const { invitation, event, marshal } = ctx;

    // Mark opened (first view only).
    if (invitation.status === 'sent') {
      await db.query(
        "UPDATE invitations SET status = 'opened', opened_at = NOW() WHERE id = $1",
        [invitation.id]
      );
    }

    // Is there already a submitted application?
    const existing = await db.query(
      'SELECT id FROM applications WHERE event_id = $1 AND marshal_id = $2',
      [invitation.event_id, invitation.marshal_id]
    );

    res.json({
      event: {
        id: event.id,
        name: event.name,
        year: event.year,
        dates: formatEventDates(event),
        location: event.location,
        description: event.description,
        organisation_name: event.organisation_name || '',
        shirt_price: Number(event.shirt_price),
        addon_enabled: !!event.addon_enabled,
        addon_label: event.addon_label || '',
        addon_price: Number(event.barbie_price),
        stage_changeover_time: event.stage_changeover_time,
        stage_direction: event.stage_direction,
      },
      prefill: {
        email: invitation.email,
        surname: marshal ? marshal.surname : '',
        forenames: marshal ? marshal.forenames : '',
        preferred_name: marshal ? marshal.preferred_name : '',
        phone_mobile: marshal ? marshal.phone_mobile : '',
        msuk_licence_number: marshal ? marshal.msuk_licence_number : '',
        msuk_licence_grades: marshal ? marshal.msuk_licence_grades : '',
        wdmc_member_number: marshal ? marshal.wdmc_member_number : '',
        motorsport_interests: marshal ? marshal.motorsport_interests : [],
        gfos_years_attended: marshal ? marshal.gfos_years_attended : 0,
      },
      already_submitted: existing.rows.length > 0,
      invitation_status: invitation.status,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load invitation' });
  }
});

// POST /api/apply/:token/decline — marshal declines this year
router.post('/apply/:token/decline', async (req, res) => {
  try {
    const ctx = await resolveToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'This invitation link is not valid.' });
    const { invitation, event, marshal } = ctx;
    if (invitation.status === 'accepted') {
      return res.status(409).json({ error: "You've already applied. Email the organisers if your plans have changed." });
    }
    await db.query(
      "UPDATE invitations SET status = 'declined', responded_at = NOW() WHERE id = $1",
      [invitation.id]
    );
    // Let the coordinator know.
    const coordEmail = process.env.EMAIL_FROM_ADDRESS;
    if (coordEmail) {
      const who = marshal ? `${marshal.forenames} ${marshal.surname}` : invitation.email;
      sendMail({
        to: coordEmail,
        subject: `Declined: ${who} — ${event.name}`,
        text: `${who} has declined their invitation to ${event.name}.`,
        type: 'general', eventId: event.id, marshalId: invitation.marshal_id,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record your response' });
  }
});

// POST /api/apply/:token — submit application
router.post('/apply/:token', async (req, res) => {
  const b = req.body || {};
  const client = await db.getClient();
  try {
    const ctx = await resolveToken(req.params.token);
    if (!ctx) { client.release(); return res.status(404).json({ error: 'This invitation link is not valid.' }); }
    const { invitation, event } = ctx;

    // Enforce email match with the invitation (it's read-only on the form).
    const email = invitation.email.toLowerCase().trim();

    // Minimal server-side required validation.
    const required = ['surname', 'forenames', 'phone_mobile', 'msuk_licence_number',
      'msuk_licence_grades', 'wdmc_member_number', 'arrival_day', 'role_preference',
      'departure_option', 'accommodation_type', 'signature_name'];
    const missing = required.filter((f) => !b[f] && b[f] !== 0);
    if (!Array.isArray(b.marshalling_days) || b.marshalling_days.length < 1) missing.push('marshalling_days');
    if (missing.length) {
      client.release();
      return res.status(400).json({ error: 'Missing required fields', fields: missing });
    }

    await client.query('BEGIN');

    // Upsert marshal (by invitation marshal_id, else by email).
    const marshalCols = {
      surname: b.surname,
      forenames: b.forenames,
      preferred_name: b.preferred_name || null,
      address_line1: b.address_line1 || null,
      address_line2: b.address_line2 || null,
      address_town: b.address_town || null,
      address_postcode: b.address_postcode || null,
      phone_mobile: b.phone_mobile,
      phone_home: b.phone_home || null,
      phone_work: b.phone_work || null,
      msuk_licence_number: b.msuk_licence_number || null,
      msuk_licence_grades: b.msuk_licence_grades || null,
      wdmc_member_number: b.wdmc_member_number || null,
      motorsport_interests: Array.isArray(b.motorsport_interests) ? b.motorsport_interests : [],
      gfos_years_attended: b.gfos_years_attended != null ? parseInt(b.gfos_years_attended, 10) : 0,
      ora_experienced: !!b.ora_experienced,
    };

    let marshalId = invitation.marshal_id;
    if (!marshalId) {
      const found = await client.query('SELECT id FROM marshals WHERE email = $1', [email]);
      if (found.rows[0]) marshalId = found.rows[0].id;
    }

    let marshal;
    if (marshalId) {
      const sets = Object.keys(marshalCols).map((k, i) => `${k} = $${i + 1}`);
      const vals = Object.values(marshalCols);
      vals.push(marshalId);
      const r = await client.query(
        `UPDATE marshals SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      marshal = r.rows[0];
    } else {
      const cols = ['email', ...Object.keys(marshalCols)];
      const vals = [email, ...Object.values(marshalCols)];
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      const r = await client.query(
        `INSERT INTO marshals (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        vals
      );
      marshal = r.rows[0];
      marshalId = marshal.id;
      await client.query('UPDATE invitations SET marshal_id = $1 WHERE id = $2', [marshalId, invitation.id]);
    }

    // Cost calculation.
    const shirts = Array.isArray(b.shirts) ? b.shirts.filter((s) => s.size && s.quantity) : [];
    const addonSelected = !!event.addon_enabled && !!b.barbie_attending;
    const { shirtTotal, barbieTotal, total } = calculateTotal({
      shirts,
      barbieAttending: addonSelected,
      shirtPrice: event.shirt_price,
      barbiePrice: event.barbie_price,
    });

    // Status: blocked at licence_pending until a licence file is on record.
    const status = marshal.licence_upload_path ? 'applied' : 'licence_pending';

    // Upsert application (one per event+marshal).
    const appData = {
      event_id: event.id,
      marshal_id: marshalId,
      invitation_id: invitation.id,
      status,
      arrival_day: b.arrival_day || null,
      arrival_time_approx: b.arrival_time_approx || null,
      marshalling_days: b.marshalling_days,
      departure_option: b.departure_option || null,
      role_preference: b.role_preference || null,
      unavailable_notes: b.unavailable_notes || null,
      stage_shift_preference: b.stage_shift_preference || null,
      accommodation_type: b.accommodation_type || null,
      accommodation_size_l: b.accommodation_size_l || null,
      accommodation_size_w: b.accommodation_size_w || null,
      sharing_with_names: b.sharing_with_names || null,
      travelling_with_names: b.travelling_with_names || null,
      barbie_attending: addonSelected,
      years_attended_event: b.years_attended_event != null && b.years_attended_event !== ''
        ? parseInt(b.years_attended_event, 10) : null,
      total_due: total,
      signature_name: b.signature_name,
    };

    const existing = await client.query(
      'SELECT id FROM applications WHERE event_id = $1 AND marshal_id = $2',
      [event.id, marshalId]
    );

    let application;
    if (existing.rows[0]) {
      const keys = Object.keys(appData).filter((k) => !['event_id', 'marshal_id'].includes(k));
      const sets = keys.map((k, i) => `${k} = $${i + 1}`);
      const vals = keys.map((k) => appData[k]);
      vals.push(existing.rows[0].id);
      const r = await client.query(
        `UPDATE applications SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      application = r.rows[0];
      await client.query('DELETE FROM shirt_orders WHERE application_id = $1', [application.id]);
    } else {
      const keys = Object.keys(appData);
      const vals = keys.map((k) => appData[k]);
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      const r = await client.query(
        `INSERT INTO applications (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        vals
      );
      application = r.rows[0];
    }

    // Shirt orders.
    for (const s of shirts) {
      await client.query(
        `INSERT INTO shirt_orders (application_id, size, quantity, unit_price)
         VALUES ($1,$2,$3,$4)`,
        [application.id, s.size, parseInt(s.quantity, 10) || 1, Number(event.shirt_price)]
      );
    }

    // Invitation -> accepted.
    await client.query(
      "UPDATE invitations SET status = 'accepted', responded_at = NOW() WHERE id = $1",
      [invitation.id]
    );

    await client.query('COMMIT');

    // Fire-and-log notification emails (don't block the response on SMTP).
    const fields = buildMergeFields({ marshal, event, token: invitation.token });
    const shirtSummary = shirts.map((s) => `${s.quantity}× ${s.size}`).join(', ') || 'none';

    sendMail({
      ...templates.application_receipt({
        ...fields,
        role_preference: application.role_preference,
        marshalling_days: (application.marshalling_days || []).join(', '),
        shirt_summary: shirtSummary,
        addon_label: event.addon_enabled ? (event.addon_label || 'Optional extra') : '',
        addon_attending: application.barbie_attending,
        total_due: total.toFixed(2),
        licence_outstanding: !marshal.licence_upload_path,
      }),
      to: email, type: 'general',
      eventId: event.id, marshalId, applicationId: application.id,
    }).catch(() => {});

    const coordEmail = process.env.EMAIL_FROM_ADDRESS;
    if (coordEmail) {
      sendMail({
        ...templates.new_application_to_coordinator({
          ...fields,
          marshal_name: fields.marshal_full_name,
          role_preference: application.role_preference,
          marshalling_days: (application.marshalling_days || []).join(', '),
        }),
        to: coordEmail, type: 'general',
        eventId: event.id, marshalId, applicationId: application.id,
      }).catch(() => {});
    }

    res.status(201).json({
      ok: true,
      application_id: application.id,
      status: application.status,
      total_due: total,
      shirt_total: shirtTotal,
      barbie_total: barbieTotal,
      licence_outstanding: !marshal.licence_upload_path,
      status_url: fields.status_url,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Application submit error:', err);
    res.status(500).json({ error: 'Failed to submit application' });
  } finally {
    client.release();
  }
});

// Middleware: resolve token -> set req.uploadEventId / req.uploadMarshalId for multer.
async function prepLicenceUpload(req, res, next) {
  try {
    const ctx = await resolveToken(req.params.token);
    if (!ctx || !ctx.marshal) {
      return res.status(404).json({ error: 'Invitation or marshal not found. Submit your application first.' });
    }
    req.uploadEventId = ctx.event.id;
    req.uploadMarshalId = ctx.marshal.id;
    req._ctx = ctx;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Upload preparation failed' });
  }
}

// POST /api/apply/:token/licence — marshal self-upload
router.post('/apply/:token/licence', prepLicenceUpload, upload.single('licence'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "That file's too large or the wrong type. Try a photo (JPG/PNG) or a PDF under 10MB." });
    }
    const { marshal, event } = req._ctx;
    supersedeOldLicence(marshal.licence_upload_path);
    await db.query(
      'UPDATE marshals SET licence_upload_path = $1, licence_verified = FALSE, licence_verified_by = NULL, licence_verified_at = NULL, updated_at = NOW() WHERE id = $2',
      [req.file.path, marshal.id]
    );
    // If the application was blocked on licence, move it forward to 'applied'.
    await db.query(
      "UPDATE applications SET status = 'applied', updated_at = NOW() WHERE event_id = $1 AND marshal_id = $2 AND status = 'licence_pending'",
      [event.id, marshal.id]
    );
    res.json({ ok: true, filename: req.file.filename });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save licence' });
  }
});

// GET /api/status/:token — marshal's own status summary
router.get('/status/:token', async (req, res) => {
  try {
    const ctx = await resolveToken(req.params.token);
    if (!ctx) return res.status(404).json({ error: 'This link is not valid.' });
    const { invitation, event, marshal } = ctx;

    if (!marshal) {
      return res.json({ event: { name: event.name }, has_application: false, invitation_status: invitation.status });
    }

    const appRes = await db.query(
      'SELECT * FROM applications WHERE event_id = $1 AND marshal_id = $2',
      [event.id, marshal.id]
    );
    const application = appRes.rows[0];
    if (!application) {
      return res.json({ event: { name: event.name }, marshal: { name: marshal.preferred_name || marshal.forenames }, has_application: false });
    }

    const shirts = await db.query('SELECT size, quantity, unit_price FROM shirt_orders WHERE application_id = $1', [application.id]);

    // Schedule assignments (with day names).
    const sched = await db.query(
      `SELECT sa.role, sa.post, sa.provisional, ed.day_name, ed.date
       FROM schedule_assignments sa
       JOIN event_days ed ON ed.id = sa.event_day_id
       WHERE sa.application_id = $1
       ORDER BY ed.date`,
      [application.id]
    );

    res.json({
      has_application: true,
      event: {
        name: event.name,
        dates: formatEventDates(event),
        organisation_name: event.organisation_name || '',
        addon_enabled: !!event.addon_enabled,
        addon_label: event.addon_label || '',
        bacs_account_name: event.bacs_account_name,
        bacs_sort_code: event.bacs_sort_code,
        bacs_account_number: event.bacs_account_number,
      },
      marshal: {
        name: marshal.preferred_name || marshal.forenames,
        full_name: `${marshal.forenames} ${marshal.surname}`,
        licence_uploaded: !!marshal.licence_upload_path,
        licence_verified: marshal.licence_verified,
      },
      application: {
        status: application.status,
        ora_team: application.ora_team,
        role_preference: application.role_preference,
        marshalling_days: application.marshalling_days,
        arrival_day: application.arrival_day,
        departure_option: application.departure_option,
        accommodation_type: application.accommodation_type,
        barbie_attending: application.barbie_attending,
        total_due: Number(application.total_due || 0),
        payment_received: application.payment_received,
        schedule_provisional: application.schedule_provisional,
      },
      shirts: shirts.rows,
      schedule: sched.rows,
      token: invitation.token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load status' });
  }
});

module.exports = router;
