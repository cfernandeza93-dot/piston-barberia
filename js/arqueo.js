// Pestaña Arqueo de Caja
import { MESES, fmtCLP, hideOverlay, sb, showOverlay, toast } from './core.js';

// ============ ARQUEO DE CAJA ============
let arqueoFiltros = { anio: new Date().getFullYear(), mes: new Date().getMonth()+1 };
let arqueoSaldoInicial = 0;
let arqueoSaldoFinalReal = null;
let arqueoNotasFinal = '';

async function loadArqueo(){
  showOverlay();
  const [vRes, gRes, sRes] = await Promise.all([
    sb.rpc('get_ventas_ef'),
    sb.from('gastos').select('*').eq('forma_pago','EF').order('fecha').order('created_at').range(0,4999),
    sb.from('caja_saldo_inicial').select('*').eq('anio', arqueoFiltros.anio).eq('mes', arqueoFiltros.mes).maybeSingle(),
  ]);
  arqueoSaldoInicial = sRes.data?.monto || 0;
  arqueoSaldoFinalReal = sRes.data?.saldo_final_real ?? null;
  arqueoNotasFinal = sRes.data?.notas_final || '';
  hideOverlay();
  renderArqueo(vRes.data||[], gRes.data||[]);
}

function renderArqueo(ventas, gastos){
  const aniosV = ventas.map(v=>v.anio).filter(Boolean);
  const aniosG = gastos.map(g=>g.fecha?Number(g.fecha.split('-')[0]):null).filter(Boolean);
  const anios  = [...new Set([...aniosV,...aniosG])].sort((a,b)=>b-a);
  if(!anios.length) anios.push(new Date().getFullYear());
  if(!anios.includes(arqueoFiltros.anio)) arqueoFiltros.anio = anios[0];

  const vMes = ventas.filter(v=>v.anio==arqueoFiltros.anio && v.n_mes==arqueoFiltros.mes);
  const gMes = gastos.filter(g=>{
    if(!g.fecha) return false;
    const [y,m]=g.fecha.split('-');
    return Number(y)==arqueoFiltros.anio && Number(m)==arqueoFiltros.mes;
  });

  const totalEntradas = vMes.reduce((s,v)=>s+(v.total||0),0);
  const totalSalidas  = gMes.reduce((s,g)=>s+(g.monto||0),0);
  const saldoFinal    = arqueoSaldoInicial + totalEntradas - totalSalidas;

  const entradasSvc  = vMes.filter(v=>v.tipo==='servicio').reduce((s,v)=>s+(v.total||0),0);
  const entradasProd = vMes.filter(v=>v.tipo==='PRODUCTO').reduce((s,v)=>s+(v.total||0),0);
  const propinasEF   = vMes.reduce((s,v)=>s+(v.propina||0),0);

  const byCat={};
  gMes.forEach(g=>{ const c=g.categoria||'Otro'; byCat[c]=(byCat[c]||0)+(g.monto||0); });

  // Movimientos día a día
  const diasMap={};
  vMes.forEach(v=>{ if(!v.fecha) return; if(!diasMap[v.fecha]) diasMap[v.fecha]={e:[],s:[]}; diasMap[v.fecha].e.push(v); });
  gMes.forEach(g=>{ if(!g.fecha) return; if(!diasMap[g.fecha]) diasMap[g.fecha]={e:[],s:[]}; diasMap[g.fecha].s.push(g); });

  let acum = arqueoSaldoInicial;
  const diasConSaldo = Object.keys(diasMap).sort().map(fecha=>{
    const totalE = diasMap[fecha].e.reduce((s,v)=>s+(v.total||0),0);
    const totalS = diasMap[fecha].s.reduce((s,g)=>s+(g.monto||0),0);
    acum += totalE - totalS;
    return { fecha, e:diasMap[fecha].e, s:diasMap[fecha].s, totalE, totalS, saldoDia:totalE-totalS, saldoAcum:acum };
  });

  const anioOpts = anios.map(a=>`<option value="${a}" ${arqueoFiltros.anio==a?'selected':''}>${a}</option>`).join('');
  const mesOpts  = MESES.map((m,i)=>`<option value="${i+1}" ${arqueoFiltros.mes==i+1?'selected':''}>${m}</option>`).join('');

  document.getElementById('mainContent').innerHTML=`
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
    <span class="sec-title" style="margin:0">🏦 Arqueo de Caja — Efectivo</span>
    <select onchange="window._bridge.arqueoSetAnio(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">${anioOpts}</select>
    <select onchange="window._bridge.arqueoSetMes(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">${mesOpts}</select>
    <span style="font-size:12px;color:#64748B">${MESES[arqueoFiltros.mes-1]} ${arqueoFiltros.anio}</span>
    <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="arqueoExportCSV()">⬇ Exportar CSV</button>
  </div>

  <!-- Saldo inicial del mes -->
  <div class="section-card" style="margin-bottom:16px;border-left:4px solid var(--blue)">
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.3px">Saldo Inicial del Mes</div>
        <div style="font-size:22px;font-weight:700;color:var(--blue)">${fmtCLP(arqueoSaldoInicial)}</div>
        <div style="font-size:11px;color:#94A3B8">Efectivo en caja al inicio de ${MESES[arqueoFiltros.mes-1]}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-left:auto">
        <input type="number" id="saldoInicialInput" value="${arqueoSaldoInicial}" placeholder="0"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:140px">
        <input type="text" id="saldoInicialNotas" placeholder="Notas (opcional)"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:180px">
        <button class="btn btn-primary btn-sm" onclick="saveSaldoInicial()">Guardar saldo inicial</button>
      </div>
    </div>
  </div>

  <!-- Métricas -->
  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric">
      <div class="metric-label">💵 Entradas EF</div>
      <div class="metric-value" style="color:var(--green)">${fmtCLP(totalEntradas)}</div>
      <div class="metric-sub">${vMes.length} transacciones</div>
    </div>
    <div class="metric">
      <div class="metric-label">💸 Salidas EF</div>
      <div class="metric-value" style="color:var(--red)">${fmtCLP(totalSalidas)}</div>
      <div class="metric-sub">${gMes.length} movimientos</div>
    </div>
    <div class="metric">
      <div class="metric-label">🏦 Saldo Final en Caja</div>
      <div class="metric-value" style="color:${saldoFinal>=0?'var(--green)':'var(--red)'};font-size:20px">${fmtCLP(saldoFinal)}</div>
      <div class="metric-sub">Inicial + Entradas − Salidas</div>
    </div>
    <div class="metric">
      <div class="metric-label">Desglose entradas</div>
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
        <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#64748B">Servicios</span><span>${fmtCLP(entradasSvc)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#64748B">Productos</span><span>${fmtCLP(entradasProd)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px"><span style="color:#64748B">Propinas</span><span>${fmtCLP(propinasEF)}</span></div>
      </div>
    </div>
  </div>

  <!-- Saldo final calculado vs real -->
  <div class="grid-2" style="margin-bottom:16px">
    <div class="section-card" style="border-left:4px solid var(--green)">
      <div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px">Saldo Final Calculado</div>
      <div style="font-size:26px;font-weight:700;color:${saldoFinal>=0?'var(--green)':'var(--red)'}">
        ${fmtCLP(saldoFinal)}
      </div>
      <div style="font-size:11px;color:#94A3B8;margin-top:2px">Saldo inicial + entradas − salidas</div>
    </div>
    <div class="section-card" style="border-left:4px solid ${arqueoSaldoFinalReal!==null?(Math.abs(arqueoSaldoFinalReal-saldoFinal)<=500?'#10B981':'var(--red)'):'#CBD5E1'}">
      <div style="font-size:11px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px">
        Conteo Real de Caja
        ${arqueoSaldoFinalReal!==null?`<span style="margin-left:8px;padding:2px 8px;border-radius:99px;font-size:10px;background:${Math.abs(arqueoSaldoFinalReal-saldoFinal)<=500?'#DCFCE7':'#FEE2E2'};color:${Math.abs(arqueoSaldoFinalReal-saldoFinal)<=500?'#15803D':'#DC2626'}">
          ${Math.abs(arqueoSaldoFinalReal-saldoFinal)<=500?'✓ Cuadra':'⚠ Diferencia: '+fmtCLP(arqueoSaldoFinalReal-saldoFinal)}
        </span>`:''}
      </div>
      ${arqueoSaldoFinalReal!==null
        ?`<div style="font-size:26px;font-weight:700;color:${arqueoSaldoFinalReal>=0?'var(--green)':'var(--red)'}">${fmtCLP(arqueoSaldoFinalReal)}</div>
          <div style="font-size:11px;color:#94A3B8;margin-top:2px">${arqueoNotasFinal||'Conteo físico registrado'}</div>`
        :`<div style="font-size:13px;color:#94A3B8;margin:6px 0 10px">Sin conteo registrado aún</div>`}
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <input type="number" id="saldoFinalRealInput" value="${arqueoSaldoFinalReal??''}" placeholder="Ingresa el conteo físico"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:180px">
        <input type="text" id="saldoFinalNotas" value="${arqueoNotasFinal}" placeholder="Notas (opcional)"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;width:160px">
        <button class="btn btn-primary btn-sm" onclick="saveSaldoFinal()">Guardar conteo</button>
        ${arqueoSaldoFinalReal!==null?`<button class="btn btn-ghost btn-sm" onclick="propagarSiguienteMes(${arqueoSaldoFinalReal})" title="Usar este saldo como inicial del mes siguiente">→ Usar como saldo inicial de ${MESES[arqueoFiltros.mes%12]} ${arqueoFiltros.mes==12?arqueoFiltros.anio+1:arqueoFiltros.anio}</button>`:''}
      </div>
    </div>
  </div>

  <!-- Salidas por categoría -->
  ${Object.keys(byCat).length>0?`
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Salidas por Categoría</div>
    <div style="display:flex;flex-wrap:wrap;gap:10px">
      ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,monto])=>`
        <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:8px 14px;min-width:160px">
          <div style="font-size:11px;color:#64748B;font-weight:600">${cat}</div>
          <div style="font-size:16px;font-weight:700;color:var(--red)">${fmtCLP(monto)}</div>
        </div>`).join('')}
    </div>
  </div>`:''}

  <!-- Movimientos día a día -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Movimientos Día a Día</div>
    ${diasConSaldo.length===0
      ?'<p style="color:#64748B;text-align:center;padding:20px">Sin movimientos en efectivo para este período</p>'
      :`<div style="overflow-x:auto"><table>
        <thead><tr>
          <th>Fecha</th><th>Día</th>
          <th style="color:var(--green)">Entradas EF</th>
          <th style="color:var(--red)">Salidas EF</th>
          <th>Saldo del Día</th>
          <th>Saldo Acumulado</th>
        </tr></thead>
        <tbody>
          <!-- Fila saldo inicial -->
          <tr style="background:#EFF6FF;font-style:italic">
            <td colspan="2" style="color:var(--blue);font-weight:600">Saldo inicial</td>
            <td>—</td><td>—</td><td>—</td>
            <td style="font-weight:700;color:var(--blue)">${fmtCLP(arqueoSaldoInicial)}</td>
          </tr>
          ${diasConSaldo.map(d=>`
          <tr id="drow-${d.fecha}" style="cursor:pointer" onclick="window._bridge.arqueoToggleDet('${d.fecha}')">
            <td><strong>${d.fecha}</strong></td>
            <td style="color:#64748B">${new Date(d.fecha+'T12:00:00').toLocaleDateString('es-CL',{weekday:'short'})}</td>
            <td style="color:var(--green);font-weight:600">${d.totalE>0?fmtCLP(d.totalE):'—'}</td>
            <td style="color:var(--red);font-weight:600">${d.totalS>0?fmtCLP(d.totalS):'—'}</td>
            <td><span style="font-weight:700;color:${d.saldoDia>=0?'var(--green)':'var(--red)'}">
              ${d.saldoDia>=0?'+':''}${fmtCLP(d.saldoDia)}</span></td>
            <td><span style="font-weight:700;color:${d.saldoAcum>=0?'#1E293B':'var(--red)'}">
              ${fmtCLP(d.saldoAcum)}</span></td>
          </tr>
          <tr id="det-${d.fecha}" style="display:none;background:#F8FAFC">
            <td colspan="6" style="padding:0 10px 10px">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding-top:8px">
                <div>
                  ${d.e.length>0?`<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:4px">ENTRADAS</div>
                  ${d.e.map(v=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px solid #F1F5F9">
                    <span style="color:#64748B">${(v.barbero_nombre||'').split(' ')[0]} · ${v.servicio_producto||''}</span>
                    <span style="font-weight:600">${fmtCLP(v.total)}</span></div>`).join('')}`:''}
                </div>
                <div>
                  ${d.s.length>0?`<div style="font-size:11px;font-weight:600;color:var(--red);margin-bottom:4px">SALIDAS</div>
                  ${d.s.map(g=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:2px 0;border-bottom:1px solid #F1F5F9">
                    <span style="color:#64748B">${g.descripcion||''} <span class="badge badge-amber" style="font-size:10px">${g.categoria}</span></span>
                    <span style="font-weight:600;color:var(--red)">${fmtCLP(g.monto)}</span></div>`).join('')}`:''}
                </div>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#F1F5F9;font-weight:700">
            <td colspan="2">TOTAL ${MESES[arqueoFiltros.mes-1].toUpperCase()}</td>
            <td style="color:var(--green)">${fmtCLP(totalEntradas)}</td>
            <td style="color:var(--red)">${fmtCLP(totalSalidas)}</td>
            <td style="color:${(totalEntradas-totalSalidas)>=0?'var(--green)':'var(--red)'}">
              ${(totalEntradas-totalSalidas)>=0?'+':''}${fmtCLP(totalEntradas-totalSalidas)}</td>
            <td style="color:${saldoFinal>=0?'var(--green)':'var(--red)'}"><strong>${fmtCLP(saldoFinal)}</strong></td>
          </tr>
        </tfoot>
      </table></div>
      <p style="color:#64748B;font-size:11px;margin-top:8px">💡 Haz clic en una fila para ver el detalle del día</p>`}
  </div>

  <!-- Tablas laterales -->
  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Ventas EF del mes (${vMes.length})</div>
      <div style="max-height:280px;overflow-y:auto">
      <table>
        <thead><tr><th>Fecha</th><th>Barbero</th><th>Descripción</th><th>Total</th></tr></thead>
        <tbody>
          ${vMes.length===0?'<tr><td colspan="4" style="color:#64748B;text-align:center">Sin ventas EF</td></tr>':
            vMes.map(v=>`<tr>
              <td>${v.fecha}</td>
              <td>${(v.barbero_nombre||'').split(' ')[0]}</td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.servicio_producto||''}</td>
              <td style="color:var(--green);font-weight:600">${fmtCLP(v.total)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Salidas EF del mes (${gMes.length})</div>
      <div style="max-height:280px;overflow-y:auto">
      <table>
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead>
        <tbody>
          ${gMes.length===0?'<tr><td colspan="4" style="color:#64748B;text-align:center">Sin salidas EF</td></tr>':
            gMes.map(g=>`<tr>
              <td>${g.fecha}</td>
              <td><span class="badge badge-amber" style="font-size:10px">${g.categoria||''}</span></td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.descripcion||g.detalle||''}</td>
              <td style="color:var(--red);font-weight:600">${fmtCLP(g.monto)}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
  </div>`;

  window._bridge.arqueoSetAnio = v=>{ arqueoFiltros.anio=Number(v); loadArqueo(); };
  window._bridge.arqueoSetMes  = v=>{ arqueoFiltros.mes=Number(v);  loadArqueo(); };
  window._bridge.arqueoToggleDet = fecha=>{
    const el=document.getElementById(`det-${fecha}`);
    if(el) el.style.display=el.style.display==='none'?'table-row':'none';
  };
}

async function saveSaldoFinal(){
  const val = document.getElementById('saldoFinalRealInput')?.value;
  if(val===''||val===null||val===undefined){ toast('Ingresa el conteo físico','error'); return; }
  const monto = Number(val);
  const notas = document.getElementById('saldoFinalNotas')?.value||null;
  showOverlay();

  // Verificar si ya existe el registro del mes
  const {data:existing} = await sb.from('caja_saldo_inicial')
    .select('id').eq('anio',arqueoFiltros.anio).eq('mes',arqueoFiltros.mes).maybeSingle();

  let error;
  if(existing){
    // Actualizar solo los campos del saldo final, sin tocar el saldo inicial
    ({error} = await sb.from('caja_saldo_inicial')
      .update({saldo_final_real:monto, notas_final:notas, updated_at:new Date().toISOString()})
      .eq('id', existing.id));
  } else {
    // Insertar fila nueva
    ({error} = await sb.from('caja_saldo_inicial')
      .insert({anio:arqueoFiltros.anio, mes:arqueoFiltros.mes, monto:0,
               saldo_final_real:monto, notas_final:notas, updated_at:new Date().toISOString()}));
  }

  hideOverlay();
  if(error){ toast('Error: '+error.message,'error'); return; }
  arqueoSaldoFinalReal = monto;
  arqueoNotasFinal = notas||'';
  toast(`✓ Conteo de ${MESES[arqueoFiltros.mes-1]} guardado: ${fmtCLP(monto)}`);
  loadArqueo();
}

async function propagarSiguienteMes(saldoFinal){
  const sigMes  = arqueoFiltros.mes===12 ? 1 : arqueoFiltros.mes+1;
  const sigAnio = arqueoFiltros.mes===12 ? arqueoFiltros.anio+1 : arqueoFiltros.anio;
  if(!confirm(`¿Usar ${fmtCLP(saldoFinal)} como saldo inicial de ${MESES[sigMes-1]} ${sigAnio}?`)) return;
  showOverlay();
  const {error} = await sb.from('caja_saldo_inicial')
    .upsert({anio:sigAnio, mes:sigMes, monto:saldoFinal, updated_at:new Date().toISOString()},
            {onConflict:'anio,mes'});
  hideOverlay();
  if(error){ toast('Error: '+error.message,'error'); return; }
  toast(`✓ Saldo inicial de ${MESES[sigMes-1]} ${sigAnio} establecido en ${fmtCLP(saldoFinal)}`);
  // Navegar al mes siguiente
  arqueoFiltros.mes = sigMes;
  arqueoFiltros.anio = sigAnio;
  loadArqueo();
}

async function saveSaldoInicial(){
  const monto = Number(document.getElementById('saldoInicialInput')?.value||0);
  const notas = document.getElementById('saldoInicialNotas')?.value||null;
  showOverlay();
  const {error} = await sb.from('caja_saldo_inicial')
    .upsert({anio:arqueoFiltros.anio, mes:arqueoFiltros.mes, monto, notas, updated_at:new Date().toISOString()},
            {onConflict:'anio,mes'});
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  arqueoSaldoInicial = monto;
  toast(`✓ Saldo inicial de ${MESES[arqueoFiltros.mes-1]} guardado: ${fmtCLP(monto)}`);
  loadArqueo();
}

function arqueoExportCSV(){
  Promise.all([
    sb.from('ventas').select('*').eq('forma_pago','EF').eq('anio',arqueoFiltros.anio).eq('n_mes',arqueoFiltros.mes).order('fecha'),
    sb.from('gastos').select('*').eq('forma_pago','EF').order('fecha'),
  ]).then(([vRes,gRes])=>{
    const vMes=vRes.data||[];
    const gMes=(gRes.data||[]).filter(g=>{
      if(!g.fecha) return false;
      const [y,m]=g.fecha.split('-');
      return Number(y)==arqueoFiltros.anio&&Number(m)==arqueoFiltros.mes;
    });
    const lines=[`Arqueo de Caja - ${MESES[arqueoFiltros.mes-1]} ${arqueoFiltros.anio}`,
      `Saldo Inicial;;${arqueoSaldoInicial}`,
      'Tipo;Fecha;Barbero/Descripcion;Detalle;Monto;Categoria'];
    vMes.forEach(v=>lines.push(`Entrada;${v.fecha};${v.barbero_nombre||''};${v.servicio_producto||''};${v.total||0};Venta EF`));
    gMes.forEach(g=>lines.push(`Salida;${g.fecha};;${g.descripcion||g.detalle||''};-${g.monto||0};${g.categoria||''}`));
    const totalE=vMes.reduce((s,v)=>s+(v.total||0),0);
    const totalS=gMes.reduce((s,g)=>s+(g.monto||0),0);
    lines.push(`;;Saldo Final;;${arqueoSaldoInicial+totalE-totalS};`);
    const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;
    a.download=`arqueo_${MESES[arqueoFiltros.mes-1]}_${arqueoFiltros.anio}.csv`;a.click();
  });
}

export { arqueoExportCSV, loadArqueo, propagarSiguienteMes, saveSaldoFinal, saveSaldoInicial };
