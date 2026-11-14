const { usageRows, today, addDays, isDate, isAdmin } = require('./_lib');

// GET /api/export?from=...&to=...  -> date-wise CSV (admin only). Opens in Excel.
module.exports = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin PIN needed' });
    const t = today();
    const to = isDate(req.query.to) ? req.query.to : t;
    const from = isDate(req.query.from) ? req.query.from : addDays(to, -29);
    const rows = await usageRows(from, to, 'asc');
    const qt = v => (v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`);
    const lines = ['Date,Meter,Opening,Closing,Day units,Night units,24h units'];
    rows.forEach(r => lines.push([r.entry_date, r.meter, r.opening, r.closing, r.day_units, r.night_units, r.total_units].map(qt).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bz-energy-${from}-to-${to}.csv"`);
    return res.status(200).send('﻿' + lines.join('\r\n'));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
