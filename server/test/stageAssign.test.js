const test = require('node:test');
const assert = require('node:assert');
const { autoAssignStage } = require('../util/stageAssign');

const DAYS = [{ id: 1, day_name: 'Thursday' }, { id: 2, day_name: 'Friday' }];

test('honours explicit AM / PM shift preferences', () => {
  const apps = [
    { id: 10, name: 'AM Person', marshalling_days: ['Thursday'], stage_shift_preference: 'am' },
    { id: 11, name: 'PM Person', marshalling_days: ['Thursday'], stage_shift_preference: 'pm' },
  ];
  const r = autoAssignStage(apps, DAYS, 5);
  const am = r.assignments.find((a) => a.application_id === 10);
  const pm = r.assignments.find((a) => a.application_id === 11);
  assert.strictEqual(am.role, 'stage_am');
  assert.strictEqual(pm.role, 'stage_pm');
  assert.strictEqual(r.perDay[1].am, 1);
  assert.strictEqual(r.perDay[1].pm, 1);
});

test('assigns one shift per marshalling day', () => {
  const apps = [{ id: 12, name: 'Both Days', marshalling_days: ['Thursday', 'Friday'], stage_shift_preference: 'am' }];
  const r = autoAssignStage(apps, DAYS, 5);
  assert.strictEqual(r.assignments.length, 2);
  assert.deepStrictEqual(r.assignments.map((a) => a.event_day_id).sort(), [1, 2]);
});

test('no-preference marshals balance across shifts toward target', () => {
  const apps = [
    { id: 1, name: 'A', marshalling_days: ['Thursday'], stage_shift_preference: 'no_preference' },
    { id: 2, name: 'B', marshalling_days: ['Thursday'], stage_shift_preference: 'no_preference' },
    { id: 3, name: 'C', marshalling_days: ['Thursday'], stage_shift_preference: null },
    { id: 4, name: 'D', marshalling_days: ['Thursday'] },
  ];
  const r = autoAssignStage(apps, DAYS, 5);
  assert.strictEqual(r.perDay[1].am + r.perDay[1].pm, 4);
  assert.ok(Math.abs(r.perDay[1].am - r.perDay[1].pm) <= 1, 'shifts should be balanced');
});

test('flags marshals whose days do not match the event', () => {
  const apps = [{ id: 99, name: 'Sunday Only', marshalling_days: ['Sunday'], stage_shift_preference: 'am' }];
  const r = autoAssignStage(apps, DAYS, 5);
  assert.strictEqual(r.assignments.length, 0);
  assert.strictEqual(r.flagged.length, 1);
  assert.strictEqual(r.flagged[0].id, 99);
});

test('does not clobber a locked (non-provisional) assignment', () => {
  const apps = [{ id: 5, name: 'Locked', marshalling_days: ['Thursday'], stage_shift_preference: 'am' }];
  const existing = new Map([['5:1', { role: 'stage_pm', provisional: false }]]);
  const r = autoAssignStage(apps, DAYS, 5, existing);
  assert.strictEqual(r.assignments.length, 0);
  assert.strictEqual(r.changes, 0);
});

test('counts a changed assignment against an existing provisional one', () => {
  const apps = [{ id: 6, name: 'Prov', marshalling_days: ['Thursday'], stage_shift_preference: 'am' }];
  const existing = new Map([['6:1', { role: 'stage_pm', provisional: true }]]);
  const r = autoAssignStage(apps, DAYS, 5, existing);
  assert.strictEqual(r.assignments.length, 1);
  assert.strictEqual(r.assignments[0].role, 'stage_am');
  assert.strictEqual(r.changes, 1);
});
