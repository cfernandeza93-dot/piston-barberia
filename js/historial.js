// Pestaña Historial
import { DIAS_ES, MESES, barberos, fmtCLP, hideOverlay, loadCatalogos, sb, servicios, showOverlay, toast, today } from './core.js';
import { normCod, normFecha } from './conciliacion.js';
import { traerTodo } from './agenda.js';

// ============ HISTORIAL ============
let hFilters={barbero:'',tipo:'',pago:'',mes:'',buscar:'',anio:'',concil:''};
let hData=[];
let editingVentaId=null;

// Mapa de GetNet por mes/cod para el historial
let hGetnetMap = {}; // key: "anio-mes-codNorm" → {total_gn, propina_gn}

async function loadHistorial(){
  showOverlay();
  await loadCatalogos();
  const {data:raw}=await sb.rpc('get_ventas_historial');
  hData=raw||[];
  // Cargar todos los registros GetNet para cruzar en historial
  // Supabase entrega máximo 1.000 filas por consulta: se piden todas por páginas
  const gn=await traerTodo(()=>sb.from('getnet_transacciones').select('id,cod_aut,anio,mes,fecha_venta,valor_transaccion,propina').order('fecha_venta').order('id'));
  hGetnetMap={};
  (gn||[]).forEach(r=>{
    const k=`${r.anio}-${r.mes}-${String(r.cod_aut||'').trim().replace(/^0+/,'')}-${String(r.fecha_venta||'').split('T')[0]}`;
    if(!hGetnetMap[k]) hGetnetMap[k]={total_gn:0,propina_gn:0,count:0};
    hGetnetMap[k].total_gn+=r.valor_transaccion||0;
    hGetnetMap[k].propina_gn+=r.propina||0;
    hGetnetMap[k].count++;
  });
  hideOverlay();
  renderHistorial();
}

function renderHistorial(){
  let rows=hData;
  if(hFilters.anio) rows=rows.filter(v=>String(v.anio)===hFilters.anio);
  if(hFilters.mes) rows=rows.filter(v=>String(v.n_mes)===hFilters.mes);
  if(hFilters.barbero) rows=rows.filter(v=>v.barbero_nombre===hFilters.barbero);
  if(hFilters.tipo) rows=rows.filter(v=>v.tipo===hFilters.tipo);
  if(hFilters.pago) rows=rows.filter(v=>v.forma_pago===hFilters.pago);
  if(hFilters.buscar){
    const q=hFilters.buscar.toLowerCase();
    rows=rows.filter(v=>(v.cod_autorizacion||'').toLowerCase().includes(q)||(v.barbero_nombre||'').toLowerCase().includes(q)||(v.servicio_producto||'').toLowerCase().includes(q)||(v.cliente||'').toLowerCase().includes(q));
  }
  // Filtro por estado conciliación
  if(hFilters.concil){
    rows=rows.filter(v=>{
      if(v.forma_pago!=='TK') return hFilters.concil==='NO_APLICA';
      if(hFilters.concil==='NO_APLICA') return false;
      const codN=String(v.cod_autorizacion||'').trim().replace(/^0+/,'');
      const k=`${v.anio}-${v.n_mes}-${codN}-${normFecha(v.fecha)}`;
      const gn=hGetnetMap[k];
      if(hFilters.concil==='SIN_COD') return !v.cod_autorizacion;
      if(!v.cod_autorizacion) return false;
      if(hFilters.concil==='SIN_GETNET') return !gn;
      if(!gn) return false;
      const ventasMismoCod=hData.filter(x=>x.forma_pago==='TK'&&x.anio==v.anio&&x.n_mes==v.n_mes&&x.cod_autorizacion&&normCod(x.cod_autorizacion)==codN && normFecha(x.fecha)==normFecha(v.fecha));
      const totalSys=ventasMismoCod.reduce((s,x)=>s+(x.total||0),0);
      const propinaSys=ventasMismoCod.reduce((s,x)=>s+(x.propina||0),0);
      const diff=Math.abs(gn.total_gn-totalSys)>0||Math.abs(gn.propina_gn-propinaSys)>0;
      if(hFilters.concil==='DIFERENCIA') return diff;
      if(hFilters.concil==='OK') return !diff;
      return true;
    });
  }

  const anios=[...new Set(hData.map(v=>v.anio))].sort((a,b)=>b-a);
  const bNombres=[...new Set(hData.map(v=>v.barbero_nombre))].filter(Boolean).sort();
  const bOpts=barberos.map(b=>`<option value="${b.id}" data-nombre="${b.nombre}">${b.nombre}</option>`).join('');
  const sOpts=servicios.map(s=>`<option value="${s.nombre}">${s.nombre}</option>`).join('');

  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">Historial de Ventas</div>
  <div class="filters">
    <select onchange="window._bridge.hSet('anio',this.value)">
      <option value="">Todos los años</option>
      ${anios.map(a=>`<option value="${a}" ${hFilters.anio==a?'selected':''}>${a}</option>`).join('')}
    </select>
    <select onchange="window._bridge.hSet('mes',this.value)">
      <option value="">Todos los meses</option>
      ${MESES.map((m,i)=>`<option value="${i+1}" ${hFilters.mes==i+1?'selected':''}>${m}</option>`).join('')}
    </select>
    <select onchange="window._bridge.hSet('barbero',this.value)">
      <option value="">Todos los barberos</option>
      ${bNombres.map(b=>`<option value="${b}" ${hFilters.barbero===b?'selected':''}>${b}</option>`).join('')}
    </select>
    <select onchange="window._bridge.hSet('tipo',this.value)">
      <option value="">Tipo</option>
      <option value="servicio" ${hFilters.tipo==='servicio'?'selected':''}>Servicio</option>
      <option value="PRODUCTO" ${hFilters.tipo==='PRODUCTO'?'selected':''}>Producto</option>
    </select>
    <select onchange="window._bridge.hSet('pago',this.value)">
      <option value="">Pago</option>
      <option value="EF" ${hFilters.pago==='EF'?'selected':''}>EF</option>
      <option value="TK" ${hFilters.pago==='TK'?'selected':''}>TK</option>
      <option value="TRF" ${hFilters.pago==='TRF'?'selected':''}>TRF</option>
      <option value="MP" ${hFilters.pago==='MP'?'selected':''}>MP</option>
    </select>
    <select onchange="window._bridge.hSet('concil',this.value)">
      <option value="">Estado Concil.</option>
      <option value="OK" ${hFilters.concil==='OK'?'selected':''}>✓ OK</option>
      <option value="DIFERENCIA" ${hFilters.concil==='DIFERENCIA'?'selected':''}>⚠ Diferencia</option>
      <option value="SIN_GETNET" ${hFilters.concil==='SIN_GETNET'?'selected':''}>✗ Sin GetNet</option>
      <option value="SIN_COD" ${hFilters.concil==='SIN_COD'?'selected':''}>Sin Cod. Auth</option>
      <option value="NO_APLICA" ${hFilters.concil==='NO_APLICA'?'selected':''}>No aplica (EF/TRF)</option>
    </select>
    <input type="text" placeholder="Buscar (cod. auth, barbero, servicio...)" value="${hFilters.buscar}" oninput="window._bridge.hBuscar(this.value)" style="min-width:200px">
    <button class="btn btn-ghost btn-sm" onclick="exportHistorialCSV()">⬇ CSV</button>
    <span style="font-size:12px;color:#64748B;margin-left:auto">${rows.length} registros</span>
  </div>
  <div class="card" style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Fecha</th><th>Barbero</th><th>Tipo</th><th>Servicio/Producto</th>
        <th>Monto</th><th>Propina</th><th>Desc.</th><th>Total</th>
        <th>Pago</th><th>Concil.</th><th>Cod. Auth</th><th>Boleta</th><th>Cliente</th><th>Acciones</th>
      </tr></thead>
      <tbody id="hTbody">
        ${rows.map(v=>renderHistorialRow(v,bOpts,sOpts)).join('')}
      </tbody>
    </table>
  </div>
  `;

  window._bridge.hSet=(k,v)=>{hFilters[k]=v;renderHistorial()};
  window._bridge.hBuscar=(v)=>{
    hFilters.buscar=v;
    // Solo actualizar tbody y contador sin re-renderizar todo (evita perder foco)
    const bOpts=barberos.map(b=>`<option value="${b.id}" data-nombre="${b.nombre}">${b.nombre}</option>`).join('');
    const sOpts=servicios.map(s=>`<option value="${s.nombre}">${s.nombre}</option>`).join('');
    let rows=hData;
    if(hFilters.anio) rows=rows.filter(v=>String(v.anio)===hFilters.anio);
    if(hFilters.mes) rows=rows.filter(v=>String(v.n_mes)===hFilters.mes);
    if(hFilters.barbero) rows=rows.filter(v=>v.barbero_nombre===hFilters.barbero);
    if(hFilters.tipo) rows=rows.filter(v=>v.tipo===hFilters.tipo);
    if(hFilters.pago) rows=rows.filter(v=>v.forma_pago===hFilters.pago);
    if(v){
      const q=v.toLowerCase();
      rows=rows.filter(r=>(r.cod_autorizacion||'').toLowerCase().includes(q)||(r.barbero_nombre||'').toLowerCase().includes(q)||(r.servicio_producto||'').toLowerCase().includes(q)||(r.cliente||'').toLowerCase().includes(q));
    }
    if(hFilters.concil){
      rows=rows.filter(r=>{
        if(r.forma_pago!=='TK') return hFilters.concil==='NO_APLICA';
        if(hFilters.concil==='NO_APLICA') return false;
        const codN=String(r.cod_autorizacion||'').trim().replace(/^0+/,'');
        const k=`${r.anio}-${r.n_mes}-${codN}-${normFecha(r.fecha)}`;
        const gn=hGetnetMap[k];
        if(hFilters.concil==='SIN_COD') return !r.cod_autorizacion;
        if(!r.cod_autorizacion) return false;
        if(hFilters.concil==='SIN_GETNET') return !gn;
        if(!gn) return false;
        const vmc=hData.filter(x=>x.forma_pago==='TK'&&x.anio==r.anio&&x.n_mes==r.n_mes&&x.cod_autorizacion&&normCod(x.cod_autorizacion)==codN && normFecha(x.fecha)==normFecha(r.fecha));
        const tSys=vmc.reduce((s,x)=>s+(x.total||0),0);
        const pSys=vmc.reduce((s,x)=>s+(x.propina||0),0);
        const diff=Math.abs(gn.total_gn-tSys)>0||Math.abs(gn.propina_gn-pSys)>0;
        if(hFilters.concil==='DIFERENCIA') return diff;
        if(hFilters.concil==='OK') return !diff;
        return true;
      });
    }
    const tbody=document.getElementById('hTbody');
    if(tbody) tbody.innerHTML=rows.map(r=>renderHistorialRow(r,bOpts,sOpts)).join('');
    const cnt=document.querySelector('.filters span[style*="margin-left:auto"]');
    if(cnt) cnt.textContent=`${rows.length} registros`;
  };
}

function getConcilBadge(v){
  if(v.forma_pago!=='TK') return '<td><span style="color:#CBD5E1;font-size:10px">—</span></td>';
  if(!v.cod_autorizacion) return '<td><span class="badge badge-gray" title="Sin cod. auth">Sin cod</span></td>';
  const codN=normCod(v.cod_autorizacion);
  const fecha=normFecha(v.fecha);
  const k=`${v.anio}-${v.n_mes}-${codN}-${fecha}`;
  const gn=hGetnetMap[k];
  if(!gn){
    return `<td><span class="badge badge-red" style="font-size:10px;cursor:default" title="No encontrado en GetNet">Sin GetNet</span></td>`;
  }
  // Comparar solo contra ventas del mismo cod Y misma fecha
  const ventasMismoCodFecha=hData.filter(x=>
    x.forma_pago==='TK' && x.anio==v.anio && x.n_mes==v.n_mes &&
    x.cod_autorizacion && normCod(x.cod_autorizacion)==codN &&
    normFecha(x.fecha)==fecha
  );
  const totalSys=ventasMismoCodFecha.reduce((s,x)=>s+(x.total||0),0);
  const propinaSys=ventasMismoCodFecha.reduce((s,x)=>s+(x.propina||0),0);
  // Si el mismo pago cubre varias ventas (servicios de distintos barberos, productos), se indica y se listan
  const n=ventasMismoCodFecha.length;
  const detalle=n>1?' | Mismo pago: '+ventasMismoCodFecha.map(x=>`${x.tipo==='PRODUCTO'?'Producto':'Servicio'} ${x.servicio_producto||''} ${fmtCLP(x.total||0)} (${x.barbero_nombre||''})`).join(' + ').replace(/"/g,"'"):'';
  const comp=n>1?` <span style="font-size:9px;opacity:.8">· ${n} ventas</span>`:'';
  if(Math.abs(gn.total_gn-totalSys)>0||Math.abs(gn.propina_gn-propinaSys)>0){
    return `<td><span class="badge badge-amber" style="font-size:10px;cursor:default" title="GetNet: ${fmtCLP(gn.total_gn)} | Sistema: ${fmtCLP(totalSys)}${detalle}">Diferencia${comp}</span></td>`;
  }
  return `<td><span class="badge badge-green" style="font-size:10px;cursor:default" title="OK: ${fmtCLP(gn.total_gn)}${detalle}">✓ OK${comp}</span></td>`;
}

function renderHistorialRow(v,bOpts,sOpts){
  const isEditing=editingVentaId===v.id;
  const cls=isEditing?'row-editing':'';
  return `<tr id="hrow-${v.id}" class="${cls}">
    <td>
      <span class="view-cell">${v.fecha||''}</span>
      <span class="edit-cell"><input type="date" id="he-fecha-${v.id}" value="${v.fecha||''}"></span>
    </td>
    <td>
      <span class="view-cell">${v.barbero_nombre||''}</span>
      <span class="edit-cell"><select id="he-barbero-${v.id}">${bOpts}</select></span>
    </td>
    <td>
      <span class="view-cell"><span class="badge ${v.tipo==='servicio'?'badge-blue':'badge-green'}">${v.tipo}</span></span>
      <span class="edit-cell"><select id="he-tipo-${v.id}"><option value="servicio">servicio</option><option value="PRODUCTO">PRODUCTO</option></select></span>
    </td>
    <td>
      <span class="view-cell" style="max-width:150px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v.servicio_producto||''}</span>
      <span class="edit-cell"><input type="text" id="he-sp-${v.id}" value="${v.servicio_producto||''}"></span>
    </td>
    <td>
      <span class="view-cell">${fmtCLP(v.monto)}</span>
      <span class="edit-cell"><input type="number" id="he-monto-${v.id}" value="${v.monto||0}" style="width:80px"></span>
    </td>
    <td>
      <span class="view-cell">${fmtCLP(v.propina)}</span>
      <span class="edit-cell"><input type="number" id="he-propina-${v.id}" value="${v.propina||0}" style="width:70px"></span>
    </td>
    <td>
      <span class="view-cell">${fmtCLP(v.descuento)}</span>
      <span class="edit-cell"><input type="number" id="he-descuento-${v.id}" value="${v.descuento||0}" style="width:70px"></span>
    </td>
    <td><strong>${fmtCLP(v.total)}</strong></td>
    <td>
      <span class="view-cell"><span class="badge ${v.forma_pago==='EF'?'badge-green':v.forma_pago==='TK'?'badge-blue':v.forma_pago==='MP'?'badge-mp':'badge-purple'}">${v.forma_pago||''}</span></span>
      <span class="edit-cell"><select id="he-pago-${v.id}"><option value="EF">EF</option><option value="TK">TK</option><option value="TRF">TRF</option></select></span>
    </td>
    ${getConcilBadge(v)}
    <td>
      <span class="view-cell">${v.cod_autorizacion||''}</span>
      <span class="edit-cell"><input type="text" id="he-auth-${v.id}" value="${v.cod_autorizacion||''}" style="width:90px"></span>
    </td>
    <td>
      <span class="view-cell">${v.boleta||''}</span>
      <span class="edit-cell"><input type="text" id="he-boleta-${v.id}" value="${v.boleta||''}" style="width:80px"></span>
    </td>
    <td>
      <span class="view-cell">${v.cliente||''}</span>
      <span class="edit-cell"><input type="text" id="he-cliente-${v.id}" value="${v.cliente||''}" style="width:90px"></span>
    </td>
    <td style="white-space:nowrap">
      ${isEditing?
        `<button class="btn btn-success btn-sm" onclick="saveEditVenta('${v.id}')">✓</button>
         <button class="btn btn-ghost btn-sm" onclick="cancelEditVenta()">✕</button>`:
        `<button class="btn btn-ghost btn-sm" onclick="startEditVenta('${v.id}')">✏</button>
         <button class="btn btn-danger btn-sm" onclick="deleteVenta('${v.id}')">🗑</button>`}
    </td>
  </tr>`;
}

function startEditVenta(id){
  editingVentaId=id;
  renderHistorial();
  // set select values
  const v=hData.find(r=>r.id===id);if(!v) return;
  setTimeout(()=>{
    const bSel=document.getElementById(`he-barbero-${id}`);
    if(bSel) bSel.value=v.barbero_id||'';
    const tSel=document.getElementById(`he-tipo-${id}`);
    if(tSel) tSel.value=v.tipo||'servicio';
    const pSel=document.getElementById(`he-pago-${id}`);
    if(pSel) pSel.value=v.forma_pago||'EF';
  },0);
}

function cancelEditVenta(){editingVentaId=null;renderHistorial();}

async function saveEditVenta(id){
  const bSel=document.getElementById(`he-barbero-${id}`);
  const bId=bSel?.value;
  const bNombre=barberos.find(b=>b.id===bId)?.nombre||document.getElementById(`he-barbero-${id}`)?.selectedOptions[0]?.text||'';
  const fecha=document.getElementById(`he-fecha-${id}`)?.value;
  const d=fecha?new Date(fecha+'T12:00:00'):null;
  const monto=Number(document.getElementById(`he-monto-${id}`)?.value||0);
  const propina=Number(document.getElementById(`he-propina-${id}`)?.value||0);
  const descuento=Number(document.getElementById(`he-descuento-${id}`)?.value||0);
  const updates={
    barbero_id:bId,barbero_nombre:bNombre,
    fecha,
    anio:d?.getFullYear(),n_mes:d?d.getMonth()+1:null,mes:d?MESES[d.getMonth()]:null,
    dia:d?.getDate(),dia_semana:d?DIAS_ES[d.getDay()]:null,
    tipo:document.getElementById(`he-tipo-${id}`)?.value,
    servicio_producto:document.getElementById(`he-sp-${id}`)?.value,
    monto,propina,descuento,total:monto+propina-descuento,
    forma_pago:document.getElementById(`he-pago-${id}`)?.value,
    cod_autorizacion:document.getElementById(`he-auth-${id}`)?.value||null,
    boleta:document.getElementById(`he-boleta-${id}`)?.value||null,
    cliente:document.getElementById(`he-cliente-${id}`)?.value||null,
  };
  showOverlay();
  const {error}=await sb.from('ventas').update(updates).eq('id',id);
  if(error){hideOverlay();toast('Error: '+error.message,'error');return;}
  editingVentaId=null;
  const {data}=await sb.from('ventas').select('*').order('fecha',{ascending:false});
  hData=data||[];
  hideOverlay();
  toast('✓ Venta actualizada');
  renderHistorial();
}

async function deleteVenta(id){
  if(!confirm('¿Eliminar esta venta?')) return;
  showOverlay();
  const {error}=await sb.from('ventas').delete().eq('id',id);
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  hData=hData.filter(v=>v.id!==id);
  toast('✓ Venta eliminada');
  renderHistorial();
}

function exportHistorialCSV(){
  let rows=hData;
  if(hFilters.anio) rows=rows.filter(v=>String(v.anio)===hFilters.anio);
  if(hFilters.mes) rows=rows.filter(v=>String(v.n_mes)===hFilters.mes);
  if(hFilters.barbero) rows=rows.filter(v=>v.barbero_nombre===hFilters.barbero);
  if(hFilters.tipo) rows=rows.filter(v=>v.tipo===hFilters.tipo);
  if(hFilters.pago) rows=rows.filter(v=>v.forma_pago===hFilters.pago);
  if(hFilters.buscar){const q=hFilters.buscar.toLowerCase();rows=rows.filter(v=>(v.cod_autorizacion||'').toLowerCase().includes(q)||(v.barbero_nombre||'').toLowerCase().includes(q)||(v.servicio_producto||'').toLowerCase().includes(q));}
  const hdr=['Cod. Autorizacion','Boleta','Año','N° Mes','Mes','Dia','Dia Semana','Fecha','Barbero','Tipo','Cliente','Servicio/Producto','Monto','Propina','Descuento','Total','Forma Pago','Es Web','Comentarios'];
  const lines=[hdr.join(';'),...rows.map(v=>[v.cod_autorizacion||'',v.boleta||'',v.anio,v.n_mes,v.mes,v.dia,v.dia_semana,v.fecha,v.barbero_nombre,v.tipo,v.cliente||'',v.servicio_producto,v.monto,v.propina,v.descuento,v.total,v.forma_pago,v.es_web?'SI':'NO',v.comentarios||''].join(';'))];
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`piston_ventas_${today()}.csv`;a.click();
}

export { cancelEditVenta, deleteVenta, exportHistorialCSV, loadHistorial, renderHistorial, saveEditVenta, startEditVenta };
