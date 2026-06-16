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
        (name, year, start_date, end_date, location, description, organisation_name, status,
         ora_team_size_target, stage_shift_target, stage_direction, shirt_price, barbie_price,
         addon_enabled, addon_label, bacs_account_name, bacs_sort_code, bacs_account_number)
       VALUES ('GFoS 2026', 2026, '2026-07-09', '2026-07-12',
               'Goodwood, West Sussex', 'Example marshalling event.', 'Welbeck & District Motor Club',
               'inviting', 20, 10, 'anticlockwise', 15.00, 15.00,
               TRUE, 'Sunday barbecue', 'Marshalling Account', '00-00-00', '12345678')
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

  // Confirmed stage marshals with full applications, so the rally-stage
  // coverage panel and stage auto-assignment have data to work with.
  const allDays = ['Thursday', 'Friday', 'Saturday', 'Sunday'];
  const stageMarshals = [
    { surname: 'Adeyemi', forenames: 'Tunde', shift: 'am', days: allDays },
    { surname: 'Bianchi', forenames: 'Lucia', shift: 'pm', days: allDays },
    { surname: 'Cole', forenames: 'Ryan', shift: 'no_preference', days: ['Thursday', 'Friday'] },
    { surname: 'Dewan', forenames: 'Priya', shift: 'am', days: ['Saturday', 'Sunday'] },
    { surname: 'Ellis', forenames: 'Mark', shift: 'pm', days: allDays },
    { surname: 'Forsyth', forenames: 'Kate', shift: 'no_preference', days: allDays },
  ];

  let n = 100;
  for (const m of stageMarshals) {
    n += 1;
    const email = `${m.forenames}.${m.surname}@example.com`.toLowerCase();
    const mr = await db.query(
      `INSERT INTO marshals
         (surname, forenames, email, phone_mobile, msuk_licence_number, msuk_licence_grades,
          wdmc_member_number, ora_experienced, licence_upload_path, licence_verified, licence_verified_by, licence_verified_at)
       VALUES ($1,$2,$3,$4,$5,'Marshal',$6,false,'seed/verified',true,$7,NOW())
       ON CONFLICT (email) DO UPDATE SET licence_verified = true, licence_verified_by = $7, licence_verified_at = NOW()
       RETURNING id`,
      [m.surname, m.forenames, email, `077009${String(n).padStart(5, '0')}`, `MS${9000 + n}`, String(n), coordinatorId]
    );
    const marshalId = mr.rows[0].id;

    let invId;
    const inv = await db.query('SELECT id FROM invitations WHERE event_id = $1 AND marshal_id = $2', [event.id, marshalId]);
    if (inv.rows[0]) {
      invId = inv.rows[0].id;
      await db.query("UPDATE invitations SET status = 'accepted', responded_at = NOW() WHERE id = $1", [invId]);
    } else {
      const r = await db.query(
        `INSERT INTO invitations (event_id, marshal_id, email, token, status, responded_at, created_by)
         VALUES ($1,$2,$3,$4,'accepted',NOW(),$5) RETURNING id`,
        [event.id, marshalId, email, uuidv4(), coordinatorId]
      );
      invId = r.rows[0].id;
    }

    const appRes = await db.query(
      `INSERT INTO applications
         (event_id, marshal_id, invitation_id, status, arrival_day, marshalling_days,
          departure_option, role_preference, stage_shift_preference, accommodation_type,
          barbie_attending, total_due, signature_name)
       VALUES ($1,$2,$3,'confirmed','Thursday',$4,'monday_morning','stage',$5,'tent',false,15.00,$6)
       ON CONFLICT (event_id, marshal_id) DO UPDATE SET status = 'confirmed', role_preference = 'stage', stage_shift_preference = EXCLUDED.stage_shift_preference, marshalling_days = EXCLUDED.marshalling_days
       RETURNING id`,
      [event.id, marshalId, invId, m.days, m.shift, `${m.forenames} ${m.surname}`]
    );
    const appId = appRes.rows[0].id;
    await db.query(
      `INSERT INTO shirt_orders (application_id, size, quantity, unit_price)
       SELECT $1,'L',1,15.00 WHERE NOT EXISTS (SELECT 1 FROM shirt_orders WHERE application_id = $1)`,
      [appId]
    );
  }
  console.log(`  ✓ ${stageMarshals.length} confirmed stage marshals (try Schedule → Auto-assign stage)`);

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
