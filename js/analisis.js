// Pestaña Análisis: clientes en riesgo, retención por barbero, ocupación por franja y margen real.
// La sub-pestaña "Totales" es el análisis que existía antes (analisis_totales.js).
import { MESES, fmtCLP, getXLSX, hideOverlay, loadCatalogos, localISODate, productos, sb, servicios, showOverlay, toast, today } from './core.js';
import { anClientesEnRiesgo, anMargen, anOcupacion, anRetencion } from './analisis_logic.js';
import { cargarAgendaCitas, guardarAgendaCitas, olvidarAgendaCitas } from './agenda.js';
import { loadAnalisisTotales } from './analisis_totales.js';

const anState = { vista: 'riesgo', barbero: '', semanas: 8, anio: new Date().getFullYear(), mes: new Date().getMonth() + 1, listaPerdidos: false };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, d = 0) => x == null ? '—' : (x * 100).toFixed(d) + '%';
const fechaCorta = f => { const [y, m, d] = String(f).split('-'); return `${+d} ${MESES[+m - 1].slice(0, 3).toLowerCase()} ${y.slice(2)}`; };
const VISTAS = [['riesgo', '👥 Clientes en riesgo'], ['retencion', '🔁 Retención'], ['ocupacion', '🕒 Ocupación'], ['margen', '💰 Margen real'], ['totales', '📊 Totales']];

// WhatsApp con saludo listo (número chileno)
function linkWsp(tel, nombre) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 8) d = '569' + d; else if (d.length === 9 && d[0] === '9') d = '56' + d;
  if (d.length < 11) return esc(tel || '');
  const primer = String(nombre || '').trim().split(/\s+/)[0] || '';
  const txt = encodeURIComponent(`Hola ${primer.charAt(0).toUpperCase() + primer.slice(1).toLowerCase()}! Te escribimos de Píston Barbería 💈 Hace tiempo que no te vemos, ¿te agendamos tu próximo corte?`);
  return `<a href="https://wa.me/${d}?text=${txt}" target="_blank" rel="noopener" title="Escribir por WhatsApp">💬 ${esc(tel)}</a>`;
}

async function loadAnalisis() {
  const main = document.getElementById('mainContent');
  main.innerHTML = `
    <div class="card" style="padding:12px 16px">
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${VISTAS.map(([k, t]) => `<button class="btn btn-sm ${anState.vista === k ? 'btn-primary' : 'btn-ghost'}" onclick="window._bridge.anVista('${k}')">${t}</button>`).join('')}
        <span id="anFuente" style="margin-left:auto;font-size:11px;color:#64748B"></span>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer" title="Sube el reporte de reservas de AgendaPro para actualizar clientes y ocupación">📥 Actualizar citas AgendaPro
          <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="window._bridge.anImportar(this)"></label>
      </div>
    </div>
    <div id="anContenido"><div style="text-align:center;padding:40px;color:#64748B">Cargando...</div></div>`;
  if (anState.vista === 'totales') return loadAnalisisTotales();
  showOverlay();
  try {
    if (anState.vista === 'margen') await renderMargen();
    else {
      const citas = await cargarAgendaCitas();
      const fuente = document.getElementById('anFuente');
      if (fuente) fuente.textContent = citas.length ? `${citas.length.toLocaleString('es-CL')} citas de AgendaPro, hasta el ${fechaCorta(citas[citas.length - 1].fecha)}` : '';
      if (!citas.length) {
        document.getElementById('anContenido').innerHTML = `<div class="card" style="text-align:center;padding:30px;color:#64748B">Todavía no hay citas de AgendaPro cargadas. Descarga el reporte de reservas de AgendaPro (idealmente desde el inicio) y súbelo con <b>📥 Actualizar citas AgendaPro</b>.</div>`;
      } else if (anState.vista === 'riesgo') renderRiesgo(citas);
      else if (anState.vista === 'retencion') renderRetencion(citas);
      else if (anState.vista === 'ocupacion') renderOcupacion(citas);
    }
  } catch (e) { toast('Error en Análisis: ' + e.message, 'error'); }
  finally { hideOverlay(); }
}

function filtroBarbero(citas) {
  const nombres = [...new Set(citas.filter(c => c.fecha >= localISODate(new Date(Date.now() - 120 * 864e5))).map(c => c.prestador).filter(Boolean))].sort();
  return `<select onchange="window._bridge.anSet('barbero',this.value)"><option value="">Todos los barberos</option>${nombres.map(n => `<option ${anState.barbero === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`;
}

// ---------- 1. Clientes en riesgo ----------
function renderRiesgo(citas) {
  const r = anClientesEnRiesgo(citas, today());
  const fb = x => !anState.barbero || x.barberoUltimo === anState.barbero;
  const riesgo = r.riesgo.filter(fb), nuevos = r.nuevosSinVolver.filter(fb), perdidos = r.perdidos.filter(fb);
  const filaRiesgo = x => `<tr><td><b>${esc(x.nombre)}</b></td><td style="text-align:center">${x.visitas}</td><td>cada ${x.frecuencia} días</td>
    <td>${fechaCorta(x.ultima)} <span style="color:var(--red);font-size:11px">(hace ${x.diasSinVenir} días)</span></td><td>${esc(x.barberoUltimo)}</td><td>${linkWsp(x.telefono, x.nombre)}</td></tr>`;
  window.__anExport = { riesgo, nuevos, perdidos };
  document.getElementById('anContenido').innerHTML = `
  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">Clientes activos</div><div class="metric-value">${r.activos}</div><div class="metric-sub">vienen a su ritmo habitual</div></div>
    <div class="metric"><div class="metric-label">En riesgo</div><div class="metric-value" style="color:var(--amber)">${r.riesgo.length}</div><div class="metric-sub">pasaron 1,5× su frecuencia sin volver</div></div>
    <div class="metric"><div class="metric-label">Nuevos que no volvieron</div><div class="metric-value" style="color:var(--amber)">${r.nuevosSinVolver.length}</div><div class="metric-sub">1 visita, hace 30–120 días</div></div>
    <div class="metric"><div class="metric-label">Perdidos</div><div class="metric-value" style="color:var(--red)">${r.perdidos.length}</div><div class="metric-sub">más de 6 meses sin venir</div></div>
  </div>
  <div class="card">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
      <div class="card-title" style="margin:0">⚠️ Clientes en riesgo (${riesgo.length})</div>
      <span style="font-size:11px;color:#64748B">Clientes frecuentes que ya se pasaron de su ritmo habitual. Los primeros de la lista son los más fieles: vale la pena escribirles hoy.</span>
      <span style="margin-left:auto">${filtroBarbero(citas)}</span>
      <button class="btn btn-ghost btn-sm" onclick="window._bridge.anExportar('riesgo')">⬇ CSV</button>
    </div>
    <div style="overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Visitas</th><th>Venía</th><th>Última visita</th><th>Último barbero</th><th>Contacto</th></tr></thead>
    <tbody>${riesgo.slice(0, 150).map(filaRiesgo).join('') || '<tr><td colspan="6" style="text-align:center;color:#64748B">Nadie en riesgo 🎉</td></tr>'}</tbody></table></div>
  </div>
  <div class="card">
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><div class="card-title" style="margin:0">🆕 Vinieron una vez y no volvieron (${nuevos.length})</div>
      <span style="font-size:11px;color:#64748B">Primera visita hace 30 a 120 días. Una invitación a tiempo puede convertirlos en clientes habituales.</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="window._bridge.anExportar('nuevos')">⬇ CSV</button></div>
    <div style="overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Visitó</th><th>Servicio</th><th>Barbero</th><th>Contacto</th></tr></thead>
    <tbody>${nuevos.slice(0, 150).map(x => `<tr><td><b>${esc(x.nombre)}</b></td><td>${fechaCorta(x.ultima)} <span style="color:#64748B;font-size:11px">(hace ${x.diasSinVenir} días)</span></td><td>${esc(x.citas[0].servicio)}</td><td>${esc(x.barberoUltimo)}</td><td>${linkWsp(x.telefono, x.nombre)}</td></tr>`).join('')}</tbody></table></div>
  </div>
  <div class="card">
    <div style="display:flex;gap:8px;align-items:center"><div class="card-title" style="margin:0">💤 Perdidos (${perdidos.length})</div>
      <span style="font-size:11px;color:#64748B">Más de 6 meses (o 3 veces su ritmo) sin venir.</span>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="window._bridge.anSet('listaPerdidos',${!anState.listaPerdidos})">${anState.listaPerdidos ? 'Ocultar' : 'Ver lista'}</button>
      <button class="btn btn-ghost btn-sm" onclick="window._bridge.anExportar('perdidos')">⬇ CSV</button></div>
    ${anState.listaPerdidos ? `<div style="overflow-x:auto;margin-top:10px"><table><thead><tr><th>Cliente</th><th>Visitas</th><th>Venía</th><th>Última visita</th><th>Último barbero</th><th>Contacto</th></tr></thead><tbody>${perdidos.slice(0, 300).map(filaRiesgo).join('')}</tbody></table></div>` : ''}
  </div>
  <div style="font-size:11px;color:#94A3B8;margin:0 0 10px">Los clientes se reconocen por teléfono (o email / nombre si no hay teléfono). "cliente cliente" y citas sin datos no se cuentan.</div>`;
}

function exportar(cual) {
  const lista = (window.__anExport || {})[cual] || [];
  const filas = [['Cliente', 'Teléfono', 'Email', 'Visitas', 'Frecuencia (días)', 'Última visita', 'Días sin venir', 'Último barbero']]
    .concat(lista.map(x => [x.nombre, x.telefono, x.email, x.visitas || 1, x.frecuencia || '', x.ultima, x.diasSinVenir, x.barberoUltimo]));
  const csv = filas.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
  a.download = `clientes_${cual}_${today()}.csv`; a.click();
}

// ---------- 2. Retención ----------
function renderRetencion(citas) {
  const r = anRetencion(citas, today());
  const t = r.total || {};
  const maxN = Math.max(1, ...r.porMes.map(m => m.nuevos));
  const color = p => p == null ? '#94A3B8' : p >= 0.4 ? 'var(--green)' : p >= 0.3 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('anContenido').innerHTML = `
  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">Clientes nuevos analizados</div><div class="metric-value">${(t.nuevos || 0).toLocaleString('es-CL')}</div><div class="metric-sub">primera visita desde ${r.desde ? fechaCorta(r.desde) : '—'}</div></div>
    <div class="metric"><div class="metric-label">Volvieron en ${r.ventana} días</div><div class="metric-value" style="color:${color(t.pct)}">${pct(t.pct)}</div><div class="metric-sub">${t.volvieron || 0} de ${t.nuevos || 0}</div></div>
    <div class="metric"><div class="metric-label">Volvieron con el mismo barbero</div><div class="metric-value">${pct(t.pctMismo)}</div><div class="metric-sub">de los que volvieron</div></div>
    <div class="metric"><div class="metric-label">No volvieron</div><div class="metric-value" style="color:var(--red)">${(t.nuevos || 0) - (t.volvieron || 0)}</div><div class="metric-sub">clientes que se perdieron tras la 1ª visita</div></div>
  </div>
  <div class="card">
    <div class="card-title">Retención por barbero de la primera visita</div>
    <div style="font-size:11px;color:#64748B;margin-bottom:10px">De los clientes nuevos que atendió cada barbero, cuántos volvieron a la barbería dentro de ${r.ventana} días. Mide quién fideliza, no solo quién vende.</div>
    <table><thead><tr><th>Barbero</th><th>Clientes nuevos</th><th>Volvieron</th><th style="width:35%">% que volvió</th><th>Volvieron con él/ella</th></tr></thead><tbody>
    ${r.porBarbero.map(b => `<tr><td><b>${esc(b.clave)}</b></td><td>${b.nuevos}</td><td>${b.volvieron}</td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;background:#F1F5F9;border-radius:4px;height:14px"><div style="width:${Math.round((b.pct || 0) * 100)}%;background:${color(b.pct)};height:14px;border-radius:4px"></div></div><b style="width:40px;color:${color(b.pct)}">${pct(b.pct)}</b></div></td>
      <td>${pct(b.pctMismo)}</td></tr>`).join('')}
    </tbody></table>
  </div>
  <div class="card">
    <div class="card-title">Clientes nuevos por mes y cuántos volvieron</div>
    <div style="font-size:11px;color:#64748B;margin-bottom:10px">Barra gris: clientes nuevos ese mes. Parte de color: los que volvieron dentro de ${r.ventana} días. Los últimos ${r.ventana} días no aparecen porque aún no se sabe si volverán.</div>
    ${r.porMes.map(m => `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px">
      <span style="width:70px;color:#64748B">${MESES[+m.clave.slice(5) - 1].slice(0, 3)} ${m.clave.slice(2, 4)}</span>
      <div style="flex:1;background:#F1F5F9;border-radius:4px;height:16px;position:relative"><div style="position:absolute;left:0;top:0;height:16px;border-radius:4px;background:#CBD5E1;width:${(m.nuevos / maxN * 100).toFixed(1)}%"></div><div style="position:absolute;left:0;top:0;height:16px;border-radius:4px;background:${color(m.pct)};width:${(m.volvieron / maxN * 100).toFixed(1)}%"></div></div>
      <span style="width:120px;text-align:right">${m.nuevos} nuevos · <b style="color:${color(m.pct)}">${pct(m.pct)}</b></span></div>`).join('')}
  </div>`;
}

// ---------- 4. Ocupación ----------
function renderOcupacion(citas) {
  const hasta = today(), desde = localISODate(new Date(Date.now() - anState.semanas * 7 * 864e5));
  const filtradas = anState.barbero ? citas.filter(c => c.prestador === anState.barbero) : citas;
  const o = anOcupacion(filtradas, { desde, hasta });
  const D = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const celda = x => {
    if (!x || x.ocupacion == null) return '<td style="background:#F8FAFC;color:#CBD5E1;text-align:center">—</td>';
    const p = Math.min(1, x.ocupacion);
    const bg = p >= 0.7 ? '#15803D' : p >= 0.5 ? '#4ADE80' : p >= 0.3 ? '#FDE68A' : p >= 0.15 ? '#FECACA' : '#FCA5A5';
    return `<td style="background:${bg};color:${p >= 0.7 ? '#fff' : '#1E293B'};text-align:center;font-weight:600" title="${x.citas} citas comenzaron en esta hora">${Math.round(x.ocupacion * 100)}%</td>`;
  };
  const libres = [];
  for (const d of orden) for (const h of o.horas) { const x = o.matriz[d][h]; if (x.ocupacion != null && o.barberoDias[d] >= 3 && x.ocupacion < 0.25) libres.push(`${D[d].slice(0, 3)} ${h}:00`); }
  document.getElementById('anContenido').innerHTML = `
  <div class="card">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <div class="card-title" style="margin:0">Ocupación por día y hora</div>
      <span style="margin-left:auto">${filtroBarbero(citas)}</span>
      <select onchange="window._bridge.anSet('semanas',Number(this.value))">${[4, 8, 12, 26].map(s => `<option value="${s}" ${anState.semanas === s ? 'selected' : ''}>Últimas ${s} semanas</option>`).join('')}</select>
    </div>
    <div style="font-size:11px;color:#64748B;margin-bottom:10px">Porcentaje del tiempo de los barberos que estuvo ocupado con clientes, considerando solo los días que cada uno trabajó. 100% = todos ocupados toda la hora. Duración estimada: corte 40 min, combinados 60 min, Experiencia 80 min.</div>
    <div style="overflow-x:auto"><table style="min-width:640px"><thead><tr><th></th>${o.horas.map(h => `<th style="text-align:center">${h}:00</th>`).join('')}</tr></thead>
    <tbody>${orden.filter(d => o.barberoDias[d] > 0).map(d => `<tr><td><b>${D[d]}</b></td>${o.horas.map(h => celda(o.matriz[d][h])).join('')}</tr>`).join('')}</tbody></table></div>
    <div style="display:flex;gap:10px;font-size:11px;margin-top:8px;color:#64748B;flex-wrap:wrap">
      <span><span style="display:inline-block;width:12px;height:12px;background:#FCA5A5;vertical-align:middle"></span> &lt;15%</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#FECACA;vertical-align:middle"></span> 15–30%</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#FDE68A;vertical-align:middle"></span> 30–50%</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#4ADE80;vertical-align:middle"></span> 50–70%</span>
      <span><span style="display:inline-block;width:12px;height:12px;background:#15803D;vertical-align:middle"></span> 70%+</span>
    </div>
    ${libres.length ? `<div style="margin-top:10px;font-size:12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:8px 12px"><b>Horas con menos de 25% de ocupación:</b> ${libres.join(' · ')}. Son buenas candidatas para promociones, horario reducido o turnos cortos.</div>` : ''}
  </div>
  <div class="card">
    <div class="card-title">Por barbero (mismo período)</div>
    <table><thead><tr><th>Barbero</th><th>Días trabajados</th><th>Citas atendidas</th><th>Citas por día</th><th>Horas con clientes por día</th><th>No asistió</th></tr></thead><tbody>
    ${anOcupacion(citas, { desde, hasta }).barberos.map(b => `<tr><td><b>${esc(b.barbero)}</b></td><td>${b.diasTrabajados}</td><td>${b.atendidas}</td><td><b>${b.citasPorDia.toFixed(1)}</b></td><td>${b.horasPorDia.toFixed(1)} h</td><td>${pct(b.tasaNoAsiste)}</td></tr>`).join('')}
    </tbody></table>
  </div>`;
}

// ---------- 7. Margen real ----------
async function renderMargen() {
  await loadCatalogos();
  const { anio, mes } = anState;
  const ini = `${anio}-${String(mes || 1).padStart(2, '0')}-01`;
  const fin = mes ? localISODate(new Date(anio, mes, 0)) : `${anio}-12-31`;
  const [vRes, gRes, gaRes] = await Promise.all([
    sb.rpc('get_ventas_anio_json', { p_anio: anio }),
    (() => { let q = sb.from('getnet_transacciones').select('cod_aut,fecha_venta,valor_venta,propina,comision,tipo').eq('anio', anio); if (mes) q = q.eq('mes', mes); return q.range(0, 999); })(),
    sb.from('gastos').select('monto,categoria,fecha').gte('fecha', ini).lte('fecha', fin).range(0, 999),
  ]);
  if (vRes.error) throw vRes.error; if (gRes.error) throw gRes.error; if (gaRes.error) throw gaRes.error;
  let getnet = gRes.data || [];
  if (!mes && getnet.length === 1000) { // año completo: traer por mes para no topar con el límite de 1.000 filas
    getnet = [];
    for (let m = 1; m <= 12; m++) { const r = await sb.from('getnet_transacciones').select('cod_aut,fecha_venta,valor_venta,propina,comision,tipo').eq('anio', anio).eq('mes', m).range(0, 999); if (r.error) throw r.error; getnet.push(...r.data); }
  }
  const ventas = (vRes.data || []).filter(v => !mes || +v.n_mes === +mes);
  const m = anMargen(ventas, getnet, servicios, productos, gaRes.data || []);
  const anios = []; for (let y = new Date().getFullYear(); y >= 2025; y--) anios.push(y);
  const tabla = (titulo, filas, nota = '') => `<div class="card"><div class="card-title">${titulo}</div>${nota ? `<div style="font-size:11px;color:#64748B;margin-bottom:8px">${nota}</div>` : ''}
    <div style="overflow-x:auto"><table><thead><tr><th></th><th>Cantidad</th><th>Venta</th><th>Comisión barbero</th><th>Comisión GetNet</th><th>Costo producto</th><th>Margen</th><th>% margen</th></tr></thead><tbody>
    ${filas.map(f => `<tr><td><b>${esc(f.clave)}</b></td><td>${f.cantidad}</td><td>${fmtCLP(f.venta)}</td><td>${fmtCLP(f.comBarbero)}</td><td>${fmtCLP(f.comGetnet)}</td><td>${f.costo ? fmtCLP(f.costo) : (f.sinCosto ? '<span style="color:#94A3B8" title="Productos sin costo cargado en Inventario">s/i</span>' : '—')}</td><td><b>${fmtCLP(f.margen)}</b></td><td>${pct(f.pct)}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  const t = m.total;
  document.getElementById('anContenido').innerHTML = `
  <div class="card" style="padding:12px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <div class="card-title" style="margin:0">Margen real</div>
    <select onchange="window._bridge.anSet('anio',Number(this.value))">${anios.map(y => `<option ${anState.anio === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select onchange="window._bridge.anSet('mes',Number(this.value))"><option value="0" ${!anState.mes ? 'selected' : ''}>Año completo</option>${MESES.map((n, i) => `<option value="${i + 1}" ${anState.mes === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <span style="font-size:11px;color:#64748B">Lo que le queda a la barbería de cada venta: venta − comisión del barbero − comisión GetNet − costo del producto. Las propinas no cuentan (son del barbero).</span>
  </div>
  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">Venta (sin propinas)</div><div class="metric-value">${fmtCLP(t.venta)}</div><div class="metric-sub">${t.cantidad} líneas de venta</div></div>
    <div class="metric"><div class="metric-label">Comisiones</div><div class="metric-value">${fmtCLP(t.comBarbero + t.comGetnet)}</div><div class="metric-sub">barberos ${fmtCLP(t.comBarbero)} · GetNet ${fmtCLP(t.comGetnet)}</div></div>
    <div class="metric"><div class="metric-label">Margen bruto</div><div class="metric-value" style="color:var(--green)">${fmtCLP(t.margen)}</div><div class="metric-sub">${pct(t.pct)} de la venta</div></div>
    <div class="metric"><div class="metric-label">Utilidad aprox.</div><div class="metric-value" style="color:${m.utilidad >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtCLP(m.utilidad)}</div><div class="metric-sub">margen − gastos ${fmtCLP(m.totalGastos)} (sin adelantos)</div></div>
  </div>
  ${tabla('Por servicio', m.porServicio, 'Ordenado por cuánto margen deja en total. Fíjate en el % margen: dice qué servicio conviene empujar.')}
  ${tabla('Por barbero', m.porBarbero)}
  ${tabla('Por forma de pago', m.porFormaPago, 'La comisión GetNet solo aplica a tarjeta (TK).')}
  <div class="card"><div class="card-title">Gastos del período (sin adelantos a barberos)</div>
    ${m.gastos.length ? `<table><tbody>${m.gastos.map(g => `<tr><td>${esc(g.categoria)}</td><td style="text-align:right">${fmtCLP(g.monto)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td style="text-align:right"><b>${fmtCLP(m.totalGastos)}</b></td></tr></tbody></table>` : '<div style="color:#64748B;font-size:12px">Sin gastos registrados en el período.</div>'}
  </div>
  <div style="font-size:11px;color:#94A3B8;margin:0 0 10px">
    ${m.comisionEstimada ? `Comisión GetNet: real donde el archivo de GetNet la trae; en el resto se estima con la tasa observada (débito ${pct(m.tasas['debito'], 2)}, crédito ${pct(m.tasas['credito'], 2)}, prepago ${pct(m.tasas['prepago'], 2)}). Al subir de nuevo los archivos de GetNet se usa la real. ` : ''}
    ${m.productosSinCosto ? `${m.productosSinCosto} ventas de productos sin costo cargado en Inventario (su margen no descuenta el costo). ` : ''}
    Comisión de barbero según % del servicio (Equipo) y 10% en productos, igual que Liquidación.
  </div>`;
}

async function anImportar(input) {
  const file = input.files?.[0]; if (!file) return;
  showOverlay();
  try {
    const XL = await getXLSX();
    const wb = XL.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const aoa = XL.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
    const r = await guardarAgendaCitas(aoa, file.name);
    olvidarAgendaCitas();
    toast(`✓ ${r.total.toLocaleString('es-CL')} citas de AgendaPro guardadas (${fechaCorta(r.desde)} a ${fechaCorta(r.hasta)})`);
  } catch (e) { toast('Error al importar: ' + e.message, 'error'); }
  finally { hideOverlay(); input.value = ''; }
  loadAnalisis();
}

window._bridge.anVista = v => { anState.vista = v; loadAnalisis(); };
window._bridge.anSet = (k, v) => { anState[k] = v; loadAnalisis(); };
window._bridge.anExportar = exportar;
window._bridge.anImportar = anImportar;

export { loadAnalisis };
