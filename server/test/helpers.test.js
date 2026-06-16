const test = require('node:test');
const assert = require('node:assert');
const { calculateTotal, formatEventDates, ordinal } = require('../util/helpers');

test('ordinal suffixes', () => {
  assert.strictEqual(ordinal(1), '1st');
  assert.strictEqual(ordinal(2), '2nd');
  assert.strictEqual(ordinal(3), '3rd');
  assert.strictEqual(ordinal(4), '4th');
  assert.strictEqual(ordinal(11), '11th');
  assert.strictEqual(ordinal(12), '12th');
  assert.strictEqual(ordinal(21), '21st');
});

test('calculateTotal: shirts only', () => {
  const r = calculateTotal({ shirts: [{ size: 'L', quantity: 2 }, { size: 'M', quantity: 1 }], barbieAttending: false, shirtPrice: 15, barbiePrice: 15 });
  assert.strictEqual(r.shirtTotal, 45);
  assert.strictEqual(r.barbieTotal, 0);
  assert.strictEqual(r.total, 45);
});

test('calculateTotal: shirts + barbie', () => {
  const r = calculateTotal({ shirts: [{ size: 'L', quantity: 3 }], barbieAttending: true, shirtPrice: 15, barbiePrice: 15 });
  assert.strictEqual(r.shirtTotal, 45);
  assert.strictEqual(r.barbieTotal, 15);
  assert.strictEqual(r.total, 60);
});

test('calculateTotal: no shirts', () => {
  const r = calculateTotal({ shirts: [], barbieAttending: true, shirtPrice: 15, barbiePrice: 15 });
  assert.strictEqual(r.shirtTotal, 0);
  assert.strictEqual(r.total, 15);
});

test('calculateTotal: respects custom prices', () => {
  const r = calculateTotal({ shirts: [{ size: 'L', quantity: 2 }], barbieAttending: true, shirtPrice: 12.5, barbiePrice: 10 });
  assert.strictEqual(r.shirtTotal, 25);
  assert.strictEqual(r.barbieTotal, 10);
  assert.strictEqual(r.total, 35);
});

test('formatEventDates renders a friendly range', () => {
  const s = formatEventDates({ start_date: '2026-07-09', end_date: '2026-07-12' });
  assert.strictEqual(s, 'Thursday 9th to Sunday 12th July 2026');
});
