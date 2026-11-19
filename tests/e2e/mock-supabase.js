// Supabase falso para las pruebas: reemplaza a https://esm.sh/@supabase/supabase-js@2
// Guarda todo en memoria (window.__db) a partir de los datos de prueba de fixtures.js.
import { seed } from './fixtures.js';

const db = structuredClone(seed);
window.__db = db;
window.__dbLog = [];
let seq = 1;
const uid = () => `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
const tabla = (t) => (db[t] = db[t] || []);

function query(t) {
  const st = { f: [], op: 'select', payload: null, single: false, maybe: false, opts: {}, order: [], from: null, to: null, ret: false };
  const api = {
    select() { st.ret = true; return api; },
    eq(c, v) { st.f.push(r => String(r[c]) === String(v)); return api; },
    neq(c, v) { st.f.push(r => String(r[c]) !== String(v)); return api; },
    in(c, vs) { st.f.push(r => vs.map(String).includes(String(r[c]))); return api; },
    gte(c, v) { st.f.push(r => String(r[c]) >= String(v)); return api; },
    lte(c, v) { st.f.push(r => String(r[c]) <= String(v)); return api; },
    gt(c, v) { st.f.push(r => String(r[c]) > String(v)); return api; },
    lt(c, v) { st.f.push(r => String(r[c]) < String(v)); return api; },
    or(expr) {
      // soporta "a.eq.x,b.gte.y"
      const conds = expr.split(',').map(x => { const [c, op, ...v] = x.split('.'); return { c, op, v: v.join('.') }; });
      st.f.push(r => conds.some(({ c, op, v }) => op === 'eq' ? String(r[c]) === v : op === 'gte' ? String(r[c]) >= v : op === 'lte' ? String(r[c]) <= v : false));
      return api;
    },
    order(c, o = {}) { st.order.push([c, o.ascending !== false]); return api; },
    range(a, b) { st.from = a; st.to = b; return api; },
    limit(n) { st.from = 0; st.to = n - 1; return api; },
    single() { st.single = true; return api; },
    maybeSingle() { st.single = true; st.maybe = true; return api; },
    insert(rows) { st.op = 'insert'; st.payload = rows; return api; },
    update(v) { st.op = 'update'; st.payload = v; return api; },
    upsert(rows, opts) { st.op = 'upsert'; st.payload = rows; st.opts = opts || {}; return api; },
    delete() { st.op = 'delete'; return api; },
    then(res, rej) { try { res(run()); } catch (e) { rej(e); } },
  };
  function run() {
    const T = tabla(t);
    const match = r => st.f.every(f => f(r));
    window.__dbLog.push(`${st.op} ${t}`);
    if (st.op === 'select') {
      let d = T.filter(match).map(r => ({ ...r }));
      for (const [c, asc] of [...st.order].reverse()) d.sort((a, b) => (String(a[c] ?? '') < String(b[c] ?? '') ? -1 : String(a[c] ?? '') > String(b[c] ?? '') ? 1 : 0) * (asc ? 1 : -1));
      if (st.from !== null) d = d.slice(st.from, st.to + 1);
      if (st.single) return d.length || st.maybe ? { data: d[0] || null, error: null } : { data: null, error: { message: 'no rows' } };
      return { data: d, error: null };
    }
    if (st.op === 'insert') {
      const rows = [].concat(st.payload).map(r => ({ id: uid(), created_at: new Date().toISOString(), ...r }));
      T.push(...rows);
      return { data: st.ret ? rows.map(r => ({ ...r })) : null, error: null };
    }
    if (st.op === 'update') { const rows = T.filter(match); rows.forEach(r => Object.assign(r, st.payload)); return { data: st.ret ? rows : null, error: null }; }
    if (st.op === 'delete') { for (let i = T.length - 1; i >= 0; i--) if (match(T[i])) T.splice(i, 1); return { data: null, error: null }; }
    if (st.op === 'upsert') {
      const keys = String(st.opts.onConflict || 'id').split(',');
      for (const r of [].concat(st.payload)) {
        const ex = T.find(x => keys.every(k => String(x[k]) === String(r[k])));
        if (ex) { if (!st.opts.ignoreDuplicates) Object.assign(ex, r); }
        else T.push({ id: uid(), ...(t === 'propuestas_venta' ? { estado: 'pendiente', pagada_agenda: false } : {}), ...r });
      }
      return { data: null, error: null };
    }
  }
  return api;
}

const rpcs = {
  get_ventas_anio_json: ({ p_anio }) => tabla('ventas').filter(v => +v.anio === +p_anio),
  get_ventas_historial: () => [...tabla('ventas')].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
  get_ventas_ef: () => tabla('ventas').filter(v => v.forma_pago === 'EF'),
  get_ventas_tk_anio: ({ p_anio, p_mes }) => tabla('ventas').filter(v => v.forma_pago === 'TK' && +v.anio === +p_anio && +v.n_mes === +p_mes),
};

let session = null;
const listeners = [];
export function createClient() {
  return {
    from: query,
    rpc: async (name, args = {}) => rpcs[name] ? { data: rpcs[name](args), error: null } : { data: null, error: { message: 'rpc ' + name } },
    auth: {
      getSession: async () => ({ data: { session } }),
      signInWithPassword: async ({ email, password }) => {
        if (email === 'equipo@pistonbarberia.cl' && password === 'clave-de-prueba') { session = { user: { email } }; return { data: { session }, error: null }; }
        return { data: null, error: { message: 'Invalid login credentials' } };
      },
      signOut: async () => { session = null; listeners.forEach(l => l('SIGNED_OUT', null)); return { error: null }; },
      onAuthStateChange: (cb) => { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    },
  };
}
