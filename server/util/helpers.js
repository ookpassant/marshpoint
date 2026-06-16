// Shared helpers: date formatting, merge-field building, cost calculation.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getUTCDay()];
  return `${dayName} ${ordinal(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// "Thursday 9th to Sunday 12th July 2026" style range for an event.
function formatEventDates(event) {
  if (!event || !event.start_date) return '';
  const start = new Date(event.start_date);
  const end = new Date(event.end_date);
  if (Number.isNaN(start.getTime())) return '';
  const startDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][start.getUTCDay()];
  const endDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][end.getUTCDay()];
  return `${startDay} ${ordinal(start.getUTCDate())} to ${endDay} ${ordinal(end.getUTCDate())} ${MONTHS[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function coordinatorName() {
  return process.env.COORDINATOR_NAME || 'The marshalling team';
}

// Build the common merge-field object shared by all templates.
function buildMergeFields({ marshal, event, token }) {
  const base = appBaseUrl();
  return {
    marshal_name: marshal ? (marshal.preferred_name || marshal.forenames || '').split(' ')[0] || marshal.forenames : '',
    marshal_full_name: marshal ? `${marshal.forenames} ${marshal.surname}`.trim() : '',
    marshal_surname: marshal ? marshal.surname : '',
    marshal_email: marshal ? marshal.email : '',
    event_name: event ? event.name : '',
    event_dates: event ? formatEventDates(event) : '',
    event_year: event ? event.year : '',
    // Short alphanumeric event token, handy for payment references e.g. "GFoS2026".
    event_short: event ? String(event.name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 16) : '',
    organisation_name: event && event.organisation_name ? event.organisation_name : '',
    coordinator_name: coordinatorName(),
    // Sign-off: coordinator name, with the organisation underneath when set.
    signoff: event && event.organisation_name
      ? `${coordinatorName()}\n${event.organisation_name}`
      : coordinatorName(),
    // For the licence template ("your 2026 MSUK licence"); blank if no year.
    licence_year: event && event.year ? `${event.year} ` : '',
    apply_url: token ? `${base}/apply/${token}` : '',
    status_url: token ? `${base}/status/${token}` : '',
  };
}

// Compute total cost for an application given shirts + barbie selection.
function calculateTotal({ shirts, barbieAttending, shirtPrice, barbiePrice }) {
  const shirtQty = (shirts || []).reduce((sum, s) => sum + (parseInt(s.quantity, 10) || 0), 0);
  const shirtTotal = shirtQty * Number(shirtPrice);
  const barbieTotal = barbieAttending ? Number(barbiePrice) : 0;
  return {
    shirtTotal: Number(shirtTotal.toFixed(2)),
    barbieTotal: Number(barbieTotal.toFixed(2)),
    total: Number((shirtTotal + barbieTotal).toFixed(2)),
  };
}

module.exports = {
  formatDate,
  formatEventDates,
  appBaseUrl,
  coordinatorName,
  buildMergeFields,
  calculateTotal,
  ordinal,
};
