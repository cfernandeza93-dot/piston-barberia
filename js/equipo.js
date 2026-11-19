// Pestaña Equipo (barberos y servicios)
import { fmtCLP, hideOverlay, sb, showOverlay, toast } from './core.js';

// ============ EQUIPO ============
let equipoBarberos=[], equipoServicios=[];
let editingBarberoId=null, editingServicioId=null;

async function loadEquipo(){
  showOverlay();
  const [b,s]=await Promise.all([
    sb.from('barberos').select('*').order('nombre'),
    sb.from('servicios').select('*').order('nombre')
  ]);
  equipoBarberos=b.data||[];equipoServicios=s.data||[];
  hideOverlay();
  renderEquipo();
}

function renderEquipo(){
  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">Equipo & Servicios</div>
  <div class="grid-2" style="margin-bottom:16px;align-items:start">
    <!-- BARBEROS -->
    <div>
      <div class="section-card" style="margin-bottom:12px">
        <div class="card-title">Nuevo Barbero</div>
        <div class="form-row">
          <div class="form-group"><label>Nombre</label><input type="text" id="bNombre" placeholder="Nombre completo"></div>
          <div class="form-group"><label>Apodo</label><input type="text" id="bApodo" placeholder="Apodo (opcional)"></div>
          <div class="form-group" style="flex:0 0 110px"><label>% Comisión</label><input type="number" id="bComision" value="50" min="0" max="100"></div>
          <div class="form-group" style="justify-content:flex-end;align-items:flex-end">
            <button class="btn btn-primary" onclick="saveBarbero()">+ Agregar</button>
          </div>
        </div>
      </div>
      <div class="card" style="overflow-x:auto">
        <div class="card-title">Barberos (${equipoBarberos.length})</div>
        <table>
          <thead><tr><th>Nombre</th><th>Apodo</th><th>% Comisión</th><th>Acciones</th></tr></thead>
          <tbody>
            ${equipoBarberos.map(b=>renderBarberoRow(b)).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- SERVICIOS -->
    <div>
      <div class="section-card" style="margin-bottom:12px">
        <div class="card-title">Nuevo Servicio</div>
        <div class="form-row">
          <div class="form-group"><label>Nombre</label><input type="text" id="sNombre" placeholder="Nombre del servicio"></div>
          <div class="form-group" style="flex:0 0 110px"><label>Precio</label><input type="number" id="sPrecio" placeholder="0"></div>
          <div class="form-group" style="flex:0 0 110px"><label>Precio Promo</label><input type="number" id="sPrecioPromo" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Tipo</label>
            <select id="sTipo"><option value="normal">Normal</option><option value="promo">Promo (mar/mié)</option><option value="menor">Menor</option></select>
          </div>
          <div class="form-group" style="flex:0 0 110px"><label>% Comisión</label><input type="number" id="sComision" value="50" min="0" max="100"></div>
          <div class="form-group" style="justify-content:flex-end;align-items:flex-end">
            <button class="btn btn-primary" onclick="saveServicio()">+ Agregar</button>
          </div>
        </div>
      </div>
      <div class="card" style="overflow-x:auto">
        <div class="card-title">Servicios (${equipoServicios.length})</div>
        <table>
          <thead><tr><th>Nombre</th><th>Precio</th><th>Promo</th><th>Tipo</th><th>% Com.</th><th>Acciones</th></tr></thead>
          <tbody>
            ${equipoServicios.map(s=>renderServicioRow(s)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function renderBarberoRow(b){
  const isEditing=editingBarberoId===b.id;
  const cls=isEditing?'row-editing':'';
  return `<tr id="brow-${b.id}" class="${cls}">
    <td>
      <span class="view-cell">${b.nombre}</span>
      <span class="edit-cell"><input type="text" id="be-nombre-${b.id}" value="${b.nombre}"></span>
    </td>
    <td>
      <span class="view-cell">${b.apodo||''}</span>
      <span class="edit-cell"><input type="text" id="be-apodo-${b.id}" value="${b.apodo||''}"></span>
    </td>
    <td>
      <span class="view-cell"><span class="badge badge-blue">${b.comision||50}%</span></span>
      <span class="edit-cell"><input type="number" id="be-comision-${b.id}" value="${b.comision||50}" min="0" max="100" style="width:60px"></span>
    </td>
    <td style="white-space:nowrap">
      ${isEditing?
        `<button class="btn btn-success btn-sm" onclick="saveEditBarbero('${b.id}')">✓</button>
         <button class="btn btn-ghost btn-sm" onclick="cancelEditBarbero()">✕</button>`:
        `<button class="btn btn-ghost btn-sm" onclick="startEditBarbero('${b.id}')">✏</button>
         <button class="btn btn-danger btn-sm" onclick="deleteBarbero('${b.id}')">🗑</button>`}
    </td>
  </tr>`;
}

function renderServicioRow(s){
  const isEditing=editingServicioId===s.id;
  const cls=isEditing?'row-editing':'';
  return `<tr id="srow-${s.id}" class="${cls}">
    <td>
      <span class="view-cell">${s.nombre}</span>
      <span class="edit-cell"><input type="text" id="se-nombre-${s.id}" value="${s.nombre}"></span>
    </td>
    <td>
      <span class="view-cell">${fmtCLP(s.precio)}</span>
      <span class="edit-cell"><input type="number" id="se-precio-${s.id}" value="${s.precio}" style="width:80px"></span>
    </td>
    <td>
      <span class="view-cell">${s.precio_promo?fmtCLP(s.precio_promo):'-'}</span>
      <span class="edit-cell"><input type="number" id="se-promo-${s.id}" value="${s.precio_promo||''}" style="width:80px" placeholder="sin promo"></span>
    </td>
    <td>
      <span class="view-cell"><span class="badge ${s.tipo==='promo'?'badge-amber':s.tipo==='menor'?'badge-purple':'badge-gray'}">${s.tipo}</span></span>
      <span class="edit-cell"><select id="se-tipo-${s.id}"><option value="normal">normal</option><option value="promo">promo</option><option value="menor">menor</option></select></span>
    </td>
    <td>
      <span class="view-cell"><span class="badge badge-blue">${s.comision||50}%</span></span>
      <span class="edit-cell"><input type="number" id="se-comision-${s.id}" value="${s.comision||50}" min="0" max="100" style="width:60px"></span>
    </td>
    <td style="white-space:nowrap">
      ${isEditing?
        `<button class="btn btn-success btn-sm" onclick="saveEditServicio('${s.id}')">✓</button>
         <button class="btn btn-ghost btn-sm" onclick="cancelEditServicio()">✕</button>`:
        `<button class="btn btn-ghost btn-sm" onclick="startEditServicio('${s.id}')">✏</button>
         <button class="btn btn-danger btn-sm" onclick="deleteServicio('${s.id}')">🗑</button>`}
    </td>
  </tr>`;
}

// BARBERO CRUD
function startEditBarbero(id){editingBarberoId=id;renderEquipo();}
function cancelEditBarbero(){editingBarberoId=null;renderEquipo();}

async function saveBarbero(){
  const obj={nombre:document.getElementById('bNombre').value,apodo:document.getElementById('bApodo').value||null,comision:Number(document.getElementById('bComision').value||50)};
  if(!obj.nombre){toast('Ingresa el nombre','error');return;}
  showOverlay();
  const {error}=await sb.from('barberos').insert(obj);
  hideOverlay();if(error){toast('Error: '+error.message,'error');return;}
  toast('✓ Barbero agregado');loadEquipo();
}

async function saveEditBarbero(id){
  const updates={nombre:document.getElementById(`be-nombre-${id}`)?.value,apodo:document.getElementById(`be-apodo-${id}`)?.value||null,comision:Number(document.getElementById(`be-comision-${id}`)?.value||50)};
  showOverlay();
  const {error}=await sb.from('barberos').update(updates).eq('id',id);
  if(error){hideOverlay();toast('Error: '+error.message,'error');return;}
  editingBarberoId=null;
  const {data}=await sb.from('barberos').select('*').order('nombre');
  equipoBarberos=data||[];hideOverlay();
  toast('✓ Barbero actualizado');renderEquipo();
}

async function deleteBarbero(id){
  if(!confirm('¿Eliminar barbero?')) return;
  showOverlay();
  const {error}=await sb.from('barberos').delete().eq('id',id);
  hideOverlay();if(error){toast('Error: '+error.message,'error');return;}
  equipoBarberos=equipoBarberos.filter(b=>b.id!==id);
  toast('✓ Barbero eliminado');renderEquipo();
}

// SERVICIO CRUD
function startEditServicio(id){
  editingServicioId=id;renderEquipo();
  const s=equipoServicios.find(x=>x.id===id);if(!s) return;
  setTimeout(()=>{
    const ts=document.getElementById(`se-tipo-${id}`);if(ts) ts.value=s.tipo||'normal';
  },0);
}
function cancelEditServicio(){editingServicioId=null;renderEquipo();}

async function saveServicio(){
  const obj={nombre:document.getElementById('sNombre').value,precio:Number(document.getElementById('sPrecio').value||0),precio_promo:Number(document.getElementById('sPrecioPromo').value||0)||null,tipo:document.getElementById('sTipo').value,comision:Number(document.getElementById('sComision').value||50)};
  if(!obj.nombre){toast('Ingresa el nombre','error');return;}
  showOverlay();
  const {error}=await sb.from('servicios').insert(obj);
  hideOverlay();if(error){toast('Error: '+error.message,'error');return;}
  toast('✓ Servicio agregado');loadEquipo();
}

async function saveEditServicio(id){
  const updates={nombre:document.getElementById(`se-nombre-${id}`)?.value,precio:Number(document.getElementById(`se-precio-${id}`)?.value||0),precio_promo:Number(document.getElementById(`se-promo-${id}`)?.value||0)||null,tipo:document.getElementById(`se-tipo-${id}`)?.value,comision:Number(document.getElementById(`se-comision-${id}`)?.value||50)};
  showOverlay();
  const {error}=await sb.from('servicios').update(updates).eq('id',id);
  if(error){hideOverlay();toast('Error: '+error.message,'error');return;}
  editingServicioId=null;
  const {data}=await sb.from('servicios').select('*').order('nombre');
  equipoServicios=data||[];hideOverlay();
  toast('✓ Servicio actualizado');renderEquipo();
}

async function deleteServicio(id){
  if(!confirm('¿Eliminar servicio?')) return;
  showOverlay();
  const {error}=await sb.from('servicios').delete().eq('id',id);
  hideOverlay();if(error){toast('Error: '+error.message,'error');return;}
  equipoServicios=equipoServicios.filter(s=>s.id!==id);
  toast('✓ Servicio eliminado');renderEquipo();
}

export { cancelEditBarbero, cancelEditServicio, deleteBarbero, deleteServicio, loadEquipo, saveBarbero, saveEditBarbero, saveEditServicio, saveServicio, startEditBarbero, startEditServicio };
