const { q, today, role, isAdmin, getConfig, isDate } = require('./_lib');

// GET: login check + settings (staff or admin). PUT: change settings (admin only).
// PUT accepts any of: meters, staff, items, baseline_per_day, plan_start, energy_owner, backup_owner
module.exports = async (req, res) => {
  try {
    const r = role(req);
    if (!r) return res.status(401).json({ error: 'Wrong PIN' });

    if (req.method === 'GET') {
      return res.status(200).json({ role: r, today: today(), config: await getConfig() });
    }

    if (req.method === 'PUT') {
      if (!isAdmin(req)) return res.status(403).json({ error: 'Admin PIN needed' });
      const b = req.body || {};
      const data = Object.assign({ plan_start: null, energy_owner: '', backup_owner: '' }, await getConfig());
      const bad = msg => res.status(400).json({ error: msg });

      const clean = (arr, max) => {
        if (!Array.isArray(arr)) return null;
        const out = arr.map(x => String(x).trim()).filter(Boolean);
        return out.length && out.length <= max && new Set(out).size === out.length ? out : null;
      };
      for (const [key, max] of [['meters', 30], ['staff', 30], ['items', 40]]) {
        if (b[key] !== undefined) {
          const v = clean(b[key], max);
          if (!v) return bad('Meters, staff and checklist items must each have at least one unique entry.');
          data[key] = v;
        }
      }
      if ('baseline_per_day' in b) {
        if (b.baseline_per_day === null || b.baseline_per_day === '') data.baseline_per_day = null;
        else {
          const n = Number(b.baseline_per_day);
          if (!isFinite(n) || n <= 0) return bad('Baseline must be a positive number.');
          data.baseline_per_day = n;
        }
      }
      if ('plan_start' in b) {
        if (b.plan_start === null || b.plan_start === '') data.plan_start = null;
        else if (isDate(b.plan_start)) data.plan_start = b.plan_start;
        else return bad('Plan start must be a date.');
      }
      for (const k of ['energy_owner', 'backup_owner']) {
        if (k in b) {
          const v = String(b[k] || '').trim();
          if (v && !data.staff.includes(v)) return bad('Owner must be one of the staff names.');
          data[k] = v;
        }
      }
      if (data.energy_owner && data.energy_owner === data.backup_owner) return bad('Owner and backup must be different people.');
      await q('update app_config set data = $1::jsonb where id = 1', [JSON.stringify(data)]);
      return res.status(200).json({ ok: true, config: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
