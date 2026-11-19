// Pestaña Nueva Venta
import { DIAS_ES, MESES, barberos, fmtCLP, hideOverlay, loadCatalogos, productos, sb, servicios, showOverlay, toast, today } from './core.js';

// CARRITO DE PRODUCTOS
let cart = [];

// ============ NUEVA VENTA ============
let ventaForm={tipo:'servicio',fecha:today(),formaPago:'EF',esWeb:false};

async function loadVenta(){
  showOverlay();
  await loadCatalogos();
  cart=[];
  hideOverlay();
  renderVentaForm();
}

function renderVentaForm(){
  const bOpts=barberos.map(b=>`<option value="${b.id}" data-nombre="${b.nombre}">${b.nombre}</option>`).join('');
  const sOpts=servicios.map(s=>`<option value="${s.id}" data-precio="${s.precio}" data-promo="${s.precio_promo||s.precio}" data-tipo="${s.tipo}" data-comision="${s.comision||50}" data-nombre="${s.nombre}">${s.nombre} - ${fmtCLP(s.precio)}</option>`).join('');
  const pOpts=productos.filter(p=>p.stock>0).map(p=>`<option value="${p.id}" data-precio="${p.precio}" data-nombre="${p.nombre}" data-stock="${p.stock}">${p.nombre} (${fmtCLP(p.precio)}) [${p.stock}]</option>`).join('');

  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">Registrar Venta</div>
  <div class="section-card">
    <div class="form-row">
      <div class="form-group" style="flex:0 0 160px">
        <label>Fecha</label>
        <input type="date" id="vFecha" value="${ventaForm.fecha}" onchange="ventaFechaChange(this.value)">
      </div>
      <div class="form-group" style="flex:0 0 120px">
        <label>Año</label>
        <input type="text" id="vAnio" readonly style="background:#F8FAFC">
      </div>
      <div class="form-group" style="flex:0 0 100px">
        <label>N° Mes</label>
        <input type="text" id="vNmes" readonly style="background:#F8FAFC">
      </div>
      <div class="form-group" style="flex:0 0 120px">
        <label>Mes</label>
        <input type="text" id="vMes" readonly style="background:#F8FAFC">
      </div>
      <div class="form-group" style="flex:0 0 80px">
        <label>Día</label>
        <input type="text" id="vDia" readonly style="background:#F8FAFC">
      </div>
      <div class="form-group" style="flex:0 0 130px">
        <label>Día semana</label>
        <input type="text" id="vDiaSemana" readonly style="background:#F8FAFC">
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Barbero</label>
        <select id="vBarbero"><option value="">-- Seleccionar --</option>${bOpts}</select>
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="vTipo" onchange="ventaTipoChange(this.value)">
          <option value="servicio">Servicio</option>
          <option value="PRODUCTO">Producto</option>
        </select>
      </div>
      <div class="form-group">
        <label>Cliente</label>
        <input type="text" id="vCliente" placeholder="Nombre cliente (opcional)">
      </div>
    </div>

    <!-- SERVICIO -->
    <div id="bloqueServicio">
      <div class="form-row">
        <div class="form-group">
          <label>Servicio</label>
          <select id="vServicio" onchange="ventaServicioChange()"><option value="">-- Seleccionar --</option>${sOpts}</select>
        </div>
        <div class="form-group" style="flex:0 0 130px">
          <label>Monto</label>
          <input type="number" id="vMonto" placeholder="0">
        </div>
      </div>
    </div>

    <!-- PRODUCTO (carrito) -->
    <div id="bloqueProducto" style="display:none">

      <!-- Buscador + filtros -->
      <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
        <div class="form-row" style="margin-bottom:8px">
          <div class="form-group">
            <label>🔍 Buscar producto</label>
            <input type="text" id="pBuscar" placeholder="Nombre, marca, formato..." oninput="filtrarProductos()" autocomplete="off"
              style="border:1.5px solid var(--blue)">
          </div>
          <div class="form-group" style="flex:0 0 160px">
            <label>Categoría</label>
            <select id="pFiltCat" onchange="filtrarProductos()">
              <option value="">Todas</option>
              ${[...new Set(productos.filter(p=>p.stock>0).map(p=>p.categoria).filter(Boolean))].sort().map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:0 0 150px">
            <label>Marca</label>
            <select id="pFiltMarca" onchange="filtrarProductos()">
              <option value="">Todas</option>
              ${[...new Set(productos.filter(p=>p.stock>0).map(p=>p.marca).filter(Boolean))].sort().map(m=>`<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:0 0 140px">
            <label>Formato</label>
            <select id="pFiltFormato" onchange="filtrarProductos()">
              <option value="">Todos</option>
              ${[...new Set(productos.filter(p=>p.stock>0).map(p=>p.formato).filter(Boolean))].sort().map(f=>`<option value="${f}">${f}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Grid de resultados -->
        <div id="pResultados" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;max-height:240px;overflow-y:auto">
          <!-- Se llena con filtrarProductos() -->
        </div>
        <div id="pResultadosEmpty" style="display:none;text-align:center;padding:16px;color:#64748B;font-size:12px">
          Sin productos con ese criterio
        </div>
      </div>

      <!-- Producto seleccionado + cantidad -->
      <div id="pSeleccionado" style="display:none;background:#DCFCE7;border:1px solid #86EFAC;border-radius:8px;padding:10px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div style="flex:1">
            <div style="font-weight:700;font-size:13px" id="pSelNombre"></div>
            <div style="font-size:11px;color:#64748B" id="pSelDetalle"></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="form-group" style="flex:0 0 80px;margin:0">
              <label style="font-size:10px">Cant.</label>
              <input type="number" id="vCantidad" value="1" min="1" oninput="updateTotal()"
                style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;width:70px">
            </div>
            <div class="form-group" style="flex:0 0 110px;margin:0">
              <label style="font-size:10px">Precio u.</label>
              <input type="number" id="vPrecioUnit" placeholder="0" oninput="updateTotal()"
                style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;font-size:13px;width:100px">
            </div>
            <input type="hidden" id="vProducto" value="">
            <button class="btn btn-primary btn-sm" onclick="addCartItem()">+ Agregar al carrito</button>
            <button class="btn btn-ghost btn-sm" onclick="limpiarSeleccionProducto()">✕</button>
          </div>
        </div>
      </div>

      <div id="cartContainer" style="margin-bottom:12px"></div>
    </div>

    <div class="form-row">
      <div class="form-group" style="flex:0 0 130px">
        <label>Propina</label>
        <input type="number" id="vPropina" value="0">
      </div>
      <div class="form-group" style="flex:0 0 130px">
        <label>Descuento</label>
        <input type="number" id="vDescuento" value="0">
      </div>
      <div class="form-group">
        <label>Forma de Pago</label>
        <select id="vFormaPago" onchange="ventaFormaPagoChange(this.value)">
          <option value="EF">EF - Efectivo</option>
          <option value="TK">TK - Tarjeta</option>
          <option value="TRF">TRF - Transferencia</option>
          <option value="MP">MP - Mercado Pago</option>
        </select>
      </div>
    </div>

    <!-- Cod Auth + Boleta (obligatorio TK/TRF/MP) -->
    <div id="bloqueAuth" style="display:none">
      <div class="form-row">
        <div class="form-group">
          <label>Cod. Autorización <span style="color:#94A3B8;font-weight:400">(opcional)</span></label>
          <input type="text" id="vCodAuth" placeholder="Código de autorización">
        </div>
        <div class="form-group">
          <label>N° Boleta <span style="color:var(--red)">*</span></label>
          <input type="text" id="vBoleta" placeholder="Número de boleta">
        </div>
      </div>
    </div>

    <!-- Campos exclusivos venta web -->
    <div id="bloqueWeb" style="display:none;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:600;color:var(--blue);margin-bottom:8px;text-transform:uppercase;letter-spacing:.3px">🌐 Datos Venta Web</div>
      <div class="form-row" style="margin-bottom:0">
        <div class="form-group">
          <label>N° de Pedido</label>
          <input type="text" id="vNroPedido" placeholder="Ej: 1042">
        </div>
        <div class="form-group">
          <label>Monto Despacho</label>
          <input type="number" id="vMontoDespacho" value="0" placeholder="0" oninput="updateTotal()">
        </div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>Comentarios</label>
        <input type="text" id="vComentarios" placeholder="Notas adicionales (opcional)">
      </div>
      <div class="form-group" style="flex:0 0 160px;justify-content:flex-end;align-items:flex-end">
        <label style="cursor:pointer;display:flex;align-items:center;gap:6px;padding:8px 12px;background:#F1F5F9;border-radius:6px;border:1px solid var(--border)">
          <input type="checkbox" id="vEsWeb" onchange="ventaEsWebChange(this.checked)" style="width:15px;height:15px">
          <span style="font-size:12px;font-weight:600">🌐 Venta Web</span>
        </label>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:16px;margin-top:8px">
      <button class="btn btn-primary" onclick="submitVenta()" style="padding:10px 24px;font-size:14px">✓ Registrar Venta</button>
      <div style="font-size:13px;color:#64748B">Total estimado: <strong id="totalEstimado">$0</strong></div>
      <div id="promoBadge" style="display:none"><span class="badge badge-amber">🏷️ Precio promo mar/mié activo</span></div>
    </div>
  </div>
  `;

  ventaFechaChange(ventaForm.fecha);
}

function ventaFechaChange(val){
  if(!val) return;
  ventaForm.fecha=val;
  const d=new Date(val+'T12:00:00');
  document.getElementById('vAnio').value=d.getFullYear();
  document.getElementById('vNmes').value=d.getMonth()+1;
  document.getElementById('vMes').value=MESES[d.getMonth()];
  document.getElementById('vDia').value=d.getDate();
  document.getElementById('vDiaSemana').value=DIAS_ES[d.getDay()];
  // check promo
  const isPromo=d.getDay()===2||d.getDay()===3; // mar=2, mie=3
  document.getElementById('promoBadge').style.display=isPromo?'block':'none';
  if(isPromo) applyPromo();
  else {
    const svc=servicios.find(s=>s.id===document.getElementById('vServicio')?.value);
    if(svc) document.getElementById('vMonto').value=svc.precio;
  }
  updateTotal();
}

function applyPromo(){
  const sel=document.getElementById('vServicio');
  if(!sel) return;
  const svc=servicios.find(s=>s.id===sel.value);
  if(!svc) return;
  const d=new Date(ventaForm.fecha+'T12:00:00');
  const isPromo=d.getDay()===2||d.getDay()===3;
  if(isPromo&&(svc.tipo==='promo'||svc.tipo==='menor')&&svc.precio_promo){
    document.getElementById('vMonto').value=svc.precio_promo;
  } else {
    document.getElementById('vMonto').value=svc.precio;
  }
  updateTotal();
}

function ventaServicioChange(){
  applyPromo();
}

function ventaTipoChange(val){
  ventaForm.tipo=val;
  const bs=document.getElementById('bloqueServicio');
  const bp=document.getElementById('bloqueProducto');
  if(bs) bs.style.display=val==='servicio'?'block':'none';
  if(bp) bp.style.display=val==='PRODUCTO'?'block':'none';
  if(val==='PRODUCTO') setTimeout(()=>filtrarProductos(), 0);
  updateTotal();
}

function ventaFormaPagoChange(val){
  document.getElementById('bloqueAuth').style.display=(val==='TK'||val==='TRF'||val==='MP')?'block':'none';
}

function ventaEsWebChange(checked){
  document.getElementById('bloqueWeb').style.display = checked ? 'block' : 'none';
  const fp = document.getElementById('vFormaPago');
  const bSel = document.getElementById('vBarbero');
  if(checked){
    fp.value = 'MP';
    document.getElementById('bloqueAuth').style.display = 'block';
    // Auto-seleccionar PISTON
    const pistonOpt = Array.from(bSel.options).find(o=>o.text.toUpperCase().includes('PISTON'));
    if(pistonOpt) bSel.value = pistonOpt.value;
  } else {
    fp.value = 'EF';
    document.getElementById('bloqueAuth').style.display = 'none';
  }
}

function updateTotal(){
  let monto=0;
  if(ventaForm.tipo==='servicio'){
    monto=Number(document.getElementById('vMonto')?.value||0);
  } else {
    monto=cart.reduce((s,c)=>s+c.total,0);
  }
  const prop=Number(document.getElementById('vPropina')?.value||0);
  const desc=Number(document.getElementById('vDescuento')?.value||0);
  const despacho=Number(document.getElementById('vMontoDespacho')?.value||0);
  document.getElementById('totalEstimado').textContent=fmtCLP(monto+prop-desc+despacho);
}

function filtrarProductos(){
  const buscar = (document.getElementById('pBuscar')?.value||'').toLowerCase().trim();
  const cat    = document.getElementById('pFiltCat')?.value||'';
  const marca  = document.getElementById('pFiltMarca')?.value||'';
  const formato= document.getElementById('pFiltFormato')?.value||'';

  let lista = productos.filter(p=>p.stock>0);
  if(cat)    lista = lista.filter(p=>p.categoria===cat);
  if(marca)  lista = lista.filter(p=>p.marca===marca);
  if(formato)lista = lista.filter(p=>p.formato===formato);
  if(buscar) lista = lista.filter(p=>[p.nombre,p.marca,p.categoria,p.formato].join(' ').toLowerCase().includes(buscar));

  const cont = document.getElementById('pResultados');
  const empty = document.getElementById('pResultadosEmpty');
  if(!cont) return;

  if(lista.length===0){
    cont.innerHTML=''; empty.style.display='block'; return;
  }
  empty.style.display='none';

  cont.innerHTML = lista.map(p=>`
    <div onclick="seleccionarProducto('${p.id}')"
      style="border:1px solid var(--border);border-radius:7px;padding:9px 11px;background:#fff;cursor:pointer;transition:.1s"
      onmouseover="this.style.borderColor='var(--blue)';this.style.background='#EFF6FF'"
      onmouseout="this.style.borderColor='var(--border)';this.style.background='#fff'">
      <div style="font-weight:600;font-size:12px;line-height:1.3">${p.nombre}</div>
      <div style="font-size:11px;color:#64748B;margin-top:2px">${[p.marca,p.formato].filter(Boolean).join(' · ')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px">
        <span style="font-size:12px;font-weight:700;color:var(--blue)">${fmtCLP(p.precio)}</span>
        <span style="font-size:10px;color:${p.stock<=p.stock_minimo?'var(--red)':'#64748B'}">
          ${p.stock<=p.stock_minimo?'⚠ ':''}Stock: ${p.stock}
        </span>
      </div>
    </div>`).join('');
}

function seleccionarProducto(pid){
  const p = productos.find(x=>x.id===pid);
  if(!p) return;
  document.getElementById('vProducto').value = pid;
  document.getElementById('vPrecioUnit').value = p.precio;
  document.getElementById('vCantidad').value = 1;
  document.getElementById('pSelNombre').textContent = p.nombre;
  document.getElementById('pSelDetalle').textContent =
    [p.marca, p.categoria, p.formato, `Stock: ${p.stock}`].filter(Boolean).join(' · ');
  document.getElementById('pSeleccionado').style.display = 'block';
  // Scroll suave al panel de seleccionado
  document.getElementById('pSeleccionado').scrollIntoView({behavior:'smooth',block:'nearest'});
  updateTotal();
}

function limpiarSeleccionProducto(){
  document.getElementById('vProducto').value='';
  document.getElementById('pSeleccionado').style.display='none';
  document.getElementById('pBuscar').value='';
  document.getElementById('pFiltCat').value='';
  document.getElementById('pFiltMarca').value='';
  document.getElementById('pFiltFormato').value='';
  filtrarProductos();
}

function addCartItem(){
  const pid=document.getElementById('vProducto').value;
  if(!pid){toast('Selecciona un producto','error');return;}
  const p=productos.find(x=>x.id===pid);
  if(!p){toast('Producto no encontrado','error');return;}
  const qty=Number(document.getElementById('vCantidad').value||1);
  const pu=Number(document.getElementById('vPrecioUnit').value||p.precio);
  if(qty>p.stock){toast('Stock insuficiente','error');return;}
  const existing=cart.find(c=>c.pid===pid);
  if(existing){existing.qty+=qty;existing.total=existing.qty*existing.precio;}
  else cart.push({pid,nombre:p.nombre,precio:pu,qty,total:pu*qty,stock:p.stock});
  renderCart();updateTotal();
  limpiarSeleccionProducto();
  toast(`✓ ${p.nombre} agregado al carrito`);
}

function removeCartItem(idx){
  cart.splice(idx,1);renderCart();updateTotal();
}

function clearCart(){cart=[];renderCart();updateTotal();}

function renderCart(){
  const c=document.getElementById('cartContainer');
  if(!c) return;
  if(cart.length===0){c.innerHTML='<p style="color:#64748B;font-size:12px">Sin productos en el carrito</p>';return;}
  c.innerHTML=cart.map((it,i)=>`
    <div class="cart-item">
      <span style="flex:1">${it.nombre}</span>
      <span style="width:60px;text-align:center">${it.qty} u.</span>
      <span style="width:90px;text-align:right">${fmtCLP(it.total)}</span>
      <button class="btn btn-danger btn-sm" style="margin-left:8px" onclick="removeCartItem(${i})">✕</button>
    </div>`).join('');
}

async function submitVenta(){
  const bId=document.getElementById('vBarbero').value;
  if(!bId){toast('Selecciona un barbero','error');return;}
  const bNombre=barberos.find(b=>b.id===bId)?.nombre||'';
  const tipo=document.getElementById('vTipo').value;
  const formaPago=document.getElementById('vFormaPago').value;
  if(formaPago==='TK'||formaPago==='TRF'||formaPago==='MP'){
    // Cod. Autorización es opcional
    if(!document.getElementById('vBoleta').value){toast('Ingresa el N° Boleta','error');return;}
  }
  const fecha=document.getElementById('vFecha').value;
  const d=new Date(fecha+'T12:00:00');

  const base={
    barbero_id:bId,barbero_nombre:bNombre,
    anio:d.getFullYear(),n_mes:d.getMonth()+1,mes:MESES[d.getMonth()],
    dia:d.getDate(),dia_semana:DIAS_ES[d.getDay()],fecha,
    propina:Number(document.getElementById('vPropina').value||0),
    descuento:Number(document.getElementById('vDescuento').value||0),
    forma_pago:formaPago,
    es_web:document.getElementById('vEsWeb').checked,
    cliente:document.getElementById('vCliente').value||null,
    comentarios:document.getElementById('vComentarios').value||null,
    cod_autorizacion:document.getElementById('vCodAuth')?.value||null,
    boleta:document.getElementById('vBoleta')?.value||null,
    numero_pedido:document.getElementById('vNroPedido')?.value||null,
    monto_despacho:Number(document.getElementById('vMontoDespacho')?.value||0)||null,
  };

  showOverlay();
  let rows=[];
  const despacho=Number(document.getElementById('vMontoDespacho')?.value||0);
  if(tipo==='servicio'){
    const monto=Number(document.getElementById('vMonto').value||0);
    const svcSel=document.getElementById('vServicio');
    const svc=servicios.find(s=>s.id===svcSel.value);
    rows.push({...base,tipo:'servicio',servicio_producto:svc?.nombre||'',monto,total:monto+base.propina-base.descuento+despacho});
  } else {
    if(cart.length===0){hideOverlay();toast('Agrega productos al carrito','error');return;}
    // El despacho solo se suma a la primera fila para no duplicar
    let primerRow=true;
    for(const it of cart){
      const totalRow=it.total+base.propina-base.descuento+(primerRow?despacho:0);
      rows.push({...base,tipo:'PRODUCTO',servicio_producto:it.nombre,monto:it.total,total:totalRow});
      primerRow=false;
      await sb.from('productos').update({stock:it.stock-it.qty}).eq('id',it.pid);
    }
  }
  const {error}=await sb.from('ventas').insert(rows);
  hideOverlay();
  if(error){toast('Error al guardar: '+error.message,'error');return;}
  toast(`✓ Venta registrada (${rows.length} registro${rows.length>1?'s':''})`)
  cart=[];
  renderVentaForm();
}

export { addCartItem, clearCart, filtrarProductos, limpiarSeleccionProducto, loadVenta, removeCartItem, seleccionarProducto, submitVenta, ventaEsWebChange, ventaFechaChange, ventaFormaPagoChange, ventaServicioChange, ventaTipoChange };
