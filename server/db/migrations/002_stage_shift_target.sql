-- Rally stage team is a first-class team alongside ORA: give it a per-shift
-- staffing target (marshals needed on each AM and PM stage shift, per day).
ALTER TABLE events ADD COLUMN IF NOT EXISTS stage_shift_target INT DEFAULT 10;
