const { today, addDays, buildSummary } = require('./_lib');
const { buildKpis } = require('./_kpi');

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = v => (v === null || v === undefined ? '-' : (Math.round(v * 10) / 10).toString());

// Called by Vercel Cron every Monday (see vercel.json). Emails last week's report to CMD Sir.
// Needs: CRON_SECRET, RESEND_API_KEY, CMD_EMAIL (and optionally MAIL_FROM).
module.exports = async (req, res) => {
  try {
    if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Not allowed' });
    }
    if (!process.env.RESEND_API_KEY || !process.env.CMD_EMAIL) {
      return res.status(200).json({ skipped: 'Set RESEND_API_KEY and CMD_EMAIL to send the weekly email.' });
    }
    const to = addDays(today(), -1);
    const from = addDays(to, -6);
    const s = await buildSummary(from, to);
    const k = await buildKpis();
    const withData = s.days.filter(d => d.total !== null);
    const total = withData.reduce((a, d) => a + d.total, 0);
    const avg = withData.length ? total / withData.length : null;
    const base = s.config.baseline_per_day;
    let cmp = '<p>No complete days of readings this week.</p>';
    if (avg !== null) {
      cmp = `<p>Average per day this week: <b>${f1(avg)} units</b>`;
      if (base) {
        const diff = (100 * (avg - base)) / base;
        cmp += ` vs baseline ${base} (${diff > 0 ? '+' : ''}${diff.toFixed(1)}%)`;
      } else cmp += ' (baseline not set yet)';
      cmp += '</p>';
    }
    const trs = s.days.slice().reverse().map(d =>
      `<tr><td>${d.date}</td><td align="right">${f1(d.total)}</td><td align="right">${f1(d.night)}</td><td align="right">${d.visits === null ? '-' : d.visits}</td><td align="right">${f1(d.perVisit)}</td><td align="right">${d.checklist === null ? '-' : d.checklist + '%'}</td></tr>`
    ).join('');
    const iss = s.issues.map(i => `<li>${esc(i.entry_date)} - ${esc(i.area)}: ${esc(i.issue)} (${esc(i.entered_by)}, ${esc(i.status)})</li>`).join('');

    const p = k.plan;
    const overdue = p.overdue.map(o => `<li>${esc(o.title)} (due ${esc(o.due)}, ${esc(o.owner || 'no owner')})</li>`).join('');
    const latest = k.bills[0];
    const billLine = latest
      ? `<p>Latest bill (${esc(latest.bill_month.slice(0, 7))}): ${latest.units === null ? '-' : f1(latest.units) + ' units'}, amount ${latest.amount === null ? '-' : f1(latest.amount)}` +
        (latest.units_vs_last_year !== null ? `; units ${latest.units_vs_last_year > 0 ? '+' : ''}${latest.units_vs_last_year}% vs same month last year` : '') + '.</p>'
      : '<p>No bills entered yet.</p>';

    const html = `<h3>BodyZone electricity report: ${from} to ${to}</h3>${cmp}
<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Date</th><th>Units (24h)</th><th>Night units</th><th>Member visits</th><th>Units per visit</th><th>Checklist done</th></tr>${trs}</table>
<h4>Last 30 days</h4>
<p>kWh per member visit: <b>${f1(k.kwh_per_visit)}</b> | Checklist done: <b>${k.checklist_avg === null ? '-' : k.checklist_avg + '%'}</b> | Open issues: <b>${k.open_issues}</b></p>
${billLine}
<h4>30/60/90-day plan</h4>
<p>${p.done} of ${p.total} tasks done, ${p.in_progress} in progress, <b>${p.overdue.length} overdue</b>.</p>${overdue ? `<ul>${overdue}</ul>` : ''}
<h4>Saving areas</h4>
<p>Not checked: ${k.areas['Not checked']} | Checked: ${k.areas.Checked} | Action in progress: ${k.areas['Action in progress']} | Fixed: ${k.areas.Fixed}</p>
<h4>Approvals waiting for CMD Sir: ${k.pending_approvals}</h4>
<h4>Issues reported this week</h4>${iss ? `<ul>${iss}</ul>` : '<p>None.</p>'}
<p style="color:#666">Units are meter readings from opening to next opening, added across meters. A day with no next-morning reading shows "-".</p>`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || 'BZ Energy <onboarding@resend.dev>',
        to: process.env.CMD_EMAIL.split(',').map(x => x.trim()),
        subject: `BZ electricity report ${from} to ${to}`,
        html
      })
    });
    const out = await r.text();
    if (!r.ok) return res.status(502).json({ error: out });
    return res.status(200).json({ sent: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
