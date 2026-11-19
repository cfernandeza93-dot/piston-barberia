// Pestaña Gastos
import { MESES, barberos, fmtCLP, hideOverlay, loadCatalogos, sb, showOverlay, toast, today } from './core.js';

// ============ GASTOS ============
let gastoData=[];
let editingGastoId=null;
let gastoTabActiva='Adelantos';
let gastoFiltros={ anio: new Date().getFullYear(), mes: new Date().getMonth()+1 };

async function loadGastos(){
  showOverlay();
  await loadCatalogos();
  const {data}=await sb.from('gastos').select('*').order('fecha',{ascending:false});
  gastoData=data||[];
  hideOverlay();
  renderGastos();
}

function renderGastos(){
  const cats=['Adelantos','Proveedores','Retiros'];
  const catIcon={Adelantos:'👤',Proveedores:'🏢',Retiros:'💰'};
  const bOpts=barberos.map(b=>`<option value="${b.nombre}">${b.nombre}</option>`).join('');

  // Años disponibles en los datos
  const aniosDisp=[...new Set(gastoData.map(g=>g.fecha?Number(g.fecha.split('-')[0]):null).filter(Boolean))].sort((a,b)=>b-a);
  if(!aniosDisp.length) aniosDisp.push(new Date().getFullYear());
  const anioOpts=aniosDisp.map(a=>`<option value="${a}" ${gastoFiltros.anio==a?'selected':''}>${a}</option>`).join('');
  const mesOpts=MESES.map((m,i)=>`<option value="${i+1}" ${gastoFiltros.mes==i+1?'selected':''}>${m}</option>`).join('');

  // Filtrar por período
  const datosFiltrados=gastoData.filter(g=>{
    if(!g.fecha) return false;
    const [y,m]=g.fecha.split('-');
    return Number(y)==gastoFiltros.anio && Number(m)==gastoFiltros.mes;
  });

  // Métricas del período filtrado
  const totCat={};
  cats.forEach(c=>{ totCat[c]=datosFiltrados.filter(g=>g.categoria===c).reduce((s,g)=>s+(g.monto||0),0); });
  const totalGeneral=Object.values(totCat).reduce((s,v)=>s+v,0);
  const filtrados=datosFiltrados.filter(g=>g.categoria===gastoTabActiva);

  document.getElementById('mainContent').innerHTML=`
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
    <span class="sec-title" style="margin:0">Gastos y Movimientos</span>
    <select onchange="window._bridge.gastoSetAnio(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      ${anioOpts}
    </select>
    <select onchange="window._bridge.gastoSetMes(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      ${mesOpts}
    </select>
    <span style="font-size:12px;color:#64748B">${MESES[gastoFiltros.mes-1]} ${gastoFiltros.anio}</span>
  </div>

  <!-- Métricas del período -->
  <div class="grid-4" style="margin-bottom:16px">
    <div class="metric">
      <div class="metric-label">Total ${MESES[gastoFiltros.mes-1]}</div>
      <div class="metric-value" style="color:var(--red)">${fmtCLP(totalGeneral)}</div>
      <div class="metric-sub">${datosFiltrados.length} registros</div>
    </div>
    ${cats.map(c=>`
    <div class="metric">
      <div class="metric-label">${catIcon[c]} ${c}</div>
      <div class="metric-value" style="font-size:20px;color:var(--red)">${fmtCLP(totCat[c])}</div>
      <div class="metric-sub">${datosFiltrados.filter(g=>g.categoria===c).length} registros</div>
    </div>`).join('')}
  </div>

  <!-- Tabs de categoría -->
  <div style="display:flex;gap:0;margin-bottom:0;border-bottom:2px solid var(--border)">
    ${cats.map(c=>`
    <button onclick="window._bridge.gastoSetTab('${c}')"
      style="padding:10px 24px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;
             color:${gastoTabActiva===c?'var(--blue)':'#64748B'};
             border-bottom:${gastoTabActiva===c?'2px solid var(--blue)':'2px solid transparent'};
             margin-bottom:-2px">
      ${catIcon[c]} ${c}
      <span style="margin-left:6px;background:${gastoTabActiva===c?'#DBEAFE':'#F1F5F9'};color:${gastoTabActiva===c?'var(--blue)':'#64748B'};border-radius:99px;padding:1px 8px;font-size:11px">
        ${datosFiltrados.filter(g=>g.categoria===c).length}
      </span>
    </button>`).join('')}
  </div>

  <!-- Formulario -->
  <div class="section-card" style="margin-top:16px;margin-bottom:16px">
    <div class="card-title">Nuevo registro — ${gastoTabActiva}</div>
    ${gastoTabActiva==='Adelantos'?`
    <div class="form-row">
      <div class="form-group" style="flex:0 0 160px"><label>Fecha</label><input type="date" id="gFecha" value="${today()}"></div>
      <div class="form-group"><label>Barbero</label>
        <select id="gBarbero"><option value="">-- Seleccionar --</option>${bOpts}</select>
      </div>
      <div class="form-group" style="flex:0 0 150px"><label>Monto</label><input type="number" id="gMonto" placeholder="0"></div>
      <div class="form-group" style="justify-content:flex-end;align-items:flex-end">
        <button class="btn btn-primary" onclick="saveGasto()">+ Registrar</button>
      </div>
    </div>
    `:gastoTabActiva==='Proveedores'?`
    <div class="form-row">
      <div class="form-group" style="flex:0 0 150px"><label>Fecha</label><input type="date" id="gFecha" value="${today()}"></div>
      <div class="form-group"><label>Nombre Proveedor</label><input type="text" id="gProveedor" placeholder="Nombre del proveedor"></div>
      <div class="form-group" style="flex:0 0 150px">
        <label>Tipo Documento</label>
        <select id="gTipoDoc">
          <option value="Boleta">Boleta</option>
          <option value="Factura">Factura</option>
          <option value="Comprobante">Comprobante</option>
        </select>
      </div>
      <div class="form-group" style="flex:0 0 130px"><label>N° Documento</label><input type="text" id="gNumDoc" placeholder="Ej: 001234"></div>
      <div class="form-group" style="flex:0 0 130px"><label>Monto</label><input type="number" id="gMonto" placeholder="0"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Detalle</label><input type="text" id="gDetalle" placeholder="Descripción de la compra"></div>
      <div class="form-group" style="justify-content:flex-end;align-items:flex-end">
        <button class="btn btn-primary" onclick="saveGasto()">+ Registrar</button>
      </div>
    </div>
    `:`
    <div class="form-row">
      <div class="form-group" style="flex:0 0 160px"><label>Fecha</label><input type="date" id="gFecha" value="${today()}"></div>
      <div class="form-group" style="flex:0 0 150px"><label>Monto</label><input type="number" id="gMonto" placeholder="0"></div>
      <div class="form-group"><label>Detalle <span style="color:#94A3B8;font-weight:400">(opcional)</span></label><input type="text" id="gDetalle" placeholder="Motivo del retiro"></div>
      <div class="form-group" style="justify-content:flex-end;align-items:flex-end">
        <button class="btn btn-primary" onclick="saveGasto()">+ Registrar</button>
      </div>
    </div>
    `}
  </div>

  <!-- Tabla filtrada -->
  <div class="card" style="overflow-x:auto">
    ${gastoTabActiva==='Adelantos'?`
    <table>
      <thead><tr><th>Fecha</th><th>Barbero</th><th>Monto</th><th>Acciones</th></tr></thead>
      <tbody>
        ${filtrados.length===0?'<tr><td colspan="4" style="color:#64748B;text-align:center;padding:20px">Sin adelantos en este período</td></tr>':
          filtrados.map(g=>renderGastoRowAdelantos(g,bOpts)).join('')}
      </tbody>
    </table>
    `:gastoTabActiva==='Proveedores'?`
    <table>
      <thead><tr><th>Fecha</th><th>Proveedor</th><th>Tipo Doc.</th><th>N° Doc.</th><th>Monto</th><th>Detalle</th><th>Acciones</th></tr></thead>
      <tbody>
        ${filtrados.length===0?'<tr><td colspan="7" style="color:#64748B;text-align:center;padding:20px">Sin proveedores en este período</td></tr>':
          filtrados.map(g=>renderGastoRowProveedores(g)).join('')}
      </tbody>
    </table>
    `:`
    <table>
      <thead><tr><th>Fecha</th><th>Monto</th><th>Detalle</th><th>Acciones</th></tr></thead>
      <tbody>
        ${filtrados.length===0?'<tr><td colspan="4" style="color:#64748B;text-align:center;padding:20px">Sin retiros en este período</td></tr>':
          filtrados.map(g=>renderGastoRowRetiros(g)).join('')}
      </tbody>
    </table>
    `}
  </div>`;

  window._bridge.gastoSetTab  = v=>{gastoTabActiva=v; renderGastos();};
  window._bridge.gastoSetAnio = v=>{gastoFiltros.anio=Number(v); renderGastos();};
  window._bridge.gastoSetMes  = v=>{gastoFiltros.mes=Number(v);  renderGastos();};
}

// ---- Render rows ----
function renderGastoRowAdelantos(g, bOpts){
  const isEditing=editingGastoId===g.id;
  return `<tr id="grow-${g.id}" class="${isEditing?'row-editing':''}">
    <td><span class="view-cell">${g.fecha||''}</span>
        <span class="edit-cell"><input type="date" id="ge-fecha-${g.id}" value="${g.fecha||''}"></span></td>
    <td><span class="view-cell"><span class="badge badge-blue">${g.barbero_nombre||''}</span></span>
        <span class="edit-cell"><select id="ge-barbero-${g.id}">${bOpts}</select></span></td>
    <td><span class="view-cell"><strong style="color:var(--red)">${fmtCLP(g.monto)}</strong></span>
        <span class="edit-cell"><input type="number" id="ge-monto-${g.id}" value="${g.monto||0}" style="width:100px"></span></td>
    <td style="white-space:nowrap">${gastoAcciones(g.id,isEditing)}</td>
  </tr>`;
}

function renderGastoRowProveedores(g){
  const isEditing=editingGastoId===g.id;
  const tipoOpts=['Boleta','Factura','Comprobante'].map(t=>`<option value="${t}" ${g.tipo_documento===t?'selected':''}>${t}</option>`).join('');
  const tipoColor={Boleta:'badge-green',Factura:'badge-blue',Comprobante:'badge-gray'};
  return `<tr id="grow-${g.id}" class="${isEditing?'row-editing':''}">
    <td><span class="view-cell">${g.fecha||''}</span>
        <span class="edit-cell"><input type="date" id="ge-fecha-${g.id}" value="${g.fecha||''}"></span></td>
    <td><span class="view-cell"><strong>${g.nombre_proveedor||''}</strong></span>
        <span class="edit-cell"><input type="text" id="ge-prov-${g.id}" value="${(g.nombre_proveedor||'').replace(/"/g,'&quot;')}"></span></td>
    <td><span class="view-cell"><span class="badge ${tipoColor[g.tipo_documento]||'badge-gray'}">${g.tipo_documento||''}</span></span>
        <span class="edit-cell"><select id="ge-tipodoc-${g.id}">${tipoOpts}</select></span></td>
    <td><span class="view-cell" style="font-family:monospace;font-size:12px">${g.numero_documento||'—'}</span>
        <span class="edit-cell"><input type="text" id="ge-numdoc-${g.id}" value="${(g.numero_documento||'').replace(/"/g,'&quot;')}" style="width:90px"></span></td>
    <td><span class="view-cell"><strong style="color:var(--red)">${fmtCLP(g.monto)}</strong></span>
        <span class="edit-cell"><input type="number" id="ge-monto-${g.id}" value="${g.monto||0}" style="width:100px"></span></td>
    <td><span class="view-cell" style="max-width:160px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.detalle||''}</span>
        <span class="edit-cell"><input type="text" id="ge-detalle-${g.id}" value="${(g.detalle||'').replace(/"/g,'&quot;')}"></span></td>
    <td style="white-space:nowrap">${gastoAcciones(g.id,isEditing)}</td>
  </tr>`;
}

function renderGastoRowRetiros(g){
  const isEditing=editingGastoId===g.id;
  return `<tr id="grow-${g.id}" class="${isEditing?'row-editing':''}">
    <td><span class="view-cell">${g.fecha||''}</span>
        <span class="edit-cell"><input type="date" id="ge-fecha-${g.id}" value="${g.fecha||''}"></span></td>
    <td><span class="view-cell"><strong style="color:var(--red)">${fmtCLP(g.monto)}</strong></span>
        <span class="edit-cell"><input type="number" id="ge-monto-${g.id}" value="${g.monto||0}" style="width:100px"></span></td>
    <td><span class="view-cell" style="color:#64748B">${g.detalle||'—'}</span>
        <span class="edit-cell"><input type="text" id="ge-detalle-${g.id}" value="${(g.detalle||'').replace(/"/g,'&quot;')}"></span></td>
    <td style="white-space:nowrap">${gastoAcciones(g.id,isEditing)}</td>
  </tr>`;
}

function gastoAcciones(id,isEditing){
  return isEditing
    ?`<button class="btn btn-success btn-sm" onclick="saveEditGasto('${id}')">✓</button>
      <button class="btn btn-ghost btn-sm" onclick="cancelEditGasto()">✕</button>`
    :`<button class="btn btn-ghost btn-sm" onclick="startEditGasto('${id}')">✏</button>
      <button class="btn btn-danger btn-sm" onclick="deleteGasto('${id}')">🗑</button>`;
}

function startEditGasto(id){
  editingGastoId=id; renderGastos();
  const g=gastoData.find(x=>x.id===id); if(!g) return;
  setTimeout(()=>{
    const bs=document.getElementById(`ge-barbero-${id}`); if(bs) bs.value=g.barbero_nombre||'';
  },0);
}
function cancelEditGasto(){editingGastoId=null; renderGastos();}

async function saveGasto(){
  const fecha=document.getElementById('gFecha')?.value;
  const monto=Number(document.getElementById('gMonto')?.value||0);
  if(!fecha){toast('Ingresa la fecha','error');return;}
  if(!monto){toast('Ingresa el monto','error');return;}

  let obj={fecha, monto, categoria:gastoTabActiva, forma_pago:'EF'};

  if(gastoTabActiva==='Adelantos'){
    const barb=document.getElementById('gBarbero')?.value;
    if(!barb){toast('Selecciona el barbero','error');return;}
    obj.barbero_nombre=barb;
    obj.descripcion=`Adelanto – ${barb}`;
  } else if(gastoTabActiva==='Proveedores'){
    const prov=document.getElementById('gProveedor')?.value;
    if(!prov){toast('Ingresa el nombre del proveedor','error');return;}
    obj.nombre_proveedor=prov;
    obj.tipo_documento=document.getElementById('gTipoDoc')?.value;
    obj.numero_documento=document.getElementById('gNumDoc')?.value||null;
    obj.detalle=document.getElementById('gDetalle')?.value||null;
    obj.descripcion=prov;
  } else {
    obj.detalle=document.getElementById('gDetalle')?.value||null;
    obj.descripcion=obj.detalle||'Retiro';
  }

  showOverlay();
  const {error}=await sb.from('gastos').insert(obj);
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  toast('✓ Registrado');
  loadGastos();
}

async function saveEditGasto(id){
  const g=gastoData.find(x=>x.id===id); if(!g) return;
  const updates={
    fecha:document.getElementById(`ge-fecha-${id}`)?.value,
    monto:Number(document.getElementById(`ge-monto-${id}`)?.value||0),
  };
  if(g.categoria==='Adelantos'){
    const bv=document.getElementById(`ge-barbero-${id}`)?.value;
    updates.barbero_nombre=bv;
    updates.descripcion=`Adelanto – ${bv}`;
  } else if(g.categoria==='Proveedores'){
    updates.nombre_proveedor=document.getElementById(`ge-prov-${id}`)?.value||null;
    updates.tipo_documento=document.getElementById(`ge-tipodoc-${id}`)?.value||null;
    updates.numero_documento=document.getElementById(`ge-numdoc-${id}`)?.value||null;
    updates.detalle=document.getElementById(`ge-detalle-${id}`)?.value||null;
    updates.descripcion=updates.nombre_proveedor||'Proveedor';
  } else {
    updates.detalle=document.getElementById(`ge-detalle-${id}`)?.value||null;
    updates.descripcion=updates.detalle||'Retiro';
  }
  showOverlay();
  const {error}=await sb.from('gastos').update(updates).eq('id',id);
  if(error){hideOverlay();toast('Error: '+error.message,'error');return;}
  editingGastoId=null;
  const {data}=await sb.from('gastos').select('*').order('fecha',{ascending:false});
  gastoData=data||[]; hideOverlay();
  toast('✓ Actualizado'); renderGastos();
}

async function deleteGasto(id){
  if(!confirm('¿Eliminar registro?')) return;
  showOverlay();
  const {error}=await sb.from('gastos').delete().eq('id',id);
  hideOverlay(); if(error){toast('Error: '+error.message,'error');return;}
  gastoData=gastoData.filter(g=>g.id!==id);
  toast('✓ Eliminado'); renderGastos();
}
window._bridge.gastoSetTab=v=>{gastoTabActiva=v;renderGastos();};

export { cancelEditGasto, deleteGasto, gastoFiltros, loadGastos, renderGastos, saveEditGasto, saveGasto, startEditGasto };
