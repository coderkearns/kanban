// node test/dates.test.js
const assert = require('assert');
const { dueInfo } = require('../src/frontend/dates.js');

const wed = new Date('2026-10-07T00:00'); // a Wednesday
const cases = {
  '2026-10-07': ['today', 'soon'],
  '2026-10-08': ['tomorrow', 'soon'],
  '2026-10-06': ['yesterday', 'overdue'],
  '2026-10-02': ['Oct 2', 'overdue'],
  '2026-10-09': ['Fri', ''],
  '2026-10-11': ['Sun', ''],           // Sunday ends this week
  '2026-10-12': ['next Mon', ''],
  '2026-10-18': ['next Sun', ''],
  '2026-10-19': ['Oct 19', ''],
  '2027-01-05': ['Jan 5, 2027', ''],
};
for (const [iso, [label, state]] of Object.entries(cases))
  assert.deepStrictEqual(dueInfo(iso, wed), { label, state }, iso);

const sun = new Date('2026-10-11T00:00'); // Sunday: tomorrow starts next week
assert.strictEqual(dueInfo('2026-10-13', sun).label, 'next Tue');
assert.strictEqual(dueInfo('2026-10-19', sun).label, 'Oct 19');
console.log('dates ok');
