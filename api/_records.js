// Generic list / save / delete for the proposal modules (plan, areas, equipment, bills, approvals, scorecard)
const { q, today, addDays, isDate, getConfig } = require('./_lib');

// Column types: t = text, d = date, i = whole number, n = number
const SPEC = {
  plan: {
    table: 'plan_tasks',
    cols: { phase: 't', title: 't', area: 't', owner: 't', due_date: 'd', due_offset: 'i', status: 't', notes: 't', done_date: 'd', sort: 'i' },
    required: ['phase', 'title'], staffRead: true, staffCols: ['status', 'notes', 'owner', 'done_date'],
    order: 'sort, id', enums: { status: ['Not started', 'In progress', 'Done'] }
  },
  areas: {
    table: 'saving_areas',
    cols: { area: 't', what: 't', cost: 't', status: 't', finding: 't', action: 't', owner: 't', saving_pct: 'n' },
    required: ['area'], staffRead: true, staffCols: ['status', 'finding', 'action', 'owner'],
    order: 'id', enums: { status: ['Not checked', 'Checked', 'Action in progress', 'Fixed'] }
  },
  equipment: {
    table: 'equipment',
    cols: { name: 't', zone: 't', area: 't', qty: 'i', kw: 'n', hours_per_day: 'n', notes: 't' },
    required: ['name'], staffRead: true, staffCols: 'all', staffCreate: true,
    order: 'area nulls last, name'
  },
  bills: {
    table: 'bills',
    cols: { bill_month: 'd', units: 'n', amount: 'n', power_factor: 'n', contract_kva: 'n', diesel_litres: 'n', notes: 't' },
    required: ['bill_month'], staffRead: false, conflict: ['bill_month'], order: 'bill_month desc'
  },
  approvals: {
    table: 'approvals',
    cols: { item: 't', status: 't', cmd_remark: 't', decided_on: 'd', sort: 'i' },
    required: ['item'], staffRead: false, order: 'sort, id', enums: { status: ['Pending', 'Approved', 'Needs changes'] }
  },
  scorecard: {
    table: 'scorecard',
    cols: { criterion: 't', person: 't', score: 'i' },
    required: ['criterion', 'person', 'score'], staffRead: false, conflict: ['criterion', 'person'], order: 'criterion, person'
  }
};
const CAST = { t: '', d: '::date', i: '::int', n: '::numeric' };

function selectExpr(spec) {
  const parts = ['id'];
  Object.keys(spec.cols).forEach(c => {
    const t = spec.cols[c];
    parts.push(t === 'd' ? `${c}::text as ${c}` : t === 'n' ? `${c}::float8 as ${c}` : c);
  });
  return parts.join(', ');
}

function coerce(spec, key, v) {
  const t = spec.cols[key];
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null;
  if (t === 't') {
    const s = String(v).trim().slice(0, 500);
    if (spec.enums && spec.enums[key] && !spec.enums[key].includes(s)) throw new Error(`Bad value for ${key}`);
    return s;
  }
  if (t === 'd') {
    let s = String(v).trim();
    if (key === 'bill_month' && /^\d{4}-\d{2}$/.test(s)) s += '-01';
    if (!isDate(s)) throw new Error(`${key} must be a date`);
    if (key === 'bill_month') s = s.slice(0, 7) + '-01';
    return s;
  }
  const n = Number(v);
  if (!isFinite(n)) throw new Error(`${key} must be a number`);
  if (t === 'i' && !Number.isInteger(n)) throw new Error(`${key} must be a whole number`);
  if ((t === 'n' || t === 'i') && n < 0 && key !== 'sort') throw new Error(`${key} cannot be negative`);
  if (key === 'score' && (n < 1 || n > 5)) throw new Error('Score must be 1 to 5');
  return n;
}

async function list(type) {
  const spec = SPEC[type];
  const rows = await q(`select ${selectExpr(spec)} from ${spec.table} order by ${spec.order}`);
  if (type !== 'plan') return { rows };
  const cfg = await getConfig();
  const start = cfg.plan_start && isDate(cfg.plan_start) ? cfg.plan_start : null;
  const t = today();
  rows.forEach(r => {
    r.due = r.due_date || (start && r.due_offset !== null ? addDays(start, r.due_offset) : null);
    r.overdue = r.status !== 'Done' && !!r.due && r.due < t;
  });
  return { rows, plan_start: start };
}

async function save(type, row, admin) {
  const spec = SPEC[type];
  const id = row.id !== undefined && row.id !== null && row.id !== '' ? Number(row.id) : null;
  if (id !== null && !Number.isInteger(id)) throw new Error('Bad id');
  if (!admin) {
    if (id === null && !spec.staffCreate) { const e = new Error('Admin PIN needed'); e.status = 403; throw e; }
  }
  const allowed = admin || spec.staffCols === 'all' ? Object.keys(spec.cols) : spec.staffCols;
  const keys = Object.keys(row).filter(k => k !== 'id' && allowed.includes(k) && spec.cols[k]);
  const vals = {};
  keys.forEach(k => { vals[k] = coerce(spec, k, row[k]); });

  if (type === 'plan' && 'status' in vals) {
    if (vals.status === 'Done' && !vals.done_date) { vals.done_date = today(); if (!keys.includes('done_date')) keys.push('done_date'); }
    if (vals.status && vals.status !== 'Done') { vals.done_date = null; if (!keys.includes('done_date')) keys.push('done_date'); }
  }

  if (id !== null) {
    if (!keys.length) throw new Error('Nothing to change');
    const sets = keys.map((k, i) => `${k} = $${i + 1}${CAST[spec.cols[k]]}`);
    if (type === 'areas') sets.push('updated_at = now()');
    const out = await q(`update ${spec.table} set ${sets.join(', ')} where id = $${keys.length + 1} returning id`, keys.map(k => vals[k]).concat([id]));
    if (!out.length) throw new Error('Record not found');
    return;
  }

  spec.required.forEach(k => { if (vals[k] === null || vals[k] === undefined) throw new Error(`${k} is required`); });
  const ph = keys.map((k, i) => `$${i + 1}${CAST[spec.cols[k]]}`);
  let sql = `insert into ${spec.table} (${keys.join(', ')}) values (${ph.join(', ')})`;
  if (spec.conflict) {
    const rest = keys.filter(k => !spec.conflict.includes(k));
    sql += ` on conflict (${spec.conflict.join(', ')}) ` + (rest.length ? `do update set ${rest.map(k => `${k} = excluded.${k}`).join(', ')}` : 'do nothing');
  }
  await q(sql, keys.map(k => vals[k]));
}

async function remove(type, id) {
  const spec = SPEC[type];
  const n = Number(id);
  if (!Number.isInteger(n)) throw new Error('Bad id');
  await q(`delete from ${spec.table} where id = $1`, [n]);
}

module.exports = { SPEC, list, save, remove };
