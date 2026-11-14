const { role, isAdmin } = require('./_lib');
const { SPEC, list, save, remove } = require('./_records');

// GET    /api/records?type=plan|areas|equipment|bills|approvals|scorecard
// POST   /api/records  {type, row:{id?, ...fields}}   (create or update)
// DELETE /api/records  {type, id}                      (admin only)
module.exports = async (req, res) => {
  try {
    const r = role(req);
    if (!r) return res.status(401).json({ error: 'Wrong PIN' });
    const type = req.method === 'GET' ? req.query.type : (req.body || {}).type;
    const spec = SPEC[type];
    if (!spec) return res.status(400).json({ error: 'Unknown type' });
    const admin = isAdmin(req);

    if (req.method === 'GET') {
      if (!admin && !spec.staffRead) return res.status(403).json({ error: 'Admin PIN needed' });
      return res.status(200).json(await list(type));
    }
    if (req.method === 'POST') {
      if (!admin && !spec.staffRead) return res.status(403).json({ error: 'Admin PIN needed' });
      await save(type, (req.body || {}).row || {}, admin);
      return res.status(200).json({ ok: true, ...(await list(type)) });
    }
    if (req.method === 'DELETE') {
      if (!admin) return res.status(403).json({ error: 'Admin PIN needed' });
      await remove(type, (req.body || {}).id);
      return res.status(200).json({ ok: true, ...(await list(type)) });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const bad = /required|must be|cannot be|Bad |Nothing to change|not found|Score|Admin PIN/.test(e.message);
    return res.status(e.status || (bad ? 400 : 500)).json({ error: e.message });
  }
};
