const nodemailer = require('nodemailer');
const db = require('../db/pool');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

function fromAddress() {
  const name = process.env.EMAIL_FROM_NAME || 'Marshpoint';
  const addr = process.env.EMAIL_FROM_ADDRESS || 'noreply@marshpoint.co.uk';
  return `"${name}" <${addr}>`;
}

/**
 * Send an email and record it in comms_log.
 *
 * @param {object} opts
 * @param {string} opts.to            recipient email
 * @param {string} opts.subject       email subject
 * @param {string} opts.text          plain-text body
 * @param {string} [opts.type]        comms_log type (default 'general')
 * @param {number} [opts.eventId]
 * @param {number} [opts.marshalId]
 * @param {number} [opts.applicationId]
 * @param {number} [opts.sentBy]      user id, or null for system
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function sendMail(opts) {
  const {
    to,
    subject,
    text,
    type = 'general',
    eventId = null,
    marshalId = null,
    applicationId = null,
    sentBy = null,
  } = opts;

  let error = null;
  try {
    await getTransporter().sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
    });
  } catch (err) {
    error = err.message;
    console.error(`Email to ${to} failed:`, err.message);
  }

  // Always log the attempt (error column is NULL on success).
  try {
    await db.query(
      `INSERT INTO comms_log
        (event_id, marshal_id, application_id, type, subject, body_preview, sent_to, sent_by, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        eventId,
        marshalId,
        applicationId,
        type,
        subject,
        (text || '').slice(0, 500),
        to,
        sentBy,
        error,
      ]
    );
  } catch (logErr) {
    console.error('Failed to write comms_log entry:', logErr.message);
  }

  return { ok: !error, error };
}

module.exports = { sendMail, getTransporter };
