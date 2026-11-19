// Pestaña Inventario
import { fmtCLP, hideOverlay, sb, showOverlay, toast } from './core.js';

// ============ INVENTARIO ============
let invData=[];
let editingProdId=null;

async function loadInventario(){
  showOverlay();
  const {data}=await sb.from('productos').select('*').order('categoria').order('nombre');
  invData=data||[];hideOverlay();
  renderInventario();
}

function renderInventario(){
  const total=invData.reduce((s,p)=>s+p.precio*p.stock,0);
  const bajosStk=invData.filter(p=>p.stock<=p.stock_minimo).length;
  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">Inventario</div>
  <div class="grid-3" style="margin-bottom:16px">
    <div class="metric"><div class="metric-label">Productos</div><div class="metric-value">${invData.length}</div></div>
    <div class="metric"><div class="metric-label">Valor Inventario</div><div class="metric-value">${fmtCLP(total)}</div></div>
    <div class="metric"><div class="metric-label">Stock Bajo</div><div class="metric-value" style="color:${bajosStk>0?'var(--red)':'var(--green)'}">${bajosStk}</div></div>
  </div>

  <div class="section-card" style="margin-bottom:16px">
    <div class="card-title">Nuevo Producto</div>
    <div class="form-row">
      <div class="form-group"><label>Categoría</label>
        <select id="pCat">
          <option>cera de cabello</option><option>after shave</option><option>cera de barba</option>
          <option>hair spray</option><option>shampoo</option><option>talco texturizador</option>
          <option>óleo para barba</option><option>salt spray</option><option>tónico</option>
          <option>crema afeitar</option><option>kit</option><option>pre shave</option><option>otro</option>
        </select>
      </div>
      <div class="form-group"><label>Marca</label><input type="text" id="pMarca" placeholder="Ej: IMMORTAL"></div>
      <div class="form-group"><label>Nombre</label><input type="text" id="pNombre" placeholder="Nombre del producto"></div>
      <div class="form-group"><label>Formato</label><input type="text" id="pFormato" placeholder="Ej: 150ml"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Precio Venta</label><input type="number" id="pPrecio" placeholder="0"></div>
      <div class="form-group"><label>Costo</label><input type="number" id="pCosto" placeholder="0"></div>
      <div class="form-group"><label>Stock Inicial</label><input type="number" id="pStock" value="0"></div>
      <div class="form-group"><label>Stock Mínimo</label><input type="number" id="pStockMin" value="2"></div>
      <div class="form-group" style="justify-content:flex-end;align-items:flex-end">
        <button class="btn btn-primary" onclick="saveProducto()">+ Agregar</button>
      </div>
    </div>
  </div>

  <div class="card" style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Categoría</th><th>Marca</th><th>Nombre</th><th>Formato</th>
        <th>Precio</th><th>Costo</th><th>Stock</th><th>Mín.</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>
        ${invData.map(p=>renderProdRow(p)).join('')}
      </tbody>
    </table>
  </div>`;
}

function renderProdRow(p){
  const isEditing=editingProdId===p.id;
  const pct=Math.min(100,p.stock_minimo>0?Math.round(p.stock/p.stock_minimo*50):100);
  const stockColor=p.stock<=p.stock_minimo?'var(--red)':p.stock<=p.stock_minimo*2?'var(--amber)':'var(--green)';
  const cls=isEditing?'row-editing':'';
  return `<tr id="prow-${p.id}" class="${cls}">
    <td>
      <span class="view-cell">${p.categoria||''}</span>
      <span class="edit-cell"><input type="text" id="pe-cat-${p.id}" value="${p.categoria||''}"></span>
    </td>
    <td>
      <span class="view-cell">${p.marca||''}</span>
      <span class="edit-cell"><input type="text" id="pe-marca-${p.id}" value="${p.marca||''}"></span>
    </td>
    <td>
      <span class="view-cell">${p.nombre}</span>
      <span class="edit-cell"><input type="text" id="pe-nombre-${p.id}" value="${p.nombre}"></span>
    </td>
    <td>
      <span class="view-cell">${p.formato||''}</span>
      <span class="edit-cell"><input type="text" id="pe-formato-${p.id}" value="${p.formato||''}"></span>
    </td>
    <td>
      <span class="view-cell">${fmtCLP(p.precio)}</span>
      <span class="edit-cell"><input type="number" id="pe-precio-${p.id}" value="${p.precio}" style="width:80px"></span>
    </td>
    <td>
      <span class="view-cell">${fmtCLP(p.costo||0)}</span>
      <span class="edit-cell"><input type="number" id="pe-costo-${p.id}" value="${p.costo||0}" style="width:80px"></span>
    </td>
    <td>
      <div style="display:flex;align-items:center;gap:6px">
        <span class="view-cell" style="font-weight:700;color:${stockColor}">${p.stock}</span>
        <span class="edit-cell"><input type="number" id="pe-stock-${p.id}" value="${p.stock}" style="width:60px"></span>
        <div class="view-cell" style="width:60px">
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${stockColor}"></div></div>
        </div>
      </div>
    </td>
    <td>
      <span class="view-cell">${p.stock_minimo||2}</span>
      <span class="edit-cell"><input type="number" id="pe-stmin-${p.id}" value="${p.stock_minimo||2}" style="width:60px"></span>
    </td>
    <td>
      <span class="view-cell">
        ${p.stock<=p.stock_minimo?'<span class="badge badge-red">Bajo</span>':p.stock<=p.stock_minimo*2?'<span class="badge badge-amber">Alerta</span>':'<span class="badge badge-green">OK</span>'}
      </span>
    </td>
    <td style="white-space:nowrap">
      ${isEditing?
        `<button class="btn btn-success btn-sm" onclick="saveEditProducto('${p.id}')">✓</button>
         <button class="btn btn-ghost btn-sm" onclick="cancelEditProducto()">✕</button>`:
        `<button class="btn btn-ghost btn-sm" onclick="startEditProducto('${p.id}')">✏</button>
         <button class="btn btn-danger btn-sm" onclick="deleteProducto('${p.id}')">🗑</button>`}
    </td>
  </tr>`;
}

function startEditProducto(id){editingProdId=id;renderInventario();}
function cancelEditProducto(){editingProdId=null;renderInventario();}

async function saveProducto(){
  const obj={
    categoria:document.getElementById('pCat').value,
    marca:document.getElementById('pMarca').value,
    nombre:document.getElementById('pNombre').value,
    formato:document.getElementById('pFormato').value,
    precio:Number(document.getElementById('pPrecio').value||0),
    costo:Number(document.getElementById('pCosto').value||0),
    stock:Number(document.getElementById('pStock').value||0),
    stock_minimo:Number(document.getElementById('pStockMin').value||2),
  };
  if(!obj.nombre){toast('Ingresa el nombre','error');return;}
  showOverlay();
  const {error}=await sb.from('productos').insert(obj);
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  toast('✓ Producto agregado');
  loadInventario();
}

async function saveEditProducto(id){
  const updates={
    categoria:document.getElementById(`pe-cat-${id}`)?.value,
    marca:document.getElementById(`pe-marca-${id}`)?.value,
    nombre:document.getElementById(`pe-nombre-${id}`)?.value,
    formato:document.getElementById(`pe-formato-${id}`)?.value,
    precio:Number(document.getElementById(`pe-precio-${id}`)?.value||0),
    costo:Number(document.getElementById(`pe-costo-${id}`)?.value||0),
    stock:Number(document.getElementById(`pe-stock-${id}`)?.value||0),
    stock_minimo:Number(document.getElementById(`pe-stmin-${id}`)?.value||2),
  };
  showOverlay();
  const {error}=await sb.from('productos').update(updates).eq('id',id);
  if(error){hideOverlay();toast('Error: '+error.message,'error');return;}
  editingProdId=null;
  const {data}=await sb.from('productos').select('*').order('categoria').order('nombre');
  invData=data||[];hideOverlay();
  toast('✓ Producto actualizado');
  renderInventario();
}

async function deleteProducto(id){
  if(!confirm('¿Eliminar producto?')) return;
  showOverlay();
  const {error}=await sb.from('productos').delete().eq('id',id);
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  invData=invData.filter(p=>p.id!==id);
  toast('✓ Producto eliminado');
  renderInventario();
}

export { cancelEditProducto, deleteProducto, loadInventario, saveEditProducto, saveProducto, startEditProducto };
