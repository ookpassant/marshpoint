-- Make the system club- and event-agnostic.

-- The organising club/section, per event (used in emails and the BACS reference).
ALTER TABLE events ADD COLUMN IF NOT EXISTS organisation_name VARCHAR(255);

-- Generalise the hardcoded "Sunday barbie" into a configurable optional paid
-- add-on per event. The existing barbie_price column is reused as the add-on
-- price, and applications.barbie_attending as the "add-on selected" flag.
ALTER TABLE events ADD COLUMN IF NOT EXISTS addon_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS addon_label VARCHAR(255);

-- Optional: how many years this marshal has attended THIS event before
-- (distinct from overall marshalling experience held on the marshal record).
ALTER TABLE applications ADD COLUMN IF NOT EXISTS years_attended_event INT;
