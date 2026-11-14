const { q, today, addDays, daysBetween, isDate, role, buildSummary } = require('./_lib');

// GET /api/summary?from=YYYY-MM-DD&to=YYYY-MM-DD  (staff: max 31 days, admin: max 366 days)
module.exports = async (req, res) => {
  try {
    const r = role(req);
    if (!r) return res.status(401).json({ error: 'Wrong PIN' });
    const t = today();
    let to = isDate(req.query.to) ? req.query.to : t;
    if (to > t) to = t;
    let from = isDate(req.query.from) ? req.query.from : addDays(to, -13);
    const maxDays = r === 'admin' ? 366 : 31;
    if (daysBetween(from, to) < 0) from = to;
    if (daysBetween(from, to) + 1 > maxDays) from = addDays(to, -(maxDays - 1));

    const s = await buildSummary(from, to);
    const todays = await q('select distinct shift from readings where entry_date = $1::date', [t]);
    const status = { Opening: false, Closing: false };
    todays.forEach(x => { status[x.shift] = true; });

    return res.status(200).json({
      role: r, today: t, from, to,
      days: s.days, rows: s.rows, issues: s.issues,
      baseline: s.config.baseline_per_day, status
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
