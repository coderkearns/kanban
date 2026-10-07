// Due-date label + state. Weeks run Monday–Sunday.
//   today / tomorrow / yesterday · "Thu" (this week) · "next Thu" (next week) · "Oct 29" (else)
// `today` = a Date at local midnight, passed in so one render computes it once.

const fmt = (d, opts) => d.toLocaleDateString('en-US', opts);

function dueInfo(iso, today) {
  const d = new Date(iso + 'T00:00');
  const days = Math.round((d - today) / 864e5); // round: DST days are 23/25h
  const week = Math.floor((days + (today.getDay() + 6) % 7) / 7); // 0 = this week, 1 = next
  const wd = fmt(d, { weekday: 'short' });
  const label =
    days === 0 ? 'today' :
    days === 1 ? 'tomorrow' :
    days === -1 ? 'yesterday' :
    days > 0 && week === 0 ? wd :
    days > 0 && week === 1 ? 'next ' + wd :
    fmt(d, { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  return { label, state: days < 0 ? 'overdue' : days <= 1 ? 'soon' : '' };
}

if (typeof module !== 'undefined') module.exports = { dueInfo }; // for test/dates.test.js
