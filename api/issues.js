const { q, isAdmin } = require('./_lib');

// PATCH {id, status: "Open" | "Closed"}  (admin only)
module.exports = async (req, res) => {
  try {
    if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });
    if (!isAdmin(req)) return res.status(403).json({ error: 'Admin PIN needed' });
    const b = req.body || {};
    const id = Number(b.id);
    if (!Number.isInteger(id) || !['Open', 'Closed'].includes(b.status)) return res.status(400).json({ error: 'Bad request' });
    await q('update issues set status = $1 where id = $2', [b.status, id]);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
