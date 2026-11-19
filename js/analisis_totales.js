// Análisis → sub-pestaña "Totales" (el análisis que existía antes)
import { MESES, fmtCLP, hideOverlay, sb, showOverlay } from './core.js';

// ============ ANÁLISIS ============
let analisisFiltros = { anio: new Date().getFullYear(), mes: 0 };

async function loadAnalisis(){
  showOverlay();
  const {data:ventasJson} = await sb.rpc('get_ventas_anio_json', {p_anio: analisisFiltros.anio});
  const ventas = ventasJson || [];
  hideOverlay();
  renderAnalisis(ventas);
}

function normDiaA(d){
  if(!d) return null;
  const s=String(d).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return {lunes:'Lunes',martes:'Martes',miercoles:'Miércoles',jueves:'Jueves',viernes:'Viernes',sabado:'Sábado',domingo:'Domingo'}[s]||null;
}

function barH(val, max, color, height='18px'){
  const w=Math.round(val/max*100);
  return `<div style="flex:1;height:${height};background:#F1F5F9;border-radius:4px;overflow:hidden">
    <div style="height:100%;width:${w}%;background:${color};border-radius:4px;transition:.4s"></div>
  </div>`;
}

function renderAnalisis(ventasAll){
  // Filtrar por mes si aplica
  const ventas = analisisFiltros.mes>0
    ? ventasAll.filter(v=>v.n_mes==analisisFiltros.mes)
    : ventasAll;

  const anios=[...new Set(ventasAll.map(v=>v.anio).filter(Boolean))].sort((a,b)=>b-a);
  const anioOpts=anios.map(a=>`<option value="${a}" ${analisisFiltros.anio==a?'selected':''}>${a}</option>`).join('');
  const mesOpts=MESES.map((m,i)=>`<option value="${i+1}" ${analisisFiltros.mes==i+1?'selected':''}>${m}</option>`).join('');

  // ── 1. Día de semana ──────────────────────────────────────────────────────
  const diasOrden=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
  const coloresDia=['#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6','#1E6FD9','#8B5CF6'];
  const byDia={};
  diasOrden.forEach(d=>{ byDia[d]={total:0,count:0,fechas:new Set()}; });
  ventas.forEach(v=>{
    const d=normDiaA(v.dia_semana); if(!d) return;
    byDia[d].total+=(v.total||0); byDia[d].count++;
    if(v.fecha) byDia[d].fechas.add(v.fecha);
  });
  diasOrden.forEach(d=>{
    byDia[d].promedio=Math.round(byDia[d].total/(byDia[d].fechas.size||1));
    byDia[d].dias=byDia[d].fechas.size;
  });
  const maxProm=Math.max(...diasOrden.map(d=>byDia[d].promedio),1);
  const maxDiaTotal=Math.max(...diasOrden.map(d=>byDia[d].total),1);
  const rankingDia=[...diasOrden].sort((a,b)=>byDia[b].promedio-byDia[a].promedio);

  // ── 2. Evolución mensual ──────────────────────────────────────────────────
  const byMes={};
  MESES.forEach((m,i)=>{ byMes[i+1]={nombre:m,total:0,count:0}; });
  ventasAll.forEach(v=>{ if(v.n_mes) { byMes[v.n_mes].total+=(v.total||0); byMes[v.n_mes].count++; } });
  const mesesConDatos=Object.values(byMes).filter(m=>m.total>0);
  const maxMes=Math.max(...mesesConDatos.map(m=>m.total),1);

  // ── 3. Ranking servicios ──────────────────────────────────────────────────
  const bySvc={};
  ventas.filter(v=>v.tipo==='servicio').forEach(v=>{
    const s=v.servicio_producto||'Otro';
    if(!bySvc[s]) bySvc[s]={total:0,count:0};
    bySvc[s].total+=(v.monto||0); bySvc[s].count++;
  });
  const topSvc=Object.entries(bySvc).sort((a,b)=>b[1].count-a[1].count).slice(0,10);
  const maxSvc=Math.max(...topSvc.map(([,d])=>d.count),1);

  // ── 4. Ticket promedio por barbero ────────────────────────────────────────
  const byBarb={};
  ventas.filter(v=>v.tipo==='servicio'&&!String(v.barbero_nombre||'').toUpperCase().includes('PISTON'))
    .forEach(v=>{
      const n=v.barbero_nombre||'?';
      if(!byBarb[n]) byBarb[n]={total:0,count:0,propinas:0};
      byBarb[n].total+=(v.monto||0); byBarb[n].count++; byBarb[n].propinas+=(v.propina||0);
    });
  Object.keys(byBarb).forEach(k=>{ byBarb[k].ticket=Math.round(byBarb[k].total/(byBarb[k].count||1)); });
  const topBarb=Object.entries(byBarb).sort((a,b)=>b[1].ticket-a[1].ticket);
  const maxTicket=Math.max(...topBarb.map(([,d])=>d.ticket),1);
  const coloresBarb=['#1E6FD9','#10B981','#F59E0B','#EC4899','#8B5CF6','#6366F1','#EF4444'];

  // ── 5. Propinas por barbero ───────────────────────────────────────────────
  const topPropinas=Object.entries(byBarb).sort((a,b)=>b[1].propinas-a[1].propinas);
  const maxPropina=Math.max(...topPropinas.map(([,d])=>d.propinas),1);

  // ── 6. Forma de pago ─────────────────────────────────────────────────────
  const byPago={EF:0,TK:0,TRF:0,MP:0};
  ventas.forEach(v=>{ if(byPago[v.forma_pago]!==undefined) byPago[v.forma_pago]+=(v.total||0); });
  const totalPago=Object.values(byPago).reduce((s,v)=>s+v,0)||1;

  // ── 7. Clientes más frecuentes ────────────────────────────────────────────
  const byCli={};
  ventas.filter(v=>v.cliente&&v.cliente.trim()&&v.cliente.trim().toUpperCase()!=='CLIENTE CLIENTE').forEach(v=>{
    const c=v.cliente.trim().toUpperCase();
    if(!byCli[c]) byCli[c]={count:0,total:0};
    byCli[c].count++; byCli[c].total+=(v.total||0);
  });
  const topCli=Object.entries(byCli).sort((a,b)=>b[1].count-a[1].count).slice(0,8);
  const maxCli=Math.max(...topCli.map(([,d])=>d.count),1);

  (document.getElementById('anContenido')||document.getElementById('mainContent')).innerHTML=`
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
    <span class="sec-title" style="margin:0">📈 Análisis</span>
    <select onchange="window._bridge.analisisSetAnio(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">${anioOpts}</select>
    <select onchange="window._bridge.analisisSetMes(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      <option value="0" ${analisisFiltros.mes==0?'selected':''}>Año completo</option>${mesOpts}
    </select>
    <span style="font-size:12px;color:#64748B">${analisisFiltros.mes>0?MESES[analisisFiltros.mes-1]+' ':''} ${analisisFiltros.anio} · ${ventas.length} transacciones</span>
  </div>

  <!-- Fila 1: Evolución mensual + Forma de pago -->
  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Evolución Mensual ${analisisFiltros.anio}</div>
      ${mesesConDatos.length===0?'<p style="color:#64748B;font-size:12px">Sin datos</p>':
        Object.values(byMes).filter(m=>m.total>0).map((m,i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <div style="width:70px;font-size:11px;font-weight:500;color:#374151;text-align:right;flex-shrink:0">${m.nombre.slice(0,3)}</div>
          ${barH(m.total,maxMes,'#1E6FD9')}
          <div style="width:90px;font-size:12px;font-weight:700;flex-shrink:0">${fmtCLP(m.total)}</div>
          <div style="width:40px;font-size:10px;color:#94A3B8;flex-shrink:0">${m.count}t</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Distribución por Forma de Pago</div>
      ${Object.entries(byPago).map(([k,v])=>{
        const pct=Math.round(v/totalPago*100);
        const col={EF:'#15803D',TK:'#1E6FD9',TRF:'#6D28D9',MP:'#0369A1'}[k]||'#64748B';
        return `<div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:12px;font-weight:600">${k}</span>
            <span style="font-size:12px;color:#64748B">${fmtCLP(v)} · <strong>${pct}%</strong></span>
          </div>
          <div style="height:10px;background:#F1F5F9;border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${col};border-radius:99px;transition:.4s"></div>
          </div>
        </div>`;
      }).join('')}
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:13px;font-weight:700;display:flex;justify-content:space-between">
        <span>Total</span><span>${fmtCLP(totalPago)}</span>
      </div>
    </div>
  </div>

  <!-- Fila 2: Día de semana -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Ventas por Día de la Semana</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
      <div>
        <div style="font-size:11px;font-weight:600;color:#64748B;margin-bottom:10px;text-transform:uppercase">Promedio por día (días con atención)</div>
        ${diasOrden.map((d,i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <div style="width:82px;font-size:12px;font-weight:500;text-align:right;flex-shrink:0">${d}</div>
          ${barH(byDia[d].promedio,maxProm,coloresDia[i])}
          <div style="width:88px;font-size:12px;font-weight:700;flex-shrink:0">${fmtCLP(byDia[d].promedio)}</div>
          <div style="width:36px;font-size:10px;color:#94A3B8;flex-shrink:0">${byDia[d].dias}d</div>
        </div>`).join('')}
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:#64748B;margin-bottom:10px;text-transform:uppercase">Total acumulado + transacciones</div>
        ${diasOrden.map((d,i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <div style="width:82px;font-size:12px;font-weight:500;text-align:right;flex-shrink:0">${d}</div>
          ${barH(byDia[d].total,maxDiaTotal,coloresDia[i])}
          <div style="width:88px;font-size:12px;font-weight:700;flex-shrink:0">${fmtCLP(byDia[d].total)}</div>
          <div style="width:36px;font-size:10px;color:#94A3B8;flex-shrink:0">${byDia[d].count}t</div>
        </div>`).join('')}
        <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">
          ${rankingDia.map((d,i)=>`<span style="padding:3px 8px;background:${i===0?'#FEF3C7':i===1?'#F1F5F9':'#F8FAFC'};border-radius:99px;font-size:11px;font-weight:600;color:${i===0?'#B45309':'#475569'}">${['🥇','🥈','🥉'][i]||String(i+1)+'.'} ${d}</span>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <!-- Fila 3: Top servicios + Ticket promedio barbero -->
  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Top 10 Servicios más Vendidos</div>
      ${topSvc.length===0?'<p style="color:#64748B;font-size:12px">Sin datos</p>':
        topSvc.map(([nombre,d],i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <div style="width:16px;font-size:10px;color:#94A3B8;text-align:right;flex-shrink:0">${i+1}</div>
          <div style="min-width:0;flex:2;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${nombre}">${nombre}</div>
          ${barH(d.count,maxSvc,'#10B981','16px')}
          <div style="width:32px;font-size:12px;font-weight:700;color:#10B981;flex-shrink:0;text-align:right">${d.count}</div>
          <div style="width:76px;font-size:11px;color:#64748B;flex-shrink:0;text-align:right">${fmtCLP(d.total)}</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Ticket Promedio por Barbero</div>
      ${topBarb.length===0?'<p style="color:#64748B;font-size:12px">Sin datos</p>':
        topBarb.map(([nombre,d],i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="width:70px;font-size:12px;font-weight:600;text-align:right;flex-shrink:0">${nombre.split(' ')[0]}</div>
          ${barH(d.ticket,maxTicket,coloresBarb[i%coloresBarb.length])}
          <div style="width:80px;font-size:12px;font-weight:700;flex-shrink:0">${fmtCLP(d.ticket)}</div>
          <div style="width:40px;font-size:10px;color:#94A3B8;flex-shrink:0">${d.count}t</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- Fila 4: Propinas + Clientes frecuentes -->
  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Propinas por Barbero</div>
      ${topPropinas.length===0?'<p style="color:#64748B;font-size:12px">Sin datos</p>':
        topPropinas.map(([nombre,d],i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="width:70px;font-size:12px;font-weight:600;text-align:right;flex-shrink:0">${nombre.split(' ')[0]}</div>
          ${barH(d.propinas,maxPropina,coloresBarb[i%coloresBarb.length])}
          <div style="width:80px;font-size:12px;font-weight:700;color:var(--blue);flex-shrink:0">${fmtCLP(d.propinas)}</div>
          <div style="width:72px;font-size:10px;color:#94A3B8;flex-shrink:0">${d.count>0?fmtCLP(Math.round(d.propinas/d.count))+'/t':''}</div>
        </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-title">Clientes más Frecuentes</div>
      ${topCli.length===0?'<p style="color:#64748B;font-size:12px">Sin clientes registrados</p>':
        topCli.map(([nombre,d],i)=>`
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <div style="width:16px;font-size:10px;color:#94A3B8;text-align:right;flex-shrink:0">${i+1}</div>
          <div style="min-width:0;flex:2;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${nombre}">${nombre}</div>
          ${barH(d.count,maxCli,'#8B5CF6','16px')}
          <div style="width:28px;font-size:12px;font-weight:700;color:#8B5CF6;flex-shrink:0">${d.count}</div>
          <div style="width:80px;font-size:11px;color:#64748B;flex-shrink:0;text-align:right">${fmtCLP(d.total)}</div>
        </div>`).join('')}
    </div>
  </div>
  `;

  window._bridge.analisisSetAnio = v=>{ analisisFiltros.anio=Number(v); loadAnalisis(); };
  window._bridge.analisisSetMes  = v=>{ analisisFiltros.mes=Number(v);  loadAnalisis(); };
}

export { loadAnalisis as loadAnalisisTotales };
