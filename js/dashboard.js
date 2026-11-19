// Pestaña Dashboard
import { MESES, fmtCLP, hideOverlay, loadCatalogos, productos, sb, servicios, showOverlay } from './core.js';

// ============ DASHBOARD ============
let dshFilters={anio:new Date().getFullYear(),mes:new Date().getMonth()+1};

async function loadDashboard(){
  document.getElementById('mainContent').innerHTML=`<div style="text-align:center;padding:40px;color:#64748B">Cargando datos...</div>`;
  showOverlay();
  await loadCatalogos();
  // Fetch all ventas & gastos
  // RPC que retorna JSON directo, sin límite de filas de PostgREST
  const {data:ventasJson} = await sb.rpc('get_ventas_anio_json', {p_anio: dshFilters.anio});
  const ventas = ventasJson || [];
  const {data:gastos} = await sb.from('gastos').select('*').range(0,4999);
  hideOverlay();

  // Años disponibles — consultamos aparte para el selector
  const {data:aniosData} = await sb.from('ventas').select('anio').range(0,4999);
  const anios=[...new Set((aniosData||[]).map(v=>v.anio).filter(Boolean))].sort((a,b)=>b-a);

  

  let vFilt = (ventas||[]);
  let gFilt = (gastos||[]).filter(g=>g.fecha&&Number(g.fecha.split('-')[0])==dshFilters.anio);
  if(dshFilters.mes>0){
    vFilt=vFilt.filter(v=>v.n_mes==dshFilters.mes);
    gFilt=gFilt.filter(g=>g.fecha&&Number(g.fecha.split('-')[1])==dshFilters.mes);
  }

  const totalVentas=vFilt.reduce((s,v)=>s+(v.total||0),0);
  const totalServicios=vFilt.filter(v=>v.tipo==='servicio').reduce((s,v)=>s+(v.monto||0),0);
  const totalProductos=vFilt.filter(v=>v.tipo==='PRODUCTO').reduce((s,v)=>s+(v.monto||0),0);
  const totalPropinas=vFilt.reduce((s,v)=>s+(v.propina||0),0);
  const totalGastos=gFilt.reduce((s,g)=>s+(g.monto||0),0);
  const utilidad=totalVentas-totalGastos;

  // Por forma de pago
  const ef=vFilt.filter(v=>v.forma_pago==='EF').reduce((s,v)=>s+(v.total||0),0);
  const tk=vFilt.filter(v=>v.forma_pago==='TK').reduce((s,v)=>s+(v.total||0),0);
  const trf=vFilt.filter(v=>v.forma_pago==='TRF').reduce((s,v)=>s+(v.total||0),0);
  const mp=vFilt.filter(v=>v.forma_pago==='MP').reduce((s,v)=>s+(v.total||0),0);

  // Por barbero — solo servicios para liquidaciones
  const byBarbero={};
  vFilt.forEach(v=>{
    const n=v.barbero_nombre||'Sin barbero';
    if(!byBarbero[n]) byBarbero[n]={
      ventas:0,
      // EF servicios
      efMonto:0, efPropina:0,
      // TK+TRF+MP servicios
      tkMonto:0, tkPropina:0,
      // productos (para barras)
      productos:0
    };
    const esEF = v.forma_pago==='EF';
    if(v.tipo==='servicio'){
      byBarbero[n].ventas+=(v.monto||0);
      const svc=servicios.find(s=>s.nombre===v.servicio_producto);
      const pct=(svc?.comision||50)/100;
      const com=Math.round((v.monto||0)*pct);
      const prop=(v.propina||0);
      if(esEF){ byBarbero[n].efMonto+=com; byBarbero[n].efPropina+=prop; }
      else     { byBarbero[n].tkMonto+=com; byBarbero[n].tkPropina+=prop; }
    }
    if(v.tipo==='PRODUCTO') byBarbero[n].productos+=(v.monto||0);
  });
  Object.keys(byBarbero).forEach(k=>{
    const b=byBarbero[k];
    b.efTotal  = b.efMonto + b.efPropina;
    b.tkTotal  = b.tkMonto + b.tkPropina;
    b.total    = b.efTotal + b.tkTotal;
    // Para barras y orden
    b.comision = b.efMonto + b.tkMonto;
    b.propinas = b.efPropina + b.tkPropina;
  });
  const barMax=Math.max(...Object.values(byBarbero).map(b=>b.ventas),1);

  // Últimas 10 ventas
  const ultimas=[...vFilt].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,10);

  // Stock bajo
  const stockBajo=(productos||[]).filter(p=>p.stock<=p.stock_minimo).sort((a,b)=>(a.marca||'').localeCompare(b.marca||''));

  function renderStockBajoTabla(lista){
    if(!lista.length) return '<p style="color:var(--green);font-size:12px">✓ Todo el stock está bien</p>';
    return `<div style="max-height:260px;overflow-y:auto">
      <table>
        <thead><tr><th>Marca</th><th>Producto</th><th>Categoría</th><th>Stock</th><th>Mín.</th></tr></thead>
        <tbody>
          ${lista.map(p=>`<tr>
            <td><span class="badge badge-gray">${p.marca||'—'}</span></td>
            <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.nombre}</td>
            <td style="color:#64748B;font-size:11px">${p.categoria||'—'}</td>
            <td style="color:var(--red);font-weight:700">${p.stock}</td>
            <td>${p.stock_minimo}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  // Ventas web
  const webVentas=vFilt.filter(v=>v.es_web).length;

  const mesOpts=MESES.map((m,i)=>`<option value="${i+1}" ${dshFilters.mes==i+1?'selected':''}>${m}</option>`).join('');
  const anioOpts=anios.map(a=>`<option value="${a}" ${dshFilters.anio==a?'selected':''}>${a}</option>`).join('');

  document.getElementById('mainContent').innerHTML=`
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
    <span class="sec-title" style="margin:0">Dashboard</span>
    <select onchange="window._bridge.dshSetAnio(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      <option value="0" ${dshFilters.anio==0?'selected':''}>Todos los años</option>
      ${anioOpts}
    </select>
    <select onchange="window._bridge.dshSetMes(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      <option value="0" ${dshFilters.mes==0?'selected':''}>Todos los meses</option>
      ${mesOpts}
    </select>
    <span style="font-size:12px;color:#64748B">${dshFilters.mes>0?MESES[dshFilters.mes-1]:''} ${dshFilters.anio||''}</span>
  </div>

  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">Ventas Totales</div><div class="metric-value">${fmtCLP(totalVentas)}</div><div class="metric-sub">${vFilt.length} transacciones</div></div>
    <div class="metric"><div class="metric-label">Servicios</div><div class="metric-value">${fmtCLP(totalServicios)}</div><div class="metric-sub">${vFilt.filter(v=>v.tipo==='servicio').length} servicios</div></div>
    <div class="metric"><div class="metric-label">Productos</div><div class="metric-value">${fmtCLP(totalProductos)}</div><div class="metric-sub">${vFilt.filter(v=>v.tipo==='PRODUCTO').length} ventas</div></div>
    <div class="metric"><div class="metric-label">Propinas</div><div class="metric-value">${fmtCLP(totalPropinas)}</div><div class="metric-sub">${webVentas} ventas web</div></div>
  </div>

  <div class="grid-2" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">Gastos</div><div class="metric-value" style="color:var(--red)">${fmtCLP(totalGastos)}</div><div class="metric-sub">${gFilt.length} registros</div></div>
    <!-- UTILIDAD BRUTA - deshabilitado temporalmente
    <div class="metric"><div class="metric-label">Utilidad Bruta</div><div class="metric-value" style="color:${utilidad>=0?'var(--green)':'var(--red)'}">${fmtCLP(utilidad)}</div><div class="metric-sub">Ventas - Gastos</div></div>
    -->
    <div class="metric">
      <div class="metric-label">Por Forma de Pago</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        <span class="badge badge-green">EF ${fmtCLP(ef)}</span>
        <span class="badge badge-blue">TK ${fmtCLP(tk)}</span>
        <span class="badge badge-purple">TRF ${fmtCLP(trf)}</span>
        <span class="badge badge-mp">MP ${fmtCLP(mp)}</span>
      </div>
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Ventas por Barbero</div>
      ${Object.entries(byBarbero).filter(([n])=>!n.toUpperCase().includes('PISTON')).sort((a,b)=>b[1].ventas-a[1].ventas).map(([n,d])=>`
        <div class="bar-chart-row">
          <div class="bar-chart-label">${n.split(' ')[0]}</div>
          <div class="bar-chart-bar"><div class="bar-chart-fill" style="width:${Math.round(d.ventas/barMax*100)}%"></div></div>
          <div class="bar-chart-val">${fmtCLP(d.ventas)}</div>
        </div>`).join('')||'<p style="color:#64748B;font-size:12px">Sin datos</p>'}
    </div>
    <div class="card" style="overflow-x:auto">
      <div class="card-title">Liquidaciones por Barbero — Servicios</div>
      <table>
        <thead><tr><th>Barbero</th><th>Comisión Svc</th><th>Propinas</th><th>Total</th></tr></thead>
        <tbody>
          ${Object.entries(byBarbero)
            .filter(([n])=>!n.toUpperCase().includes('PISTON'))
            .sort((a,b)=>b[1].total-a[1].total)
            .map(([n,d])=>`
          <tr>
            <td><strong>${n.split(' ')[0]}</strong></td>
            <td>${fmtCLP(d.comision)}</td>
            <td>${fmtCLP(d.propinas)}</td>
            <td><strong>${fmtCLP(d.total)}</strong></td>
          </tr>`).join('')||'<tr><td colspan="4" style="color:#64748B">Sin datos</td></tr>'}
        </tbody>
      </table>
    </div>
  </div>

  <div class="grid-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-title">Últimas Transacciones</div>
      <table>
        <thead><tr><th>Fecha</th><th>Barbero</th><th>Servicio/Producto</th><th>Total</th><th>Pago</th></tr></thead>
        <tbody>
          ${ultimas.map(v=>`<tr>
            <td>${v.fecha||''}</td>
            <td>${(v.barbero_nombre||'').split(' ')[0]}</td>
            <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.servicio_producto||''}</td>
            <td>${fmtCLP(v.total)}</td>
            <td><span class="badge ${v.forma_pago==='EF'?'badge-green':v.forma_pago==='TK'?'badge-blue':v.forma_pago==='MP'?'badge-mp':'badge-purple'}">${v.forma_pago}</span></td>
          </tr>`).join('')||'<tr><td colspan="5" style="color:#64748B">Sin datos</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="margin:0">Stock Bajo (≤ mínimo) <span style="font-weight:400;color:#94A3B8">${stockBajo.length}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="dshStockMarca" onchange="window._bridge.dshFiltrarStock()" style="padding:4px 8px;border:1px solid var(--border);border-radius:5px;font-size:11px">
            <option value="">Todas las marcas</option>
            ${[...new Set(stockBajo.map(p=>p.marca).filter(Boolean))].sort().map(m=>`<option value="${m}">${m}</option>`).join('')}
          </select>
          <select id="dshStockCat" onchange="window._bridge.dshFiltrarStock()" style="padding:4px 8px;border:1px solid var(--border);border-radius:5px;font-size:11px">
            <option value="">Todas las categorías</option>
            ${[...new Set(stockBajo.map(p=>p.categoria).filter(Boolean))].sort().map(c=>`<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="dshStockTabla">
        ${renderStockBajoTabla(stockBajo)}
      </div>
    </div>
  </div>
  `;

  window._bridge.dshFiltrarStock = () => {
    const marca = document.getElementById('dshStockMarca')?.value||'';
    const cat   = document.getElementById('dshStockCat')?.value||'';
    let lista = stockBajo;
    if(marca) lista = lista.filter(p=>p.marca===marca);
    if(cat)   lista = lista.filter(p=>p.categoria===cat);
    const el = document.getElementById('dshStockTabla');
    if(el) el.innerHTML = renderStockBajoTabla(lista);
  };

  window._bridge.dshSetAnio=v=>{dshFilters.anio=Number(v);loadDashboard()};
  window._bridge.dshSetMes=v=>{dshFilters.mes=Number(v);loadDashboard()};
}

export { loadDashboard };
