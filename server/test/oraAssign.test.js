const test = require('node:test');
const assert = require('node:assert');
const { autoAssignOra, canBeA, canBeB } = require('../util/oraAssign');

const ALL_DAYS = ['Thursday', 'Friday', 'Saturday', 'Sunday'];

test('canBeA / canBeB reflect required days', () => {
  assert.strictEqual(canBeA(['Thursday', 'Saturday']), true);
  assert.strictEqual(canBeA(['Friday', 'Sunday']), false);
  assert.strictEqual(canBeB(['Friday', 'Sunday']), true);
  assert.strictEqual(canBeB(['Thursday', 'Saturday']), false);
  assert.strictEqual(canBeA(ALL_DAYS), true);
  assert.strictEqual(canBeB(ALL_DAYS), true);
});

test('rule 1: departure before prizes forces Team A', () => {
  const apps = [
    { id: 1, full_name: 'A One', marshalling_days: ALL_DAYS, departure_option: 'sunday_before_prizes' },
  ];
  const r = autoAssignOra(apps, 20);
  assert.strictEqual(r.assignments[1], 'A');
  assert.strictEqual(r.flagged.length, 0);
});

test('rule 3: only Fri+Sun available => Team B only', () => {
  const apps = [
    { id: 1, full_name: 'B One', marshalling_days: ['Friday', 'Sunday'], departure_option: 'monday_morning' },
  ];
  const r = autoAssignOra(apps, 20);
  assert.strictEqual(r.assignments[1], 'B');
});

test('conflict: before-prizes departure but cannot make Thu+Sat is flagged', () => {
  const apps = [
    { id: 1, full_name: 'Conflict Person', marshalling_days: ['Friday', 'Sunday'], departure_option: 'sunday_before_prizes' },
  ];
  const r = autoAssignOra(apps, 20);
  assert.strictEqual(r.flagged.length, 1);
  assert.strictEqual(r.flagged[0].id, 1);
  assert.strictEqual(r.assignments[1], undefined);
});

test('no viable team (insufficient days) is flagged', () => {
  const apps = [
    { id: 1, full_name: 'Thursday Only', marshalling_days: ['Thursday'], departure_option: 'monday_morning' },
  ];
  const r = autoAssignOra(apps, 20);
  assert.strictEqual(r.flagged.length, 1);
});

test('group constraint keeps travelling companions on the same team', () => {
  const apps = [
    { id: 1, full_name: 'Sarah Briggs', marshalling_days: ALL_DAYS, departure_option: 'monday_morning', travelling_with_names: 'Daniel Okafor' },
    { id: 2, full_name: 'Daniel Okafor', marshalling_days: ALL_DAYS, departure_option: 'sunday_before_prizes' },
  ];
  const r = autoAssignOra(apps, 20);
  // Daniel forced to A (before prizes); Sarah grouped with him -> also A.
  assert.strictEqual(r.assignments[2], 'A');
  assert.strictEqual(r.assignments[1], 'A');
});

test('group with internal conflict is flagged rather than auto-assigned', () => {
  const apps = [
    // Forced A (before prizes) but grouped with someone who can only be B.
    { id: 1, full_name: 'Anne Early', marshalling_days: ALL_DAYS, departure_option: 'sunday_before_prizes', sharing_with_names: 'Bob Late' },
    { id: 2, full_name: 'Bob Late', marshalling_days: ['Friday', 'Sunday'], departure_option: 'monday_morning' },
  ];
  const r = autoAssignOra(apps, 20);
  assert.strictEqual(r.flagged.length, 2);
});

test('balancing distributes flexible marshals roughly evenly', () => {
  const apps = [];
  for (let i = 1; i <= 10; i++) {
    apps.push({ id: i, full_name: `Flex ${i}`, marshalling_days: ALL_DAYS, departure_option: 'monday_morning' });
  }
  const r = autoAssignOra(apps, 20);
  assert.strictEqual(r.flagged.length, 0);
  assert.strictEqual(r.teamA + r.teamB, 10);
  assert.ok(Math.abs(r.teamA - r.teamB) <= 1, `teams should be balanced, got A=${r.teamA} B=${r.teamB}`);
});
