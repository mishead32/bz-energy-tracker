const { q, today, addDays, isDate, isStaff, isAdmin, getConfig } = require('./_lib');

// POST: save one Opening or Closing entry (meter readings + checklist + optional issue).
// Saving the same date + shift again replaces the earlier values (that is how corrections are made).
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isStaff(req)) return res.status(401).json({ error: 'Wrong PIN' });
    const admin = isAdmin(req);
    const b = req.body || {};
    const cfg = await getConfig();
    const t = today();

    if (!cfg.staff.includes(b.by)) return res.status(400).json({ error: 'Please choose your name.' });
    if (!['Opening', 'Closing'].includes(b.shift)) return res.status(400).json({ error: 'Choose Opening or Closing.' });
    if (!isDate(b.date)) return res.status(400).json({ error: 'Choose a valid date.' });
    if (b.date > t) return res.status(400).json({ error: 'Date cannot be in the future.' });
    if (!admin && b.date < addDays(t, -3)) {
      return res.status(400).json({ error: 'Staff can enter only the last 3 days. Ask the admin for older dates.' });
    }

    // Meter readings
    const readings = [];
    for (const m of Object.keys(b.readings || {})) {
      const raw = b.readings[m];
      if (raw === '' || raw === null || raw === undefined) continue;
      if (!cfg.meters.includes(m)) return res.status(400).json({ error: `Unknown meter: ${m}` });
      const val = Number(raw);
      if (!isFinite(val) || val < 0) return res.status(400).json({ error: `Reading for ${m} must be a number.` });
      readings.push({ m, v: val });
    }
    if (!readings.length) return res.status(400).json({ error: 'Enter at least one meter reading.' });
    if (b.visits !== '' && b.visits !== null && b.visits !== undefined && (!Number.isInteger(Number(b.visits)) || Number(b.visits) < 0)) {
      return res.status(400).json({ error: 'Member visits must be a whole number.' });
    }

    // A reading must not be lower than the previous one (catches typing mistakes)
    for (const r of readings) {
      const prev = await q(
        `select entry_date::text as entry_date, shift, reading::float8 as reading
         from readings
         where meter = $1
           and (entry_date < $2::date or (entry_date = $2::date and $3 = 'Closing' and shift = 'Opening'))
         order by entry_date desc, (shift = 'Closing') desc
         limit 1`,
        [r.m, b.date, b.shift]
      );
      const earlier = prev[0];
      if (earlier && r.v < Number(earlier.reading) && !(admin && b.force)) {
        return res.status(409).json({
          code: 'LOWER',
          error: `${r.m}: ${r.v} is lower than the previous reading ${earlier.reading} (${earlier.entry_date}, ${earlier.shift}). Please check the number.`
        });
      }
    }

    await q(
      `insert into readings (entry_date, shift, meter, reading, entered_by)
       select $1::date, $2, x->>'m', (x->>'v')::numeric, $4 from jsonb_array_elements($3::jsonb) as x
       on conflict (entry_date, shift, meter)
       do update set reading = excluded.reading, entered_by = excluded.entered_by, updated_at = now()`,
      [b.date, b.shift, JSON.stringify(readings), b.by]
    );

    const chk = Object.keys(b.checklist || {})
      .filter(i => cfg.items.includes(i))
      .map(i => ({ i, d: !!b.checklist[i] }));
    if (chk.length) {
      await q(
        `insert into checklist (entry_date, shift, item, done, entered_by)
         select $1::date, $2, x->>'i', (x->>'d')::boolean, $4 from jsonb_array_elements($3::jsonb) as x
         on conflict (entry_date, shift, item)
         do update set done = excluded.done, entered_by = excluded.entered_by`,
        [b.date, b.shift, JSON.stringify(chk), b.by]
      );
    }

    if (b.visits !== '' && b.visits !== null && b.visits !== undefined) {
      const v = Number(b.visits);
      if (!Number.isInteger(v) || v < 0) return res.status(400).json({ error: 'Member visits must be a whole number.' });
      await q(
        `insert into daily_visits (entry_date, visits, updated_by) values ($1::date, $2::int, $3)
         on conflict (entry_date) do update set visits = excluded.visits, updated_by = excluded.updated_by, updated_at = now()`,
        [b.date, v, b.by]
      );
    }

    const text = String(b.issueText || '').trim().slice(0, 500);
    if (text) {
      await q('insert into issues (entry_date, area, issue, entered_by) values ($1::date, $2, $3, $4)',
        [b.date, String(b.issueArea || '').slice(0, 60), text, b.by]);
    }
    return res.status(200).json({ ok: true, message: `Saved. Thank you, ${b.by}.` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
