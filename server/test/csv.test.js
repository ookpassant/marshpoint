const test = require('node:test');
const assert = require('node:assert');
const { toCsv } = require('../routes/applications');

test('toCsv writes a header and rows', () => {
  const out = toCsv([{ a: 1, b: 'hi' }], ['a', 'b']);
  assert.strictEqual(out, 'a,b\n1,hi\n');
});

test('toCsv quotes values containing commas, quotes, or newlines', () => {
  const out = toCsv([{ a: 'one, two', b: 'say "hi"' }], ['a', 'b']);
  assert.strictEqual(out, 'a,b\n"one, two","say ""hi"""\n');
});

test('toCsv joins arrays with a semicolon and blanks null/undefined', () => {
  const out = toCsv([{ a: ['Thursday', 'Friday'], b: null, c: undefined }], ['a', 'b', 'c']);
  assert.strictEqual(out, 'a,b,c\nThursday; Friday,,\n');
});
