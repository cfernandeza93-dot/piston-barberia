// Pestaña Conciliación (GetNet)
import { MESES, fmtCLP, getXLSX, hideOverlay, sb, showOverlay, toast } from './core.js';

// ============ CONCILIACIÓN ============
let concilState = { mes: new Date().getMonth()+1, anio: new Date().getFullYear(), ventasTK:[], getnetRows:[], resultados:[] };

async function loadConciliacion(){
  showOverlay();
  const {data:vtk} = await sb.rpc('get_ventas_tk_anio', {p_anio: concilState.anio, p_mes: concilState.mes});
  concilState.ventasTK = vtk||[];
  // Cargar GetNet guardado para este mes
  const {data:gn} = await sb.from('getnet_transacciones')
    .select('*').eq('anio', concilState.anio).eq('mes', concilState.mes)
    .order('fecha_venta');
  concilState.getnetRows = (gn||[]).map(r=>({
    cod: r.cod_aut, fecha: r.fecha_venta, marca: r.marca, tipo: r.tipo,
    monto: r.valor_venta, propina: r.propina, total: r.valor_transaccion, estado: r.estado
  }));
  hideOverlay();
  renderConciliacion();
}

function renderConciliacion(){
  const anios = [...new Set(concilState.ventasTK.map(v=>v.anio).filter(Boolean))].sort((a,b)=>b-a);
  if(!anios.length) anios.push(new Date().getFullYear());
  const anioOpts = anios.map(a=>`<option value="${a}" ${concilState.anio==a?'selected':''}>${a}</option>`).join('');
  const mesOpts  = MESES.map((m,i)=>`<option value="${i+1}" ${concilState.mes==i+1?'selected':''}>${m}</option>`).join('');
  const tieneGetnet = concilState.getnetRows.length > 0;

  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">Conciliación GetNet</div>

  <!-- Filtro período -->
  <div class="section-card" style="margin-bottom:16px">
    <div class="card-title">Período a conciliar</div>
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <select id="concilAnio" onchange="window._bridge.concilSetAnio(this.value)" style="padding:7px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px">${anioOpts}</select>
      <select id="concilMes" onchange="window._bridge.concilSetMes(this.value)" style="padding:7px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px">${mesOpts}</select>
      <span class="badge badge-blue">📋 ${concilState.ventasTK.length} ventas TK — ${MESES[concilState.mes-1]} ${concilState.anio}</span>
      ${tieneGetnet?`<span class="badge badge-green">✓ GetNet cargado: ${concilState.getnetRows.length} transacciones</span>`:'<span class="badge badge-amber">⚠ Sin datos GetNet para este mes</span>'}
    </div>
  </div>

  <!-- Cargar archivo GetNet -->
  <div class="section-card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <div>
        <div class="card-title" style="margin:0">Historial GetNet — ${MESES[concilState.mes-1]} ${concilState.anio}</div>
        <div style="font-size:11px;color:#64748B;margin-top:3px">
          ${tieneGetnet
            ? `Datos guardados el ${concilState.getnetRows.length} txn. Puedes reemplazarlos subiendo un nuevo archivo.`
            : 'Sube el reporte XLSX de GetNet — se guardará en la BD para no tener que subirlo de nuevo.'}
        </div>
      </div>
      ${tieneGetnet?`<button class="btn btn-danger btn-sm" onclick="window._bridge.borrarGetnet()">🗑 Borrar datos del mes</button>`:''}
    </div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <input type="file" id="concilFile" accept=".xlsx,.xls,.csv" onchange="processConcilFile(this)">
      <div id="concilLoading" style="display:none;color:#64748B;font-size:12px">⏳ Procesando y guardando...</div>
    </div>
  </div>

  <!-- Resultado conciliación -->
  <div id="concilResult">
    ${tieneGetnet ? buildConcilResult() : '<div class="card" style="text-align:center;padding:30px;color:#64748B">Sube el archivo GetNet para ejecutar la conciliación</div>'}
  </div>

  <!-- Tabla ventas TK del mes -->
  <div class="card" style="margin-top:16px">
    <div class="card-title">Ventas TK sistema — ${MESES[concilState.mes-1]} ${concilState.anio} (${concilState.ventasTK.length})</div>
    <div style="overflow-x:auto;max-height:300px">
    <table>
      <thead><tr><th>Fecha</th><th>Barbero</th><th>Servicio/Producto</th><th>Monto</th><th>Propina</th><th>Total</th><th>Cod. Auth</th></tr></thead>
      <tbody>
        ${concilState.ventasTK.length===0
          ?'<tr><td colspan="7" style="color:#64748B;text-align:center;padding:20px">Sin ventas TK para este mes</td></tr>'
          :concilState.ventasTK.map(v=>`<tr>
            <td>${v.fecha||''}</td>
            <td>${(v.barbero_nombre||'').split(' ')[0]}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.servicio_producto||''}</td>
            <td>${fmtCLP(v.monto)}</td><td>${fmtCLP(v.propina)}</td><td>${fmtCLP(v.total)}</td>
            <td style="font-family:monospace;font-size:11px">${v.cod_autorizacion||'—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    </div>
  </div>`;

  window._bridge.concilSetAnio = v=>{ concilState.anio=Number(v); loadConciliacion(); };
  window._bridge.concilSetMes  = v=>{ concilState.mes=Number(v);  loadConciliacion(); };
  window._bridge.borrarGetnet  = async()=>{
    if(!confirm(`¿Borrar los datos GetNet de ${MESES[concilState.mes-1]} ${concilState.anio}?`)) return;
    showOverlay();
    await sb.from('getnet_transacciones').delete().eq('anio',concilState.anio).eq('mes',concilState.mes);
    concilState.getnetRows=[];
    hideOverlay();
    toast('✓ Datos GetNet eliminados');
    renderConciliacion();
  };

  if(tieneGetnet) runConciliacion();
}

function buildConcilResult(){ return '<div id="concilResultInner"></div>'; }

async function processConcilFile(input){
  const file=input.files[0]; if(!file) return;
  document.getElementById('concilLoading').style.display='block';
  try{
    const XL = await getXLSX();
    const buf = await file.arrayBuffer();
    const wb  = XL.read(buf,{type:'array'});
    const ws  = wb.Sheets[wb.SheetNames[0]];
    const raw = XL.utils.sheet_to_json(ws,{defval:''});

    const normalize = s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s.]/g,'').toUpperCase();
    function getGN(row,...keys){
      for(const k of keys){
        const nk=normalize(k);
        const found=Object.keys(row).find(rk=>normalize(rk)===nk);
        if(found!==undefined&&row[found]!=='') return String(row[found]).trim();
      }
      return '';
    }

    // Parsear y guardar en Supabase
    const rows = raw.map(r=>({
      cod_aut:          String(getGN(r,'COD.AUT','CODAUT')||'').trim(),
      fecha_venta:      parseFechaGetnet(getGN(r,'FECHA VENTA','FECHAVENTA')),
      hora_venta:       parseHoraGetnet(getGN(r,'FECHA VENTA','FECHAVENTA'),getGN(r,'HORA VENTA','HORAVENTA','HORA')),
      mes:              concilState.mes,
      anio:             concilState.anio,
      marca:            getGN(r,'MARCA')||null,
      tipo:             getGN(r,'TIPO')||null,
      propina:          Number(getGN(r,'PROPINA')||0),
      valor_venta:      Number(getGN(r,'VALOR VENTA','VALORVENTA')||0),
      valor_transaccion:Number(getGN(r,'VALOR TRANSACCION','VALORTRANSACCION','VALOR TRANSACCIÓN')||0),
      comision:         getGN(r,'COMISION','COMISIÓN')!==''?Number(getGN(r,'COMISION','COMISIÓN')):null,
      comision_propina: getGN(r,'COMISION PROPINA','COMISIÓN PROPINA')!==''?Number(getGN(r,'COMISION PROPINA','COMISIÓN PROPINA')):null,
      estado:           getGN(r,'ESTADO TRANSACCION','ESTADOTRANSACCION','ESTADO TRANSACCIÓN')||null,
      archivo_origen:   file.name,
    })).filter(r=>r.cod_aut&&r.cod_aut!=='-');

    if(!rows.length){ toast('Sin transacciones válidas en el archivo','error'); document.getElementById('concilLoading').style.display='none'; return; }

    showOverlay();
    // Borrar datos existentes del mes y reemplazar
    await sb.from('getnet_transacciones').delete().eq('anio',concilState.anio).eq('mes',concilState.mes);
    // Insertar en lotes de 100
    for(let i=0;i<rows.length;i+=100){
      await sb.from('getnet_transacciones').insert(rows.slice(i,i+100));
    }

    concilState.getnetRows = rows.map(r=>({
      cod:r.cod_aut, fecha:r.fecha_venta, marca:r.marca, tipo:r.tipo,
      monto:r.valor_venta, propina:r.propina, total:r.valor_transaccion, estado:r.estado
    }));
    hideOverlay();
    document.getElementById('concilLoading').style.display='none';
    toast(`✓ ${rows.length} transacciones GetNet guardadas`);
    renderConciliacion();
  }catch(err){
    hideOverlay();
    document.getElementById('concilLoading').style.display='none';
    toast('Error: '+err.message,'error'); console.error(err);
  }
}

function parseFechaGetnet(v){
  if(!v) return null;
  const s=String(v).trim();
  // DD/MM/YYYY HH:MM:SS
  const m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if(m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const iso=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

// Hora del pago (HH:MM:SS) desde "DD/MM/YYYY HH:MM:SS", un número de Excel o una columna de hora aparte
function parseHoraGetnet(v, horaAparte){
  const src=horaAparte||v; if(src===undefined||src===null||src==='') return null;
  const n=Number(src);
  if(!isNaN(n)&&typeof src!=='boolean'&&String(src).trim()!==''&&n>0&&n<60000){
    const secs=Math.round((n%1)*86400); if(!secs) return null;
    return [Math.floor(secs/3600),Math.floor(secs/60)%60,secs%60].map(x=>String(x).padStart(2,'0')).join(':');
  }
  const m=String(src).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m?`${m[1].padStart(2,'0')}:${m[2]}:${m[3]||'00'}`:null;
}

function normCod(v){ return String(v||'').trim().replace(/^0+/,''); }
function normFecha(v){ return String(v||'').split('T')[0]; }
function concilKey(cod, fecha){ return normCod(cod)+'|'+normFecha(fecha); }

function runConciliacion(){
  const { getnetRows, mes, anio } = concilState;
  const vtkMes = concilState.ventasTK;

  // Ventas sin código de autorización — no se pueden conciliar
  const sinCodRows = vtkMes.filter(v=>!v.cod_autorizacion);
  const sinCodTotal = sinCodRows.reduce((s,v)=>s+(v.total||0),0);

  // Agrupar por cod+fecha
  const ventasByCodFecha={};
  vtkMes.forEach(v=>{
    if(!v.cod_autorizacion) return;
    const k=concilKey(v.cod_autorizacion, v.fecha);
    if(!ventasByCodFecha[k]) ventasByCodFecha[k]=[];
    ventasByCodFecha[k].push(v);
  });

  // También mantener índice solo por cod para "sin GetNet"
  const ventasByCod={};
  vtkMes.forEach(v=>{
    if(!v.cod_autorizacion) return;
    const k=normCod(v.cod_autorizacion);
    if(!ventasByCod[k]) ventasByCod[k]=[];
    ventasByCod[k].push(v);
  });

  const getnetKeys=new Set(getnetRows.map(r=>concilKey(r.cod, r.fecha)));
  const getnetCods=new Set(getnetRows.map(r=>normCod(r.cod)));
  let ok=0,diffs=0,missing=0;
  const resultados=getnetRows.map(r=>{
    const key=concilKey(r.cod, r.fecha);
    const codN=normCod(r.cod);
    const vsys=ventasByCodFecha[key];
    if(!vsys){ missing++; return{...r,codN,estado:'FALTANTE EN SISTEMA',montoSys:null,propinaSys:null,totalSys:null,vsys:null}; }
    const montoSys=vsys.reduce((s,v)=>s+(v.monto||0),0);
    const propinaSys=vsys.reduce((s,v)=>s+(v.propina||0),0);
    const totalSys=vsys.reduce((s,v)=>s+(v.total||0),0);
    if(Math.abs(r.monto-montoSys)>0||Math.abs(r.propina-propinaSys)>0){ diffs++; return{...r,codN,estado:'DIFERENCIA',montoSys,propinaSys,totalSys,vsys}; }
    ok++; return{...r,codN,estado:'OK',montoSys,propinaSys,totalSys,vsys};
  });

  // Sin GetNet: ventas cuya clave cod+fecha no aparece en GetNet
  const sinGetNet=Object.entries(ventasByCodFecha).filter(([k])=>!getnetKeys.has(k)).map(([k,vs])=>({
    cod:normCod(vs[0].cod_autorizacion),codN:normCod(vs[0].cod_autorizacion),estado:'EN SISTEMA SIN GETNET',
    monto:vs.reduce((s,v)=>s+(v.monto||0),0),propina:vs.reduce((s,v)=>s+(v.propina||0),0),
    total:vs.reduce((s,v)=>s+(v.total||0),0),montoSys:null,propinaSys:null,totalSys:null,vsys:vs,
    fecha:vs[0].fecha,marca:'—'
  }));

  // Ventas sin cod como fila especial en tabla
  const sinCodEntradas = sinCodRows.map(v=>({
    cod:'(sin código)',codN:'',estado:'SIN COD. AUTH',
    monto:v.monto,propina:v.propina,total:v.total,montoSys:null,propinaSys:null,totalSys:null,
    fecha:v.fecha,marca:'—',vsys:[v]
  }));

  const todosResultados=[...resultados,...sinGetNet,...sinCodEntradas];
  concilState.resultados=resultados;
  concilState.todosResultados=todosResultados;

  const totalGetNet=getnetRows.reduce((s,r)=>s+r.total,0);
  // Excluir ventas sin cod del total sistema para que la diferencia sea real
  const totalSistema=vtkMes.filter(v=>v.cod_autorizacion).reduce((s,v)=>s+(v.total||0),0);
  const diffTotal=totalGetNet-totalSistema;

  const target=document.getElementById('concilResult');
  if(!target) return;
  target.innerHTML=`
  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">GetNet (${getnetRows.length} txn)</div><div class="metric-value">${fmtCLP(totalGetNet)}</div></div>
    <div class="metric"><div class="metric-label">Sistema TK (${vtkMes.length} reg)</div>
      <div class="metric-value">${fmtCLP(totalSistema)}</div>
      ${sinCodRows.length>0?`<div class="metric-sub" style="color:var(--red)">⚠ ${sinCodRows.length} sin cod. auth (${fmtCLP(sinCodTotal)})</div>`:''}
    </div>
    <div class="metric"><div class="metric-label">Diferencia</div><div class="metric-value" style="color:${Math.abs(diffTotal)<100?'var(--green)':'var(--red)'}">${diffTotal>=0?'+':''}${fmtCLP(diffTotal)}</div></div>
    <div class="metric"><div class="metric-label">Resumen</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
        <span class="badge badge-green">✓ OK: ${ok}</span>
        <span class="badge badge-amber">⚠ Diferencia: ${diffs}</span>
        <span class="badge badge-red">✗ Sin sistema: ${missing}</span>
        ${sinGetNet.length?`<span class="badge badge-purple">↩ Sin GetNet: ${sinGetNet.length}</span>`:''}
        ${sinCodRows.length?`<span class="badge badge-gray">? Sin cod. auth: ${sinCodRows.length}</span>`:''}
      </div>
    </div>
  </div>
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${[
          {k:'TODOS', label:`Todos (${todosResultados.length})`, bg:'#DBEAFE', color:'#1D4ED8', border:'#93C5FD'},
          {k:'OK', label:`✓ OK (${ok})`, bg:'#DCFCE7', color:'#15803D', border:'#86EFAC'},
          {k:'DIFERENCIA', label:`⚠ Diferencia (${diffs})`, bg:'#FEF3C7', color:'#B45309', border:'#FCD34D'},
          {k:'FALTANTE EN SISTEMA', label:`✗ Sin sistema (${missing})`, bg:'#FEE2E2', color:'#DC2626', border:'#FCA5A5'},
          {k:'EN SISTEMA SIN GETNET', label:`↩ Sin GetNet (${sinGetNet.length})`, bg:'#EDE9FE', color:'#6D28D9', border:'#C4B5FD'},
          {k:'SIN COD. AUTH', label:`? Sin cod. (${sinCodRows.length})`, bg:'#F1F5F9', color:'#475569', border:'#CBD5E1'},
        ].map((f,i)=>`
          <button id="cfbtn-${f.k.replace(/ /g,'_')}"
            onclick="window._bridge.concilFiltrar('${f.k}')"
            style="padding:5px 12px;border:2px solid ${i===0?f.border:'transparent'};border-radius:99px;font-size:11px;font-weight:600;cursor:pointer;
                   background:${i===0?f.bg:'#F1F5F9'};color:${i===0?f.color:'#475569'};transition:.15s">
            ${f.label}
          </button>`).join('')}
      </div>
      ${(diffs+missing+sinGetNet.length)>0?`<button class="btn btn-ghost btn-sm" onclick="exportConcilErrors()">⬇ Exportar errores CSV</button>`:''}
    </div>
    <div style="margin-top:10px;margin-bottom:4px">
      <input type="text" id="concilBuscador" placeholder="Buscar por código de autorización, fecha o marca..."
        oninput="window._bridge.concilBuscar(this.value)"
        style="width:100%;max-width:420px;padding:7px 12px;border:1px solid var(--border);border-radius:6px;font-size:13px;box-sizing:border-box">
    </div>
    <div style="overflow-x:auto" id="concilTablaWrap">
      ${renderConcilTabla(todosResultados)}
    </div>
  </div>`;

  // Registrar bridge
  const filtroMeta=[
    {k:'TODOS', bg:'#DBEAFE', color:'#1D4ED8', border:'#93C5FD'},
    {k:'OK', bg:'#DCFCE7', color:'#15803D', border:'#86EFAC'},
    {k:'DIFERENCIA', bg:'#FEF3C7', color:'#B45309', border:'#FCD34D'},
    {k:'FALTANTE EN SISTEMA', bg:'#FEE2E2', color:'#DC2626', border:'#FCA5A5'},
    {k:'EN SISTEMA SIN GETNET', bg:'#EDE9FE', color:'#6D28D9', border:'#C4B5FD'},
    {k:'SIN COD. AUTH', bg:'#F1F5F9', color:'#475569', border:'#CBD5E1'},
  ];
  window._bridge.concilFiltrar = k => {
    concilState.filtroEstado = k;
    filtroMeta.forEach(f=>{
      const btn=document.getElementById(`cfbtn-${f.k.replace(/ /g,'_')}`);
      if(!btn) return;
      if(f.k===k){ btn.style.background=f.bg; btn.style.color=f.color; btn.style.borderColor=f.border; }
      else { btn.style.background='#F1F5F9'; btn.style.color='#475569'; btn.style.borderColor='transparent'; }
    });
    const busq = document.getElementById('concilBuscador')?.value||'';
    actualizarTablaConcil(k, busq);
  };
  window._bridge.concilBuscar = busq => {
    actualizarTablaConcil(concilState.filtroEstado||'TODOS', busq);
  };
}

function actualizarTablaConcil(estado, busq){
  let lista = estado==='TODOS' ? concilState.todosResultados : concilState.todosResultados.filter(r=>r.estado===estado);
  if(busq && busq.trim()){
    const q = busq.trim().toLowerCase();
    lista = lista.filter(r=>
      String(r.cod||'').toLowerCase().includes(q) ||
      String(r.fecha||'').toLowerCase().includes(q) ||
      String(r.marca||'').toLowerCase().includes(q)
    );
  }
  const wrap = document.getElementById('concilTablaWrap');
  if(wrap) wrap.innerHTML = renderConcilTabla(lista);
}

function renderConcilTabla(lista){
  if(!lista.length) return '<p style="text-align:center;padding:20px;color:#64748B">Sin registros para este filtro</p>';
  return `<table>
    <thead><tr><th>Cod. Auth</th><th>Fecha</th><th>Marca</th><th>Monto GetNet</th><th>Monto Sis.</th><th>Propina GetNet</th><th>Propina Sis.</th><th>Total GetNet</th><th>Total Sis.</th><th>Estado</th></tr></thead>
    <tbody>
      ${lista.map(r=>`
      <tr class="${r.estado==='OK'?'concil-match':r.estado==='DIFERENCIA'?'concil-diff':'concil-missing'}">
        <td style="font-family:monospace;font-size:11px">${r.cod}</td>
        <td>${r.fecha?String(r.fecha).split('T')[0]:''}</td>
        <td>${r.marca||'—'}</td>
        <td>${r.monto!=null?fmtCLP(r.monto):'—'}</td><td>${r.montoSys!=null?fmtCLP(r.montoSys):'—'}</td>
        <td>${r.propina!=null?fmtCLP(r.propina):'—'}</td><td>${r.propinaSys!=null?fmtCLP(r.propinaSys):'—'}</td>
        <td>${r.total!=null?fmtCLP(r.total):'—'}</td><td>${r.totalSys!=null?fmtCLP(r.totalSys):'—'}</td>
        <td><span class="badge ${r.estado==='OK'?'badge-green':r.estado==='DIFERENCIA'?'badge-amber':r.estado==='EN SISTEMA SIN GETNET'?'badge-purple':'badge-red'}" style="white-space:nowrap">${r.estado}</span></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function exportConcilErrors(){
  const errs=concilState.resultados.filter(r=>r.estado!=='OK');
  if(!errs.length){toast('No hay errores','info');return;}
  const hdr=['Cod. Auth','Fecha','Marca','Monto GetNet','Monto Sistema','Propina GetNet','Propina Sistema','Total GetNet','Total Sistema','Estado'];
  const lines=[hdr.join(';'),...errs.map(r=>[r.cod,r.fecha?String(r.fecha).split('T')[0]:'',r.marca||'',r.monto||0,r.montoSys||0,r.propina||0,r.propinaSys||0,r.total||0,r.totalSys||0,r.estado].join(';'))];
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`concil_errores_${MESES[concilState.mes-1]}_${concilState.anio}.csv`;a.click();
}

export { concilState, exportConcilErrors, loadConciliacion, normCod, normFecha, processConcilFile, renderConciliacion, runConciliacion };
