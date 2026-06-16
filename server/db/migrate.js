// Lightweight forward-only migration runner.
//
// Applies every *.sql file in db/migrations/ (lexicographic order) that hasn't
// already been recorded in the schema_migrations table. Each migration runs in
// its own transaction, so a failure rolls back cleanly and leaves earlier
// migrations applied.
//
//   npm run migrate
//
// Also exported as runMigrations(pool) for use in tests/seed.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function runMigrations(pool = db, { log = false } = {}) {
  const say = (m) => { if (log) console.log(m); };

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const appliedRes = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map((r) => r.filename));

  const ran = [];
  for (const file of files) {
    if (applied.has(file)) { say(`  · ${file} (already applied)`); continue; }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.getClient();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
      say(`  ✓ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }
  return ran;
}

module.exports = { runMigrations };

// CLI entrypoint.
if (require.main === module) {
  console.log('Running migrations...');
  runMigrations(db, { log: true })
    .then((ran) => {
      console.log(ran.length ? `Applied ${ran.length} migration(s).` : 'Database already up to date.');
      return db.pool.end();
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
