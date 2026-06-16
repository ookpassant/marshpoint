// Data-retention purge. Anonymises marshals whose most recent event ended (or,
// if they never applied, who were created) more than RETENTION_DAYS ago, and
// deletes their licence files. Idempotent — already-anonymised records are
// skipped.
//
//   node db/retention.js            # purge
//   node db/retention.js --dry-run  # list what would be purged, change nothing
//
// Intended to be run on a schedule (e.g. a daily cron / systemd timer).

require('dotenv').config();
const db = require('./pool');
const { RETENTION_DAYS, anonymiseMarshal } = require('../util/gdpr');

async function findExpired() {
  const { rows } = await db.query(
    `SELECT m.id, COALESCE(MAX(e.end_date), m.created_at::date) AS last_activity
     FROM marshals m
     LEFT JOIN applications a ON a.marshal_id = m.id
     LEFT JOIN events e ON e.id = a.event_id
     WHERE m.anonymised_at IS NULL
     GROUP BY m.id, m.created_at
     HAVING COALESCE(MAX(e.end_date), m.created_at::date) < CURRENT_DATE - $1::int`,
    [RETENTION_DAYS]
  );
  return rows;
}

async function run({ dryRun = false } = {}) {
  const expired = await findExpired();
  if (!expired.length) {
    console.log(`No records past the ${RETENTION_DAYS}-day retention window.`);
    return { purged: 0 };
  }
  console.log(`${expired.length} marshal record(s) past the ${RETENTION_DAYS}-day window:`);
  let purged = 0;
  for (const r of expired) {
    if (dryRun) {
      console.log(`  - marshal ${r.id} (last activity ${r.last_activity}) — would anonymise`);
      continue;
    }
    const res = await anonymiseMarshal(r.id, null, 'retention_purge');
    if (res.ok) { purged += 1; console.log(`  ✓ anonymised marshal ${r.id} (${res.filesRemoved} file(s) deleted)`); }
  }
  return { purged };
}

module.exports = { run, findExpired };

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  run({ dryRun })
    .then((r) => {
      if (!dryRun) console.log(`Done. ${r.purged} record(s) anonymised.`);
      return db.pool.end();
    })
    .catch((err) => { console.error(err); process.exit(1); });
}
