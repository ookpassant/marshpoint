// Full-flow API integration test.
//
// Runs against a dedicated test database (TEST_DB_NAME, default 'marshals_test')
// using the same credentials as the app. Applies the schema, resets all tables,
// seeds admin users, boots the app on an ephemeral port, and exercises the
// whole lifecycle over HTTP. If no database is reachable, the suite is skipped
// rather than failing — so it stays CI-friendly without a database.

const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');

// Point the app at the test database BEFORE requiring it (dotenv won't override
// already-set vars), then load app + pool.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'marshals_test';
process.env.NODE_ENV = 'test';
process.env.EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS || 'coordinator@test.local';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'localhost';
process.env.SMTP_PORT = process.env.SMTP_PORT || '59999'; // unused port: sends fail-soft and are logged
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const app = require('../app');
const db = require('../db/pool');
const { runMigrations } = require('../db/migrate');

async function dbReachable() {
  try { await db.query('SELECT 1'); return true; } catch { return false; }
}

test('API integration — full lifecycle', async (t) => {
  if (!(await dbReachable())) {
    t.skip('no test database reachable (set DB_USER/DB_PASSWORD and create marshals_test)');
    return;
  }

  // Schema (via migrations) + reset.
  await runMigrations(db);
  await db.query(`TRUNCATE users, events, event_days, marshals, invitations,
    applications, shirt_orders, schedule_assignments, comms_log RESTART IDENTITY CASCADE`);

  const hash = await bcrypt.hash('pw123', 10);
  await db.query("INSERT INTO users (email,name,role,password) VALUES ($1,'Jon','coordinator',$2)", ['jon@test.local', hash]);
  await db.query("INSERT INTO users (email,name,role,password) VALUES ($1,'Cmte','committee',$2)", ['cmte@test.local', hash]);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  const call = async (method, url, { token, body, raw } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body && !raw) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + url, { method, headers, body: raw ? body : (body ? JSON.stringify(body) : undefined) });
    let parsed = null;
    const text = await res.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  };

  let coordToken; let cmteToken; let eventId; let applyToken; let appId; let marshalId;

  try {
    await t.test('login as coordinator and committee', async () => {
      const c = await call('POST', '/auth/login', { body: { email: 'jon@test.local', password: 'pw123' } });
      assert.strictEqual(c.status, 200);
      assert.ok(c.body.token);
      coordToken = c.body.token;
      const m = await call('POST', '/auth/login', { body: { email: 'cmte@test.local', password: 'pw123' } });
      cmteToken = m.body.token;
      const bad = await call('POST', '/auth/login', { body: { email: 'jon@test.local', password: 'wrong' } });
      assert.strictEqual(bad.status, 401);
    });

    await t.test('create event with day generation', async () => {
      const r = await call('POST', '/admin/events', { token: coordToken, body: { name: 'GFoS Test', year: 2026, start_date: '2026-07-09', end_date: '2026-07-12', stage_direction: 'anticlockwise', addon_enabled: true, addon_label: 'Sunday barbecue', barbie_price: 15 } });
      assert.strictEqual(r.status, 201);
      eventId = r.body.id;
      const detail = await call('GET', `/admin/events/${eventId}`, { token: coordToken });
      assert.strictEqual(detail.body.days.length, 4);
      assert.deepStrictEqual(detail.body.days.map((d) => d.day_name), ['Thursday', 'Friday', 'Saturday', 'Sunday']);
    });

    await t.test('committee cannot create events (403)', async () => {
      const r = await call('POST', '/admin/events', { token: cmteToken, body: { name: 'X', year: 2026, start_date: '2026-01-01', end_date: '2026-01-02' } });
      assert.strictEqual(r.status, 403);
    });

    await t.test('create invitation and fetch apply prefill', async () => {
      const r = await call('POST', `/admin/events/${eventId}/invitations`, { token: coordToken, body: { send: false, invitations: [{ email: 'sam@test.local', name: 'Sam Marshal' }] } });
      assert.strictEqual(r.status, 201);
      assert.strictEqual(r.body.count, 1);
      const list = await call('GET', `/admin/events/${eventId}/invitations`, { token: coordToken });
      applyToken = list.body[0].token;
      const prefill = await call('GET', `/apply/${applyToken}`);
      assert.strictEqual(prefill.status, 200);
      assert.strictEqual(prefill.body.prefill.email, 'sam@test.local');
    });

    await t.test('submit application with shirts + barbie computes total', async () => {
      const r = await call('POST', `/apply/${applyToken}`, { body: {
        surname: 'Marshal', forenames: 'Sam', address_line1: '1 St', address_town: 'Town', address_postcode: 'AB1 2CD',
        phone_mobile: '07000000000', msuk_licence_number: 'MS1', msuk_licence_grades: 'Marshal', wdmc_member_number: '10',
        arrival_day: 'Thursday', marshalling_days: ['Thursday', 'Saturday'], role_preference: 'ora',
        departure_option: 'sunday_before_prizes', accommodation_type: 'tent', barbie_attending: true,
        shirts: [{ size: 'L', quantity: 2 }], signature_name: 'Sam Marshal',
        agree_constitution: true, agree_contact: true, agree_privacy: true,
      } });
      assert.strictEqual(r.status, 201);
      assert.strictEqual(r.body.total_due, 45); // 2*15 + 15 barbie
      assert.strictEqual(r.body.status, 'licence_pending');
      const list = await call('GET', `/admin/events/${eventId}/applications`, { token: coordToken });
      appId = list.body[0].id;
      marshalId = list.body[0].marshal_id;
    });

    await t.test('confirm blocked until licence verified', async () => {
      const blocked = await call('PUT', `/admin/applications/${appId}/confirm`, { token: coordToken });
      assert.strictEqual(blocked.status, 409);
    });

    await t.test('upload + verify licence, then confirm succeeds', async () => {
      const fd = new FormData();
      fd.append('licence', new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }), 'lic.pdf');
      const up = await fetch(`${base}/admin/applications/${appId}/licence`, { method: 'POST', headers: { Authorization: `Bearer ${coordToken}` }, body: fd });
      assert.strictEqual(up.status, 200);
      const v = await call('PUT', `/admin/applications/${appId}/verify-licence`, { token: coordToken, body: { verified: true } });
      assert.strictEqual(v.status, 200);
      const conf = await call('PUT', `/admin/applications/${appId}/confirm`, { token: coordToken });
      assert.strictEqual(conf.status, 200);
      assert.strictEqual(conf.body.status, 'confirmed');
    });

    await t.test('ORA auto-assign places before-prizes marshal on Team A', async () => {
      const r = await call('POST', `/admin/events/${eventId}/schedule/auto-assign`, { token: coordToken, body: { commit: true } });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.assignments === undefined ? r.body.teamA : r.body.teamA, 1);
      const detail = await call('GET', `/admin/applications/${appId}`, { token: coordToken });
      assert.strictEqual(detail.body.ora_team, 'A');
    });

    await t.test('payment-request blocked until shirts ordered, then allowed', async () => {
      const blocked = await call('POST', `/admin/events/${eventId}/comms/payment-request`, { token: coordToken, body: { recipients: 'unpaid' } });
      assert.strictEqual(blocked.status, 409);
      await call('PUT', `/admin/events/${eventId}`, { token: coordToken, body: { shirts_ordered: true } });
      const ok = await call('POST', `/admin/events/${eventId}/comms/payment-request`, { token: coordToken, body: { recipients: 'unpaid' } });
      assert.strictEqual(ok.status, 200);
    });

    await t.test('reports reflect the confirmed marshal', async () => {
      const fin = await call('GET', `/admin/events/${eventId}/reports/financials`, { token: coordToken });
      assert.strictEqual(fin.body.confirmed, 1);
      assert.strictEqual(fin.body.total_due, 45);
      const shirt = await call('GET', `/admin/events/${eventId}/reports/shirt-order`, { token: coordToken });
      assert.strictEqual(shirt.body.total, 2);
      const barbie = await call('GET', `/admin/events/${eventId}/reports/barbie-count`, { token: coordToken });
      assert.strictEqual(barbie.body.count, 1);
    });

    await t.test('status page shows confirmed status to the marshal', async () => {
      const s = await call('GET', `/status/${applyToken}`);
      assert.strictEqual(s.status, 200);
      assert.strictEqual(s.body.application.status, 'confirmed');
      assert.strictEqual(s.body.application.ora_team, 'A');
    });

    await t.test('CSV export returns a header row', async () => {
      const res = await fetch(`${base}/admin/events/${eventId}/applications/export`, { headers: { Authorization: `Bearer ${coordToken}` } });
      const text = await res.text();
      assert.strictEqual(res.status, 200);
      assert.ok(text.startsWith('id,surname,forenames'));
    });

    await t.test('GDPR: consent is recorded on the application', async () => {
      const d = await call('GET', `/admin/applications/${appId}`, { token: coordToken });
      assert.strictEqual(d.body.agreed_privacy, true);
      assert.ok(d.body.consent_given_at);
      assert.ok(d.body.privacy_policy_version);
    });

    await t.test('GDPR: marshal can self-export their data', async () => {
      const res = await fetch(`${base}/status/${applyToken}/export`);
      assert.strictEqual(res.status, 200);
      const pack = await res.json();
      assert.strictEqual(pack.personal_details.surname, 'Marshal');
      assert.ok(Array.isArray(pack.applications) && pack.applications.length === 1);
    });

    await t.test('GDPR: coordinator export includes a processing history', async () => {
      const res = await fetch(`${base}/admin/marshals/${marshalId}/export`, { headers: { Authorization: `Bearer ${coordToken}` } });
      assert.strictEqual(res.status, 200);
      const pack = await res.json();
      assert.ok(pack.processing_history.some((p) => p.action === 'consent'));
    });

    await t.test('GDPR: erasure anonymises the marshal and scrubs PII', async () => {
      const r = await call('POST', `/admin/marshals/${marshalId}/erase`, { token: coordToken });
      assert.strictEqual(r.status, 200);
      const m = await call('GET', `/admin/marshals/${marshalId}`, { token: coordToken });
      assert.strictEqual(m.body.surname, 'Erased');
      assert.ok(m.body.anonymised_at);
      assert.strictEqual(m.body.email, `erased+${marshalId}@anonymised.invalid`);
    });

    await t.test('GDPR: committee cannot erase (403)', async () => {
      // Re-erase attempt by committee should be forbidden regardless of state.
      const r = await call('POST', `/admin/marshals/${marshalId}/erase`, { token: cmteToken });
      assert.strictEqual(r.status, 403);
    });
  } finally {
    server.close();
    await db.pool.end();
  }
});
