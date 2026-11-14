const { isAdmin } = require('./_lib');
const { buildKpis } = require('./_kpi');

// GET /api/kpi  (admin only): all proposal KPIs for the last 30 days
module.exports = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin PIN needed' });
    return res.status(200).json(await buildKpis());
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
