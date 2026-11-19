// Pestaña Propuestas (ventas sugeridas desde AgendaPro)
import { DIAS_ES, MESES, barberos, fmtCLP, getXLSX, hideOverlay, loadCatalogos, localISODate, productos, sb, servicios, showOverlay, toast } from './core.js';
import { propClave, propCod, propDetectarRegistradas, propMapBarbero, propNorm, propParseAgenda, propServicio, propSugerirDia } from './propuestas_logic.js';

// ============ PROPUESTAS: PANTALLA ============
let propState={barbero:'',estado:'pendiente',props:[],gn:[],ventas:[],drafts:{},sugs:{},disp:{},cargado:false};
function propEsc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function propFechaLarga(f){const d=new Date(f+'T12:00:00');return `${DIAS_ES[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0,3).toLowerCase()}`;}

async function loadPropuestas(){
  document.getElementById('mainContent').innerHTML=`<div style="text-align:center;padding:40px;color:#64748B">Cargando propuestas...</div>`;
  showOverlay();
  try{
    await loadCatalogos();
    const desde=localISODate(new Date(Date.now()-45*864e5));
    const {data:pp,error}=await sb.from('propuestas_venta').select('*')
      .or(`estado.eq.pendiente,fecha.gte.${desde}`).order('fecha').order('hora').range(0,4999);
    if(error) throw error;
    propState.props=pp||[];
    const fechas=propState.props.filter(p=>p.estado==='pendiente').map(p=>p.fecha).sort();
    if(fechas.length){
      const min=fechas[0], max=fechas[fechas.length-1];
      const [g,v]=await Promise.all([
        sb.from('getnet_transacciones').select('cod_aut,fecha_venta,hora_venta,valor_venta,propina,valor_transaccion,marca,tipo').gte('fecha_venta',min).lte('fecha_venta',max).range(0,4999),
        sb.from('ventas').select('id,fecha,barbero_nombre,cliente,forma_pago,cod_autorizacion,total,propina,tipo').gte('fecha',min).lte('fecha',max).range(0,4999)
      ]);
      if(g.error) throw g.error; if(v.error) throw v.error;
      propState.gn=g.data||[]; propState.ventas=v.data||[];
    } else { propState.gn=[]; propState.ventas=[]; }
    propRecalcular(true);
    propState.cargado=true;
  }catch(e){ toast('Error cargando propuestas: '+e.message,'error'); }
  finally{ hideOverlay(); }
  renderPropuestas();
}

// Calcula sugerencias y borradores (keep=true conserva lo que el barbero ya editó)
function propRecalcular(keep){
  if(!keep){ for(const k of Object.keys(propState.drafts)) if(!propState.drafts[k].editado) delete propState.drafts[k]; }
  propState.sugs={}; propState.disp={};
  const pend=propState.props.filter(p=>p.estado==='pendiente');
  const fechas=[...new Set(pend.map(p=>p.fecha))];
  for(const f of fechas){
    const gnDia=propState.gn.filter(g=>String(g.fecha_venta).slice(0,10)===f);
    const vDia=propState.ventas.filter(v=>String(v.fecha).slice(0,10)===f);
    const {sug,disponibles}=propSugerirDia(pend.filter(p=>p.fecha===f),gnDia,vDia,servicios);
    Object.assign(propState.sugs,sug);
    propState.disp[f]=disponibles; // pagos GetNet con lo que queda por asignar
  }
  for(const p of pend){
    if(propState.drafts[p.id]) continue;
    const bo=p.borrador;
    if(bo&&Array.isArray(bo.lineas)&&bo.lineas.length){
      propState.drafts[p.id]={forma:bo.forma||'',cod:bo.cod||'',codOtro:!!bo.codOtro,boleta:bo.boleta||'',nota:bo.nota||'',
        lineas:bo.lineas.map(l=>({...l})),editado:true};
      continue;
    }
    const s=propState.sugs[p.id]||{forma:'',cod:'',precio:0,propina:0};
    const b=propMapBarbero(p.barbero_nombre||'',barberos);
    let servicio_id='';
    if(p.servicio_agenda){
      const sv=propServicio(p.servicio_agenda,p.fecha,servicios);
      servicio_id=(sv.promo&&s.precio===sv.promo.precio_promo&&s.precio!==sv.normal?.precio?sv.promo.id:sv.normal?.id)||'';
    } else {
      servicio_id=(servicios.find(x=>x.precio===s.precio)||{}).id||'';
    }
    propState.drafts[p.id]={forma:s.forma,cod:s.cod||'',codOtro:false,boleta:'',nota:'',
      lineas:[{tipo:'servicio',barbero_id:b?.id||'',servicio_id,monto:s.precio||0,propina:s.propina||0}]};
  }
}

function propDraftTotal(d){return d.lineas.reduce((s,l)=>s+Number(l.monto||0)+(l.tipo==='servicio'?Number(l.propina||0):0),0);}

// Revisa si el código GetNet elegido cuadra con todo lo que lo usa (otras propuestas pendientes del mismo día)
function propCheckCod(p,d){
  if(d.forma!=='TK') return '';
  if(!d.cod) return `<span style="color:var(--amber)">⚠ Sin código de autorización: no se podrá conciliar con GetNet</span>`;
  const c=propCod(d.cod);
  const g=(propState.disp[p.fecha]||[]).find(x=>propCod(x.cod)===c);
  const otros=propState.props.filter(q=>q.id!==p.id&&q.estado==='pendiente'&&q.fecha===p.fecha&&propState.drafts[q.id]?.forma==='TK'&&propCod(propState.drafts[q.id]?.cod)===c);
  const suma=propDraftTotal(d)+otros.reduce((s,q)=>s+propDraftTotal(propState.drafts[q.id]),0);
  const comp=otros.length?` · compartido con ${otros.map(q=>propEsc((q.cliente||'pago sin cita')+(q.hora?' '+q.hora:'')+' ('+(q.barbero_nombre||'?')+')')).join(', ')}`:'';
  if(!g) return `<span style="color:var(--amber)">⚠ El código ${propEsc(d.cod)} no está en GetNet para este día (o ya se usó en otra venta)</span>`;
  const que=g.parcial?`lo que queda del pago GetNet (${fmtCLP(g.trans)} de ${fmtCLP(g.total)}; el resto ya está en ventas)`:`GetNet (${fmtCLP(g.trans)})`;
  if(suma===g.trans) return `<span style="color:var(--green)">✓ Cuadra con ${que}</span>${comp}`;
  return `<span style="color:var(--red)">⚠ ${g.parcial?'Queda':'GetNet'} ${fmtCLP(g.trans)} vs propuesta ${fmtCLP(suma)} (diferencia ${fmtCLP(g.trans-suma)})</span>${comp}`;
}

function renderPropuestas(){
  const st=propState;
  const bOpts=barberos.filter(b=>!/piston/i.test(b.nombre));
  const visible=p=>{
    if(st.estado && p.estado!==st.estado) return false;
    if(!st.barbero) return true;
    const b=barberos.find(x=>x.id===st.barbero);
    if(propNorm(p.barbero_nombre)===propNorm(b?.nombre)) return true;
    const d=st.drafts[p.id]; return !!d && d.lineas.some(l=>l.barbero_id===st.barbero) || (p.origen==='getnet' && !p.barbero_nombre);
  };
  const lista=st.props.filter(visible);
  const cuenta=e=>st.props.filter(p=>p.estado===e).length;
  const fechas=[...new Set(lista.map(p=>p.fecha))].sort((a,b)=>st.estado==='pendiente'?a.localeCompare(b):b.localeCompare(a));

  let html=`
  <div class="card">
    <div class="card-title">📝 Propuestas de venta desde AgendaPro</div>
    <div style="font-size:12px;color:#64748B;margin-bottom:12px">Sube el reporte de reservas de AgendaPro. Cada cita atendida que no esté registrada aparece aquí con el servicio, precio y pago sugeridos (cruzando con GetNet). Revisa, ajusta y acepta: se crea la venta como si la ingresaras en Nueva Venta.</div>
    <div class="filters" style="flex-wrap:wrap;gap:8px">
      <label class="btn btn-primary btn-sm" style="cursor:pointer">📥 Subir reporte AgendaPro
        <input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="window._bridge.propImport(this)">
      </label>
      <select onchange="window._bridge.propFiltro('barbero',this.value)">
        <option value="">Todos los barberos</option>
        ${bOpts.map(b=>`<option value="${b.id}" ${st.barbero===b.id?'selected':''}>${propEsc(b.nombre)}</option>`).join('')}
      </select>
      <select onchange="window._bridge.propFiltro('estado',this.value)">
        <option value="pendiente" ${st.estado==='pendiente'?'selected':''}>Por revisar (${cuenta('pendiente')})</option>
        <option value="aceptada" ${st.estado==='aceptada'?'selected':''}>Aceptadas (${cuenta('aceptada')})</option>
        <option value="descartada" ${st.estado==='descartada'?'selected':''}>Descartadas (${cuenta('descartada')})</option>
        <option value="registrada" ${st.estado==='registrada'?'selected':''}>Ya estaban registradas (${cuenta('registrada')})</option>
      </select>
      ${st.estado==='pendiente'?`<button class="btn btn-ghost btn-sm" onclick="window._bridge.propRecalc()" title="Vuelve a calcular las sugerencias de las tarjetas que nadie ha editado">↺ Recalcular sugerencias</button>`:''}
      <span style="margin-left:auto;font-size:12px;color:#64748B">${lista.length} propuesta${lista.length===1?'':'s'}</span>
    </div>
  </div>`;

  if(!lista.length){
    html+=`<div class="card" style="text-align:center;color:#64748B;padding:30px">${st.estado==='pendiente'?'No hay citas por revisar. Sube el reporte de AgendaPro para traer las nuevas.':'Nada que mostrar con estos filtros.'}</div>`;
  }
  for(const f of fechas){
    const delDia=lista.filter(p=>p.fecha===f);
    html+=`<div style="margin:18px 0 8px;display:flex;align-items:baseline;gap:10px"><div class="sec-title" style="margin:0">${propFechaLarga(f)}</div><span style="font-size:12px;color:#64748B">${delDia.length} cita${delDia.length===1?'':'s'}</span></div>`;
    if(st.estado==='pendiente'){
      const usadosDraft=new Set(st.props.filter(p=>p.estado==='pendiente'&&p.fecha===f&&st.drafts[p.id]?.forma==='TK').map(p=>propCod(st.drafts[p.id].cod)));
      const sueltos=(st.disp[f]||[]).filter(g=>!usadosDraft.has(propCod(g.cod)));
      if(sueltos.length) html+=`<div class="card" style="background:#FFFBEB;border-color:#FDE68A;padding:10px 14px;margin-bottom:10px;font-size:12px">
        <b>Pagos GetNet de este día sin propuesta:</b> ${sueltos.map(g=>`<span style="display:inline-block;margin:3px 8px 3px 0">${propEsc(g.cod)}${g.hora?' ('+g.hora+')':''} · ${g.parcial?'queda ':''}${fmtCLP(g.venta)}${g.prop?` + ${fmtCLP(g.prop)} prop.`:''} <button class="btn btn-ghost btn-sm" style="padding:1px 6px;font-size:11px" onclick="window._bridge.propCrearDesdePago('${f}','${propEsc(g.cod)}')">+ crear venta</button></span>`).join('')}
        <div style="color:#92400E;margin-top:4px">Puede ser un cliente sin cita, o un pago que corresponde a una propuesta de abajo con otro monto (por ejemplo, con productos).</div></div>`;
    }
    for(const p of delDia) html+= p.estado==='pendiente'?propCardPendiente(p):propCardCerrada(p);
  }
  document.getElementById('mainContent').innerHTML=html;
}

function propCardPendiente(p){
  const d=propState.drafts[p.id]; const s=propState.sugs[p.id]||{};
  const colores={alta:'#15803D',media:'#B45309',baja:'#DC2626',ninguna:'#94A3B8'};
  const bOpts=barberos.filter(b=>!/piston/i.test(b.nombre));
  const disp=propState.disp[p.fecha]||[];
  const lineas=d.lineas.map((l,i)=>{
    const selB=`<select onchange="window._bridge.propLinea('${p.id}',${i},'barbero_id',this.value)" style="min-width:130px"><option value="">— Barbero —</option>${bOpts.map(b=>`<option value="${b.id}" ${l.barbero_id===b.id?'selected':''}>${propEsc(b.nombre)}</option>`).join('')}</select>`;
    let item;
    if(l.tipo==='servicio'){
      item=`<select onchange="window._bridge.propLinea('${p.id}',${i},'servicio_id',this.value)" style="flex:1;min-width:180px;max-width:340px"><option value="">— Servicio —</option>${servicios.map(sv=>`<option value="${sv.id}" ${l.servicio_id===sv.id?'selected':''}>${propEsc(sv.nombre)} (${fmtCLP(sv.tipo==='promo'&&sv.precio_promo?sv.precio_promo:sv.precio)})</option>`).join('')}</select>`;
    } else {
      item=`<select onchange="window._bridge.propLinea('${p.id}',${i},'producto_id',this.value)" style="flex:1;min-width:180px;max-width:340px"><option value="">— Producto —</option>${productos.filter(x=>x.stock>0||x.id===l.producto_id).map(x=>`<option value="${x.id}" ${l.producto_id===x.id?'selected':''}>${propEsc(x.nombre)}${x.marca?' · '+propEsc(x.marca):''} (${fmtCLP(x.precio)} · stock ${x.stock})</option>`).join('')}</select>
        <input type="number" min="1" value="${l.qty||1}" title="Cantidad" style="width:60px" onchange="window._bridge.propLinea('${p.id}',${i},'qty',this.value)">`;
    }
    return `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <span class="badge ${l.tipo==='servicio'?'badge-blue':'badge-purple'}" style="width:70px;text-align:center">${l.tipo==='servicio'?'Servicio':'Producto'}</span>
      ${selB}${item}
      <label style="font-size:11px;color:#64748B">Monto <input type="number" value="${l.monto||0}" style="width:90px" onchange="window._bridge.propLinea('${p.id}',${i},'monto',this.value)"></label>
      ${l.tipo==='servicio'?`<label style="font-size:11px;color:#64748B">Propina <input type="number" value="${l.propina||0}" style="width:80px" onchange="window._bridge.propLinea('${p.id}',${i},'propina',this.value)"></label>`:''}
      ${d.lineas.length>1?`<button class="btn btn-ghost btn-sm" title="Quitar línea" onclick="window._bridge.propDelLinea('${p.id}',${i})">✕</button>`:''}
    </div>`;
  }).join('');
  const codSel = d.forma==='TK' ? (d.codOtro
      ? `<input type="text" value="${propEsc(d.cod)}" placeholder="Código de autorización" style="width:150px" onchange="window._bridge.propSet('${p.id}','cod',this.value)"> <a href="#" style="font-size:11px" onclick="window._bridge.propSet('${p.id}','codOtro',false);return false">elegir de GetNet</a>`
      : `<select style="min-width:240px" onchange="window._bridge.propSet('${p.id}','cod',this.value)">
          <option value="">— Código GetNet —</option>
          ${disp.map(g=>{const usadoPor=propState.props.filter(q=>q.id!==p.id&&q.estado==='pendiente'&&q.fecha===p.fecha&&propState.drafts[q.id]?.forma==='TK'&&propCod(propState.drafts[q.id].cod)===propCod(g.cod)).map(q=>q.cliente||'sin cita');
            return `<option value="${propEsc(g.cod)}" ${propCod(d.cod)===propCod(g.cod)?'selected':''}>${propEsc(g.cod)}${g.hora?' · '+g.hora:''} · ${g.parcial?'queda ':''}${fmtCLP(g.venta)}${g.prop?' + '+fmtCLP(g.prop)+' prop.':''}${g.parcial?' (de '+fmtCLP(g.total)+')':''} · ${propEsc(g.tarjeta)}${usadoPor.length?' — en: '+propEsc(usadoPor.join(', ')):''}</option>`;}).join('')}
          ${d.cod&&!disp.some(g=>propCod(g.cod)===propCod(d.cod))?`<option value="${propEsc(d.cod)}" selected>${propEsc(d.cod)} (no está en GetNet)</option>`:''}
          <option value="__otro">Otro código…</option>
        </select>`) : '';
  return `<div class="card prop-card" data-prop-id="${p.id}" style="border-left:4px solid ${colores[s.conf]||'#94A3B8'};padding:14px 16px;margin-bottom:10px">
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px">
      ${p.hora?`<b>${propEsc(p.hora)}</b>`:''}
      <b>${p.origen==='getnet'?'Pago GetNet sin cita':propEsc(p.cliente||'(sin nombre)')}</b>
      ${p.servicio_agenda?`<span class="badge badge-gray">${propEsc(p.servicio_agenda)}</span>`:''}
      ${p.barbero_nombre?`<span class="badge badge-blue">${propEsc(p.barbero_nombre)}</span>`:''}
      ${p.pagada_agenda?`<span class="badge badge-green">$ pagada en AgendaPro</span>`:''}
    </div>
    ${s.motivo?`<div style="font-size:11px;color:${colores[s.conf]||'#64748B'};margin-bottom:10px">💡 ${propEsc(s.motivo)}</div>`:''}
    ${lineas}
    <div style="display:flex;gap:6px;margin:2px 0 10px">
      <button class="btn btn-ghost btn-sm" onclick="window._bridge.propAddLinea('${p.id}','PRODUCTO')">+ Producto</button>
      <button class="btn btn-ghost btn-sm" onclick="window._bridge.propAddLinea('${p.id}','servicio')" title="Mismo pago, servicio hecho por otro barbero (o un segundo servicio)">+ Servicio (otro barbero)</button>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">
      <select onchange="window._bridge.propSet('${p.id}','forma',this.value)" style="${d.forma?'':'border-color:var(--red)'}">
        <option value="" ${!d.forma?'selected':''}>— Forma de pago —</option>
        ${[['EF','EF - Efectivo'],['TK','TK - Tarjeta'],['TRF','TRF - Transferencia'],['MP','MP - Mercado Pago']].map(([v,t])=>`<option value="${v}" ${d.forma===v?'selected':''}>${t}</option>`).join('')}
      </select>
      ${codSel}
      ${d.forma&&d.forma!=='TK'&&d.forma!=='EF'?`<input type="text" value="${propEsc(d.cod)}" placeholder="Cod. autorización (opcional)" style="width:170px" onchange="window._bridge.propSet('${p.id}','cod',this.value)">`:''}
      ${d.forma&&d.forma!=='EF'?`<input type="text" value="${propEsc(d.boleta)}" placeholder="N° Boleta *" style="width:110px" onchange="window._bridge.propSet('${p.id}','boleta',this.value)">`:''}
      <input type="text" value="${propEsc(d.nota)}" placeholder="Comentario (opcional)" style="flex:1;min-width:140px" onchange="window._bridge.propSet('${p.id}','nota',this.value)">
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;font-size:12px">
      <div style="flex:1">Total: <b>${fmtCLP(propDraftTotal(d))}</b> ${propCheckCod(p,d)?' · '+propCheckCod(p,d):''}
        ${d.editado?`<div style="margin-top:4px;color:#64748B"><span id="propGuardado_${p.id}">${p.borrador?'✎ Cambios guardados':'✎ Guardando…'}</span> · <a href="#" onclick="window._bridge.propVolverSugerencia('${p.id}');return false">volver a la sugerencia</a></div>`:''}</div>
      <button class="btn btn-success btn-sm" onclick="window._bridge.propAceptar('${p.id}')">✓ Aceptar</button>
      <select class="btn btn-ghost btn-sm" onchange="if(this.value)window._bridge.propDescartar('${p.id}',this.value)">
        <option value="">Descartar…</option>
        <option value="No vino">No vino</option>
        <option value="Ya estaba registrada">Ya estaba registrada</option>
        <option value="Cita duplicada">Cita duplicada</option>
        <option value="Otro motivo">Otro motivo</option>
      </select>
    </div>
  </div>`;
}

function propCardCerrada(p){
  const badge={aceptada:'badge-green',descartada:'badge-gray',registrada:'badge-blue'}[p.estado]||'badge-gray';
  const txt={aceptada:'Aceptada',descartada:'Descartada',registrada:'Ya registrada'}[p.estado]||p.estado;
  const det=p.detalle&&p.detalle.lineas?p.detalle.lineas.map(l=>`${propEsc(l.nombre||'')} ${fmtCLP(l.monto)}${l.propina?' + '+fmtCLP(l.propina):''} (${propEsc(l.barbero||'')})`).join(' · ')+` · ${propEsc(p.detalle.forma||'')}${p.detalle.cod?' '+propEsc(p.detalle.cod):''}`:'';
  return `<div class="card" style="padding:10px 14px;margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px">
    <span class="badge ${badge}">${txt}</span>
    ${p.hora?`<b>${propEsc(p.hora)}</b>`:''} <b>${propEsc(p.cliente||(p.origen==='getnet'?'Pago GetNet '+(p.getnet_cod||''):''))}</b>
    ${p.servicio_agenda?`<span style="color:#64748B">${propEsc(p.servicio_agenda)}</span>`:''}
    ${p.barbero_nombre?`<span class="badge badge-blue">${propEsc(p.barbero_nombre)}</span>`:''}
    <span style="flex:1;color:#64748B">${det}${p.nota?' — '+propEsc(p.nota):''}</span>
    ${p.estado==='aceptada'?`<button class="btn btn-ghost btn-sm" onclick="window._bridge.propDeshacer('${p.id}')" title="Borra las ventas creadas y devuelve la propuesta a revisión">↩ Deshacer</button>`
      :`<button class="btn btn-ghost btn-sm" onclick="window._bridge.propReabrir('${p.id}')">Volver a revisar</button>`}
  </div>`;
}

// ---- Acciones ----
function propSet(id,campo,valor){
  const d=propState.drafts[id]; if(!d) return;
  if(campo==='cod'&&valor==='__otro'){ d.codOtro=true; d.cod=''; }
  else if(campo==='codOtro'){ d.codOtro=!!valor; }
  else if(campo==='forma'){
    d.forma=valor;
    if(valor!=='TK'){ d.codOtro=false; if(propState.disp[propState.props.find(p=>p.id===id)?.fecha]?.some(g=>propCod(g.cod)===propCod(d.cod))) d.cod=''; }
  }
  else d[campo]=valor;
  propMarcar(id);
  // Al elegir un código GetNet, proponer propina si la propuesta no comparte el pago
  if(campo==='cod'&&valor&&valor!=='__otro'){
    const p=propState.props.find(x=>x.id===id);
    const g=(propState.disp[p.fecha]||[]).find(x=>propCod(x.cod)===propCod(valor));
    const otros=propState.props.some(q=>q.id!==id&&q.estado==='pendiente'&&q.fecha===p.fecha&&propState.drafts[q.id]?.forma==='TK'&&propCod(propState.drafts[q.id].cod)===propCod(valor));
    const servs=d.lineas.filter(l=>l.tipo==='servicio');
    if(g&&!otros&&servs.length===1&&d.lineas.length===1){ servs[0].propina=g.prop; servs[0].monto=g.venta; }
  }
  renderPropuestas();
}
function propLinea(id,i,campo,valor){
  const l=propState.drafts[id]?.lineas[i]; if(!l) return;
  if(campo==='servicio_id'){ l.servicio_id=valor; const sv=servicios.find(s=>s.id===valor); if(sv) l.monto=(sv.tipo==='promo'&&sv.precio_promo)?sv.precio_promo:sv.precio; }
  else if(campo==='producto_id'){ l.producto_id=valor; const pr=productos.find(x=>x.id===valor); if(pr) l.monto=pr.precio*(Number(l.qty)||1); }
  else if(campo==='qty'){ l.qty=Math.max(1,Number(valor)||1); const pr=productos.find(x=>x.id===l.producto_id); if(pr) l.monto=pr.precio*l.qty; }
  else if(campo==='monto'||campo==='propina'){ l[campo]=Math.max(0,Number(valor)||0); }
  else l[campo]=valor;
  propMarcar(id);
  renderPropuestas();
}
function propAddLinea(id,tipo){
  const d=propState.drafts[id]; if(!d) return;
  const base=d.lineas[0]?.barbero_id||'';
  if(tipo==='PRODUCTO') d.lineas.push({tipo:'PRODUCTO',barbero_id:base,producto_id:'',qty:1,monto:0});
  else d.lineas.push({tipo:'servicio',barbero_id:'',servicio_id:'',monto:0,propina:0});
  propMarcar(id);
  renderPropuestas();
}
function propDelLinea(id,i){ const d=propState.drafts[id]; if(d&&d.lineas.length>1){ d.lineas.splice(i,1); propMarcar(id); renderPropuestas(); } }
function propFiltro(k,v){ propState[k]=v; renderPropuestas(); }
function propRecalc(){ propRecalcular(false); renderPropuestas(); toast('Sugerencias recalculadas (las tarjetas que alguien editó se mantienen)','info'); }

// ---- Borradores: se guardan solos en la base para no perder cambios al recargar o cambiar de equipo ----
const propTimers={};
function propMarcar(id){
  const d=propState.drafts[id]; if(!d) return;
  d.editado=true;
  clearTimeout(propTimers[id]);
  propTimers[id]=setTimeout(()=>propGuardarBorrador(id),700);
}
async function propGuardarBorrador(id){
  const d=propState.drafts[id]; if(!d) return;
  const borrador={forma:d.forma,cod:d.cod,codOtro:d.codOtro,boleta:d.boleta,nota:d.nota,lineas:d.lineas};
  const {error}=await sb.from('propuestas_venta').update({borrador}).eq('id',id).eq('estado','pendiente');
  if(error){ toast('No se pudo guardar el borrador: '+error.message,'error'); return; }
  const p=propState.props.find(x=>x.id===id); if(p) p.borrador=borrador;
  const el=document.getElementById('propGuardado_'+id); if(el) el.textContent='✎ Cambios guardados';
}
async function propVolverSugerencia(id){
  clearTimeout(propTimers[id]);
  const {error}=await sb.from('propuestas_venta').update({borrador:null}).eq('id',id);
  if(error) return toast('Error: '+error.message,'error');
  const p=propState.props.find(x=>x.id===id); if(p) p.borrador=null;
  delete propState.drafts[id];
  propRecalcular(true); renderPropuestas();
}

async function propAceptar(id){
  clearTimeout(propTimers[id]);
  const p=propState.props.find(x=>x.id===id), d=propState.drafts[id];
  if(!p||!d) return;
  if(!['EF','TK','TRF','MP'].includes(d.forma)) return toast('Elige la forma de pago','error');
  if(d.forma!=='EF'&&!String(d.boleta||'').trim()) return toast('Ingresa el N° Boleta','error');
  for(const l of d.lineas){
    if(!l.barbero_id) return toast('Falta elegir el barbero en una línea','error');
    if(l.tipo==='servicio'&&!l.servicio_id) return toast('Falta elegir el servicio en una línea','error');
    if(l.tipo==='PRODUCTO'&&!l.producto_id) return toast('Falta elegir el producto en una línea','error');
    if(!(Number(l.monto)>0)) return toast('Hay una línea con monto 0','error');
  }
  showOverlay();
  try{
    const {data:actual}=await sb.from('propuestas_venta').select('estado').eq('id',id).single();
    if(actual?.estado!=='pendiente'){ toast('Esta propuesta ya fue revisada por otra persona','error'); hideOverlay(); return loadPropuestas(); }
    const dt=new Date(p.fecha+'T12:00:00');
    const cod=d.forma==='EF'?null:(String(d.cod||'').trim()||null);
    const detalle={forma:d.forma,cod,boleta:d.boleta||null,lineas:[]};
    const filas=d.lineas.map(l=>{
      const b=barberos.find(x=>x.id===l.barbero_id);
      const nombre=l.tipo==='servicio'?servicios.find(s=>s.id===l.servicio_id)?.nombre:productos.find(x=>x.id===l.producto_id)?.nombre;
      const prop=l.tipo==='servicio'?Number(l.propina||0):0;
      detalle.lineas.push({tipo:l.tipo,barbero:b.nombre,nombre,monto:Number(l.monto),propina:prop,producto_id:l.producto_id||null,qty:l.qty||null});
      return {barbero_id:b.id,barbero_nombre:b.nombre,anio:dt.getFullYear(),n_mes:dt.getMonth()+1,mes:MESES[dt.getMonth()],
        dia:dt.getDate(),dia_semana:DIAS_ES[dt.getDay()],fecha:p.fecha,tipo:l.tipo,servicio_producto:nombre,
        monto:Number(l.monto),propina:prop,descuento:0,total:Number(l.monto)+prop,forma_pago:d.forma,es_web:false,
        cliente:p.cliente?p.cliente.trim().toUpperCase():null,
        comentarios:[p.origen==='getnet'?'Desde pago GetNet':`AgendaPro ${p.hora||''}`.trim(),d.nota].filter(Boolean).join(' · '),
        cod_autorizacion:cod,boleta:d.forma==='EF'?null:String(d.boleta).trim()};
    });
    const {data:ins,error}=await sb.from('ventas').insert(filas).select('id');
    if(error) throw error;
    for(const l of d.lineas.filter(l=>l.tipo==='PRODUCTO')){
      const {data:pr}=await sb.from('productos').select('stock').eq('id',l.producto_id).single();
      if(pr) await sb.from('productos').update({stock:Math.max(0,(pr.stock||0)-(Number(l.qty)||1))}).eq('id',l.producto_id);
    }
    const {error:e2}=await sb.from('propuestas_venta').update({estado:'aceptada',venta_ids:ins.map(x=>x.id),resuelta_en:new Date().toISOString(),nota:d.nota||null,detalle,borrador:null}).eq('id',id);
    if(e2) throw new Error('La venta se creó, pero no se pudo marcar la propuesta: '+e2.message);
    const pr=propState.props.find(x=>x.id===id); Object.assign(pr,{estado:'aceptada',venta_ids:ins.map(x=>x.id),detalle,nota:d.nota||null});
    delete propState.drafts[id];
    filas.forEach((f,i)=>propState.ventas.push({...f,id:ins[i].id}));
    propRecalcular(true);
    toast(`✓ Venta registrada (${filas.length} línea${filas.length>1?'s':''})`);
    await loadCatalogos();
  }catch(e){ toast('Error al aceptar: '+e.message,'error'); }
  finally{ hideOverlay(); }
  renderPropuestas();
}

async function propDescartar(id,motivo){
  clearTimeout(propTimers[id]);
  const estado=motivo==='Ya estaba registrada'?'registrada':'descartada';
  const {error}=await sb.from('propuestas_venta').update({estado,nota:motivo,resuelta_en:new Date().toISOString(),borrador:null}).eq('id',id).eq('estado','pendiente');
  if(error) return toast('Error: '+error.message,'error');
  const p=propState.props.find(x=>x.id===id); if(p){p.estado=estado;p.nota=motivo;}
  delete propState.drafts[id];
  toast(estado==='registrada'?'Marcada como ya registrada':'Propuesta descartada','info');
  renderPropuestas();
}
async function propReabrir(id){
  const {error}=await sb.from('propuestas_venta').update({estado:'pendiente',nota:null,resuelta_en:null}).eq('id',id).in('estado',['descartada','registrada']);
  if(error) return toast('Error: '+error.message,'error');
  toast('Vuelve a "Por revisar"','info'); loadPropuestas();
}
async function propDeshacer(id){
  const p=propState.props.find(x=>x.id===id); if(!p||p.estado!=='aceptada') return;
  showOverlay();
  try{
    if(p.venta_ids?.length){ const {error}=await sb.from('ventas').delete().in('id',p.venta_ids); if(error) throw error; }
    for(const l of (p.detalle?.lineas||[]).filter(l=>l.tipo==='PRODUCTO'&&l.producto_id)){
      const {data:pr}=await sb.from('productos').select('stock').eq('id',l.producto_id).single();
      if(pr) await sb.from('productos').update({stock:(pr.stock||0)+(Number(l.qty)||1)}).eq('id',l.producto_id);
    }
    const {error}=await sb.from('propuestas_venta').update({estado:'pendiente',venta_ids:null,detalle:null,resuelta_en:null}).eq('id',id);
    if(error) throw error;
    toast('Venta borrada; la propuesta vuelve a revisión','info');
  }catch(e){ toast('Error al deshacer: '+e.message,'error'); }
  finally{ hideOverlay(); }
  loadPropuestas();
}
async function propCrearDesdePago(fecha,cod){
  const {error}=await sb.from('propuestas_venta').upsert({clave:`getnet|${fecha}|${propCod(cod)}`,origen:'getnet',fecha,getnet_cod:cod,estado:'pendiente'},{onConflict:'clave'});
  if(error) return toast('Error: '+error.message,'error');
  loadPropuestas();
}

// ---- Importar reporte de reservas de AgendaPro ----
async function propImport(input){
  const file=input.files?.[0]; if(!file) return;
  showOverlay();
  try{
    const XL=await getXLSX();
    const wb=XL.read(await file.arrayBuffer(),{type:'array',cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const aoa=XL.utils.sheet_to_json(ws,{header:1,raw:true,defval:''});
    const {citas,omitidas}=propParseAgenda(aoa);
    if(!citas.length) throw new Error('El reporte no tiene citas con estado "Asiste"');
    await loadCatalogos();
    const filas=citas.map(c=>{
      const b=propMapBarbero(c.prestador,barberos);
      const barbero_nombre=b?b.nombre:c.prestador.toUpperCase();
      return {clave:propClave(c.fecha,c.hora,barbero_nombre,c.cliente),origen:'agendapro',fecha:c.fecha,hora:c.hora||null,
        cliente:c.cliente,servicio_agenda:c.servicio,barbero_nombre,estado_agenda:c.estado,pagada_agenda:c.pagada,archivo_origen:file.name};
    });
    // sin duplicados dentro del mismo archivo
    const unicas=[...new Map(filas.map(f=>[f.clave,f])).values()];
    const fechas=unicas.map(f=>f.fecha).sort(); const min=fechas[0], max=fechas[fechas.length-1];
    const [ex,ve]=await Promise.all([
      sb.from('propuestas_venta').select('clave,estado,fecha,barbero_nombre,venta_ids').gte('fecha',min).lte('fecha',max).range(0,9999),
      sb.from('ventas').select('id,fecha,barbero_nombre,cliente').eq('tipo','servicio').gte('fecha',min).lte('fecha',max).range(0,9999)
    ]);
    if(ex.error) throw ex.error; if(ve.error) throw ve.error;
    const existentes=new Set((ex.data||[]).map(x=>x.clave));
    const nuevas=unicas.filter(f=>!existentes.has(f.clave));
    // ventas ya ligadas a propuestas aceptadas no cuentan; cada "registrada" previa consume una venta de su día/barbero
    const ligadas=new Set((ex.data||[]).flatMap(x=>x.venta_ids||[]));
    const capacidad={};
    (ex.data||[]).filter(x=>x.estado==='registrada').forEach(x=>{const k=x.fecha+'|'+propNorm(x.barbero_nombre); capacidad[k]=(capacidad[k]||0)+1;});
    const pool=(ve.data||[]).filter(v=>!ligadas.has(v.id));
    const reg=propDetectarRegistradas(nuevas.map(f=>({key:f.clave,fecha:f.fecha,barbero_nombre:f.barbero_nombre,cliente:f.cliente})),pool,capacidad);
    nuevas.forEach(f=>{ if(reg.has(f.clave)){ f.estado='registrada'; f.nota='Detectada al importar: ya existía la venta'; } else f.estado='pendiente'; });
    for(let i=0;i<nuevas.length;i+=200){
      const {error}=await sb.from('propuestas_venta').upsert(nuevas.slice(i,i+200),{onConflict:'clave',ignoreDuplicates:true});
      if(error) throw error;
    }
    const pend=nuevas.filter(f=>f.estado==='pendiente').length;
    const om=Object.entries(omitidas).map(([k,v])=>`${v} ${k}`).join(', ');
    toast(`Reporte leído: ${pend} por revisar, ${nuevas.length-pend} ya registradas, ${unicas.length-nuevas.length} ya importadas antes${om?' · omitidas: '+om:''}`,'info');
    propState.estado='pendiente';
  }catch(e){ toast('Error al importar: '+e.message,'error'); }
  finally{ hideOverlay(); input.value=''; }
  loadPropuestas();
}

window._bridge.propImport=propImport;
window._bridge.propFiltro=propFiltro;
window._bridge.propRecalc=propRecalc;
window._bridge.propSet=propSet;
window._bridge.propLinea=propLinea;
window._bridge.propAddLinea=propAddLinea;
window._bridge.propDelLinea=propDelLinea;
window._bridge.propAceptar=propAceptar;
window._bridge.propDescartar=propDescartar;
window._bridge.propReabrir=propReabrir;
window._bridge.propDeshacer=propDeshacer;
window._bridge.propCrearDesdePago=propCrearDesdePago;
window._bridge.propVolverSugerencia=propVolverSugerencia;
window._bridge.loadPropuestas=loadPropuestas;

export { loadPropuestas };
