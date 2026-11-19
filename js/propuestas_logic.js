// Propuestas: lógica pura (sin base de datos ni pantalla) — se prueba con tests/unit

// ============ PROPUESTAS: LÓGICA (sin acceso a la base ni a la pantalla) ============
// Convierte citas de AgendaPro en propuestas de venta y sugiere servicio, precio y pago.

function propNorm(s){
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .toLowerCase().replace(/[^a-z0-9ñ]+/g,' ').replace(/\s+/g,' ').trim();
}
const PROP_GENERICOS=new Set(['cliente','piston','sin','nombre']);
function propTokens(nombre){
  return propNorm(nombre).split(' ').filter(t=>t.length>=3&&!PROP_GENERICOS.has(t));
}
function propEsGenerico(nombre){ return propTokens(nombre).length===0; }
function propClave(fecha,hora,barbero,cliente){
  return [fecha,hora||'',propNorm(barbero),propNorm(cliente)].join('|');
}
function propCod(v){ return String(v||'').trim().replace(/^0+/,'').toUpperCase(); }
function propDiaSemana(fecha){ return new Date(fecha+'T12:00:00').getDay(); }

// --- Lectura del reporte de reservas de AgendaPro (xlsx/csv ya convertido a filas) ---
function propParseFechaHora(v, horaV){
  let fecha=null, hora='';
  if(v instanceof Date && !isNaN(v)){
    fecha=`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    if(v.getHours()||v.getMinutes()) hora=`${String(v.getHours()).padStart(2,'0')}:${String(v.getMinutes()).padStart(2,'0')}`;
  } else if(typeof v==='number' && v>40000 && v<60000){
    const ms=Math.round((v-25569)*86400*1000); const d=new Date(ms);
    fecha=d.toISOString().slice(0,10);
    const mins=Math.round((v%1)*1440); if(mins) hora=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`;
  } else {
    const s=String(v||'').trim();
    let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
    if(m){ fecha=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; if(m[4]) hora=`${m[4].padStart(2,'0')}:${m[5]}`; }
    m=!fecha&&s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if(m){ fecha=`${m[1]}-${m[2]}-${m[3]}`; if(m[4]) hora=`${m[4]}:${m[5]}`; }
  }
  if(horaV!==undefined && horaV!==null && horaV!==''){
    if(horaV instanceof Date) hora=`${String(horaV.getHours()).padStart(2,'0')}:${String(horaV.getMinutes()).padStart(2,'0')}`;
    else if(typeof horaV==='number' && horaV<1){ const mins=Math.round(horaV*1440); hora=`${String(Math.floor(mins/60)).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}`; }
    else { const hm=String(horaV).match(/(\d{1,2}):(\d{2})/); if(hm) hora=`${hm[1].padStart(2,'0')}:${hm[2]}`; }
  }
  return {fecha,hora};
}

function propParseAgenda(aoa){
  // Buscar la fila de encabezados (la que tiene "cliente" y "servicio")
  let h=-1;
  for(let i=0;i<Math.min(aoa.length,25);i++){
    const r=(aoa[i]||[]).map(propNorm);
    if(r.some(c=>c.includes('cliente')||c==='nombre') && r.some(c=>c.includes('servicio'))){ h=i; break; }
  }
  if(h<0) throw new Error('No encontré los encabezados del reporte (Cliente / Servicio). ¿Es el reporte de reservas de AgendaPro?');
  const hdr=aoa[h].map(propNorm);
  const col=(...tests)=>hdr.findIndex(c=>tests.some(t=>t instanceof RegExp?t.test(c):c===t));
  const ix={
    fecha: col(/fecha de realizacion/,/fecha de la reserva/,/fecha reserva/,/fecha cita/,'fecha',/^fecha y hora/,/^inicio/),
    hora: col('hora',/hora de inicio/,/hora inicio/),
    cliente: col('cliente',/nombre del cliente/,/nombre cliente/,'nombre',/^nombres?$/),
    apellido: col('apellido',/apellido del cliente/,/^apellidos?$/),
    servicio: col('servicio',/nombre del servicio/,/^servicio /),
    prestador: col('prestador',/profesional/,/^prestador /,/staff/),
    estado: hdr.findIndex(c=>/^estado( de la reserva| reserva)?$/.test(c)),
    pago: (()=>{const i=hdr.indexOf('estado de pago'); return i>=0?i:hdr.findIndex(c=>/pagad/.test(c));})(),
  };
  if(ix.fecha<0) ix.fecha=hdr.findIndex(c=>c.includes('fecha'));
  // "N° de Cliente" es un número, no el nombre
  if(ix.cliente<0) ix.cliente=hdr.findIndex(c=>c.includes('cliente')&&!/^(n|no|nro|numero|id) de cliente/.test(c));
  if(ix.servicio<0) ix.servicio=hdr.findIndex(c=>c.includes('servicio'));
  const faltan=['fecha','cliente','servicio','prestador'].filter(k=>ix[k]<0);
  if(faltan.length) throw new Error('Al reporte le faltan columnas: '+faltan.join(', '));

  const citas=[]; const omitidas={};
  for(let i=h+1;i<aoa.length;i++){
    const r=aoa[i]||[];
    if(!r.some(c=>String(c??'').trim())) continue;
    const {fecha,hora}=propParseFechaHora(r[ix.fecha], ix.hora>=0?r[ix.hora]:undefined);
    if(!fecha) continue;
    let cliente=String(r[ix.cliente]??'').trim().replace(/\s+/g,' ');
    if(ix.apellido>=0 && String(r[ix.apellido]??'').trim()) cliente=(cliente+' '+String(r[ix.apellido]).trim()).replace(/\s+/g,' ').trim();
    const estado=ix.estado>=0?String(r[ix.estado]??'').trim():'Asiste';
    const est=propNorm(estado);
    if(est && est!=='asiste'){ omitidas[estado]=(omitidas[estado]||0)+1; continue; }
    const pagoTxt=ix.pago>=0?propNorm(r[ix.pago]):'';
    citas.push({
      fecha, hora, cliente,
      servicio:String(r[ix.servicio]??'').trim(),
      prestador:String(r[ix.prestador]??'').trim(),
      estado: estado||'Asiste',
      pagada: !!pagoTxt && (pagoTxt.startsWith('pagad')||pagoTxt.includes('pago asociado')),
    });
  }
  return {citas, omitidas, columnas:ix};
}

function propMapBarbero(prestador, barberos){
  const n=propNorm(prestador);
  return barberos.find(b=>propNorm(b.nombre)===n)
      || barberos.find(b=>{const t=propNorm(b.nombre).split(' '); return t.length&&t.every(x=>n.includes(x));})
      || null;
}

// --- ¿La cita ya tiene una venta en el sistema? (mismo día y barbero, nombre parecido, luego por cantidad) ---
// citas: [{key, fecha, barbero_nombre, cliente}]  ventas: [{id, fecha, barbero_nombre, cliente}]
// capacidadUsada: {fecha|barbero: n} ventas ya cubiertas por propuestas aceptadas/registradas previas
function propDetectarRegistradas(citas, ventas, capacidadUsada={}){
  const registradas=new Set();
  const grupos={};
  citas.forEach(c=>{const k=c.fecha+'|'+propNorm(c.barbero_nombre); (grupos[k]=grupos[k]||{c:[],v:[]}).c.push(c);});
  ventas.forEach(v=>{const k=v.fecha+'|'+propNorm(v.barbero_nombre); if(grupos[k]) grupos[k].v.push(v);});
  for(const [k,g] of Object.entries(grupos)){
    const pares=[];
    g.c.forEach((c,ci)=>g.v.forEach((v,vi)=>{
      const a=propTokens(c.cliente), b=propTokens(v.cliente);
      let s=a.filter(t=>b.includes(t)).length;
      if(!s && propEsGenerico(c.cliente) && propEsGenerico(v.cliente)) s=0.5;
      if(s>0) pares.push({ci,vi,s});
    }));
    pares.sort((x,y)=>y.s-x.s);
    const cUsada=new Set(), vUsada=new Set();
    for(const p of pares){ if(cUsada.has(p.ci)||vUsada.has(p.vi)) continue; cUsada.add(p.ci); vUsada.add(p.vi); registradas.add(g.c[p.ci].key); }
    // Por cantidad: ventas del día/barbero que no calzaron por nombre cubren citas sin calzar
    let libres=g.v.length - vUsada.size - (capacidadUsada[k]||0);
    for(let ci=0; ci<g.c.length && libres>0; ci++){
      if(cUsada.has(ci)) continue;
      registradas.add(g.c[ci].key); cUsada.add(ci); libres--;
    }
  }
  return registradas;
}

// --- Servicio y precios posibles para el nombre que viene de AgendaPro ---
function propServicio(nombreAgenda, fecha, servicios){
  const n=propNorm(nombreAgenda);
  let cands=servicios.filter(s=>propNorm(s.nombre)===n);
  if(!cands.length) cands=servicios.filter(s=>{const sn=propNorm(s.nombre); return sn&&(sn.includes(n)||n.includes(sn));});
  if(!cands.length) return {normal:null, promo:null, precios:[]};
  const normal=cands.find(s=>s.tipo!=='promo')||cands[0];
  const dow=propDiaSemana(fecha);
  const promoSvc=cands.find(s=>(s.tipo==='promo'||s.tipo==='menor')&&s.precio_promo);
  const precios=[normal.precio];
  let promo=null;
  if(promoSvc && (dow===2||dow===3)){ promo=promoSvc; if(!precios.includes(promoSvc.precio_promo)) precios.push(promoSvc.precio_promo); }
  else if(promoSvc && promoSvc.precio_promo && !precios.includes(promoSvc.precio_promo)){ promo=promoSvc; precios.push(promoSvc.precio_promo); }
  return {normal, promo, precios: precios.filter(p=>p>0)};
}

// Combinación de precios de un grupo de propuestas que suma exactamente "objetivo"
function propCombo(grupo, objetivo, preciosDe){
  const listas=grupo.map(preciosDe);
  const sol=[];
  const rec=(i,acc)=>{
    if(i===listas.length) return acc===objetivo;
    for(const p of listas[i]){ sol[i]=p; if(acc+p<=objetivo && rec(i+1,acc+p)) return true; }
    return false;
  };
  return listas.every(l=>l.length) && rec(0,0) ? sol.slice() : null;
}
function propRepartir(total, montos){
  const s=montos.reduce((a,b)=>a+b,0)||1;
  const out=montos.map(m=>Math.floor(total*m/s));
  out[0]+=total-out.reduce((a,b)=>a+b,0);
  return out;
}
function propMin(h){ const m=String(h||'').match(/(\d{1,2}):(\d{2})/); return m?(+m[1])*60+(+m[2]):0; }
// Qué tan lógico es que un pago (hora GetNet) corresponda a una cita: lo normal es pagar ~40 min después de la hora de inicio.
// Devuelve null si falta alguna hora.
function propCostoHora(citaHora, pagoHora){
  if(!citaHora||!pagoHora) return null;
  const d=propMin(pagoHora)-propMin(citaHora);
  if(d<-20) return 1000-d;            // pagó bastante antes de la cita: muy raro
  return Math.abs(d-40);
}
function propCostoGrupo(grupo, g){
  const cs=grupo.map(p=>propCostoHora(p.hora,g.hora)).filter(c=>c!==null);
  return cs.length?Math.min(...cs):null;
}

// --- Sugerencias de pago para un día ---
// props: propuestas pendientes del día (con id, hora, cliente, servicio_agenda, barbero_nombre, pagada_agenda, origen, getnet_cod)
// gnDia: transacciones GetNet del día; ventasDia: ventas ya registradas ese día; servicios: catálogo
// Devuelve {sug:{id:{forma,cod,precio,propina,motivo,conf}}, libres:[txns GetNet sin asignar], usadosVentas:Set}
// Pagos GetNet del día con lo que queda por asignar (descontando ventas ya registradas con ese código)
function propDisponibles(gnDia, ventasDia){
  const usado={};
  ventasDia.filter(v=>v.forma_pago==='TK'&&v.cod_autorizacion).forEach(v=>{
    const c=propCod(v.cod_autorizacion); const u=(usado[c]=usado[c]||{monto:0,prop:0,clientes:[]});
    u.monto+=(v.total||0)-(v.propina||0); u.prop+=v.propina||0; if(v.cliente) u.clientes.push(propNorm(v.cliente)); });
  const byCod={};
  gnDia.forEach(g=>{const c=propCod(g.cod_aut);
    (byCod[c]=byCod[c]||{cod:g.cod_aut,venta:0,prop:0,trans:0,total:0,parcial:false,hora:String(g.hora_venta||'').slice(0,5),tarjeta:`${g.marca||''} ${g.tipo||''}`.trim()});
    byCod[c].venta+=g.valor_venta||0; byCod[c].prop+=g.propina||0; byCod[c].total+=g.valor_transaccion||0;});
  const out=[];
  for(const [c,g] of Object.entries(byCod)){
    const u=usado[c];
    if(u){ g.venta-=u.monto; g.prop=Math.max(0,g.prop-u.prop); g.parcial=true; g.clientes=u.clientes; }
    g.trans=g.venta+g.prop;
    if(g.venta>0) out.push(g);
  }
  return out.sort((a,b)=>a.venta-b.venta||String(a.cod).localeCompare(b.cod));
}

function propSugerirDia(props, gnDia, ventasDia, servicios){
  const disponibles=propDisponibles(gnDia, ventasDia);
  let libres=disponibles.map(g=>({...g}));
  const sug={};
  const preciosDe=p=>{const s=propServicio(p.servicio_agenda,p.fecha,servicios); return s.precios.length?s.precios:[0];};
  const tomar=g=>{libres=libres.filter(x=>x!==g);};
  const asignar=(grupo,g,motivo,conf)=>{
    const precios=propCombo(grupo,g.venta,preciosDe)||grupo.map(p=>preciosDe(p)[0]);
    const props=propRepartir(g.prop,precios);
    grupo.forEach((p,i)=>{ sug[p.id]={forma:'TK',cod:g.cod,precio:precios[i],propina:props[i],motivo,conf,compartido:grupo.length>1}; });
    tomar(g);
  };

  // 0. Pagos GetNet sin cita que ya son propuestas propias
  props.filter(p=>p.origen==='getnet').forEach(p=>{
    const g=libres.find(x=>propCod(x.cod)===propCod(p.getnet_cod));
    if(g){ sug[p.id]={forma:'TK',cod:g.cod,precio:g.venta,propina:g.prop,motivo:'Pago GetNet sin cita en la agenda',conf:'media'}; tomar(g); }
  });
  let resto=props.filter(p=>p.origen!=='getnet').sort((a,b)=>propMin(a.hora)-propMin(b.hora));

  // 1. $ verde en AgendaPro
  resto.forEach(p=>{ if(p.pagada_agenda) sug[p.id]={forma:'EF',cod:'',precio:preciosDe(p)[0],propina:0,motivo:'Marcada como pagada ($ verde) en AgendaPro — normalmente efectivo, a veces transferencia',conf:'media'}; });
  resto=resto.filter(p=>!sug[p.id]);

  // 1b. Resto de un pago compartido cuya otra parte ya se registró para el mismo cliente
  for(const g of [...libres].filter(x=>x.parcial&&x.clientes&&x.clientes.length)){
    const grupo=resto.filter(p=>!sug[p.id]&&!propEsGenerico(p.cliente)&&g.clientes.includes(propNorm(p.cliente)));
    if(!grupo.length) continue;
    if(propCombo(grupo,g.venta,preciosDe)) asignar(grupo,g,`Resto del pago GetNet ${g.cod} de ${grupo[0].cliente}; la otra parte ya está registrada`,'alta');
  }
  resto=resto.filter(p=>!sug[p.id]);

  // 2. Mismo cliente con varias citas ese día pagadas juntas
  const porCliente={};
  resto.forEach(p=>{ if(propEsGenerico(p.cliente)) return; const k=propNorm(p.cliente); (porCliente[k]=porCliente[k]||[]).push(p); });
  Object.values(porCliente).filter(g=>g.length>1).forEach(grupo=>{
    const cands=libres.filter(x=>propCombo(grupo,x.venta,preciosDe));
    cands.sort((a,b)=>(propCostoGrupo(grupo,a)??0)-(propCostoGrupo(grupo,b)??0));
    const g=cands[0];
    if(g) asignar(grupo,g,`Un pago GetNet de ${g.venta}${g.hora?' a las '+g.hora:''} = ${grupo.length} servicios de ${grupo[0].cliente}`,'alta');
  });
  resto=resto.filter(p=>!sug[p.id]);

  // 3. Un pago, dos servicios de barberos distintos (el monto no calza con ningún servicio solo)
  for(const g of [...libres]){
    if(resto.some(p=>preciosDe(p).includes(g.venta))) continue;
    let mejor=null;
    for(let i=0;i<resto.length;i++) for(let j=i+1;j<resto.length;j++){
      const a=resto[i], b=resto[j];
      if(sug[a.id]||sug[b.id]) continue;
      if(!propCombo([a,b],g.venta,preciosDe)) continue;
      const ch=propCostoGrupo([a,b],g);
      const dist=ch!==null?ch:Math.abs(propMin(a.hora)-propMin(b.hora));
      if(!mejor||dist<mejor.dist) mejor={a,b,dist};
    }
    if(mejor){
      const misma=propNorm(mejor.a.barbero_nombre)===propNorm(mejor.b.barbero_nombre);
      asignar([mejor.a,mejor.b],g,`Un pago GetNet de ${g.venta} calza con estos 2 servicios${misma?'':' (barberos distintos)'} — confirmar`,'baja');
    }
  }
  resto=resto.filter(p=>!sug[p.id]);

  // 4. Un servicio, un pago del mismo monto. Primero el precio esperado del día, después el alternativo (promo).
  // La confianza depende de cuántas citas compiten por pagos de ese monto y si esos pagos son idénticos.
  const libres0=[...libres], resto0=[...resto];
  const confianza=(p,g)=>{
    const precios=preciosDe(p);
    const pagos=libres0.filter(x=>precios.includes(x.venta));
    const citas=resto0.filter(q=>preciosDe(q).some(v=>pagos.some(x=>x.venta===v)));
    if(pagos.length===1&&citas.length===1) return ['alta','Único pago GetNet del día con este monto'];
    const iguales=pagos.every(x=>x.venta===g.venta&&x.prop===g.prop);
    return [iguales?'media':'baja', `${citas.length} cita${citas.length===1?'':'s'} y ${pagos.length} pago${pagos.length===1?'':'s'} GetNet de montos parecidos ese día — ${iguales?'son iguales, da lo mismo cuál':'confirma el código (cambian monto o propina)'}`];
  };
  const conHora=resto.length && resto.every(p=>p.hora) && libres.length && libres.every(g=>g.hora);
  if(conHora){
    const dow=resto[0]?propDiaSemana(resto[0].fecha):0, promoDia=dow===2||dow===3;
    const pares=[];
    for(const p of resto){ const precios=preciosDe(p);
      for(const g of libres){ if(!precios.includes(g.venta)) continue;
        const c=propCostoHora(p.hora,g.hora)+(g.venta===precios[0]||promoDia?0:15);
        pares.push({p,g,c}); } }
    pares.sort((a,b)=>a.c-b.c);
    const tomadas=new Set(), usados=new Set();
    for(const x of pares){
      if(tomadas.has(x.p.id)||usados.has(x.g)) continue;
      // ¿hay otro pago libre casi igual de cercano para esta cita? -> menos seguro
      const alt=pares.filter(y=>y.p===x.p&&y.g!==x.g&&!usados.has(y.g)).map(y=>y.c);
      const segundo=alt.length?Math.min(...alt):Infinity;
      const conf=x.c<=35&&segundo-x.c>=15?'alta':(x.c<=90?'media':'baja');
      const motivo=`Pago GetNet a las ${x.g.hora} (cita ${x.p.hora})`+(conf==='alta'?'':conf==='media'?' — hay otro pago parecido cerca, revisa':' — hora poco calzada, revisa');
      tomadas.add(x.p.id); usados.add(x.g);
      asignar([x.p],x.g,motivo,conf);
    }
    resto=resto.filter(p=>!sug[p.id]);
  }
  for(const pasada of [0,1]){
    for(const p of resto){
      if(sug[p.id]) continue;
      const precios=preciosDe(p);
      const buscados=pasada===0?[precios[0]]:precios;
      const cands=libres.filter(g=>buscados.includes(g.venta));
      if(!cands.length) continue;
      const g=cands[0];
      const [conf,motivo]=confianza(p,g);
      asignar([p],g,motivo,conf);
    }
  }
  resto=resto.filter(p=>!sug[p.id]);

  // 5. Sin pista de pago
  resto.forEach(p=>{ sug[p.id]={forma:'',cod:'',precio:preciosDe(p)[0],propina:0,motivo:'No hay pago GetNet que calce ni $ verde — ¿efectivo o transferencia?',conf:'ninguna'}; });

  return {sug, libres, disponibles};
}

export { PROP_GENERICOS, propClave, propCod, propCombo, propCostoGrupo, propCostoHora, propDetectarRegistradas, propDiaSemana, propDisponibles, propEsGenerico, propMapBarbero, propMin, propNorm, propParseAgenda, propParseFechaHora, propRepartir, propServicio, propSugerirDia, propTokens };
