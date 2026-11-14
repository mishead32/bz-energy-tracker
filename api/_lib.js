// Shared helpers for all API files. Files starting with "_" are not public endpoints.
const { neon } = require('@neondatabase/serverless');

let _sql;
async function q(text, params) {
  if (!process.env.DATABASE_URL) throw new Error('Server is missing DATABASE_URL');
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql.query(text, params || []);
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(new Date(s + 'T00:00:00Z'));

function pin(req) { return String(req.headers['x-pin'] || ''); }
function isAdmin(req) { return !!process.env.ADMIN_PIN && pin(req) === process.env.ADMIN_PIN; }
function isStaff(req) { return isAdmin(req) || (!!process.env.APP_PIN && pin(req) === process.env.APP_PIN); }
function role(req) { return isAdmin(req) ? 'admin' : isStaff(req) ? 'staff' : null; }

async function getConfig() {
  const rows = await q('select data from app_config where id = 1');
  return rows && rows[0] ? rows[0].data : { meters: [], staff: [], items: [], baseline_per_day: null };
}

const round2 = x => (x === null || x === undefined ? null : Math.round(Number(x) * 100) / 100);

// Date-wise usage rows (one row per date and meter)
async function usageRows(from, to, order) {
  return q(
    `select entry_date::text as entry_date, meter, opening::float8 as opening, closing::float8 as closing,
            day_units::float8 as day_units, night_units::float8 as night_units, total_units::float8 as total_units
     from daily_usage
     where entry_date between $1::date and $2::date
     order by entry_date ${order === 'asc' ? 'asc' : 'desc'}, meter asc`,
    [from, to]
  );
}

// Date-wise summary used by the app and the weekly email
async function buildSummary(from, to) {
  const [rows, chk, issues, cfg, vis] = await Promise.all([
    usageRows(from, to, 'desc'),
    q(`select entry_date::text as entry_date, count(*)::int as n, (count(*) filter (where done))::int as d
       from checklist where entry_date between $1::date and $2::date group by entry_date`, [from, to]),
    q(`select id, entry_date::text as entry_date, area, issue, entered_by, status
       from issues where entry_date between $1::date and $2::date order by entry_date desc, id desc`, [from, to]),
    getConfig(),
    q('select entry_date::text as entry_date, visits from daily_visits where entry_date between $1::date and $2::date', [from, to])
  ]);
  const visits = {};
  vis.forEach(v => { visits[v.entry_date] = Number(v.visits); });
  const agg = {};
  rows.forEach(r => {
    const a = (agg[r.entry_date] = agg[r.entry_date] || { total: 0, day: 0, night: 0, hasTotal: false, hasDay: false, hasNight: false });
    if (r.total_units !== null) { a.total += Number(r.total_units); a.hasTotal = true; }
    if (r.day_units !== null) { a.day += Number(r.day_units); a.hasDay = true; }
    if (r.night_units !== null) { a.night += Number(r.night_units); a.hasNight = true; }
  });
  const ck = {};
  chk.forEach(c => { ck[c.entry_date] = c; });
  const days = [];
  const n = daysBetween(from, to);
  for (let i = 0; i <= n; i++) {
    const d = addDays(to, -i);
    const a = agg[d];
    const total = a && a.hasTotal ? round2(a.total) : null;
    days.push({
      date: d,
      total: total,
      day: a && a.hasDay ? round2(a.day) : null,
      night: a && a.hasNight ? round2(a.night) : null,
      checklist: ck[d] ? Math.round((100 * ck[d].d) / ck[d].n) : null,
      visits: visits[d] !== undefined ? visits[d] : null,
      perVisit: total !== null && visits[d] > 0 ? round2(total / visits[d]) : null
    });
  }
  return { days, rows, issues, config: cfg };
}

module.exports = { q, today, addDays, daysBetween, isDate, role, isStaff, isAdmin, getConfig, buildSummary, usageRows, round2 };
