// KPIs from the proposal: used by the Dashboard and the Monday email
const { q, today, addDays, buildSummary, round2 } = require('./_lib');
const { list } = require('./_records');

async function buildKpis() {
  const t = today();
  const from = addDays(t, -29);
  const [s, plan, areas, equip, bills, approvals] = await Promise.all([
    buildSummary(from, t),
    list('plan'),
    list('areas'),
    list('equipment'),
    list('bills'),
    list('approvals')
  ]);

  // Units and kWh per member visit (last 30 days)
  const withTotal = s.days.filter(d => d.total !== null);
  const avgPerDay = withTotal.length ? withTotal.reduce((a, d) => a + d.total, 0) / withTotal.length : null;
  const both = s.days.filter(d => d.total !== null && d.visits > 0);
  const sumU = both.reduce((a, d) => a + d.total, 0);
  const sumV = both.reduce((a, d) => a + d.visits, 0);
  const cks = s.days.filter(d => d.checklist !== null);
  const base = s.config.baseline_per_day;

  // Plan progress
  const byPhase = {};
  plan.rows.forEach(r => {
    const p = (byPhase[r.phase] = byPhase[r.phase] || { phase: r.phase, total: 0, done: 0 });
    p.total++; if (r.status === 'Done') p.done++;
  });
  const overdue = plan.rows.filter(r => r.overdue).map(r => ({ title: r.title, due: r.due, owner: r.owner }));

  // Saving areas
  const areaCounts = { 'Not checked': 0, Checked: 0, 'Action in progress': 0, Fixed: 0 };
  areas.rows.forEach(r => { areaCounts[r.status] = (areaCounts[r.status] || 0) + 1; });

  // Equipment estimate vs metered use
  const estDaily = equip.rows.reduce((a, e) => a + (e.qty || 0) * (e.kw || 0) * (e.hours_per_day || 0), 0);

  // Bills: this month vs same month last year
  const byMonth = {};
  bills.rows.forEach(b => { byMonth[b.bill_month] = b; });
  const billList = bills.rows.slice(0, 13).map(b => {
    const prev = byMonth[(Number(b.bill_month.slice(0, 4)) - 1) + b.bill_month.slice(4)];
    const pct = (a, p) => (a !== null && p !== null && p > 0 ? round2((100 * (a - p)) / p) : null);
    return Object.assign({}, b, { units_vs_last_year: prev ? pct(b.units, prev.units) : null, amount_vs_last_year: prev ? pct(b.amount, prev.amount) : null });
  });

  return {
    period: { from, to: t },
    avg_per_day: avgPerDay === null ? null : round2(avgPerDay),
    baseline: base,
    vs_baseline_pct: avgPerDay !== null && base ? round2((100 * (avgPerDay - base)) / base) : null,
    days_with_readings: withTotal.length,
    kwh_per_visit: sumV > 0 ? round2(sumU / sumV) : null,
    visit_days: both.length,
    checklist_avg: cks.length ? Math.round(cks.reduce((a, d) => a + d.checklist, 0) / cks.length) : null,
    plan: {
      total: plan.rows.length, done: plan.rows.filter(r => r.status === 'Done').length,
      in_progress: plan.rows.filter(r => r.status === 'In progress').length,
      overdue: overdue, by_phase: Object.values(byPhase), plan_start: plan.plan_start
    },
    areas: areaCounts,
    equipment: { items: equip.rows.length, est_daily_kwh: round2(estDaily) },
    bills: billList,
    pending_approvals: approvals.rows.filter(a => a.status === 'Pending').length,
    open_issues: s.issues.filter(i => i.status === 'Open').length,
    days: s.days
  };
}

module.exports = { buildKpis };
