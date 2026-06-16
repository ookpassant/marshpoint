-- ============================================================
-- Marshpoint database schema
-- PostgreSQL 16
-- ============================================================

-- ============================================================
-- USERS (admin roles only — marshals authenticate via token)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,           -- bcrypt hash
  name        VARCHAR(255) NOT NULL,
  role        VARCHAR(50) NOT NULL             -- 'coordinator' | 'committee'
                CHECK (role IN ('coordinator', 'committee')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,   -- e.g. 'GFoS 2026'
  year                  INT NOT NULL,
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  location              VARCHAR(255),
  description           TEXT,
  status                VARCHAR(50) DEFAULT 'draft'
                          CHECK (status IN ('draft', 'inviting', 'closed', 'complete')),
  -- ORA config
  ora_team_size_target  INT DEFAULT 20,          -- marshals per day on ORA
  -- Rally stage config
  stage_shifts_per_day  INT DEFAULT 2,           -- AM + PM
  stage_changeover_time TIME DEFAULT '12:30',
  stage_direction       VARCHAR(20) DEFAULT 'anticlockwise'
                          CHECK (stage_direction IN ('clockwise', 'anticlockwise')),
  -- Shirt pricing
  shirt_price           NUMERIC(6,2) DEFAULT 15.00,
  -- Barbie pricing
  barbie_price          NUMERIC(6,2) DEFAULT 15.00,
  -- Whether shirts have been ordered (gates payment requests)
  shirts_ordered        BOOLEAN DEFAULT FALSE,
  -- BACS payment details shown to marshals
  bacs_account_name     VARCHAR(255),
  bacs_sort_code        VARCHAR(20),
  bacs_account_number   VARCHAR(20),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- EVENT DAYS (one row per calendar day of the event)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_days (
  id          SERIAL PRIMARY KEY,
  event_id    INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  day_name    VARCHAR(20) NOT NULL,              -- 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'
  UNIQUE(event_id, date)
);

-- ============================================================
-- MARSHALS (one record per person, persists across events)
-- ============================================================
CREATE TABLE IF NOT EXISTS marshals (
  id                    SERIAL PRIMARY KEY,
  -- Personal details
  surname               VARCHAR(255) NOT NULL,
  forenames             VARCHAR(255) NOT NULL,
  preferred_name        VARCHAR(255),
  address_line1         VARCHAR(255),
  address_line2         VARCHAR(255),
  address_town          VARCHAR(255),
  address_postcode      VARCHAR(50),
  phone_home            VARCHAR(50),
  phone_work            VARCHAR(50),
  phone_mobile          VARCHAR(50) NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  -- Motorsport credentials
  msuk_licence_number   VARCHAR(100),
  msuk_licence_grades   VARCHAR(255),           -- comma-separated e.g. 'Senior Marshal, Clerk'
  msuk_licence_expiry   DATE,
  licence_upload_path   VARCHAR(500),           -- server filesystem path
  licence_verified      BOOLEAN DEFAULT FALSE,
  licence_verified_by   INT REFERENCES users(id),
  licence_verified_at   TIMESTAMPTZ,
  -- Club membership
  wdmc_member_number    VARCHAR(50),            -- 'TBC' | 'N/A' | actual number
  -- Motorsport interests (stored as array)
  motorsport_interests  TEXT[],                 -- ['Race','Rally','Marshalling', etc.]
  -- Experience
  gfos_years_attended   INT DEFAULT 0,
  ora_experienced       BOOLEAN DEFAULT FALSE,  -- can cover ORA as stage marshal
  -- System
  is_active             BOOLEAN DEFAULT TRUE,
  notes                 TEXT,                   -- coordinator notes on this marshal
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS invitations (
  id              SERIAL PRIMARY KEY,
  event_id        INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  marshal_id      INT REFERENCES marshals(id),   -- NULL if marshal not yet in system
  email           VARCHAR(255) NOT NULL,          -- invite target email
  token           VARCHAR(255) UNIQUE NOT NULL,   -- UUID, used in invite URL
  status          VARCHAR(50) DEFAULT 'sent'
                    CHECK (status IN ('sent', 'opened', 'accepted', 'declined', 'expired')),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  opened_at       TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  reminder_count  INT DEFAULT 0,
  last_reminder   TIMESTAMPTZ,
  created_by      INT REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- APPLICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id                      SERIAL PRIMARY KEY,
  event_id                INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  marshal_id              INT NOT NULL REFERENCES marshals(id),
  invitation_id           INT REFERENCES invitations(id),

  -- Status lifecycle
  status                  VARCHAR(50) DEFAULT 'applied'
                            CHECK (status IN (
                              'applied',        -- form submitted, awaiting review
                              'licence_pending',-- waiting for licence upload/verification
                              'confirmed',      -- Jon has confirmed this marshal
                              'cancelled',      -- marshal cancelled
                              'no_show'         -- didn't turn up
                            )),

  -- Attendance: arrival
  arrival_day             VARCHAR(20)           -- 'Wednesday' | 'Thursday' | 'Friday'
                            CHECK (arrival_day IN ('Wednesday', 'Thursday', 'Friday')),
  arrival_time_approx     TIME,

  -- Attendance: marshalling days (stored as array of day names)
  marshalling_days        TEXT[],               -- ['Thursday','Friday','Saturday','Sunday']

  -- Attendance: departure
  departure_option        VARCHAR(100)
                            CHECK (departure_option IN (
                              'sunday_before_prizes',
                              'sunday_after_prizes',
                              'sunday_after_barbie',
                              'monday_morning'
                            )),

  -- Role
  role_preference         VARCHAR(50)
                            CHECK (role_preference IN ('ora', 'stage', 'flexible')),

  -- Days unavailable (even within attending days — e.g. can't do Thursday morning)
  unavailable_notes       TEXT,

  -- Stage-specific: shift preference
  stage_shift_preference  VARCHAR(20)
                            CHECK (stage_shift_preference IN ('am', 'pm', 'no_preference')),

  -- Accommodation
  accommodation_type      VARCHAR(50)
                            CHECK (accommodation_type IN ('tent', 'caravan', 'campervan')),
  accommodation_size_l    NUMERIC(5,1),         -- length in metres
  accommodation_size_w    NUMERIC(5,1),         -- width in metres
  sharing_with_names      TEXT,                 -- free text names
  travelling_with_names   TEXT,                 -- free text names

  -- Kit
  barbie_attending        BOOLEAN DEFAULT FALSE,

  -- Coordinator scheduling assignments
  ora_team                VARCHAR(5)            -- 'A' | 'B' | null
                            CHECK (ora_team IN ('A', 'B')),
  schedule_provisional    BOOLEAN DEFAULT TRUE, -- all assignments start provisional
  coordinator_notes       TEXT,

  -- Payment
  total_due               NUMERIC(8,2),         -- calculated at submission
  payment_received        BOOLEAN DEFAULT FALSE,
  payment_received_date   DATE,
  payment_method          VARCHAR(50),          -- 'BACS' | 'cash' | 'other'

  -- Declaration
  signature_name          TEXT NOT NULL,
  submitted_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(event_id, marshal_id)                  -- one application per marshal per event
);

-- ============================================================
-- SHIRT ORDERS (separate table: one row per shirt per application)
-- ============================================================
CREATE TABLE IF NOT EXISTS shirt_orders (
  id              SERIAL PRIMARY KEY,
  application_id  INT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  size            VARCHAR(10) NOT NULL
                    CHECK (size IN ('S','M','L','XL','2XL','3XL','4XL')),
  quantity        INT NOT NULL DEFAULT 1,
  unit_price      NUMERIC(6,2) NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SCHEDULE ASSIGNMENTS (granular: marshal → day → shift → post)
-- ============================================================
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id              SERIAL PRIMARY KEY,
  application_id  INT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_day_id    INT NOT NULL REFERENCES event_days(id),
  role            VARCHAR(50) NOT NULL
                    CHECK (role IN ('ora', 'stage_am', 'stage_pm', 'stage_full', 'rest')),
  post            VARCHAR(100),                 -- e.g. 'ORA Post 3', 'Stage Post A', 'Chief'
  provisional     BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  assigned_by     INT REFERENCES users(id),
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(application_id, event_day_id)          -- one assignment per marshal per day
);

-- ============================================================
-- COMMUNICATIONS LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS comms_log (
  id              SERIAL PRIMARY KEY,
  event_id        INT REFERENCES events(id),
  marshal_id      INT REFERENCES marshals(id),
  application_id  INT REFERENCES applications(id),
  type            VARCHAR(50) NOT NULL
                    CHECK (type IN (
                      'invitation',
                      'reminder',
                      'confirmation',
                      'schedule_update',
                      'payment_request',
                      'licence_nudge',
                      'general'
                    )),
  subject         TEXT,
  body_preview    TEXT,                         -- first 500 chars of email body
  sent_to         VARCHAR(255) NOT NULL,
  sent_by         INT REFERENCES users(id),     -- NULL = system automated
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  error           TEXT                          -- NULL = sent OK
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_event ON invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_applications_event ON applications(event_id);
CREATE INDEX IF NOT EXISTS idx_applications_marshal ON applications(marshal_id);
CREATE INDEX IF NOT EXISTS idx_schedule_event_day ON schedule_assignments(event_day_id);
CREATE INDEX IF NOT EXISTS idx_comms_marshal ON comms_log(marshal_id);
