// Análisis: lógica pura (sin base de datos ni pantalla) — se prueba con tests/unit
// Clientes en riesgo, retención por barbero, ocupación por franja y margen real.
import { propNorm, propParseFechaHora } from './propuestas_logic.js';

const DIA_MS = 864e5;
const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DIA_MS);
const GENERICOS = new Set(['cliente', 'piston', 'sin', 'nombre', 'nn', 'na']);
const tokens = n => propNorm(n).split(' ').filter(t => t.length >= 2 && !GENERICOS.has(t));
const mediana = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const esAsiste = e => propNorm(e) === 'asiste';

// ---------- Reporte completo de AgendaPro (todas las citas, con teléfono y email) ----------
function anParseAgendaCompleta(aoa) {
  let h = -1;
  for (let i = 0; i < Math.min(aoa.length, 25); i++) {
    const r = (aoa[i] || []).map(propNorm);
    if (r.some(c => c.includes('cliente') || c === 'nombre') && r.some(c => c.includes('servicio'))) { h = i; break; }
  }
  if (h < 0) throw new Error('No encontré los encabezados del reporte de AgendaPro');
  const hdr = aoa[h].map(propNorm);
  const col = (...ts) => hdr.findIndex(c => ts.some(t => t instanceof RegExp ? t.test(c) : c === t));
  const ix = {
    fecha: col(/fecha de realizacion/, 'fecha'), hora: col('hora'),
    nombre: col('nombre', 'cliente'), apellido: col('apellido'),
    telefono: col(/telefono/, /celular/), email: col(/^e ?mail$/, /correo/),
    servicio: col('servicio'), precio: col('precio real', 'precio', /^valor/),
    prestador: col('prestador', /profesional/), estado: col('estado'),
    pago: col('estado de pago'), origen: col('origen'), creada: col(/fecha de creacion/),
  };
  for (const k of ['fecha', 'nombre', 'servicio', 'prestador']) if (ix[k] < 0) throw new Error('Al reporte le falta la columna ' + k);
  const out = [];
  for (let i = h + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const { fecha, hora } = propParseFechaHora(r[ix.fecha], ix.hora >= 0 ? r[ix.hora] : undefined);
    if (!fecha) continue;
    const s = k => ix[k] >= 0 ? String(r[ix[k]] ?? '').trim() : '';
    const cliente = [s('nombre'), s('apellido')].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const pagoTxt = propNorm(s('pago'));
    out.push({
      fecha, hora, cliente, telefono: s('telefono'), email: s('email').toLowerCase(),
      servicio: s('servicio').replace(/\s+/g, ' '), precio: Number(r[ix.precio]) || null,
      prestador: s('prestador'), estado: s('estado') || 'Asiste',
      pagada: pagoTxt.startsWith('pagad') || pagoTxt.includes('pago asociado'),
      origen: s('origen') || null, creada_en: s('creada') || null,
    });
  }
  return out;
}
const anClaveCita = c => [c.fecha, c.hora || '', propNorm(c.prestador), propNorm(c.cliente)].join('|');

// ---------- Identidad del cliente: teléfono > email > nombre ----------
function anTel(t) { const d = String(t || '').replace(/\D/g, ''); if (d.length < 8 || /^(\d)\1+$/.test(d.slice(-8))) return null; return d.slice(-8); }
function anClaveNombre(n) { const t = tokens(n); return t.length >= 2 ? 'nom:' + t.slice(0, 2).join(' ') : null; }
// Devuelve las citas con .clienteKey (null si no se puede identificar, ej. "cliente cliente")
function anAsignarClientes(citas) {
  const porNombre = {}, porMail = {};
  for (const c of citas) {
    const tel = anTel(c.telefono); if (!tel) continue;
    const kn = anClaveNombre(c.cliente); if (kn && !porNombre[kn]) porNombre[kn] = 'tel:' + tel;
    if (c.email && c.email.includes('@') && !porMail[c.email]) porMail[c.email] = 'tel:' + tel;
  }
  return citas.map(c => {
    const tel = anTel(c.telefono), mail = c.email && c.email.includes('@') ? c.email : null, kn = anClaveNombre(c.cliente);
    const clienteKey = tel ? 'tel:' + tel : (mail && porMail[mail]) || (kn && porNombre[kn]) || (mail ? 'mail:' + mail : kn);
    return { ...c, clienteKey };
  });
}

// Visitas atendidas agrupadas por cliente
function anVisitas(citas) {
  const m = new Map();
  for (const c of anAsignarClientes(citas)) {
    if (!c.clienteKey || !esAsiste(c.estado)) continue;
    const v = m.get(c.clienteKey) || { key: c.clienteKey, citas: [] };
    v.citas.push(c); m.set(c.clienteKey, v);
  }
  for (const v of m.values()) {
    v.citas.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    v.fechas = [...new Set(v.citas.map(c => c.fecha))];
    const ult = v.citas[v.citas.length - 1];
    v.nombre = [...v.citas].reverse().find(c => tokens(c.cliente).length)?.cliente || ult.cliente;
    v.telefono = [...v.citas].reverse().find(c => anTel(c.telefono))?.telefono || '';
    v.email = [...v.citas].reverse().find(c => c.email)?.email || '';
    v.primera = v.fechas[0]; v.ultima = v.fechas[v.fechas.length - 1];
    v.barberoPrimero = v.citas[0].prestador; v.barberoUltimo = ult.prestador;
    v.gastado = v.citas.reduce((s, c) => s + (c.precio || 0), 0);
  }
  return [...m.values()];
}

// ---------- 1. Clientes en riesgo ----------
// Clientes que venían seguido y ya pasaron 1,5 veces su frecuencia habitual sin volver.
function anClientesEnRiesgo(citas, hoy, { factor = 1.5, perdidoDias = 180, minFrecuencia = 14 } = {}) {
  const riesgo = [], perdidos = [], nuevosSinVolver = [];
  let activos = 0;
  for (const v of anVisitas(citas)) {
    const dias = diasEntre(v.ultima, hoy);
    if (v.fechas.length === 1) {
      if (dias >= 30 && dias <= 120) nuevosSinVolver.push({ ...v, diasSinVenir: dias });
      continue;
    }
    const gaps = v.fechas.slice(1).map((f, i) => diasEntre(v.fechas[i], f));
    const frecuencia = Math.max(minFrecuencia, Math.round(mediana(gaps)));
    const r = { ...v, visitas: v.fechas.length, frecuencia, diasSinVenir: dias, atraso: dias - frecuencia };
    if (dias <= factor * frecuencia) activos++;
    else if (dias <= Math.max(perdidoDias, 3 * frecuencia)) riesgo.push(r);
    else perdidos.push(r);
  }
  const orden = (a, b) => b.visitas - a.visitas || b.atraso - a.atraso;
  return { riesgo: riesgo.sort(orden), perdidos: perdidos.sort(orden), nuevosSinVolver: nuevosSinVolver.sort((a, b) => a.diasSinVenir - b.diasSinVenir), activos };
}

// ---------- 2. Retención de clientes nuevos ----------
// De los clientes cuya primera visita fue en un mes, cuántos volvieron dentro de "ventana" días (y con el mismo barbero).
// Se ignoran los primeros "calentamiento" días del historial: ahí "primera visita" puede ser un cliente antiguo.
function anRetencion(citas, hoy, { ventana = 60, calentamiento = 60 } = {}) {
  const vis = anVisitas(citas);
  if (!vis.length) return { porMes: [], porBarbero: [], total: null, desde: null };
  const inicio = vis.reduce((m, v) => v.primera < m ? v.primera : m, '9999');
  const porMes = {}, porBarbero = {};
  let total = { nuevos: 0, volvieron: 0, mismo: 0 };
  for (const v of vis) {
    if (diasEntre(inicio, v.primera) < calentamiento) continue;
    if (diasEntre(v.primera, hoy) < ventana) continue; // aún no se puede saber
    const sig = v.citas.find(c => c.fecha > v.primera);
    const volvio = !!sig && diasEntre(v.primera, sig.fecha) <= ventana;
    const mismo = volvio && propNorm(sig.prestador) === propNorm(v.barberoPrimero);
    const mes = v.primera.slice(0, 7);
    for (const [obj, k] of [[porMes, mes], [porBarbero, v.barberoPrimero]]) {
      const o = (obj[k] = obj[k] || { clave: k, nuevos: 0, volvieron: 0, mismo: 0 });
      o.nuevos++; if (volvio) o.volvieron++; if (mismo) o.mismo++;
    }
    total.nuevos++; if (volvio) total.volvieron++; if (mismo) total.mismo++;
  }
  const pct = o => ({ ...o, pct: o.nuevos ? o.volvieron / o.nuevos : null, pctMismo: o.volvieron ? o.mismo / o.volvieron : null });
  return {
    porMes: Object.values(porMes).map(pct).sort((a, b) => a.clave.localeCompare(b.clave)),
    porBarbero: Object.values(porBarbero).map(pct).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)),
    total: pct(total), desde: inicio, ventana,
  };
}

// ---------- 4. Ocupación por día de la semana y hora ----------
// Minutos atendidos en cada hora / minutos disponibles de los barberos que trabajaron ese día
// (un barbero "trabajó" un día si tuvo al menos una cita). 100% = todos ocupados toda la hora.
// Duración estimada por servicio: Experiencia 80 min, servicios combinados ("+") 60 min, el resto 40 min.
function anDuracion(servicio) { const n = propNorm(servicio); return /experiencia/.test(n) ? 80 : /\+|\by\b/.test(String(servicio)) && /perfilado|barba|cejas/.test(n) && /corte/.test(n) ? 60 : 40; }
function anOcupacion(citas, { desde, hasta, horaMin = 9, horaMax = 21 } = {}) {
  const enRango = citas.filter(c => (!desde || c.fecha >= desde) && (!hasta || c.fecha <= hasta) && !/cancel/.test(propNorm(c.estado)));
  const trabajo = {}; // fecha -> Set(prestador)
  for (const c of enRango) (trabajo[c.fecha] = trabajo[c.fecha] || new Set()).add(propNorm(c.prestador));
  const dow = f => new Date(f + 'T12:00:00').getDay();
  const barberoDias = Array(7).fill(0);
  for (const [f, s] of Object.entries(trabajo)) barberoDias[dow(f)] += s.size;
  const horas = []; for (let h = horaMin; h <= horaMax; h++) horas.push(h);
  const minutos = Array.from({ length: 7 }, () => Object.fromEntries(horas.map(h => [h, 0])));
  const inicios = Array.from({ length: 7 }, () => Object.fromEntries(horas.map(h => [h, 0])));
  const porBarbero = {};
  for (const c of enRango) {
    const b = (porBarbero[c.prestador] = porBarbero[c.prestador] || { barbero: c.prestador, dias: new Set(), atendidas: 0, noAsiste: 0, minutos: 0 });
    b.dias.add(c.fecha);
    if (esAsiste(c.estado)) {
      b.atendidas++;
      const m = String(c.hora || '').match(/(\d{1,2}):(\d{2})/); if (!m) continue;
      const ini = (+m[1]) * 60 + (+m[2]), dur = anDuracion(c.servicio), d = dow(c.fecha);
      b.minutos += dur;
      if (+m[1] >= horaMin && +m[1] <= horaMax) inicios[d][+m[1]]++;
      for (let t = ini; t < ini + dur; t++) { const h = Math.floor(t / 60); if (h >= horaMin && h <= horaMax) minutos[d][h]++; }
    } else if (/no asiste/.test(propNorm(c.estado))) b.noAsiste++;
  }
  const matriz = minutos.map((fila, d) => Object.fromEntries(horas.map(h => [h, {
    citas: inicios[d][h], minutos: fila[h],
    ocupacion: barberoDias[d] ? fila[h] / (60 * barberoDias[d]) : null,
  }])));
  // horas en que nunca hubo actividad (antes de abrir / después de cerrar) no se muestran
  const horasActivas = horas.filter(h => matriz.some(f => f[h].minutos > 0));
  const barberos = Object.values(porBarbero).map(b => ({
    barbero: b.barbero, diasTrabajados: b.dias.size, atendidas: b.atendidas,
    citasPorDia: b.dias.size ? b.atendidas / b.dias.size : 0,
    horasPorDia: b.dias.size ? b.minutos / 60 / b.dias.size : 0,
    tasaNoAsiste: (b.atendidas + b.noAsiste) ? b.noAsiste / (b.atendidas + b.noAsiste) : 0,
  })).sort((a, b) => b.citasPorDia - a.citasPorDia);
  return { horas: horasActivas, matriz, barberoDias, barberos, dias: Object.keys(trabajo).length };
}

// ---------- 7. Margen real ----------
// Lo que le queda a la barbería: venta − comisión del barbero − comisión GetNet − costo del producto.
// Las propinas no cuentan (son del barbero). La comisión GetNet se reparte entre las ventas del mismo pago.
function anTasasGetnet(getnet) {
  const acc = {};
  for (const g of getnet) if (g.comision != null && g.valor_venta > 0) {
    const k = propNorm(g.tipo) || 'otro'; const a = (acc[k] = acc[k] || [0, 0]); a[0] += g.comision; a[1] += g.valor_venta;
  }
  const tasas = Object.fromEntries(Object.entries(acc).map(([k, [c, v]]) => [k, c / v]));
  const tot = Object.values(acc).reduce((s, [c, v]) => [s[0] + c, s[1] + v], [0, 0]);
  tasas._promedio = tot[1] ? tot[0] / tot[1] : 0.018;
  return tasas;
}
function anMargen(ventas, getnet, servicios, productos, gastos = [], { comisionProducto = 0.10 } = {}) {
  const tasas = anTasasGetnet(getnet);
  const gnPorClave = {};
  for (const g of getnet) {
    const k = String(g.cod_aut || '').trim().replace(/^0+/, '') + '|' + String(g.fecha_venta).slice(0, 10);
    const real = g.comision != null;
    const com = real ? g.comision : Math.round((g.valor_venta || 0) * (tasas[propNorm(g.tipo)] ?? tasas._promedio));
    const o = (gnPorClave[k] = gnPorClave[k] || { comision: 0, estimada: false });
    o.comision += com; if (!real) o.estimada = true;
  }
  // monto de las ventas TK por pago, para repartir la comisión
  const montoPorClave = {};
  const claveDe = v => String(v.cod_autorizacion || '').trim().replace(/^0+/, '') + '|' + String(v.fecha).slice(0, 10);
  for (const v of ventas) if (v.forma_pago === 'TK' && v.cod_autorizacion) montoPorClave[claveDe(v)] = (montoPorClave[claveDe(v)] || 0) + (v.monto || 0);
  const pctServicio = nombre => { const s = servicios.find(x => propNorm(x.nombre) === propNorm(nombre)); return (s?.comision ?? 50) / 100; };
  const costoProducto = nombre => { const p = productos.find(x => propNorm(x.nombre) === propNorm(nombre)); return p && p.costo > 0 && p.precio > 0 ? p.costo / p.precio : null; };

  const filas = ventas.map(v => {
    const monto = v.monto || 0;
    const esProd = v.tipo === 'PRODUCTO';
    const comBarbero = Math.round(monto * (esProd ? comisionProducto : pctServicio(v.servicio_producto)));
    let comGetnet = 0, estimada = false;
    if (v.forma_pago === 'TK') {
      const g = v.cod_autorizacion && gnPorClave[claveDe(v)];
      if (g) { const base = montoPorClave[claveDe(v)] || monto; comGetnet = Math.round(g.comision * (base ? monto / base : 0)); estimada = g.estimada; }
      else { comGetnet = Math.round(monto * tasas._promedio); estimada = true; }
    }
    const r = esProd ? costoProducto(v.servicio_producto) : 0;
    const costo = r === null ? 0 : Math.round(monto * r);
    return { ...v, monto, comBarbero, comGetnet, costo, sinCosto: esProd && r === null, estimada, margen: monto - comBarbero - comGetnet - costo };
  });
  const agrupar = (keyFn) => {
    const m = {};
    for (const f of filas) {
      const k = keyFn(f); const o = (m[k] = m[k] || { clave: k, cantidad: 0, venta: 0, comBarbero: 0, comGetnet: 0, costo: 0, margen: 0, sinCosto: 0 });
      o.cantidad++; o.venta += f.monto; o.comBarbero += f.comBarbero; o.comGetnet += f.comGetnet; o.costo += f.costo; o.margen += f.margen; if (f.sinCosto) o.sinCosto++;
    }
    return Object.values(m).map(o => ({ ...o, pct: o.venta ? o.margen / o.venta : 0 })).sort((a, b) => b.margen - a.margen);
  };
  const total = agrupar(() => 'total')[0] || { venta: 0, margen: 0, comBarbero: 0, comGetnet: 0, costo: 0, cantidad: 0, pct: 0 };
  // Gastos del período, sin "Adelantos" (son parte de la comisión del barbero, ya descontada)
  const gastosCat = {};
  for (const g of gastos) { if (/adelanto/i.test(g.categoria || '')) continue; gastosCat[g.categoria || 'Otros'] = (gastosCat[g.categoria || 'Otros'] || 0) + (g.monto || 0); }
  const totalGastos = Object.values(gastosCat).reduce((a, b) => a + b, 0);
  return {
    porServicio: agrupar(f => (f.tipo === 'PRODUCTO' ? 'Productos' : propNorm(f.servicio_producto) ? f.servicio_producto.trim() : 'Sin servicio')),
    porBarbero: agrupar(f => f.barbero_nombre || 'Sin barbero'),
    porFormaPago: agrupar(f => f.forma_pago || '—'),
    total, gastos: Object.entries(gastosCat).map(([categoria, monto]) => ({ categoria, monto })).sort((a, b) => b.monto - a.monto),
    totalGastos, utilidad: total.margen - totalGastos, tasas,
    comisionEstimada: filas.some(f => f.estimada), productosSinCosto: filas.filter(f => f.sinCosto).length,
  };
}

export { anAsignarClientes, anClaveCita, anDuracion, anClientesEnRiesgo, anMargen, anOcupacion, anParseAgendaCompleta, anRetencion, anTasasGetnet, anTel, anVisitas };
