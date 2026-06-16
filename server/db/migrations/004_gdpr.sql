-- UK GDPR / Data Protection Act 2018 support.

-- Record the consent given at application time (lawful basis + accountability).
ALTER TABLE applications ADD COLUMN IF NOT EXISTS agreed_constitution BOOLEAN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS agreed_contact BOOLEAN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS agreed_privacy BOOLEAN;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS privacy_policy_version VARCHAR(50);

-- Mark a marshal whose personal data has been erased/anonymised (the row is
-- kept for referential integrity but all PII is scrubbed).
ALTER TABLE marshals ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ;

-- Accountability: a log of data-processing actions (access/export/erasure/etc.).
CREATE TABLE IF NOT EXISTS processing_log (
  id              SERIAL PRIMARY KEY,
  action          VARCHAR(50) NOT NULL,   -- 'consent' | 'export' | 'export_self'
                                          -- 'erasure' | 'erasure_request'
                                          -- 'licence_download' | 'retention_purge'
  marshal_id      INT,
  application_id  INT,
  event_id        INT,
  performed_by    INT REFERENCES users(id),  -- NULL = the data subject or the system
  detail          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_processing_log_marshal ON processing_log(marshal_id);
CREATE INDEX IF NOT EXISTS idx_processing_log_action ON processing_log(action);
