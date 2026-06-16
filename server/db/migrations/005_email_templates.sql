-- Admin-editable email templates: global defaults with optional per-event
-- overrides. Resolution order is per-event override -> global -> built-in code
-- default. A missing row simply falls back to the next level.
CREATE TABLE IF NOT EXISTS email_templates (
  id          SERIAL PRIMARY KEY,
  event_id    INT REFERENCES events(id) ON DELETE CASCADE,  -- NULL = global
  type        VARCHAR(50) NOT NULL,   -- invitation | reminder | confirmation
                                      -- schedule_update | payment_request | licence_nudge
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated_by  INT REFERENCES users(id),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One global row per type, and one override row per (event, type).
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_tpl_global ON email_templates(type) WHERE event_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_tpl_event ON email_templates(event_id, type) WHERE event_id IS NOT NULL;
