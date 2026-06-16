// Seed script: creates admin users, an example event, a few test marshals,
// and test invitations. Idempotent-ish — safe to re-run (uses upserts on email).
//
//   node db/seed.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./pool');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

async function upsertUser(email, name, role, password) {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (email, name, role, password) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password = EXCLUDED.password
     RETURNING id`,
    [email, name, role, hash]
  );
  return rows[0].id;
}

async function main() {
  console.log('Seeding Marshpoint database...');

  const coordinatorId = await upsertUser('jon@marshpoint.co.uk', 'Jon', 'coordinator', 'changeme123');
  await upsertUser('committee@marshpoint.co.uk', 'Committee Member', 'committee', 'changeme123');
  console.log('  ✓ admin users');

  // Example event: GFoS 2026 (Thu 9 - Sun 12 July 2026).
  let event;
  const existing = await db.query("SELECT * FROM events WHERE name = 'GFoS 2026'");
  if (existing.rows[0]) {
    event = existing.rows[0];
  } else {
    const r = await db.query(
      `INSERT INTO events
        (name, year, start_date, end_date, location, description, status,
         ora_team_size_target, stage_direction, shirt_price, barbie_price,
         bacs_account_name, bacs_sort_code, bacs_account_number)
       VALUES ('GFoS 2026', 2026, '2026-07-09', '2026-07-12',
               'Goodwood, West Sussex', 'Welbeck & District MC marshalling team at the Festival of Speed.',
               'inviting', 20, 'anticlockwise', 15.00, 15.00,
               'WDMC GFoS Account', '00-00-00', '12345678')
       RETURNING *`
    );
    event = r.rows[0];
  }
  // Event days.
  for (let d = new Date(event.start_date); d <= new Date(event.end_date); d.setUTCDate(d.getUTCDate() + 1)) {
    await db.query(
      `INSERT INTO event_days (event_id, date, day_name) VALUES ($1,$2,$3)
       ON CONFLICT (event_id, date) DO NOTHING`,
      [event.id, d.toISOString().slice(0, 10), DAY_NAMES[d.getUTCDay()]]
    );
  }
  console.log(`  ✓ event "${event.name}" (id ${event.id})`);

  // Test marshals.
  const testMarshals = [
    { surname: 'Briggs', forenames: 'Sarah', email: 'sarah.briggs@example.com', phone_mobile: '07700900001', msuk_licence_number: 'MS123456', msuk_licence_grades: 'Senior Marshal', wdmc_member_number: '1024', ora_experienced: true },
    { surname: 'Okafor', forenames: 'Daniel', email: 'daniel.okafor@example.com', phone_mobile: '07700900002', msuk_licence_number: 'MS223344', msuk_licence_grades: 'Marshal', wdmc_member_number: 'TBC', ora_experienced: false },
    { surname: 'Hughes', forenames: 'Megan', email: 'megan.hughes@example.com', phone_mobile: '07700900003', msuk_licence_number: 'MS998877', msuk_licence_grades: 'Senior Marshal, Incident Officer', wdmc_member_number: '0876', ora_experienced: true },
  ];

  for (const m of testMarshals) {
    const r = await db.query(
      `INSERT INTO marshals (surname, forenames, email, phone_mobile, msuk_licence_number, msuk_licence_grades, wdmc_member_number, ora_experienced)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (email) DO UPDATE SET surname = EXCLUDED.surname
       RETURNING id`,
      [m.surname, m.forenames, m.email, m.phone_mobile, m.msuk_licence_number, m.msuk_licence_grades, m.wdmc_member_number, m.ora_experienced]
    );
    const marshalId = r.rows[0].id;
    // Invitation (one per marshal for this event).
    const existingInv = await db.query('SELECT id, token FROM invitations WHERE event_id = $1 AND marshal_id = $2', [event.id, marshalId]);
    if (existingInv.rows[0]) {
      console.log(`  · invite for ${m.forenames} ${m.surname}: /apply/${existingInv.rows[0].token}`);
    } else {
      const token = uuidv4();
      await db.query(
        `INSERT INTO invitations (event_id, marshal_id, email, token, created_by) VALUES ($1,$2,$3,$4,$5)`,
        [event.id, marshalId, m.email, token, coordinatorId]
      );
      console.log(`  · invite for ${m.forenames} ${m.surname}: /apply/${token}`);
    }
  }
  console.log('  ✓ test marshals + invitations');

  console.log('\nSeed complete.');
  console.log('Logins:');
  console.log('  Coordinator: jon@marshpoint.co.uk / changeme123');
  console.log('  Committee:   committee@marshpoint.co.uk / changeme123');
  await db.pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
