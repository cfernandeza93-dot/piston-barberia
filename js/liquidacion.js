// Pestaña Liquidación
import { MESES, barberos, fmtCLP, hideOverlay, loadCatalogos, sb, servicios, showOverlay, toast } from './core.js';

// ============ LIQUIDACIÓN DE PAGOS ============
const PW_LIQ = 'Pi$t0n2590';
let liqUnlocked = false;
let liqFiltros = { anio: new Date().getFullYear(), mes: new Date().getMonth()+1 };
let liqVentas = [], liqGastos = [], liqAdelantosSantander = [];

async function loadLiquidacion(){
  if(!liqUnlocked){
    renderLiquidacionLock();
    return;
  }
  showOverlay();
  await loadCatalogos();
  const [vRes, gRes, aRes] = await Promise.all([
    sb.rpc('get_ventas_anio_json', {p_anio: liqFiltros.anio}),
    sb.from('gastos').select('*').eq('categoria','Adelantos').range(0,4999),
    sb.from('adelantos_santander').select('*').eq('anio', liqFiltros.anio).order('mes').order('barbero_nombre'),
  ]);
  liqVentas = vRes.data||[];
  liqGastos = gRes.data||[];
  liqAdelantosSantander = aRes.data||[];
  hideOverlay();
  renderLiquidacion();
}

function renderLiquidacionLock(){
  document.getElementById('mainContent').innerHTML=`
  <div style="display:flex;align-items:center;justify-content:center;height:60vh">
    <div class="card" style="max-width:380px;width:100%;text-align:center;padding:40px 32px">
      <div style="font-size:36px;margin-bottom:12px">🔐</div>
      <div style="font-size:18px;font-weight:700;margin-bottom:6px">Liquidación de Pagos</div>
      <div style="font-size:13px;color:#64748B;margin-bottom:24px">Módulo restringido — ingresa la contraseña para continuar</div>
      <input type="password" id="liqPwInput" placeholder="Contraseña"
        onkeydown="if(event.key==='Enter')window._bridge.liqCheckPw()"
        style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:8px;font-size:14px;margin-bottom:12px;box-sizing:border-box">
      <button onclick="window._bridge.liqCheckPw()"
        style="width:100%;padding:10px;background:var(--blue);color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">
        Ingresar
      </button>
      <div id="liqPwError" style="color:var(--red);font-size:12px;margin-top:10px;display:none">Contraseña incorrecta</div>
    </div>
  </div>`;
  window._bridge.liqCheckPw = ()=>{
    const v = document.getElementById('liqPwInput')?.value;
    if(v === PW_LIQ){ liqUnlocked=true; loadLiquidacion(); }
    else { document.getElementById('liqPwError').style.display='block'; }
  };
}

function renderLiquidacion(){
  const vMes = liqVentas.filter(v=>v.n_mes==liqFiltros.mes);
  const gMes = liqGastos.filter(g=>g.fecha&&Number(g.fecha.split('-')[0])==liqFiltros.anio&&Number(g.fecha.split('-')[1])==liqFiltros.mes);
  const aMes = liqAdelantosSantander.filter(a=>a.mes==liqFiltros.mes);

  // Barberos activos en el mes (sin PISTON)
  const barbNombres = [...new Set(vMes.map(v=>v.barbero_nombre).filter(n=>n&&!n.toUpperCase().includes('PISTON')))].sort();

  const anios = [...new Set(liqVentas.map(v=>v.anio).filter(Boolean))].sort((a,b)=>b-a);
  const anioOpts = anios.map(a=>`<option value="${a}" ${liqFiltros.anio==a?'selected':''}>${a}</option>`).join('');
  const mesOpts  = MESES.map((m,i)=>`<option value="${i+1}" ${liqFiltros.mes==i+1?'selected':''}>${m}</option>`).join('');

  // Calcular por barbero
  const rows = barbNombres.map(nombre=>{
    const svc=servicios.find(s=>s.nombre);
    const pct = (barberos.find(b=>b.nombre===nombre)?.comision||50)/100;

    const vBarb = vMes.filter(v=>v.barbero_nombre===nombre);

    // SANTANDER (TK + TRF)
    const vSant = vBarb.filter(v=>v.tipo==='servicio'&&['TK','TRF'].includes(v.forma_pago));
    const montoSant  = vSant.reduce((s,v)=>s+(v.monto||0),0);
    const comSant    = Math.round(vSant.reduce((s,v)=>{
      const svcPct=(servicios.find(sx=>sx.nombre===v.servicio_producto)?.comision||50)/100;
      return s+(v.monto||0)*svcPct;
    },0));
    const propSant   = vSant.reduce((s,v)=>s+(v.propina||0),0);
    const adelSant   = aMes.filter(a=>a.barbero_nombre===nombre).reduce((s,a)=>s+a.monto,0);
    const totalSant  = comSant + propSant - adelSant;

    // FALABELLA (EF)
    const vFall = vBarb.filter(v=>v.tipo==='servicio'&&v.forma_pago==='EF');
    const montoFall  = vFall.reduce((s,v)=>s+(v.monto||0),0);
    const comFall    = Math.round(vFall.reduce((s,v)=>{
      const svcPct=(servicios.find(sx=>sx.nombre===v.servicio_producto)?.comision||50)/100;
      return s+(v.monto||0)*svcPct;
    },0));
    const propFall   = vFall.reduce((s,v)=>s+(v.propina||0),0);
    // Comisión productos (10%) — todos los pagos
    const comProd    = Math.round(vBarb.filter(v=>v.tipo==='PRODUCTO').reduce((s,v)=>s+(v.monto||0)*0.1,0));
    const totalFall  = comFall + propFall + comProd;
    // Adelantos EF desde gastos
    const adelFall   = gMes.filter(g=>g.barbero_nombre===nombre).reduce((s,g)=>s+g.monto,0);
    const transferFall = totalFall - adelFall;

    const totalBarbero = totalSant + totalFall;

    return { nombre, pct,
      montoSant, comSant, propSant, adelSant, totalSant,
      montoFall, comFall, propFall, comProd, totalFall, adelFall, transferFall,
      totalBarbero };
  });

  // Totales columna
  const T = rows.reduce((acc,r)=>({
    montoSant:acc.montoSant+r.montoSant, comSant:acc.comSant+r.comSant,
    propSant:acc.propSant+r.propSant, adelSant:acc.adelSant+r.adelSant, totalSant:acc.totalSant+r.totalSant,
    montoFall:acc.montoFall+r.montoFall, comFall:acc.comFall+r.comFall,
    propFall:acc.propFall+r.propFall, comProd:acc.comProd+r.comProd, totalFall:acc.totalFall+r.totalFall,
    adelFall:acc.adelFall+r.adelFall, transferFall:acc.transferFall+r.transferFall,
    totalBarbero:acc.totalBarbero+r.totalBarbero
  }), {montoSant:0,comSant:0,propSant:0,adelSant:0,totalSant:0,montoFall:0,comFall:0,propFall:0,comProd:0,totalFall:0,adelFall:0,transferFall:0,totalBarbero:0});

  const thStyle = 'padding:7px 10px;font-size:11px;font-weight:700;white-space:nowrap;text-align:right';
  const tdStyle = 'padding:6px 10px;font-size:12px;text-align:right;white-space:nowrap';
  const headerBg1='background:#DC2626;color:#fff';
  const headerBg2='background:#16A34A;color:#fff';
  const headerBgT='background:#1E3A5F;color:#fff';

  document.getElementById('mainContent').innerHTML=`
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap">
    <span class="sec-title" style="margin:0">💰 Liquidación de Pagos</span>
    <select onchange="window._bridge.liqSetAnio(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">${anioOpts}</select>
    <select onchange="window._bridge.liqSetMes(this.value)" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:12px">${mesOpts}</select>
    <span style="font-size:12px;color:#64748B">${MESES[liqFiltros.mes-1]} ${liqFiltros.anio}</span>
    <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="window._bridge.liqAddAdelanto()">+ Adelanto Santander</button>
    <button class="btn btn-ghost btn-sm" onclick="exportLiqCSV()">⬇ Exportar CSV</button>
    <button class="btn btn-danger btn-sm" onclick="liqUnlocked=false;go('dashboard')">🔒 Cerrar</button>
  </div>

  <!-- Adelantos Santander del mes -->
  ${aMes.length>0?`
  <div class="card" style="margin-bottom:16px">
    <div class="card-title">Adelantos Santander — ${MESES[liqFiltros.mes-1]} ${liqFiltros.anio}</div>
    <table>
      <thead><tr><th>Barbero</th><th>Monto</th><th>Descripción</th><th>Fecha</th><th></th></tr></thead>
      <tbody>
        ${aMes.map(a=>`<tr>
          <td>${a.barbero_nombre}</td>
          <td style="text-align:right;font-weight:600;color:var(--red)">${fmtCLP(a.monto)}</td>
          <td style="color:#64748B">${a.descripcion||'—'}</td>
          <td>${a.fecha||'—'}</td>
          <td><button class="btn btn-danger btn-sm" onclick="window._bridge.liqDeleteAdelanto('${a.id}')">🗑</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`:''}

  <!-- Tabla principal -->
  <div style="overflow-x:auto">
  <table style="border-collapse:collapse;width:100%;font-size:12px">
    <thead>
      <tr>
        <th rowspan="2" style="${thStyle};text-align:left;background:#F1F5F9;min-width:110px">Mes</th>
        <th rowspan="2" style="${thStyle};text-align:left;background:#F1F5F9;min-width:130px">Barbero</th>
        <!-- Santander -->
        <th colspan="5" style="${thStyle};text-align:center;${headerBg1};border:1px solid #B91C1C">🏦 Banco Santander</th>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C">Transferencia<br>Adelanto</th>
        <!-- Falabella -->
        <th colspan="4" style="${thStyle};text-align:center;${headerBg2};border:1px solid #15803D">🏦 Banco Falabella</th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D">Adelanto<br>EF</th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D">Total a Transf.<br>Falabella</th>
        <!-- Total -->
        <th colspan="2" style="${thStyle};text-align:center;${headerBgT}">TOTAL</th>
        <th rowspan="2" style="${thStyle};text-align:center;background:#1E3A5F;color:#fff">PDF</th>
      </tr>
      <tr>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C">Con Boleta</th>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C">Comisión<br>Barbero</th>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C">Propina</th>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C">Subtotal</th>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C">Total a Transf.<br>Santander</th>
        <th style="${thStyle};${headerBg1};border:1px solid #B91C1C"></th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D">Sin Boleta</th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D">Comisión<br>Barbero</th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D">Propina</th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D">Com.<br>Productos</th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D"></th>
        <th style="${thStyle};${headerBg2};border:1px solid #15803D"></th>
        <th style="${thStyle};${headerBgT}">Barbero</th>
        <th style="${thStyle};${headerBgT}">Com. Prod.</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r=>`
      <tr style="border-bottom:1px solid var(--border)">
        <td style="${tdStyle};text-align:left;color:#64748B">${MESES[liqFiltros.mes-1]}</td>
        <td style="${tdStyle};text-align:left;font-weight:700">${r.nombre.split(' ')[0]} ${r.nombre.split(' ')[1]||''}</td>
        <!-- Santander -->
        <td style="${tdStyle};background:#FEF2F2">${fmtCLP(r.montoSant)}</td>
        <td style="${tdStyle};background:#FEF2F2">${fmtCLP(r.comSant)}</td>
        <td style="${tdStyle};background:#FEF2F2">${r.propSant?fmtCLP(r.propSant):'—'}</td>
        <td style="${tdStyle};background:#FEF2F2;font-weight:700">${fmtCLP(r.comSant+r.propSant)}</td>
        <td style="${tdStyle};background:#FEE2E2;font-weight:700;color:#DC2626">${fmtCLP(r.totalSant)}</td>
        <td style="${tdStyle};background:#FEE2E2;color:#DC2626">${r.adelSant?fmtCLP(r.adelSant):'—'}</td>
        <!-- Falabella -->
        <td style="${tdStyle};background:#F0FDF4">${fmtCLP(r.montoFall)}</td>
        <td style="${tdStyle};background:#F0FDF4">${fmtCLP(r.comFall)}</td>
        <td style="${tdStyle};background:#F0FDF4">${r.propFall?fmtCLP(r.propFall):'—'}</td>
        <td style="${tdStyle};background:#F0FDF4">${r.comProd?fmtCLP(r.comProd):'—'}</td>
        <td style="${tdStyle};background:#DCFCE7;color:var(--red)">${r.adelFall?fmtCLP(r.adelFall):'—'}</td>
        <td style="${tdStyle};background:#DCFCE7;font-weight:700;color:#15803D">${fmtCLP(r.transferFall)}</td>
        <!-- Total -->
        <td style="${tdStyle};background:#EFF6FF;font-weight:700;font-size:13px">${fmtCLP(r.totalSant+r.transferFall)}</td>
        <td style="${tdStyle};background:#EFF6FF;color:#64748B">${r.comProd?fmtCLP(r.comProd):'—'}</td>
        <td style="padding:6px 8px;text-align:center">
          <button onclick="window._bridge.generarPDFBarbero('${r.nombre.replace(/'/g,"\\'")}',${rows.indexOf(r)})"
            style="padding:5px 10px;background:#1E3A5F;color:#fff;border:none;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">
            📄 PDF
          </button>
        </td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr style="background:#F1F5F9;font-weight:700;border-top:2px solid #CBD5E1">
        <td colspan="2" style="${tdStyle};text-align:left">TOTAL ${MESES[liqFiltros.mes-1].toUpperCase()}</td>
        <td style="${tdStyle};background:#FEF2F2">${fmtCLP(T.montoSant)}</td>
        <td style="${tdStyle};background:#FEF2F2">${fmtCLP(T.comSant)}</td>
        <td style="${tdStyle};background:#FEF2F2">${fmtCLP(T.propSant)}</td>
        <td style="${tdStyle};background:#FEF2F2">${fmtCLP(T.comSant+T.propSant)}</td>
        <td style="${tdStyle};background:#FEE2E2;color:#DC2626">${fmtCLP(T.totalSant)}</td>
        <td style="${tdStyle};background:#FEE2E2;color:#DC2626">${fmtCLP(T.adelSant)}</td>
        <td style="${tdStyle};background:#F0FDF4">${fmtCLP(T.montoFall)}</td>
        <td style="${tdStyle};background:#F0FDF4">${fmtCLP(T.comFall)}</td>
        <td style="${tdStyle};background:#F0FDF4">${fmtCLP(T.propFall)}</td>
        <td style="${tdStyle};background:#F0FDF4">${fmtCLP(T.comProd)}</td>
        <td style="${tdStyle};background:#DCFCE7;color:var(--red)">${fmtCLP(T.adelFall)}</td>
        <td style="${tdStyle};background:#DCFCE7;color:#15803D">${fmtCLP(T.transferFall)}</td>
        <td style="${tdStyle};background:#EFF6FF;font-size:13px">${fmtCLP(T.totalSant+T.transferFall)}</td>
        <td style="${tdStyle};background:#EFF6FF;color:#64748B">${fmtCLP(T.comProd)}</td>
        <td></td>
      </tr>
    </tfoot>
  </table>
  </div>

  <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#64748B">
    <span>🔴 <strong>Santander:</strong> Servicios TK + TRF · comisión + propinas − adelantos TRF</span>
    <span>🟢 <strong>Falabella:</strong> Servicios EF · comisión + propinas + 10% productos − adelantos EF</span>
  </div>`;

  window._bridge.generarPDFBarbero = (nombre, idx) => generarPDFBarbero(nombre, rows[idx]);
  window._bridge.liqSetAnio = v=>{ liqFiltros.anio=Number(v); loadLiquidacion(); };
  window._bridge.liqSetMes  = v=>{ liqFiltros.mes=Number(v);  loadLiquidacion(); };
  window._bridge.liqDeleteAdelanto = async id=>{
    if(!confirm('¿Eliminar este adelanto?')) return;
    showOverlay();
    await sb.from('adelantos_santander').delete().eq('id',id);
    hideOverlay();
    toast('✓ Adelanto eliminado');
    loadLiquidacion();
  };
  window._bridge.liqAddAdelanto = ()=>{
    const bOpts = barberos.filter(b=>!b.nombre.toUpperCase().includes('PISTON'))
      .map(b=>`<option value="${b.nombre}">${b.nombre}</option>`).join('');
    // Mostrar modal inline
    const existing = document.querySelector('#liqAddModal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id='liqAddModal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9998;display:flex;align-items:center;justify-content:center';
    modal.innerHTML=`
      <div class="card" style="width:380px;padding:24px">
        <div style="font-weight:700;font-size:15px;margin-bottom:16px">+ Adelanto Santander</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <select id="liqAbarbero" style="padding:8px;border:1px solid var(--border);border-radius:6px">
            <option value="">Selecciona barbero</option>${bOpts}
          </select>
          <input type="number" id="liqAmonto" placeholder="Monto" style="padding:8px;border:1px solid var(--border);border-radius:6px">
          <input type="date" id="liqAfecha" style="padding:8px;border:1px solid var(--border);border-radius:6px">
          <input type="text" id="liqAdesc" placeholder="Descripción (opcional)" style="padding:8px;border:1px solid var(--border);border-radius:6px">
          <div style="display:flex;gap:8px;margin-top:4px">
            <button onclick="window._bridge.liqSaveAdelanto()" class="btn btn-primary" style="flex:1">Guardar</button>
            <button onclick="document.getElementById('liqAddModal').remove()" class="btn btn-ghost" style="flex:1">Cancelar</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  };
  window._bridge.liqSaveAdelanto = async ()=>{
    const barbero_nombre = document.getElementById('liqAbarbero')?.value;
    const monto = Number(document.getElementById('liqAmonto')?.value||0);
    const fecha = document.getElementById('liqAfecha')?.value||null;
    const descripcion = document.getElementById('liqAdesc')?.value||null;
    if(!barbero_nombre||!monto){ toast('Completa barbero y monto','error'); return; }
    showOverlay();
    const {error} = await sb.from('adelantos_santander').insert({
      barbero_nombre, monto, fecha, descripcion,
      mes:liqFiltros.mes, anio:liqFiltros.anio
    });
    hideOverlay();
    if(error){ toast('Error: '+error.message,'error'); return; }
    document.getElementById('liqAddModal')?.remove();
    toast('✓ Adelanto guardado');
    loadLiquidacion();
  };
}


const LOGO_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAlgAAAKKCAYAAADhkCX4AACye0lEQVR42u2dd7grVfW/3yTnFnrvHelFehGki2JBigUsWAEbghVFQVEU69feABsKgtgQCxYUC00BQVE60rv0css5SX5/rL1+szM3OeckmZlMcj7v88yTe+ckU/bs2fuz1157LRBCiPJTCZ/HACun9gkhROmoqgiEEEMksDYHZqs4hBBCCCH6F1cVYC5wG7CnBohCiLKjBkoIMQztVBPYFlgH2E/tlxBCAksIIfrDpwd3CUJrJ6AGNFQ0QgghhBC9DwRnAZcHgfUQsHRKfAkhhBBCiGlSC5+7BXG1ALNcvSOIqzEVkRBCCCFEd7iF6nuRwGoCt2CWrQqyYgkhhBBCdCWulgDWAB4LwqoBTITteeF7NRWVEEIIIcT0qGG+VycGcTWR+rxYAksIIYQQYvr49N/ywL2Y5aoehFUssvYN35cvlhBCCCHEFMwKn2enBJVv9bDdBKyLWbEUdqY48SuEEELkihys8xNXxwQxNZ4SV2kr1u/U8aveCyGEGL3R/EmYM7Y6nf7xqb59gaeCiGp0EFix+DopJc5EPnW9AmwHfCDsk/+bEEKIXDocgGtI8uOpw+m/PDcBHiCZCmxOsbkla/+USBP5iN8vA69VfRdCCFGEwDov/F8dTn+d96bAtbT3u+q0eeiGJ4EXhuPMQhbFLKmE+r0s8DhwkASWEEKIvAXWn0NH/4aUWBDTK8PZ4d8HkkwHNqYprpptvv/GSBSIbAXw+0IZf0Z1XQghRN4C66+hg784dOoa1U9NOs3N64B5JNaoZg9bPfy2DnwemBOOrRWG/VELz2s94H/hGZ0fylTlKoQQIjeBdVHUyb9HI/spyywWoBsC36C9JaqXrREd40LgJSmhIEHQvRB25/bvR+X8WwksIYQQeYqrVYEnSFa0LQT2iDp0kVj14vJYGjia1hQ4/YqrtE+W//8U4BmpZzcmcTAtxsKzemkoy4Xh8+ao/DQVK4QQIjNcLGzXplO/GZg7w0f47UQVwPqhs/4vi4ZayHqLQzw8AXw1JbRiESGR0LmOvxlbQDBOsqrzPmBJCSwhhBB5jOwrwLtCJz5O68q3b4fvaTUbrIyFUDgdi23VTgDlucXWrCcw/6E3YxHgRef6TSij+2idvnWR9bKUEBNCCCH6xi1TP2/TibvY+lbUAc0US1YlbGsC7wfOBG6jfZqbZoFbO+f5p4DrgR8Am6eeq8SVBc+9epL6/XkWXawghFBjIkRfIqKJTZHsEO2LO6gJLGzDp4KYaMyg960JLAAeCfe+QvQ3t4JUBvDMKuG5OIuH67wGmwLza5/JzA5ltA3wF2Cr8MxqqbIE2CISr0IIIUTf+LL1g5g82riP9E8HVgm/nYlThssDb8PCWXSaustzq9M6FXkd8FlgYzS9FQ+23RK1C+ZH2OkZ+YKEeaEMKxqsCyGEyEpgAVwwDaHgq65uADaKjjHqq9h86ig9fbQHttx/QSRC8/TDih3or8Qc7OekrmkmO7mnw2Ycg0Vqn6pee7l+OipDIYQQoq8OCSxf3rw21pHJnKyfAE7GLDpx514b8Q7eVxTGgnJL4A/kZ82Kn8u1mEP2rDYCdyYKq3Z+U9thvmhx+U0n3tjtwIokU7BCCCFET3jogd90KQziDutBLCDp+m3E21jU+VejjqsyQuUXx096G3A32YZriJ/Jp2i1WI26mE3Xp2pUr9Iit4L5EJ4ZidFuVnamV8xqulUIIUTP4gAsZ14vVpf0SrbHsJVYe2Jxs2YSsfXoWcDvaO8v1euU4H+BZ89gYTUZ62ILMM6nP5+4RnheD2BWLJAVS4iWEYwQYnrvShWLan0NsNo0O7N2uJCIp2luAu4MQuNxLM3LAmx12wJgPubPNWr4ikswa9OxoWx6mb4bx6YBzwLeCdwfju/Ww5nG+uG+VwB2xlYGbgBsj62gdOr0bn3y3/4QeEUo73E1F0IIIaaL++98l+ymszxAaYPO1q4HMEvXFcCrGM0VW3HE+8PpLQipW1/OjI47k6asvPw+DPwD8ztbSGer1DjZ+b35cZ6beleEEEKIKa0sYH5TeYUXqIfjjtOakqQJ/BqLOTSX0bU6VyJB1K3I8udxRhvBNlNwP73lgAOwAKrxNN54JKoaOdTd8XDOrVPvjBBCCNG20/LR+LOizirv9C4uGB7HoqHPJLy838j0LIVeVldE4kquD8Yp5J/vMb2I4yZsRaJElhBCiI7iynklllYl79x5jaijOg9Yb4ZaZLxj/i6TWwy9rK7CQl8oVECrJRAsB+TttMZky3tg8D9gp5RgFkIIIf5/4MnZwAkpAZSnuPJ/vzW6lpm49N0th1UsVla7PIIuRieAbWdwWU1Whi5U1w+CvYjArv6c5gMvjt4nRXoXQogZTJwuZDatsa7y7JR82vEJ4PmRWJjJnZKLpZ1ob8XyZ3Jk1ImL9oMF55QCBgqxZXEceF2bgYsQQogZONoHeAFwKcX4rjSiczwvnF/TKq0i6/spkeWC9F5GLxBrXgMHF+vvJ3FKz7teu5D7CYmV0Z+rnpcQQswg1qPVMbiIZMTe0b1V4qqtMKgAK2OhKlxY+XM5PCXExOSDiNnh318K5begAJEVTxkeSRI/TgghxIh3OjVgU+Bs4NGo41lA/lOD3vmcKKHQEbcsfi4lCv5NEhNM1pDp1/dZoUzPJn8LrVtn50d1/dFQ31dBfllCCDGynU0Fi8x+SegAHmbyOD9Zii3vcD4scTUpLqC2wsJWuCA4VOXWV72fE+p91pZaf1faHfOx8I7dR5K/UOJYjPTLJsRMZ25kDdkem8bYCrNs7QSsGn23nkHH7ulFLsby5cXpYsSiePmcA7wMyzO4GUnqoKaKqGvR2gTWAP4FLBv+X+2zTqffi3uxlE+3AJeHc/2PxApZ16MQQoiZy+LA3sBXwsg7tkDV6T3W1cOY428VWWGmI7AqwJtD2Z3OogsTRHcD6yqwOvDeqC73YqFNT6NfB3wMS5uztIpaCCHU4fhWC9tYG+GzCnAY8HM6x7CarlP72yPxICbHLSurh7J7UxtriegeL7/v0r0/VlqQnY+l6FmsjTj2d6mKVnwKIYSIxFetjRB6BXBR1MlMx4/FLV4PA0sgB+1un8Ms4GZg55TwEr0LrBqwMTCP6Vux4rr+a8zCmxZVCsUghBCia7EVd+wvw/xKpmMB8Mjjh0og9FT2APsBS6o4MsMHDidPow7HYReuB/aJjlOVqBJCCJHV6N8F0rokgUkbHawAcTJcFwzqjMSgcSvqpsDTdLZgxf6G52AWWH8PNFUrhBAiF6HlfHkSkeWWgXfRmpJHdF/eEqb51OFf0t6K5XX5iVB/29V9IYQQIhcrgFuzDsXCB6TjZjWwgIvrRr8Rokyi9RUsaq3yuFYPAjuG7yunoBBCiELxVCQnpiwB7rdyAckSeSHKgoulVbFgoO3yZB6UquNCCCGm0bCK7MpzVvj8ZiSuvJM6PbIACFHGtuCfUb31gcFh4W+aEhRCCDHQjsotVH8OHdQ8Ev8rCSxRRrzOnk9rzsf3q85q4CuE6J4l9ELngvu0bI9NuXjC2+1kCRAlxQXUcSTTg7+O/qY2QkJLCDFNAQDwAixVhkao+ZXx4aHDuhdLu6OGU5RZYH2cZEHGGshnsGhBVQFWwlYkKxCxEEP8Iq8G3IlFckYNaeZl7BGtb8ViDMliKMo+IHh1GBB4B6+BV3H4AoIvAD/QwFeI4cXF1LXAf4DlNFrNrdM6EAvdsKQElih5e7BVGAxo0FUsLqReEgTu81NtiBBiyDr/CrayrQl8B0umO0eNaqZ4ep2zgRUksETJBdbOwKkSVwMRV1sC94f2eF09AyGG/6U+jiSw4LcjAaAXO1uRJWElhqmu6v0vth1eDbghtMP/wvw19QyEGFLc9PwyWpdlf57EF0Dm6ew7LiFUVwVYzDyAZwN3k6zevEgiV4jhxl/eDVk0X955WFRnH2GpwRVCiOzaXh+87g88kBrkXiaBJcRoCKwtaZ+U+HZgm+j7ElpCCJGNsAL4DEm0/Hr070slsIQYDYG1WUpgxbnz5gPfxVYYxkJLL74QQky/rY3DLTyTJMtDg8QH1ttdWbCEGBGBtWUbgeUvvv/7KuBQYKno97Vo87hanahEozf5dQkhhq2t7KWtS1v9NwU+h4VscUHVaDOwlQ+WEEOOj6iOoXVqsJM1qwn8A4v8vkWHY3qjEm+aVhRCjBrt2rpOg8dnAl8Cnoja0nqbttb3XYcFJZ5KzIkh6WTFzGXZaTQkPsraJmwnA78AfoZFgr8y/P3JDsdYEku7sUloRH6pYhdClJxKaNe2xgKv3omFUGgCT03S1q0LrI+5XxyA5ST1vrYe2tR21inft0loL28M+5p6FBJYYrhohM/nRI1JJ6rRbxqh3hwUNoD/kZi250fHagJrhsZpOWxZ8pGpvwshRFkFFqHdOh6z3N8X2sO/YlN9sRBbHNg1tHVpa9YE03eRaJKEcBBCDCEumi5l0anAqbZG+H7ah2CybR4W7wXkWyCEGC6RBfCnLtrICcztops2MnbVeDNJPlMhxJA1GhVgFeBhFnVq73Zzy9Z4alsYtieBPaLRoBBCDAvuS7ocFiPQB4zp9m4iagt7bUtdYH02nFuLgoQYMvyl3YPODpf9bm7lagJ7hvOt02ZUKIQQZcet7nMjkdWN1X+6m7fFtwIrI0d3IYYKX0a8OHBFjg2FH/PEcF5ZroQQwy6yKsBiwN9yHJy6FeuIcF5NEwoxJHgslz1zbCBcXP0haiA0ChNCjEL7CbAStrinTn9Tgp3azwZmKYvPKYQYkgbi66FxGM9h9FXHHEIXxyxXEldCiFHBLUqvDG3eQvKbKtxFIkuI4cD9CNbE4rj065A5md/VbmoYhBAjLrK+zOSBmvudBfiN2lEhhqdRqACnk4/vlR/vhFQjJIQQo4T7si6FBQSNcwpm3Z7uLJElRLnxl/PZOYkr90W4hyQhtKYGhRCj3qbumaPAamApyipqU4UoJ9WwrQBcG17cvEZbh4RGQKMtIcSo41b6n9PqIpF1u/qlcB6txhaiRFQigfU78rVeXUdivRJCiFHHV2XvTH6rst2J/nCJLCHK1wAAnEI+zpjxMT+UGtUJIcRMGMDOwWYH8hjANoLImgc8VyJLiHK8+IuHf3+C/JYT+yrEB4AVowZHCCFm0iD2UPKZJowtY/cBO2ogK8Tg8BdvLvC9SFw1yMd61cBWJuqlF0LMNHxAuXrUxubR1rrIegzYPyXuhBAFvuwrAb+MRJA7tk+QZHr3oKD9+A34aG1/5NwuhJiZ1MJ2Nv1NE3p7nE4i7e23D5TnAwdE59fqQiFyxhOD7g/c26NYGu9i9OXC7C5gGZSYVAgxM3HL/TF07+vaT0aNM7HciHLLKHGlEKNDE3gelqrmbuCPmHNkJfr7YsB+Yd+uwLLAerRan+rRyGyycwH8FzNbV4M4E0KImch4NNidqp1ukKzwdoF0a/i8EHgauB+4OByvGX2uD2wFLAEsH9r6StQmCyFKQg3YFngx8B3gSRY1WU+VzkHO7UKImYq3fZsyfbcK3/4BnAhskxJbQoiSvuw1zEJZ67CN0dmCuR7wZpK4WbEze7vwDO8Mv5NFVAgxk9vducB/aB8TKx6sPg38Cti3w7HGom2y9tvTnwkhSkolEmXpKcH9gL+TmLTrElhCCNFWYAFcxqKWqtjH6lskoRa8/Y3Ti0kwCTHiDUUckX0Z4KvYypW4sZDAEkKIVoF1eUpg+efNwAtS39eqayFmMHED8CzgClpXHEpgCSFEYoG6PBqAusX/G9hiIlA6MSFERIUkNcNywGmh0XCL1rsksIQQElgAXEKrhf+kDgNWIYRo2zh8i8Rx8ygJLCHEDB+EVoBVsdAKHtT5BVHbKN8qIcSUozRfxXJmEFknoyjuQoiZ3S4CbELizP56DTyFEL2M1gBmA9dgcVziRkYIIWaiwNo4iKuPhv/PUtEIIbrFrVWbB5G1AlpiLISYmbiV6qOYk3vcRgohRM+jtr2AdcO/JbCEEDMNb/c2AVYkWVEohBB9NyxCCCGECMiEKbJAvldCCKG2UAghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEGJ4qagIxACp5VwH60BTxTzSz1io/gshhBBCCCFmAhpZikHVuyawF7Ah0ACqGR6/CcwCfgrcF51PFM8rgCXV3hRKE5gN/Ah4QPVfCCFmjriqYFNHD4SGP49tAlgvnKuqYi8cL/O/5fiMtXXengLWit43IUTBjKkIxAA63jpwPLACMD/jejgRxNuRwK3h2BMq9oFxGPAPzKKozj5/xsM79hHgzvAu1FUsQggx+uKqAqwIPIJNDTYyHLXXw/EeAOaoQy/F8wZ4S3guE8iylOfm5ftrYFlsmlAIIcQMwC1Vn0h1CFl3MO8J56mpyAdKJXrmf8jpmWuzrREGGE8BG0XlL4QQYoZYr7YNnWw94w6mHrabSUIDqIMZPLXw7DfFpq8myNZqqa1VuB6fGswIIYSYAR0t2Mq+PCwZ4+HzCHUwpRTXAJ+SFStXcXVmVPc1uBBCiBkkrraKLE15dDB/wpypFdyyXMRThX+RyMp8anAibJuTrNAVQggxQwTWLOAC8vO9agC7pgSdKJ/I3g1YKIElv0MhZsLIcqq/64XtjC9/VhC/yTvWOrA78GeyDypaD+f4A/ActCy97G3NGHA7sFp4b2Rp7A+3YG0PXBPerYaKRYxYH5JFO6HUUUNeCcZQUMt0p+rO7deECp6l5SJeObUhCio6DO/IXOCHaJowq/rfBO7AwpJMZ9AsxEzvkwrzURyb5CKawErBKrAlFrTuUZR2IR45XgQsAP6XsprEwqLZxqIyU8rQg4oeDWxBYm3Kinqow18FbkJBRcvesHmbcz7wcrUjmdX/v2DTrqr/YhQ5GHMxWRVzMfhl6He7fVcuAu6J3pExkliMhY80AbbTKHHKdBRPYOlAfgQcHoREu86lNsOsK9WwrQQ8Flmbsg4qelsYvcuxvfz4gG6/8PzG1YZksnL2B1MMmIUY1j4E4K8Z9tc/Bl4JLJPqnyuDuLkK8Meg+OaHF1pbsnXq+C8LD/JILKFxzGJBiTPigsAb+4+mOoOsO5ePqHMZOivW8lgk/3iaS1vv78CJegfECA/S1wD+g1lpF/bYV6fdEW7FYsZt3cawVKgVa+sgrhQgsL0PRLxMupOIuAx4E5Z8OC7fUV1A4COCVYGHyS8lzu2YT09V1quhElhLAw9JYGW2gnA/CSwx4gP1V9G/32bcV8f7vwksMUiR9WHklNrLQxyndVpsHJs/3r+NSh/Fl+JbOdUbL9MDBvFSiL4F1rLYtLEEVjYC6wAJLDHCePv+5wz7E3dR8Pbn38A+Rb9H1XBzqwL3R5YDNW7dN4QTqf+fGz1QRsgK49arVYAHc6gzse/VkiglzjA2llXgF+QzdTwTBdaLJbDEiLcZldBf5pnDtgm8pOh3yU90jBrEzB9mE0sds24btT7s1qtzcqgv8VTjZiNq/Rt1qtiihL8hq7gsWEJMv92A/DJBTESD95cW2Rd7J7YWcC/5pDqZqdOIXo6PA18G1owaysqQvgQVLGXHvBysV27SPSOyrorhsm6CTRE+iaYI5YMlxPStWAQrViOngVk9apN2Swm7QqwSb5cVK1eL1v3Aa9uo9mF7Ca7KYZQRv1RKiTPc1s39aL+ypyyDHw+IG49qyygEvR0+QQJLzCAr1iXkZ/32930BsAl9Bq+e7g8b4USXhBNrWiZbUeIN+8rAd4EPYoHVGkMkIjxFzV5YLLCsr92P99tQD5USZ3iZHcRAWQKNxvksvUH1Vb5ula2kRH6Z2FBVSswggXVGJIjyOEcjtFGnUmA6Lx8d/UhWrFxHz16uvyLxzSq7yPJOaTngRvIJKloH7sZiKMmxfbgtWB8qSRvSaHMNTwNXA78J21XYdPdTHerkIK/fz//3MCBTuBIxysRhXvKOo+cDqUOL6oNdPW4ZGhz5TuRv+n8AeGaqcyqr9Qos1leeQUW/NARlISavJ1XgQgbv4J6emv8OthpvtTYiZbWwvRg4OQj9tF/gIHMRPkwSx0cCS4z6IK0CfD3nQZoPXu7GFuVUimogIQldrxVAxYisHUtsyXJrUg3LV5n1yN79Xx4B1kYrB4d99LlcEASDdHCfiN6tjwbx1K6t6/S+LQ0cBlzbpkEeVAiY5w+JtVuILDTIjuTvx+k+mPsV9W65elTIhmKnACawPIdltN54pTuOfFZ3+PHerA5kJBrGvUmcyAeVeaEJ/JAkZVUsqGqRiPetFn3G79+yQaA9PcD2UNZdMRMHaktiUQ3yHKj5u/Xzot4ttxysTzJNqKnC/EVWHfMBeW7JRIZbr9wqkVdKnFuxHI7yMRlevHE6ckBipBFtH09dVyysphKJsdhytgauHNB9uVA9P7IkCzHqbUkV81PO+53zPMx7FtX3egOjacLiLVn3B3EL5Zgm807zTTnVBT/evrJeDT3VUF/+PIB2w0X/09EgZSzaYlbFYv6tGX2u2aEdrGDO5QArRA1+fQBtw/+wqUs0CBEzZLD2yQIElh/7kKKsWIrsPli/kX8G82htgA2prxpcGtg9KPysg4r6/Z5bIkEpeq8vYIm576dY/yuftn6a1lxjcX1aHXgP5nz/OLAQC0fjnwuChepU4AXAUlGdrERt4hLATQMQWe4rsocGImIGCaxDChRYry1KYGmacHDbwvB5UlEPewpLJsBZ4ZoWkExn9rtNhHttYDG1NPUx3Piz2yoS40X7KL0nXMPs6L3ZA/OheqzLY94OvDvVJvo9boZNlxeZt9Xv8cQStAsiv0FKv5v7EM4a8vbUr32XqN8pqv0o5N1y589L0TThoETWEQNsTH3Uvg9JypM8tlMkrkYCH5SdTRIleSLnrR7O08TSULm4cmvaFsBDLLoar9Fhq9Oa3qoZBherRvfo7+JrokHHRAHbwvB5daozFqLT+7gMw5tuLI6H9RjFOLqf0Ut/O9bHA5rATOo7U77IxqNuDXAr1jlB4FQKfgb+/DfBfD8eBR7M6Nh+H/OAj5FfxF5RXF1pYD5KLwl1dXZB554drEkfDtfh9ejVwLfC38dJHN2n06gTCa5DsbiA+wF3RW3q94CDSZIwF2kh3AG4HGU6GJW2vg68F3gjNn09q4/j3QxcF/rti0M9jvuUxpCVz+wCBxI9lXu/1o+b9A4MpMOaAFYB/g8L31B0Y1oPFfurwDcx35OHczxfQ4996FkP82OioEaxHt6Lz4a6OQezKB2FWbR8xDurx3ewGsTZ5lgk9V2x1a5urXsrsCLFJW5vRmIWDUpGgkZ4pqcDBwHP6vN4W4fPE0JdvQr4DHBZStANC80RPdf/b0R2wczTRfobaEscd+cDB1KOabRKTpsQWVgCKqGDmh+EUVZ+Gz6F8E/MiV+hRETW7apba64K9c373F58W9N1vwH8FNgpNXgYhjJZAbPqFTFFeHZGRqmubnCl6AIksAazqvCylOgdlLASYrqWn0FsNeDf5OMz6n6RH0kJukHcpxg9vFPfmewyZbjgakT/f0sbI4oE1gAElj+AJYB/MdhUETPZiuUBSDeIGnYhRKv1CuCl5Lcgxzu924DFNegQOdXjCnBFDvU4zqf5Kyz+W5n7k6ERWNU+b/IpEudOzfkXX8maoUH/sBp0ISZ9V47NsY1y36d1SFYQarAjssatpFn7pLqf4DgW5+0CLO9rXfW4/4ahX2YNYSV18+gE7eepJ6IRQtlHNQ1sVdSzwr/1QgiRvB914NnAtjm/H75K8dgw6Klr0CMypBHq00XYyvFaDv3TrCCyNgJ+jc1QqR4PWGANg+UqNqnGAdfiPGS11H5X9f7bRolfvCYWk6qpl0GI/4+/Cxvk1CGlz1XB/FJnIYu+yL4Pq2JTYldFbX/WzAr93ebAz4DlGWzWkKFmbAZUykYknADuw+KB3ALcEyrr/EhM7Qysga3a2ANLo+G/dTVfJgdAX7V0MPBF4AmKj4slRJnZrSAxN4FZr47AwkPUwj4hsqxjf8FSlOXVxo9hlqx9gQ9gUczHVJclsGJ8/rgG3A38GFuOejkWxLITv4j+vRgWO+TFWJDEDVPHLovAaoTr3BvL3aeXQQh7L2YDG0cdVBHv4yoqepGTwQDgrwUM9F1kvT0IuvNQ8NpCcYHxO8qVLqcRXcvdmH/SCm1GAvFUYLspwrSAWhIL9nZTdJ6yhKZwX7KzUs9GiJk82gdLCZJ3Oo30iqPnz4ABrBhMna6Evug28l+978e+kSQMSKVE7/ZIryIsq8J3H6szMcfWM7CcYy6aYr+qdo7u8b7YX+tJbE56a+D4qLI3S1LhqliajDko8rkQcZtQ9Kh7KRW7yKkuV0NfdHPKqpUH1fDubAi8mSSyvJiBAstFxQLgEMxydT+Js3qcqLXbxnmCxOr1FPBx4JXA05Qjh5OvYFo/vAxN+g/BoXpbjDDutLhiur9PW2HVACbvbi28r5em2oi8WU3F3/dgsTKJBWemlw/YtF3eAsvb2gbwKcwaLJE1Azsqt1zVsQSr56SEVTOjc7jQmoVNx+0d9lUZvCXLl/HunsGzLbuD/DBa6NKrVyu0BqnsJTxIbIn14zTaCK9Kicqg6PN5MN4i6rWf79+pdqmo+64O6buQrtONDs+qXeL3aknret48XPA7uyTm8K7FU10wCj4CcSf1YeC3mGPrwhzPNx7K7m/AYcC3MIf4Qc5Re8XfoI9juBPjodg06ETJ6kg9lPHfMOfLBR0a3TINYCq0pqOImQtsFf62OWZ9rGCrd+bSOeyG738Ec3hthno/D3gU8xOcaPOuT9Z5FVlHi+baAs7tFrOHsWjbDKCsyzrwiK1SE0w+bVvFVm4vBB5I/W358Pf/pe650aYdq3T426jwWMGDlibw+tAvjKOV6jNGYNXDfXwdM2PmKa5iJsK5zgHWAz45YEHio9cXAR/EQk/02gH+K3T4ZeV74f6qJW1Aa1HddFYGtgCeF+rIs0JHsk6f53p2+PxA+FwIXIyFH7kdmx67IhJcFYpfDeTnOxx4L/mtwvXpi+uxsCXOn8g/24Hf09WYj4zHE3oG8P0gDvLoEON8iG8Nz74s74XXtYlUfVuCZNXzMsCemN9aM7wbK4f7eSh1vGXDvT0cDTKuwRy+7wcuCYOLB9pcw6iILb+Hv5CEIMo7/qH7Yq2IucacjkKQFNaJDHIVoVuunsBC+xftg+JTMYsD/6A8qyk3T4muXoTaG4OIWUD7iPdFb26t+kYf91bEOxE3dJuFBukvYdQ9WR32TPfjXZRJ+jedVtL8GzgZ2Cv1nGsFlksV+GWB78B20SByNnBlzu+nrzY6LrJOAry7wHv2d2PQ2TXSIQRqWEzB44G/A3fmWAYPAj8M5b5Zh3o4zPj1r0fiU1zEanZvX64PYniQszUzItlzWQRWEzgwdU2DEJovCKOuMgisZ/QpQrwSnZWqZIMMQ9EE/hw6j7L5WlRSdW+PMMpb2Ka+uiCKF13kEabEz5FueH4arGhFdTrxc7otKoM8hXgdODqcc0743AFblDKRQ2Ps534wWFkq0Tv06/C3hTnesx/7T9HzrAzoPYg7oLWwaaUrO5RZpwGFW5ums39ikvdpQRjcvCcltoZZaA1KYMX9wHuLFhsSWMULC69cN4fR4iAVddyYDtKK5ZVszz4FpwuGVYAbokZtkHHNngid5KCE9FTvAdEUTVocTjDYmGn1qBPyfRe2EVp5dgibhGeYd/w4v8df0bpKEyyJbR4DBhfSR6QsSOtgfnF5d4L+bt7RQdgW/R6sgblOPNamDtZzbksatC4WicXWT7CpeQYsEIZVYLnI/Q+w9ICFvARWAWq6Aby/BC+Lrwp7/YAtPulpirE+7wngpVEn0hjgPR1ZskYxtlqtECxWcUM0aFE1VVBa///Xgvjxe6rk1E68gPwDI8YN7dOYL49bVarYgoJ7Mm6vXFz9LLpfr6OHFNQeuGi9jySKfLXA98DrzLLARzAfqE71bRCDs/HU8/omrYuBhikw8yAFVvzefHCA7bEEVoHWmu0YfH5Af+CrFfDAp1MZsqr83lmcWFDn2Oll/mTJxFVc196GZQxodhg5l3WLO755wPui+8qynP1Ynyhw8OHP4LSoHnt7tT3mW5jFtbi4uojEL8W3xYHLCnxv/By7FigaxqJzHUuyWrNZwgFGI/W8HwS+jPnnDZM1a9ACy5/tvAHOKEhgFSSu7sDic5QhAJ2Xx58GOE3o5/xrhqNYL9eLCr4vN0ffFqZcyhJkMLZafa/NizhsW3zdfyRZ7TaWYXlVsRyZRdWfRmRF3DAagPmz2xZzLejFwtJITbeeS+ITGA/0dip4UOLX84oCOr24LNeI2rx4ZmFY6vzfsJXXMByBTMsgsLz8Tk0NXiSwRkRg+U1/uUQmXi/44wfY4fozuCxDgeWdx1bRVESjwHt5aYmesV/DmlgYBH/OdYZTXLUb3d9I4ps1llFDCHDrgATHt1L34u/EksCPUt+PfYTi2GX1NlNN3v7Ex/XpyLmhftQLvF+/tm/n3BHEbcprSFbHTgzZe5C2aH04JwvuKAqsuA9YZwAzSBJYBTUmJ7HoypVBC6zDSyCwLs3YglXFYtfcXlAn6S/LfeG8g54Cjuv7NthS5XiKaFS2+B0+LIMGxZ/Z6phfTtEJ0tP+e7PavBevDaJysnoYb08Gy+W+bRp8n2762ADaAH8nryugjdsG8zlrDtBan2Wd9+v/cQ4W3FEUWPEU8CCMHBJYBXUErymhBevVJM6VoyCw4ns7rs3IL89K/f2SPF8///qY78awdyrT8c2aR5J2aazPcnt2wdarWCAtxFLlPC8lsiopa9aLge8E8Xxj+I1b9K7HIuV/JNSBtHU3Pu6BDGblqJft7Zj/V17t27NIVgcOw3Rgt/50/w11If18JbDaT8M3geeyaKgaCawhFlhemP0E1Myr4q8VvayDcD7MQ2D5s35mGxNxnvdxcAkslF6Gi2MR7ofZ36rbuE6PA/unBEQvnfKxBQnzyYTHA8Hykm4kax0a8PVIFtC0ex9q0Xe9bLYPZVYfUKfn97ptxgMTP87zInG1kNEcXPi/PyAL1rStWJcWPBAeGoE17FFt5yCKwBMI3wrcQr55qJqhXj5GEqBwUCku3Ol1cSxA55YkqZlGGW8XlsKigz8jNDTVHp4lWBiIygDvpQGsBPw+iCZPaeUpfNLxspqhrl8Z3YMnFa5GAqoWNcIHBCvXUqlOoEj8WrfO8Jizwv1+APgNFv+oweCjxedlNHDLzMfDNkayyEYsWl6+kn8/klyxYkQElpJNFlfOFSxQ5L05l32cyPj2AT9n74C/EEbv4wxXzJx+24Y65j91IUnOxG7aDM8/t+uA2xsXWStg2QDeQTIVWo06ikYkjnx/JRpk1KNRrFuMlsCmzs/B/HcaA7xPf082zkjkjYU6f1wQG/VoADTK9b4a7vsD2LTwTHrvexl8zwJOGODAQgJLDD1uzflXzqLHO7mLUp3fIMTVBJaQ9ojQyM6aYc/cy2AtLKZUo4cGtFqSgZCLrCWAz2NZF/Yh8Zf0KQa3bFWjMhhLibAJzKq5P2blOhlzcB+0+PBns1n4dyODZ/+ycH8TDDZbRtHlOBbu+Ths4dKERFZHEV7HYmLtRGLZFRJYostGxxMHF8FjPXboWXZUi2FBTpsz+F3xjmZf4M2hMZ1OA+rf2QhzDG+UoAyrkUh6PpY65/xwX+uF70xEWz3171mhIzkJS+5+HmYtcstOpQTvqJd5P1Prbr1cF3P8b8wgcRWXpdfh0zD/Ok2BtacZ3o0PleQ9KFXjKUQ3zC3oPIsP8B599H546FAnZvi74taf92FxpepddPZ7kvjxlKXjrESd5X5hexq4Cfh7+N4CbGp073D9i4V7WSs6Vp1iV09Nt8znAMuEQUq3/pJePrOxVbxLdCGqR1FkuUj9GbbIp5cynQk6oh7eoxdg1uFaid55CSwxNCws6Dy3D7BRrYcO5j2Uw/JSBoHVDBaNXTA/puk2oGtFo9wyUYtEkgv6rcLmHNXhtz5dVjbR4R3/OpjV8CoSa1S39f9ULLzGTBVXcd2vY8GFPw+8TuKhY72pAl8E/hDekRkvRGXuFNPFR3J/JPFVaeb0ohI68UF0zC4mjgfWZmZPD7Z7/idN87l4B7RN6rmWDV89GPtXtZsinIjKYKzEdcKfy5o91v1GENKvRVNicblMhDJ5sUTnpGW0AfBylZEEluiN+QWdZ/aARmHuCP1Wiau2wnNnLM5Sc4oG1EV4VivaihqBj0VbLfX/YagLLgJ36rLc/XtLYDF/4vyKM51KVP+/jq0WVdvQWaB/BFiRwfnQSmAJ1ZlpjsQHISLegC3pn/ENRKqTcUfvQ5jcmdXryObYdJU6o2KfE1hsolhwTbdzfGMQZxN6ZouUj4cteRtyHZisDq0HvEplpAoiRNwxNbBAisfq/ZhUgB4ELDsNATqVlUvkJ7A2CGK42UXdXwJ4L1pq3wkPRHo0sDLJIgfRWkZ1zIq1ykwXWepAhEgahibwUsx/RY1n51H8hpg/SqeO2NuVXcJnQ0VXuAheH9iU6VkP/TdHhLqvpfaTC9EVscj9GkC0L6Mmtor1PTO9LklgCWH4SN8TEw9y9YtHDZ/osNUHeH3egO6dKrd2bDyN70z32TT62JoDqEuDvt5uArx6J3g4Cj8w3XI9HkuLpIHYooyFenxMGIzNWCEqgSVE61LsVzG42EaeZNlDAIx12GrRaLro5eLu+PwMLLRBs8N9AOzRYzsTC0yfhqz2sVUGUEZZXK/nPOxFoIMtSKhMUf5uuX0O5jMnq8zUbUUDW2G8s8prUtE+C4uLNWMt2IqDJUTSaD4XW71Y9BLjRtTZAdyFRcz/W5vvLoYlnd4W83EgEjmVgsqqHjrjfYGfk0R7T4uMXhrldtOOT2FBQHthCSzR87LkP13hx38MSxbdKxsF8VpLidbpikWvD3tjUcib0/j+IVFdHOTA2y14zUnEKww2srxf2+FYAnFZ/Tq3qR/DkqDfGO2TwBJiBrIexU8Pxh3aH7El8j8EHp/idysAe2FpXvYpuHP0MlprihH+ptG+6QqrGnB3EJm/B27DAhfe1uO1rgF8Fjg0iJSxHMsELCH6TsANfRxrHWz66XlYYMstSCxN0xFa/rfNgeWARyf5XgMLO/DCaT6rvN6BBt2HwvCVjkVfswvf/UMdvxEF1WxXt+rAksC7gCOZgZY+CSwhkk7rAIqN/eOWsruAdwPnpIRKdZIO6SHgx2HbH/hqEDxFWN+8g38LcAqt1isvu12xtEpTiT7/ew24E/hysLo82kE0dNu+3ROE2qEFdSoT4T4qfXS6nsXg38DnsBQ9b8KsTLVU3en0fAj1YVPgkg7WA08J9SJgVYq33Dbb1PWbwjP7LYtmjVgSs5qCRdxfMqpDRb63/pznYlbvG6KyFK31qwG8JNTjGWnF6lfF/y68KBPRyDbvzc3I2wxw1DVZo7YwdZ1Fbf4MLs2hXPxYz4juq5HjPeybqmd51+MDIgtBkc/qxtC5eRmPTbOjcD8xHyRtCNxR4D24f9BuqXL06/lA+N74JPfv1/k4Fhpj6VR9G+vTQuHXcvAU15Jlm/RIsBr1KgpjwZEeAB8G/BTLmxg/g8mua/1J2gI//qnhOOMDaKv8Hfh8sLhNN9fpGli8uv90OGZR1/9rik2b5M9xvej9Kbqf6aWcfp5he+7v1Qqh7cizDPydOLsXo5Sc3MVMpxIJYwoaXfl02E1hdHcf5hDaiBqk6Yz+3RF8VjjWPsH60SzgPtxqsHqqHN0PaaVpWO6qWELhTYBPh8bSBaaXRSODeynaUt/MoGwbkUXErTPfD2Jxh2C5dEtivcMxmsDWHcSel/EcLJzGVM7wWZdPDfNVOwDzKXxnEEvzWTSifjqafhWbRv52KIsXAw9QbI5AL6udSRJiazVh+3JqYAteNmOGpV+SwBIzHe8Mi8qZ5+ebjznJXhM6jvE+jjkeiazXkfjrFMEqbe6viU0RpsuzGXWul4ZrfQ02JeTCaiKHa2+OQB31cqsEIfKyYMG5r4OwcAF8WIc67QJr9SBwi6j7kCQBvhSb5jsPWBAJ7lhct9sa0b2NBWveL4BnAj8gmZYqYmBWx6yuu6k/nbScPC7WZwusZxJYQpToPdisoHN54/8h4C9BGGXhuzEeOpeLsUTZRXU0+0YNpjemS2Cr9uLGtBlZYs4LlpjTo041D2E1aviUkFtxvoNZn34ciaz0itLVaL9woxo9v2okfPK+/jHgasx36fZIWMfTndMVnROR0LofC7FyBolltwjhW8NCEcwo4dAlPuB7PjPMiiWBJWa6sKqHTuiZBbwT7tB9F/CZqGPLssGfCFaLp3O23rgvxY5hFO8rupqYP9iGqTJuYFOAh2HTQo9HDa+EVff1yKeZb8WsWR+LRHWcwmi58HzSISq8zF9EMQ7ifr3/wFYsutWqX2HdjOpeLdSv39E+dEge1hlCXR9TPZ7yOQH8JtTJGRHhXQJLCGuIZxfUyFSA46IGOstG2TuxO4HvReImT2ILnLcnz6LVkd3DL7w0WBh8ameQEelHgTgo7QnYSsNaql3fCHMGjjs0n4ZbjiQpdJ6dnVtS/4eFnrgnqhtZnsOte+8CHiR/K66X89bR85AVq7MYbWC+rtsxQxLAS2CJmf7Sg62MrOTcGHtneCXmK5LXcmXvSM8g/7hYjSBM107t34Jk2qeGrRLbGwuXUIRlYSbhUe/HsNWAhwFPklhHm9iKs7SIaoZnt1IBAss706ODyMrL2uP1/UYsTUsR4t3Lcc0CynHY21q3Vn+VxHo90uUlgSUksGwVk49283rhvTH5JRZEMq/AhD6KvjSIubyEnAvSJUL5xeW5LckKtXuw/I4XolhBeTIRhMsZmK/L3STTuNt26PwXJ38rYjw1eDb5r/TzcjgLuJZ8rbj+DixL4sMpgdUZb2M3At7L4LMGSGAJUQCLFTDKrWF+R+eTxFbJ871uYA7vkL+z+3j0uQbmk1LFAmXuhU3XjFF83sSZKLJmARdhiwieCh3+NlE9JBJeu2Nxp/Kc2vK698VokNEs4H2rACcXaCWZp+o3bVHaBD4YhGmDERalElhiJuMN/X4FjD4rWGiG/xYgsLxT+yoW9DbvsA0TUXk2MZ+fn2KWE4/eLMtVMYwHMft3bAHCPdhKwSXbdGbVAt4vj3f1u4LEPpFgPCuI/DytWP5ePbeANiTdngyr5nDL9/6MeLJsCSwhihNyN2MpbhoFne/JgkbwK0b/3hWznL00iKqiwkWIVsFbA67Dgs/egeU3TNeF8ZyvwwXd30nidRVVF3xl5KWpdyIvVhqAkB5W/Nl8MAwGRtaKJYElRP54p/IfEp+UPBt8dyp+CPN9ydty4KP3GnAZcFDUmWtacDD4AoPrsQUGt7apB3mLAq/jf4g61iI78Sbwp4IGGUULnhULEo556Y46sDG2onpkfbEksIQoruFfuuB7Gsf8vooSkBUsRMSD5L8qU0xPZFVDHXi6jfDZt6D6f9MABzWXk+TtbI5AG+J99m6RUBlG649PFR6LxSEcSZElgSWE+SkVIeD+NgDR+PuCR7oVinFkFtMXGp064Dz94tyKOg+bGmcAgrsSzv9Ywe9AkQJymAe1Dcw38B2MaFwsCSwxU/EXfGmKW2J93QDu8/GCz6fI7OWjOYUIz7N/mQ/cMgCB48LybizfJ6qXpcN98t6OZdLwaW0JLCFGpONZEosuXESHM2cA9zimxywGPJCZPeBr0DtQ7kHuYliA3JELPCqBJWY6DYpzUB3ECFqjdlGGgcxMPr/ojAeefRuwKSOWCFoCS4jRjl1TxDlnROJWIURu7dNiWHT3kWpLJLCEKI5BxK4pIkzCbFkJhBA94las1wM7kISykcASQkyJi489B3DuJXNuGJtYHKwNsVVpalOEEL22kx8epcGaGkMhimOtAYi6PGMduZPqMijZrRCi/8Ha84GdGRErlgSWEMXxZEHnceGzArBdzu+6h2XYiSQGlhBC9NKWVIGvRO3KULcnElhC5G+S9kZiY4rJx+ajwd2wdCh5Rnt2UbVbOKeitwshem236sBWYWA49NHdJbDETKdC/nFyXFTtBjyL4szfhxfUKDaA7YEN1K4IIfpkDPgUIxC/TA2hmOniaiHwaAHncivZcjmLqzHM2XwX4IUFibkGMBd4PyO0AkgIUThuxdoHeEX499AKLQksMVPx+f6HgCsioZA3LwaWiARe1u/zBLA68EOKW43jVqxXYb5Y4xJZQog+Br4N4APALIbY7UACSwgLcldEowGwB/BEDo2Gv8tLA78A1qS4BKruhzUH+A3mQzFyecWEEIXpkiawCXAoQ2wVl8ASM32kBHBp+GzmfK5GED7rkv0KmWo4/meBbSk+JpXf37LAt4HFSRLuCiFEt+1JE/hgGDQO5YpCCSwh4NYCG4zFgGPINqTBrCCoPgQcgU3RDcJvoRauY1vgm6F9qUlkCSF60CZ1bOX1EQypFUsCS8xk3GL1ryAMauRvxQJ4Zfh3FuETakFQHQZ8JPx71gDL1J3sXxGuR9HdhRC9tm1N4D3Aqgxh2IYsLlajUzHsAuvOIAwqBbxvdWwl4QEZvIN+vNWBz5HkHawPeKsACzDz/nuQP5YQojdtUQ/i6p0zVWCNqx6IIRZYVeAx4DKS6MF5MwackBJ5vQ5sKsBPgBWDiJkVPge9zQnX9xksRdDQBw0UQgxEozSAtwCrMGQW8X78NJpY7Js1Uw2+EMMksGrA08CPsBxY9ZxfYI/zsg3wGuB70b5ur90/3wKsXNL3sILFGWuqugkhehBYdWAp4Hjg6GHSGr0KrHhF1OYMzsO/jAUtoTl8IqsCXAvMwywveddnd3j/KPD9PsSH/+7qISprIYToVmQ1gaOAz1PMoqTMLrzXUThY6o+snHV7oV7CMi3DNSkfXHfPq4LFb7qaxCSd93vXANYGjgv/HuvzeLUSbxp0CCH6GZA2gsg6cZgGav1OhUwMWFjtltF9ZFWWFSxFydiARKeXw5bI76WXZ3chxflhVaMGY1+SVYy9Cup6iTdZroQQWfRt+wNrlKjfz0VgNTFn2pdECnMQ1/0GYDblsNh4x/zyAY7Y/bxLYf5xYvoCpYn5YVUoZsVbJXqPPh2eWRMJYiGEaNdeeiDjr4f/j6TA8inBJYHnD0hJ+hTLNmFrMthl4N5Zrg08d8AdpVsMdh+WSlgSgVUF/g1cHJVj3nhgzq0xZ/fGgAYsQggxDHqlEXTHqsCTlDz8Sy+dr/tUvIRk9dMgOgS3OrybwU9BeLLbo7Gw/oMqk1jwHUhx012j8vJOAN8t+Nn5dPKBwOkkEYslsoQQZRyMDqpPcUNGDTiLxKo1UgKLcJMHkn/k66k6JoCXYj5Hgwpm6A99lXAtgw7p7x3ztpg5dShzOA0AF8U/Bu4l8ZEqSqCPY2EbTiaJ9SLroxCibJphkP2Ja47dgYOwGIYjI7A8JsUaWMygQU/NeTLZ/4vERdEPf1Yokw8C6zD4BLdxdO+hzeE0AHxa91EsanCl4MGD5xM8Lpy/jhYpCCHKgVuKLgIeYbAzI97Pfx6bMaKsRoReBFYTeC+wAoOfCvMpyn2xBLoTFJvkdgxYiFmujqS/lWBZV8BGeE5roVQl3Qr2XwIPDEBkeR6/zwFnAKvRfwgHISZrJ4ToRmD9FPgFiS/2IOvtCtjioNJS7fK7E1getdcweOtV+rq+EITOOLayMO/Gwy0OuwM/DOcsi++MC+GVSFZclOV5lRm3Yj0FnMdg5vjHQh1+FfAXYBOSKUP5ZoksWagiEF2yOHBsqDtFD0DbtdelZjoCq0JrItzvY749g54Ki6/Pncy/jznfL+xBQHZTZu4zsw6WB84rWpk6P1+h9kLg7LCvjqwh0xmpVUIjcteARJZPO28AXBHElse6cqE8FrbqFNuYhLXoYAE4f1g6KlEalgTuD0aFIoIyT6cel/ZcUwmQsfDyTYTG/ZjQYZfNr8fnZOdiTsofjh5+ltdZizq6Q4OFYUXKG7/IV6i9DPgrFg7Ag8PKt6fzqKiG+Rl8boCNiNe1JbDpwt8B+4Q6Xg/PcSJ8Z7LN310h0swEC5baumxxt6CPR31JU+/K9AWWW4QqoQCXwGI7/QCbhiurP48/6DoWHfvcICjqGbxkNRLn8Y0xS9lZWNyrsgeHdD+1XYC/AV8N+xvBUqIpp0VxYf4j4OZI7BSNT/U2MT/DC4BrgHOAN2FBbdeaZFszDASeN4ARnxgO8TFqloY0c4PVRWQ3AG0CNwCfZPBWrKLq7nr0GdS8XQTr1wL/jAq1Ef27zNs4ieXtrSmLTrdlEv/mUMw/x4VcfUjKw8vC/31JEJ+xCJuuGH9GVA8aOV7nvl1cW17CFGC7UJ8mBlz/O51/4STb/PAdn+ocxCrbQeLv7stT7UIemz+bRzAXijILWi+X1+dYLl4eD4dBetHl4XV9GeCWqM3Oq685pcc+ptdnd1QBdbrdfZ4Ule8WOZZrWTavx49FQn3a9bgaCSsvqKWAdwBXYkEXn0kyLVYZooa1Hu7vq5jD8oZ0Nz1WjTq2PbFpmrMwJz8/9jCZnmvR/TwL+DsWc2nZcD+zZujouhPur3ZlGKm5JXCQz68SvYsT0XPrtM0O3/nvDB91TwxghK9ysbo6N7S9gxBYTcyFY/0Czr9ghrWPc4DrgW8x2BWFRZRzA1gM2CFlbJi2iKhj8SSOwaYgPo8FqvRRc5Xhc5StRQ9+f+AyWn2zKtMo1CWBdwG/J3E0HubVeG6R8+nB48K9bR1GKNNtNItgQQnKy6fDTwbujMpukPi7OBaJ5slGXzVsqhBmpjNzhcQamvd5vB3dttuGuGC8HuybY2cdd0zrD7A8liLf6ONedptSrCvBoNtH9+98N/AEQxBVvc/3ZRY9WrBWxcyN/8J8rNYhCXI4xvA7CLrlYXnMN+viYMHpVFBuWt4WuBALYurHGHQU2yw7aTf7bg9cDpyAWecqk/ymAuwVdSaVnCozWHT+QU9puUiZh1kxHyxYZE63gZ9sK9v1DuIZrlDguWrY6k+GoK1YvqDzbDagNg7g2ST+s3kJSb/HJsWtrt+iBAKrhk2dfYliM18MakCycS+V8KfAlyNh5Y3EKK28qEUd5U5BSHYKq+AWrqOC+JgfHWPURvazgsgaAz4KrDzFSLMZqfi8X6Y9KMd0SzOUz3+DCPXGWpS/ftexYK27UKzlee8hKZ8lCjrXtgMUmysWWJ5LFyRs5oT2cdAi3vvQU7DQDaO6otDLeB96SA+4EvBbEofZYXFk72arR/f1A2yFVSdrlPtozQb+TGuYilErF3cofxoLv9FJXHmZLA38m3wdGz28wOPYyo2yLLN259JjKda5tN9638RWQlaGxKqS5fOqYMGH04s88naIvT2IlzIuKnCRuU0B7Zof+9YgCoosD/eRvaiA5+/3uQ/tF4tlbZVbPWp/iuqv007uY6nPTw9Ru9jre/1A0AVdt6OLA19sU2FGYYsr4pfbqNLJFOts4Og2xxqlcvlPZPqsTCEu9imofvi1HZU6f1lE1mlDUh9mssDyRRtfKPhZeUe+d0kt37XQrp1ekPCsY/5CWxVYHtXIePBEAULE69bJObdXfty3k/hAFd1ffCx1LT4AXha4jdaAyKNmjJgADpnEEDGpmAB4dbAcjIqYWBg+bwwm1VnYqpZql+WyO+anNApWvkZULr8GVplGo+BTxucW9GK7xfEfwRJQlhQxlaiDuqZAy4gEVm/Wi82wJfpFhlTx+vCT0N6MlbBs5gYrW5GDpSMLHCx5e3FgQfdYjyyXS5Ofr64f96oBtD3+HE9o8xz9319K9bujNgvmIW/m0GU6vko04tsFeHQIOo/pTDM1gT9iAUG7Up2pDhUsB+PXh9zKF3c0X4ueeW0ao6bnF1wn/DzvTFkkytBBga28fCI1/VzWRuGmaVpuRwXvYH8+oHbMz7dHyaxY/i4/C3MLmCiwLH6T8/RZu/v8ZYHGAr/PF0ezH1nX6WpohxsDrNO/bNOX+oBmPeA+hi9GZLexCA/HVsd2PVjwSvHGyGIzwXBZbOKK99lUBe2ncjsfIAngOD6E5VLH0hwwDdHpI6bFMCfvIl8cb0QeA9Yt6VThm8J1lrUe+LP6Lz36Dgwh/mxeNsDRtL8nV4apkzJYYP09Xyqyvhb5Lj+BrebM26fSw5gsE6wNRd2nP/OrsJX5ZHyfPsD8xYAGDV6G19Hel87fu0+VvE3stx7XQ13esNc+KQ7NcOKQWWy80j2Jxa2KlX8W00NemPtiQdaGRWSNRx3tAalR/lSici4WrmIQdcCF/bXYKtcyiSxv8H5a8nrgDf82JbOm5DWF68/ltwMa6affuRNLYIH19m+JaOBcH0C7/J1ptj1ZCOyPDkCIeHv1YMbWS7+nD4XB/QSDG6xd2WGg5sJ5BSzbSYPRXTDXDEJ6036esb+U7wiCpewiyyvdNdGNj+XYsa6A+VmUfSp1PBp5rDHNxt4rzPLAnwZ8j17nrs/5ufY6Ut6o5GZxf27vKZlAzbNzfV0J3ksXd09joWEGVfZuhZ4bWT/GB1gPv5GTyIoHwG8f4PP3c94TrGj9WrJmRbNKzQEKFz/vY6Efaedn5s/0fUPQL2bxjK+PBv7Vfirss4P1o6wiy6cBzsUc0PIeqcfH/lyJK5Nf058icTU2zXtbHwvKWganRe8QbsZik5XFEuPXcGCJ64CX3adHWGDFlqtDsFVrZXBt8PPfG4R40fXWO8ElsYwNg7a0jucksuLn//kSvIt+7r/1KbJ8Wv9QyuGu4/d1dOr64ufg8dXuYXRXFMZlcSdJrLWe3m0vxB0x5/ey+WT5A/wj5oheVCNWjTqrH5Swg/VyuYEkkvVU5eL3syFwR8mmvuKYXXuVSCz4NXyvpCLL68GlDF/+zG5H+Z+jfEnp/VqeIpmeHyuofaphPlc/LVHd9MHaKSkRmMXzf3uJ2qxYZC3bg8iKrbGPUY5YjL6g5y6SoNRjHa770yNuxYrv7ep+RZZX4INL1ul6hbslEldFdiBu5asM2PzeyRlvHrYqtBvL1colFFftRNa2JRFZse/BI5RzVaG/Jy+Z5hTxMFmuvN6eFNXZspb/RDQ4mFVAnQT4fkms0O0sWaf0acmKn/9HSmLlaXef3Yosb9P2CtbYMs0cedneAezXRiR73VsCC1sxylasuE/6JxZ3rW+R9dmSKFN/cONY3rpBTRt5hVoGSyhdL0HZeCPzk2mKkDhv1z9LPvKI45HsMQBRPZk4/VAJO7PYH+hB4PUjMlVYaTNNX/aQGQ3gf2FKOa96G4uO75S0PsbX9NE+RJbX4aOGYIr+b5ERoDKNtnhjLHJ4g/JaxRdioYvS4X78uZxQ0oF6Xs84FlnVXl/cxbHE0INWpl7pPliCDsPP/dqSvOj+wN9Gqy9dpxe6gvloPTYkZt3YIrBjCUSWi+zlwlR1GcvQhcdDwOYDHJBkWd7LA2cOgbhK19s6SbykrOutH+/LJRZXaZF1Wg9l4d99G+UPAO3t8cWYP9xkadoqWCqcO0tmuepUl5vAH6Ipw0r0fq4J3M3opppr94yvxJK99zT17R31gQPuRPxh/SPyNRg0Xja/GvCowzuaW4Jomir/l78Msa9G2UccXraXh5c4r8jJ3Xb6S2CLA+6inKsKvdxuwla/lCXPY6/v2kvC/SxgeJaEj0f1YrWMRZYfZ9chKhdva77Uhej37xxR4mnh9OZTfftMcp9jqenu+SW/pzgryK3RTFJsRT16SAbtWfS7fo/v7mcAWwsV4fIBFpw3UAeWaCTuL8fBA65Q3mAd34Vlzxtmn+YchpHTTVgqFEokElzk7V/iRsWv6WYsgOwwOr7HycdPHQJLTdqtwVd1zs7JgrUE5t80DIOlhT10Sv6dVw6JwPJncEH0zk3WfmwcpvOHLf5kE3hRuIdZ4TktSfGBbQdVh+eTpISq9iskXsdgIrb6Q7qRcmWr90Z/cRIn8UFUKLdg7UV3qSnicvxtSTutiWi0lEWMmTzqgL8fRSXT7afB/37UYQ1zhPcLhkBMNCLr1UfavHNZi/y5lD9fpl/XZ/qYInx1yUXWRNRfLTGN5+73tQe2aGYYhInf41XYCnQftI1Fz6jB6FmxYgveFcDOWfRJXjnWiEyYjYI7h0b0UpbJj8Sv5d0lqFDr9dho+XThn0rWaXlZ3o7lASzbs0+X4YqYT1tZfYP8uZ7ehaWzjGU9Fsq67JYsv66PFFDe/s6vjPnLllFkeXl8u4932cvwxJIKbBdG10bTZ92sItwF85ks80q8qZz43YXnWkZrRWF8H6di/qBuuctESFQYTOwfv7E9S9jJ+suzOos6FxftyLx6jxY+v4e1o+nCQTdcXr/uAJ5ZYnGVFtofLbllxTu5Vw6xyIrr94UlFRP+/D8VNcKVgtqilcJ0epnKxa/jD6HO9ROmwevsd0v2rnk/9Sjml9ntYDcO1TBBucO/3Etnf0JvCw8ZoWnCejQl+KE299o3/vBfXvA0oYfrvzdSjJWSNfYVzDfkugFUKG+4LurTVOkVZb0wHTfIF8Of+ROY8+4wCIFKZF0ps/+Bm7gfJomXNowrC2thW55yBdWMr+OTAyjfsWi6aSHlyA/n5fHvqA2vZvCuVYH/lOTZe5+4gMRPuBfLhgf5/ngJrbN+jw8Az52kXfY+cXGKTb5dhItSfN+VrDsQsJVI8wq01MQZvcs8bQFJmpmJATRel2XQcPnLsnOwiI0zmGTPE6FhGRZxlS6/L5fciuXP9DZgVYZ3ZWHcwP25ZJbX06P3sTKgevgCBp9CyOvaUyT5GWsZtbnV0B+VwVrn93loBvfowuwzJWpHYt+j6WQn8Pvfn/LmbO12hmjjlAjOpTFbjWT5aZEC61bK65TrlemzA3ghvFG5NAOBFb80hwzo5fb7+XAfo8BB14ODSjpt1W4K62ckq4SH0endr335yII86NW8Z+U1yu3hPX7RAMvE/W+eIolmn6U1L3ZtuHeAlhIv2/dlNCCsRFOovypJW+Lnf2cX9+h1//ohtWJ5/X2SgrKIVLHEylcVWGD+YM8o8XRGOqP7MAus+H5+VPDL7fXpiiCshq3T97r5wiEQWPH0w3uHUMy2K/dnBavcIIIc+rO+FnP8rZXAKjjITByN6DnsnWPnFMdpXDgAa116QJjVPfo021LAfxmss3jsP9fNwKFWApGfxYDpxKLaR688xxUoJPwcJ5W4E/Byec+ICCw3v68O3F9Qh+UN8oJotDBsvkHD2KC4n87uQ1rmaTHx1gGVvecB3bVE5Rg7hP+nYCuCl///FdBu+7HfOYABoQd4rpF96BN/dp8f4FSh+/A9jDnud+NOEH/3r0Mostz6ugldxA7MogN+oOBGApKVZPUSN/ITAzx3M4djPRHM3kV0Fo1wns9gPhXVsG8YGUar2xnAKhm2EUUzHjqkrwcLe63A+jMRyuwCzA9zrCTtVDOqjx+LOsyi3oFx4KuhbOo5l38NC7R6V4HPvhnu8//C/VVyaIcrwI/D8QfxXvpz+32wpHXTLjcjS9yJJe+72117NQisWyOraCECq0grUlpgNUr6MCAJIzGIDnYs4/tpYnPPZ2FxdfIUPF6Z7w4N8pM5iMaiO/thwTu/tYCvRB3FsArbZuiQimormqFDfwI4NlxDmdoo79TOw5JOjxXwXrkY+GHolPMuE+/InyZZUdoo4Ll7B3xuTvXN38VLsHx3eQvVTu+Ui7xqH3XhDyT+nhND0Jb4s7w0EvCFCawiOz7v2FelfGlS4vKYDTxjgNfwUA73NIZN2Z2ac4flDcl5mLNqkdaHPFhpyK53LDQiL8VWQdUZzqlCrzPnRo1iUVaMBzHLa9kGBi4Anwa+mRJdefPNAgec/uy/TuIk3sz5fBXMYnlPjgPQKq2rxJsDqDv/CwKp0ec9njZAA0SvGueRbgedw2j+b2JpINYs4T34i7XmgASgV4Q/5HDueATVzLHR8sr7R7I3sxc92gN4Nkki0PoUW6Mk9+sN+cnYQpYmw2fJ8tHyDWHEXylATHiHc1kkTMtWf90ifSH5Wyi9DC4NW7Ugi0UjnOsmLO1XEVazJvAX8g1z4nXphwPsW67FfLCqPdZtfy9/FwRpjfJPF8Z9UtcN6TAKLLAgp70+5LwfxEeiBn0QHVOeL/gjBY08Hh5ycdXAps93CY3IHBLn105bNfrtIBsdn35YD4s+7j5xw4bfx40Fj/h/W+K660LjH5glK08R6Me9A1tAUR3Asz+/gGfv7+1lkdjK69lVsBAkD1Ksb2psxcmq7X8bNp0+LAPprmeGhjX/GNgy7LJNHTVDp7r1gISVd4IXpBrTLCmqzgxj3Uw3hrMwv5MHpyHImlgC6y1p9WtsDGgg5M7Zx2C+d39jeBcbXAgcVsC7XwMeB34TjdbLSo2cgiS24aoBDsTvIV8LrB/7EfKfFvY69ggWT2qlAoWJn+eG6Dp6bQsaoX35J+Ywf1B4V8rY5vu9PoqFDOrqvR7W3GNNLMjpjsDllMOZ1Cvcxtj0YHMAHaM3Ik8W8KIV9UIPI37tC0giHU+XdUL9OTw0PNVo5FoZUH36P+D52PTOvCF8Ho8XWF718NzLXDeroUz+g4VByXsK+KYS9BmVnMvzUcxSl3fb5fdxObBbge2k92V/z+gevU37GBa3rOyzaR6moadCG0aBtRzwrRJ1xH5d7yExTw/CijXB8K78GkU8m/xUU4Nufbwdm9Z4CZam6CJapw6LvvYJLJ7TSWFANoxtRqPgdqDs718FS1R7e46CIHaov34Az8FF4z0kbg159hVzKXZF/Q0DGmzdmOE7WcWsm+cymFWR3d5/123fMDaWccO/KfAaEpPjoPDlps8EXhk1LkUrbH/xbqZ8S8RnKu5PNZVzez16kT1I4d/DKPWI0BkOYorOLbNvAJZgOB3ed1A1bEveU4QVzJqXp5CbykJyMWapy+vd8Xu6nC6X8Jf82XViTg4i+F2YZXyYFzWNlMAiGv1/EQuKODGg+/FKMQtbijwrermLxCvmJQwuEJ3I5jl6hG2PGPxNzJr1T4pbiRXX7waWpuO9DGbqu19uVLWatM3Iu/7MHuA9VnMefMeO/EUOPsZGoM744pnbseDGRaz0lcDq4sWtA8sCXwgdQNHZ6j39RAP4QBgpFxVzp921gDn0itHAY83MAu7DfLLuo/jo4L5a92XY1PywWbEeV1UaeSE32Ts0ShYlvxdfsVjGUCC93M/3GY7p9RkjsCCZmjsU+GT4d5FJgWdhkbqPw8L/jw9wZOHP8p8laNREtoyHun4rsA+WE7LIAKw+vbIWFl2/MWRtR01VSIyIiPTz3MVwTten8VhplwDnMBxxsWaMwCIImnEsseuHo84oz4pXCeJqIbYC4uRQKQadfHoc+V2NKt4QXQvsjUW5zzPmTrs638TCoyzBYKbBhRDG7BG6F3eLOBZbAT8yvlij4qczKzygE8PmWbqztmbFGenHgbcw2OSbcedbwaxX1yMH91EWWbOCyHpPwaM9t2KtC7yAwSzkEEIkomRU8EVqtwN/ZXjj7Y2swPJ7qWNWrJ9jQRsnoo6gn3uN81n5NOR3gK+ROCKXYTT/5fCpjm9RUVzmrRvGg8g6B/ggxftjNYE3jmAjL4QYrGCsYJkjFo5K+zJKAqsSjehfjEVdfRM2nVGPFLF3anEcokq0+T7/npsr61isk1dhS3JfFx2zUoLnWMdiJoGsV+kXd6LkW7dMhGd8MraooShLlg8ynkeSY1FiXgjRLz4L9Gfgu4yIL9bYCD4ofzAbAN/AYmy8F5s+u30aHVq7h7oacHA41vrR92olqZg14JdYWpaRMa9mIDobwNrA28OoqGw+Q/Go7TGm73vgoRIqWMT3i4BVKcb53H2vdsdiDMkPSwiRVXtYDe3hG0lWLw9tGzM2og/KV1g1gY2wKcMnsXg4f8LSGvyRxFfpKiwg3gpYqpsGsCGwORbocWNseboLmkqJRu7u6PynlLAQ9pwmgCOBpUt6jT/AEp52+9w8d9d/saSp5xTUELmldzfMgqZpQiFEVoO3WmjTPgu8jyG3ko+N8MOqRg8NYEks79a24f8fjb57F+bbsnQQWZ0ePiV82G7JuDgSXCJ5We/B4jedlyqvQVLHIiJfik05V/o4Tg34Gba4YfMCGiQfVe4cBiE3SdQLITI0GFSw/KdvBxZjiK1YMyHadzXqFBokfi+NaFsTWC+IK99XD99LR9UuEz5vfR7wL8qfz2kQ5TMXW5nyyiBqBu30Xg3XcSvw0kjwNftojCrA5yjOguUBfvecQe2IEKKYgXEVeBDzcx7qkA0zqWH0ZI1xR1eNRt+NlJByR/e8Y2r1e08LgOPDp/xhFmV+KJufAqeRxE0b1OisGa7nCMy61m9IDU8R9T3gLwWK7CbmhwWymgohshVZFcyv+P5hFlkaeSblUJZQC9PFrVfXAtcg69VUjGGLHa4liZtWNJ5G6STgDxleh1uVvl1QHfZ3ZRcsRZWCjgohshy8VbEE0OcyxHEdJbCGtwJ6h30sI5jDKYcRUQNbqXcols+vaL8hDxJ6OeYc7mmeshRuZwDnFyC2va6tyvDnQhNClLOPq2Ap8P6X6vcksETunXUtqPsLkPVquiKrhln7Xoit3CvqpY3PvT+JyTvLc7sV6ysFiW1vANdKiS4hhMiizRwDbgNOYUjjYklgDaeyrwIPYassqrIgdCVMZwH/CC9tEcLUn80TwGEkPgWNHO7NA/VdR77JoF3MLQZsobZECJFx+wLmfrAM5jt7PUO4WlmN4nCKhCpwDIOZ6hqV8vsctlIl7ykuP985WLDbvPy/XHg/RZIyqYh6MVdVSgiRw6D0YSx+5e2hvZbAErnieRC/CpwZ/j2hYukKXwZ8H0kk8iJMz78n/9Uw3vj8GnMQLcI/aj9VKSFEjmKrggVkfpgh8/mUwBoePHL3bcAJDPHKipJQwaL559041CIxR85izsXjHVgQ0yLqiNoQIUTebdpTwJcKHBCrcSSJXTUTKlkNeBo4CHgETQ32K3yawM2R2MpLFFeAy7BsAUWMvtwn72fRveaJLKhCiLzb6wpwKolbx1D0fdUhL/Qqo2/J8UCST2Or365mRDKND1iwVoBLsGCfeQuf/1HcKju/j/9GAi8P/LjLoVANQoj8DQz3Yr5YWa/AlsDqIDw+Bjwe7mPURtJNEp+reUFc/Sn8X+IqG3H+GBaXipxFepErPf0+riCJj9XMse3YGcvzmaeYE0LMbHyx0GeAWxiSGZxhFVhNbDXWt7B8aPcE4TEqU4beWY1hvjR7RuJKUzLZUoQoWH0A9zSOhfKAYhzrhRAi70FxHUt7NhQzV8Pug7UScBWwE7aqzqcM60MqtDzJdA14FMtXtwfwd7KN/C0S5hRwjr8OoCF6BLiyAIElhBBFGR5qwEewmYfSz+YMu8By/6S7gFcDr8JWG3iC5mHpWJokJtAa5hu0FfDNYIlQpPbsccvVJQWIkBsHdI9jBZelEELk2U9WMJeZ7wzD4HEUllh7SP0qFitjeyzm0MLwMCZK/BDcz6pCkkrleMxqdUe4L4VjyJebCjjHnAHWryLOMa5qJIQoAHefOQtzgRgrs8galRg2nsy3hoXUfy7wAuDWSKTUKY8VqEGrn9UjwIeBbYGPk1jmyiwOR4UixM8oPkN/p5YEthmx9kQIUV6jRA1boHRRJLpKydiIFb5Ps1WAPwAHA88B3gOsknoY/r2iRaBbqwjC6hvA14E7wz4PwSCrVXEvbBFiZFTLbjaw6ojfpxCifG1P6S3nYyNY8I1IQF2DxY36FvAK4BBg9zaip5ZT5xCvaqxFI/x/AV8BfpMSVg3kazWKjPoUmoSVEELtTopRNunHK/IeAb4G7I1FQv8tSaJkn0JsRoKr23AP/tuJsMUirxa2uzGn9edjDuynBXHl4m5YVz6Kqdl7RO+rCizA0jeh+juUVgB1hELkxNgMuEf3dfIwB+eGbRnMmfxgYF8sVlFlkgaoMYkorYQt/bcbw/Y1bKn+k2H/lsB1yGI1U1h9BO/Jw0E8Bfwn9Y4Itf9xPRl0eBnVSyGBVcBL7iKoiTnJnRe2ZYGNgLWwVXxjwIokviWQ+E214ynMof5yLEXJBWHfNW3KuxK+q5hWM4cFAxrFVwo6x2wslZMYDrxe/B6zqOdlyWqGNm9p4AkGEzpnDrCEHrmQwCpGaNWjRsYtTo9iwTz/Dvwk7FsOWCdqFLYM+69h0TD9jwC3dzhnnC/RRZWWtc8MvH7tBCyGxW8pspMpQsTX9JiHlgdzFnETwFLAs4AfU2x6Ez/XasDWqfdRCAmsAYkt9796JGzO1dPsbLwDjX26xMwVWN7Ib4xlHSgiUbcH5Fu2gHM8QmIdFsPFrBlwjytQXDw4IdqOsGc6LrZiR3MXXb6NkQQ0bbcRfj+BwiyIBA+EuxuJr14Rom4TzHLWzOk99/p9GeZbmFdSaZFv3SyCQSzy8JmDPUkWEeX57s1WdRJpxlQEk4qu5gAaIzGa7FCQAHGBtVVo9Cdyfs81RTi8zC6gLgLsglnLilzQ4zMRe0QD5jy5W9VJdHoBhJjJQjrvd6yJRelfiSTYbN73s1NB5afFGsOHDxavJsl12syp7jeALbBFRI2CBLm7aSwXBjZ5Ciw/7l8Lak+EBJYQGsVH71gd2Aw4imTKMK/GvhE6ljeEfXl3aOerCg3toOKWSGDlea4a8A6KmzHx6eo3YyvB6zneYwWYDzwsgSUksIRobQjvIn8nbbcQvBRbTZiXP4h3LPthq7eKcD7XitjhZbGCBhhNLIsG5G/Bja1X7yBZjJFXG1LFFnr8SwJLSGAJkTT0AFdGo+xmju9ZA7Ni7UZ2UyWVlLiaADYEvhTty9Mq8TTJ6lr5KA4XFSxW3305CwO3qi4OfD6qO3kxFgYwbwZWJl/rlbMA+SIKCSwhFmn8xzErVt6jTx9ZfzK8d1n4LjWj99gdiE/DguQWYSloAPdq5D50uOXlUeCKAp6fr+g7CgtsOkE+ISJq4X3eAngPSaq0vPB37jJsmnBM74GQwBKitZO5oaBOpgFsA7wFm8JbvEcR5L9ZBZgbjrs0cCa2airvjsWtVf/BrFhV1LEM4+AC4BcFnqsBfANYMwihLKcnZ5PEnDsLWD517jy5TtVJSGAJ0b7hv7QAgeUj7DrwFeDIIE48vlqlh2M9EUbOywJ/AV5ZgLiKy+mvwEK1I0OJi+TfAI+TfxwzryNrA38IImthOG+tz+OOhWPNBk7HLFgTBbwH/s5eWFD7ISSwhBg6riNfZ9h2IuuzwAlhJD9B4ptSIwleW4ka8mr4m09D1INAexPwNyzuVRGdil9PI4g6MbwCqwbcQ5IzNW8/Op/K3gj4I3AESYBnSAI5V6Y4houqGkkKsreG92DfcLy8Vyz6+3ob8I/onRBCAkuIqEH8W9ThFBkM9KPA74CDsFVP3tl4iqVm1Jg3SDIFjAEHAz/Fplw2Ikmsmzfescwn8d+pqyoNJS5krmXRwMp5DjAa2GKMU4EfAgeQ+CXG9b4SCan4nXVR5WLtE8BXwyCjqFhbXucvxhYLKJOBWARFchfqZGwV0NOYX1RR53Sn933Ddk8Y1f8sjIrr2NJvX3K+bth2BV4AbBqONUFruqYiBFYlXNuDFJvAV+TDnzBrUlH5JKuRUHp52K7F/MF+BlweCa30YpANw3u6J5ZE+kCSlYOVARgNZMUVElhCtMFHu/cDvwVeUuAI2IWWdwyrA68Om3ND6GBWwAImpq+9OYB3uBE6sUtIrGkSWMOJ171fYale1oiebxEiqxpdw2Zhe19U78exQLZrA1uH+r5Jmzpfp/gwCdVwfRdH74UQElhCpESOj+JfSvFmfu8Y3K8q9kHZOPqeT+E0KNZiReoavFM8O9onhhOf7n0M+CXmz9couG7VIoHig5u43m/d4bpji1XR4soHFj/AVtKOoZRRooMKF0KjePgJcAeJj8gghF7s5Fuh1RfLO5OxAb633vlejE3juMO+GP5BxtkDEFfpvmgsVe/d12qizbvgvlmVAZVXE/i2BhlCAkuIyUfxVSyi9XmRkCjL+znVqqqiy6qJTSlRousS/Q8w/gT8m2Taugz13kXXWIneBReh9wJ/R6sHhQSWENMalf6YwTjKDpMQrQB/1sh95Oo+wIkk1lPRWWBVsHRUWj0oJLCEmEajSRiRXo9Wxk02cj8bC2sRp+cRoyEazgduV/2ftJxqwH+x8CgVvQNCAkuIyXFn33nAd1KiSyRtRRN4v4piSipDWP+rWGyzjwTRIKtMZyF6ErYwQNYrIYElhrLzKLqTcl+Us4PQUuO5aNn8EriTwS0EGIa61MTStgzjM66GAcZ1yELZrnzGgCuBH6EFHkICS+TU0BRB0cuefRR/B5bCRs6rSbmA5T18L62RtoeFBQWdpwHMAdYZ0CAhCyFaAd6D/LDS74CHSPkg5nuFBmBCAktkzZIFNS5LD+De3M/o88CNDJ+lJi9BXcPCWNzAcPrnbFqQOGkAiwNbDmn76las32IBP2sovpOXyxjw4VA2Y8h6JSSwRA51ZW9aI5DnMVoEeP4ArADNqKM8nOLys5V55D4G3IVZr4Z12nSngs83PsTP3B25P42FLZnpQTQ9qOgVwCfR1KCQwBI5jtKL6mAXMphpCh+t/hX48gwfxXtwx5cC/0sJ4GHi8YLPt3CIn7lPhY0Bh2ArRseGXDT2U/89FdQbQzsw0wddQgJL5NTwNoE9IrGVl4gDS5fhjf0gGtYq8AksT+FMXLY+HsTlZ6JOdphG7m6JnIvluCuyvdtmBN71Braq8GDgamDWDBNZnkT9VmBHLLm5/DKFBJbIrbNaOjQ2eQosDwfwbGA9BpO+w5dj3we8nZm3omo8dKh/BI5neKdF3AKxUc51Ns1mI1AH/L27J7yLvw11YmKG1P8xLN7VXtjKQW+XhJDAErnUk3WANUl8lfIUc4sB2zK4yOru3P0j4MwZNIKfCPd6O+aHNqzTIl4/ly/w+r2ePgOYHQn1YRZZNWzV3AHA50h8skbRkuMrZGcBl2L+preTTBMKIYElcumsmsBbaM1knzdvZXDThN7gjgGvAc6ZASLLR+43A/tg0yPDOj3queu2BJYpSOzE09uLjYjFw9/1hcC7gWNJcgOOkjXLV1BWgK8Cu5BEtS/jfSqMhgSWGCFxtWQYxRZhUXJz/LOwaUKPtF40LiYBDh1hkdUI9zkrWCm2A25huMNUuCV0x+hZFnHOOrBEKMNB1ds83gOCsPoMcCCWGHoUrFkNEn/D+4BXA0dFAr2s97YQMdKMhc83hRdwnMQUn/fmptxtJBRzZ1b4PC6U+URBz9jPc3rqOgZpDakAP4zqe6PAOp/XFr+3x0X3PMzCwK/9hcDTQfQ0Cqy3DSyv3wqMXvJwL9uVgB+0ue9hqfeNVFv2V2xqN+7bylz+B7a5hyL63O1K0D748/lxAdrD7/shktiMlSJvUgJrdPGX6N2hkypaVHjj8bUSPOdKJLQ+kxIowyi0Jkhyzt2LTYP6M6+MQJ3dIozymwN4Pl5vf4sFHoXRmtKJBcgh2FRacwD9QBaDiluAd0XPpzYkZf/OgstbAksCS+RgtVkDi4HUiDrkokeZdWD7kogsf7n2wwJwxo122UfxXp7xu/o1YN0hGLl3U2eXxJbVF2lxTW8u7k7B/LGGXbh2GnAQROSnsXhjXuZlexcaqUHFfOArwFKp+jMs4vZtElgSWBJYwz9K/dmAR6beIP4TWxE2VoKOKl5V+VVsGiptwShTB1Nv8/wuAp7XxvIzzB2+TyOfNmBxlRZZXwzXNWsE24m43myGrbhtN2Vaprr/NWwhAkM4sPBrPWpAAmt7CSwJLNEf3hEcVhKzv5//6yXqqOIGZiPgGMwnpZ3YGqdYP6C4Y4lFxtPAH4Cjo/d3bETeH7+f11CuqSp/9q8eESthJ3Eb39deQWiNd3gPiugf0nV/Xmg/dkm9w5UhreeDElhbSmBJYIn+hcPuweRfBh+jRrAGzKfVV2jQVNtch4utP2CrkiYTPlmKrnrY2lkMbgFOBjacRCSOgrg6INSTMvnFebqhBcAmI95epd+HzYHXYT5+nabrGhmVcZ3WKcDJ6n5tiJ+B1/W3F9zverm+TAJr+gJrDCFaG8gGtkLodMy3oiwRvJvh+r6C+ddczeAjjDeicvPQEjeG7YvYlOZeQazuHcTX7DaNe/wi0+YljgO7NjuIpPQxb8aCJf4siL3Ho+PWIkE2CtaTCWBVbGowXU4Nph8YtxI1rJUM661HRT8biy/2EMXm9Sz6ffCk4P8J26+AfYP1aD9stV5tivofvwPpd6HZxgoVf+de4ALg78D3orrv5xyFej8xgGdbxaYIf4TicMmCJbruqFwoXEi5VwHdBSxLEjqhbCK1k5/YRsBOwDtCZ3sNiZ9Ov9v1QXS+B4uAX2vzvo7ae+LPf1PgTsq/eq0Z3q25I2Q97MaiBTAH2AH4KBZL638ZlOk94VjfAnYFlhvhuu/l+ROK9TP0/v2jJTDOyIIlhnYEWgV+FzqCSrcVKmcLljOLJJBkpYRl2EiJVrey3Bj2/y36vkf93iwIsAYWP2k1YGVsmnEi/P9JLPn03eGYjwB/Dse5ps3IvBZd0yjmkPM6sEGwUnwiiJe9wt+3CFa8O0Jb15ykbo1h00h3hHKuZWBhqoZj3UGSz3JVbGXuLYx+EvF278EC4PKwfSiUx6rhWW0QfrM68CiwFrBKeB88ddWNwLVRef4h/P+RNnXfA7+OYt1ffoCiWUhgiR4FTCN0VMN23WW9tnobi0sl+tsN4W9XZyQ4qrT6TYwyfn+/CFuaDbCp0rILkJnQttRTddSf331hy6L+xwOK+giX5RwsW8AgWKCuUgJLjH69qDN8PiyNSUaEaT+StC9Qs8P3Gqnv12dgfU0HifQyuJnuIqk32pRvltfnTDBzSdfRSptn1KTVH67ZZpASf7cxQ+q+WzyXx9wAoDiLkpf5NjNscCCBJTJnQkUgK8aQddrt6q13SPUejiWKe3bdJHSvz+CycpGzSdR2VAd0br0n01TEQggh8SpE+QVWBVuRPKhE7J4YW0hgCSGEECMhrurY9OA7w74ihY77dm6GhdloSj9IYAkhhBCj0Fc3gRMxB/c6xa+gbmBuRTvRnW+jBJYQQgghStlP17E0NW+iWN+rGPe7ejaLLj4QElhCCCHEUOHZF07BYgBmmWmgF73wAizLRxnjEEpgCSGEEGJKPK3VuliamgaDczJ3S9qaJEnV5fAugSWEEEIMJRXgCyTWq0FfSxM4DlgKWbFGWmBJIAohhBhFxjCL0b7Ai0jSBQ26z20AawMHMFiLmgRKDrhivhW4LtonhBBCjAJuKVoS+FgJ+7gm8IYgAtX/jpDAcp4OmxBCCDFqfXMdeCGwA+WyFLlu2IskQbesWCMmsKSahRBCjBqV0L8tDnyCJOZVsyQbJLlgX49cdUZKYHlFWx1YI9onhBBCjEK/3ASOBtYjCdNQKdE2Fj6PBbagHP5hpWMYkz27wFohiKy7o31CCCHEsOJ9WRXYH1hIeafgJsJ17QT8Cxk6RkJgOU0s8aQQQggxCsTTcM8HlmFwgUWnc60Aj0SCS4yIwFIuJCGEEKPK42ETM1hgDVJZL9QjFEIIMYJUGI5pN+UlzFFgLRjQA61gDoD/RnO/QgghRgsJlyEniym2DQdw3R6iYZdI6QshhBBCDL3AapZA5DylRyiEEEKIURJYzoIBXvee4VNBR4UQQggxUgJrkHPEK5fgGoQQQgghMhFYHsp/RWDbDMVat8wC5uoxCiGEEGIUBBaY1WgOsOyArrsJbIKtJGyimFhCCCGEGAGBBTCfwUVv9WnBFfUYhRBCCDEKAst/90xsmq5B8asI3bF974zEohBCCCHEQAWWi6mNsWClg1zFN0+PUQghhBCjILCcJ0pwD6uHT60kFEIIIcRICKy1B3jtbkXbG6ihWFhCCCGEGHKB5bkAn5MSO0VSC5+bAGuhlYRCCCGEGGKBVQHqDD4Glgu9WST5EJWTUAghhBBDKbCcehA3g6QePreWwBJCCCHEMAssFzGrMfgVhM6a4VOO7kIIIYQYSoHlv3kFFsl9EDGwHPfDOgJYA7NoyYolhBBCiKETWAQRs2WJ7mMxzJqGBJYQQggx8hQ5e9akhxmybgWWO7jPAbbqU6RlgV9PE9hfAksIIYQYWbzPXwrYqQANUglCbhlgm27P1+2FeZLlLbEpuQblCI1QAQ4Nn/LDEkIIIUYTDxO1bNT/532+MXqIVtCLBQtgfcrj4O73sAUWOmKQPmFCCCGEyAfv25ejOIOKn2O3XsVJtyxVsgJ3E94z+7wvIYQQQpQT79u3CjqkiIVtfvwVsIV1zW4vtlsld2jqxIPGLWkvL9l1CSGEECJbthuAqNsJi/05bVHXjcCqhQNvA+weRE2tZKr2hcCSJAFIhRBCCDE6VElmq4rAZ8mWJMm/nLnA8gMeHFRcmZIr+1zsasB6KC+hEEIIMUpUgAnMsOMWrKKMPE0sHNQ7wzkznyXzG7kgnGyCJDZEGbbx8PmNcJ1jqo9CCCHESOBGk92AhSQhmorY/FyPYgamSpYiqxoOti7wJGa9apZs82u6B1g+6wIQQgghxMAYC336abQaVYraJsI5Pxiup5bljQEcMKAb69aK9cbUdQshhBBiOHGDSQ24mlarUtFGnIexkFA1pnBFqk7zxhpY7Ku3kQT5KitN4HnRv4UQQggx3AKrCayJBfwchJ+1+4AtBxwTBF7f1+BmsP0op+9Vu3nS2zCHNE0TCiGEEMONz0Z9nMHOojWCBnoI2CGlkRZhuhYsgB3pMeFhgVSDyFoH2Ddca011UwghhBhKfBZtDvAyBhslwI02ywM/xtL19GzJ8oPNAW5kMPOevTiiNYErwk0rXIMQQggxnLj16gjK4wPuOugCpuGLNd0bK/P0YDuRdVDqPoQQQggxHMTO7TdjlqyyGHkWhs8P9aIzYuvVLSW7semuJvxVuBdNEwohhBDDhQf1fD/lNPJMhG2rbrWGq7EjGS7rVWzCexrYLNyHpgqFEEKI4RJXm5VYg7jR6b9YKh2PGToplfDFMYbPepW+8QuRL5YQQggxTHiffTblNvL4dZ0VCcMplSPAcQyHY/tkImsceEYkGoUQQghRXtxFaQ1sJqpBOTPIpN2S3hSuf2wy1eg3Nj+IlDLf2HSU5RenqyyFEEIIMVDcGPIjhsNFqUHi9P68yUSW7zyP4bZe+U27QNw8PDSJLCGEEKJ8VDBfpgoWtf0phsfI49d5O7B4O63h4uo1lDvnYC9WrLPDvUlgCSGEEOWjCqwS/n1uEC3zgxYZhm1+0Bvfb3djADsDj4QvT4QbHPZtIbAA2FMiSwghhCitwAJ4xQgYdz7mywndoWw1LAL6qiP68G4A9gAeCP9XMmghhBCiPAKriS2w2wHL+VcfwvtoAouNRTdVBw7DrD03MXrRz+tY0NR9gB9gVqy66rPIiIpEuxBC9EUjfJ48Sp1Cel9lRB9e2ZNVzzTGMnqejQFevwt1X0ZcLeh6POxIpYTl1s+1xdfYyFG01jJu5xoZlGc/19TIuX2rpj6bBQ5Q25VLXW35SFNjsEmdRYaiUgw3gwokOydVr1ZMdULD0IhV9c6O3KBllMpLz16MlAVh1Cu0Rj2DbzCb4fPtwPLR/7sZrVeAq4BbgWsiwVDEqNqtVM8AXhqufywIrnOBy8jPkuXlty6Wn+veLsrOy+3aUHY3R+XWyODd8GtbGfgocF8f7+gF4fqeBp7I8Nn6c9kf2I7E6tgLy2EuFU8BvwCu7PG5+28OATbt4pr8e3cA/wBuDOXlbftEhuW1L/CWUG9mAXND/WtEzz2v92x3YO/w/H2B0leB/6lNF0KIRQV8BXNgzGK1xreAjSKxkDe1sJ3d5lquDh1QNcdzAxzeZ5ktAM4Etk51aP12iASRkMVzvR/4GrBShs/Wj/FHsl0x9LZJBq3TvaY/93kN1wLHA6tnOFj2+zklda5Hor/lNSivAksBd7a516P6KG8hhBh5gXU9Fg5kQfhcSJKdfLJtATAv/NstL/OAEwoQWe5btHE478Kw+fU3sdUvlZyuw0XM1tE5x6PrmKrcno6u06//TJLYM9UMrm1DFo0PM51nuzBc3zxaAxzfD7w4IxHoHfLR4brmRdc40eXmMXrqwJEZCKxTe7im+dE1eHndDRyRUR30+3lRON/T4br+m7PA8mO/LHq/47biv8Cy9O/rJ0SunYUQg2Istc0icRaebJuNTVG4I+QENj330TCCr+dYt30Z8ZtJpjbd2d2nSg6i+2nPfstv1jTKbzawWPS9ifDbVwK/DSIrC8fSSo/Pdla4vrkk00N1bMrxJ8AB4fqyEK6zUtdXm2bdizcXNePAg+G4zR7LC+B3PVzTnLBVI9G1ehBr76R1Wq3fulZLXVue+PtzRPj3rHDO2eFe1wOeQ39TvELk3kALMWgmQsN5EnAanf1tvCPaFNgReB+wRCR66kFknYn5ZmXtB+XhTNbAfK+gdYWTj6YPBz6LTaPk5Z9CqkOvY35F/2lzTv//BsG6dBCwX1Ru48BWwK+AXcLzyOq6XcR9Dfhkh2fr51oP2ATztzk4dKr+XMew6MirBStKVtfnx74ynLOb4zaj798VHa9X1g2fXmf/C+w1hSjbBrOYvhGLX9iMxPP/Yf5rk71TZcSvdXfM96uRslS5pe54LKXbhJpQIYRonSK8mcQfqBksFN2wC3AxScR+T+30npwGEL5C6wSS6bUm8DA2TdOIruH4nK4hniKMc4XOw6ZMpstewKMsmqj0sD6u269tI1qnIJvBEtENLyCZKvRy7XcqLv7du8N1eWqLvwxYUIA5ysfvw3VdHGOlIJDdouvl9lQQpb2G3/HyOjD1PG8nvynCahDX19Ca7uzhIK7jer99qgyFKA0yrYoysXiokz4N0GmrYdNIVwCvw6ZnKlGnvmFOwnACWCbqnJ2vYRareIR9DDblVqcYHxFPkurl06ncfHrnwiCmniSZFmwCHwjPIevrns6z9eubDfwaeEPKolMFnptjW1gN56/2sGXBeJtnWp3GuzArvAMHYtOMLjbqodw97cgwiBCfFt0d2CKqhwvD/V1Oa57cY9VsCgksIaamG98Xd+y9CQuLEId/2DUSRFlbGV4FLB2OXQsN/3exyMNPkiyPX5HEIlcrSfnVI+vG7GAx+V4krhrYFN2zyT7IX6OL6xsP5z4bm3qrRSJrXgnqX7stK5HcyzP18mpg09OP0xoQdL+UUC0zXgZvDp8+Xf1PzMr4AxIfvwY2Vf88svM1E0ICS4hoFP9kav9SOZzLxdth4dP9Qn5IEq/pQlqXkh/JYCPNT4YvBPhdqmNrUg6fFo+vlLbqzFW171heYCENfpmqs9tiCwWKWHiRRb3cAPO9cpFfCe9ZFTg9vG/up+WO8OrLhASWEF2O4Cf7rguddVNC6NaM6/dYaMz3xhyK69i0zHzgY9F1fykaXTexQJYvoZwrnVz43YpZhWIL4KYDvjaPM7YM5lcWO5PfrNdkynfiytT+FbDp4zILrFr0rHcIz94XSNyFxbojvHOfjN7vJhbCYzWKm44XQgJLDB0LWXR5f7vNG9aFQcTsSOtKoy+Q7RSXd0wfIllJWCWJnu0d28VBAFRInHBPpjWlTpkEFlhwyodpXXG5eQ+Cdzod6HSfrU9jfiaIg0ZUxn/MUZyM9bDVSvhc09fkCwTKjPsNLhHes2b03v0MW5DhTvW/IInu7yIsq7hfQkhgiZFkA5LgiZMFV2xgDuTHYNMhs0iW298D/CESOVm8Iw0shMBO4d/uE/TxqOOvYZagT5I4Jzcwh/s9wr/LFBbFr3sbbPqoEXVO56ZEWBY83sWz3QL4NhZ6oBGV3d+ASyKRmyUe1HO6wW7jYKNlY4nU/2cNgfCoB6H/GswP0N/nBVgUefeprAEPAN+gdUXy27Dp40FasSrqU0WM4mCJMgn9N0Yj2cYk331OsLKsFAkBD2R5AtnmrvNpyPdjlqiF4Vy3YME5ia61gjmNHxuJxVq4r99RrpxpbinaMdzPRNQxzc7h2R4YRPFUscn2xEJIzIosGLOCeH0JFnagmmFZ+j2vCxzH9ONgucX0b5hVLa/ck93gOTEPSt3bPRQTk63fawdbRBLHPvsRFtvN32ePO/dtLBq/190VgDdh1uus8jD2cg/KiyiEaNsJ7kr+01nt4mDFaT662Xzqo46lB3lONGLPslzWw5zY6yRxgGJ/q/SA5cjU9U0Az0wds99r2jpVdvMxPxSmMYKPp7j+ThKY0q910x6vtV0crGYGz/bvmKM2ZJf65d20LvfvdftGBoNVv6ef0RoH6/ou3ikXxVuR+Nd5GZ7aR9nlHQerEommfVN1cWGwZqUtQ34fZ9Aay+x6kmnmQbSf2wGHoqlKkVFjL0arLuyYoTjpdQQYd/TpzfO0eT6yuGGfHUTM0m3+1q8Y/CCWwsVH1fcDX05Zr/zfFeDnwB0kPiK1yKqQV8NbwWIeeVqaTv5NROX5AcyhOLbAnY8FuMzaIjMRCaZOz3dhh2e7AubIvAL5TQFNVffaXesEsGWbepDlMx0Lz7XTM61Ewmc54Cu0+i9VgR+XuN1pRp9vJJnar2Ixr24gsSKn+Sbmm+VWrI2x3IVFT8e77+frsVXGsmIJIf5/h1/BfIXqWMycPEdgk1mw6lNsnawIE9G/bw6iod8BhPsoLQM8FBpttyx8IbKUVVKbC9QPp6wR/yKZ/uxHILSzYHkk9rWn+bz3CUIq/r1bcnZqY5nLyoK1sIfnG++/lSQqea/PdjILVr2LbUH4/GoGwrmTBevaqJ5NxmJYMNHraU2V0wSuIglAW6ZI7v4bT4y+DTa175arRrinSof3zJ//1akyu2AAFiS/louwkDErI38sgXywRDIC3jU0CAcDvyn4GnzEeiG2GijtQ+HXuCwWBLMBrBOsB1uFTtc7lGdgiYHXj6wdvYwo3fq0J7A8if9HE/MLITpnjMdt+inmDzYWWTqOBj5Ptj4icYdzAjZd0ukZbxBG+eulrAdumTsam46rZnh9vsrr28AXMR+qtK9KJXp2m4R/74sFkJxLElBz3VCuz87QShDnInxZD5a7+3KwYLn4WBWzlNbbCCQvs22BNSNxHS8KWBje5yfJ1m8tSzz1zXuDEBwPgupJEr/F8Ul+/39YbCz30doNm+K+lmLyL/qCl91CW7REEKOn0hogVwgxQy1Yc7CI6HXg3tCR1XIagU2Wi/CYHo63PMm0SJyP8MQ+LAsuWFYF/kxrrr5LQkewRLAczE1ti4W/zQ1CtRmNyP9NMlXXqxUrbcFq0L3fUCNl9WsCb8/AEjNZLsK39HDPm2JTRE1a/d/6yTVZ5lyEP6N3v7C0FfAOYOfUc+lnEJ61BSu+rg0i65Xf+8fDu7Rkh/ds8bB/acz/Mr62b2RQl6eLWxdPj57DzSSpoRSXS4gZijcOR6Q6m++n/l6UwPoEU+eri+MPjUUN9c8jIdQIHUw/00jVqFOJxcjjQYTeFz7bbf63R1l0GvMQ+pvCmExgzcd81Npt4yROz27leDqU05v6ECzTFVhHh79NJxfhWFT31sCW7/s0pgvV2T12YJ0E1kX0loswiw60k8BqTPI84+daj77/CJb0eZ0MxFXeAst/f3IbYXlvF1tcXo3wTNcj/2k6v/7NSVJ3+bV8Jcc2VAgxJOJqJ8zHKO18fHhODcRkAuvHPXT0vnrqpVEj7UJrqx5Hsn6Nf0xZe3q1FsUC66o+O75+LVixpePaMNLOarQ/mcB6ew/PdlawVnw+dawHouvOUmBlIUgGYcFqRM/0LW2OW0aB5VPbS2C+dY2UUOz2/hup9/+bGQ0apiqXDYDbUtfvn6+JvitL1gxEPlgzD+9AxkOj+V3MkTtOR9IETgsd2Xkkvkd5+xOc28Nv5mLTCLPbdM69iEP3m9gFm2KJI2P348zrx90c85u5imx8RPy5jQNvZdF4R379t2ALGD4eiaxNsbhDp5W0A/BYU78A3hFdYzvft1HC7+0eEstfuzq1GraYYvnovf1EGBjcVPIyqkUDuXVpTdZc6fEdi9/VF2Nx1x4g2xWxbuVcGNqIH4fnEKfD8kC4pwOrk6T2GYvEl5DAEiMkqiqRSKpg8Vq+EcRVu8atDpyD+UWdEtWXRo5Ca14Pv3k6NNSz23RSvV6nW1wWC8f2BvqBHo+3Ikl+wlnY9MEuGZdjAzgLcyLvxD9Dx7MTSdT0/8OCZf6LcgTLTHfCC7AFGDBzHIa9A34UW7AxGXdG36mH9/kk4OXR+1o2PBTD4phzezy4q5AsHOi2jVs5EuArAS/EFlf062xeiQZDsXX8ByQ5EGttrmeCxO3hK5h7AdF36wghRoqdSFbnTGaOj83uZ2ErlbJqXP0zPUV4NFP7YMX+Op4CZHYQCY1IOHjSWJj+VIlPWywVGvnYp+s0EqfbudPclgq/+Sytzu6PYqsce/ERmSzQ6FpMHgcLzILm4RJ8KuqfobOrkU0IiU4+WN0823j66TpaQ0ncH8q1F2tH1j5YWfhidQrTcAOT50D0QYVHP5+IyugdGQ2i85gi9Ps9lEWnrd8Q3p0lpvmOLRbq7jJYxPd2i0oqZGeh3RqzGs5n6iDJsXvBHVg6n5XUBQkxOtSwqaDXAL+n1SdoKl+H2K/gCWzp8ZY9NqrTFVi98PPUPU1gzq9LdXmt3vC/h9bAk01g9z6ewVa0BkttpqyCWQms1ae4X7+/Y6L78w7zuxl0yJMJrDf3cLwtg/BJd1a/i4RYr4KhzKsIu4nk7tPgF9Iaa+w+bIqsn3c1Lq+DMhRY/v3raF2hexe9Tev78V5B4ofldeUweo/r5sddOYijS1OCaroZKOLvPRyOc0QGAxpRcjRFOLrEvj8nY3GFPAnsQqaXb85HfhPBcnME5jPxXWwa4laymVaK88FtxOS+SZWo890Riz8T+0r5vZ1NdzkJPVr00lHn6/GELgwdfS9TDbVgIfo1sH8ksA7CIsT/j+JyxHnMpy9iCag9uvwE8FpsqukXZB+nC2w14HSf7Ubh2l6JhRCJ/cmaoT43yHYZ/hLhvN3WZ5/WugeL3VR0vj+PkXUktmjBE5+vggXd3IFk8Uo/1zU/QzHZAJ6PxWRrRs/90yRxsCa6rGOeQeFeLLyKi5p3Y6uie42J5474r4zqh78zvfSf41gy+muQL5YQI8Oy2LTBnV1YsOLRVyNYXfYJlqFeO7cscxHG1xhbY36BTR90M3Uz1sZ65eWzZcrS0It1YnuS6N8usj7Rw3H7sWARWX7mBitEHP7griAwq/S2mi7LXIRxTsLx6Nme1sezaPecxzOoe03MH6ffOtJrLkL//cEkKXz8vr6DTZ/1G8n9uIwsWH6tv0/dqy/66DdC/9tozWW5kO5dBTpd91zgRUHItos9NlmWiXuwqdzl1BUJMZrWLMLI9vt054N1EZbKIstrqYQOZJwk/9yCqEOdavOYT+kO8rweGn4fAS8WBOjC6NjX0F+qkbhh/2tocJ8K57ilh2N6B7RVqsyemqbAiq/n1bTGz2qE8qNPgbVhF8+xm2f783Dt/UyteN14e3gW8zK41nEs9lS/AusnUf0YJ0mV0819nZp6pk0shEmv1+bHPSKqZ+Oh7nb7nnn92ARz+F6ILVJpYH5N0PusivszLo/5Yvmx60G49lqn27EWrTkf65MMDppYOp/VU2WqNDpCjJjIihuvl5M4ctfp7Jx5XKojqGVwHf75UIZWjp+GEeJYD42p39Nr2xx7nwxGv34tz21z/Dd32bFUI4tY+lhrdNHh+fk+2OY47+2xs/Nr2zRDC9atwXL6upQY7hW/p89meI2+UGBWnwLrd6lj3tnle+UJz+9rc33b9igy0k7uccDdbgWW3+clba5vI/oPDOrX8902x+/XiuX1roZZecFSOd3aQWR5+/mVMEDz65PP1QxCPlgzB3/pvZE4B0sx8ZeoUYhDOdSw7PDfJYmDVc/oOvzzWGzqstlDw+PhJq7CVujckmoMG10ei9BpvIvEn6sJXNbD8Tpd6wWY/9DTwRJQw1aK0cXxvfzuIJnmqgJ7MXnOtjTuu/MpbFXjnOg6b+nymtLXdh9JOpt+6sjDWN7Hp6Ln2q/fSiOyJu4cnskTfV5rBXiQ/mPF/SY8i4uDWLu2i/v29/Nfwdr0pmDxqwbxMtZned0a6sp9od4+Hv2t2eWxvoLFj/J25m7gxgzfs08AV2AhFNYLbcREl9faqU7WI3H5W+A5mI/m6iSxsDxsw1dIAuxmmd9TCFFyfLXOx2iNgOwjrxcMmQivaoQ4smRhOZ0pxPV/U7ILr1LkdWdhOPAVxHNyvFZvQ19Gqy9ovCpVKwWFmKG4eDqT1iXrnytIXI1lsGWZlLrW5viVnO+512uv5HScMbKZBh7LaMurc0rntsxiy+Kaahk8hyrmT7gllsolC5+fSob3W8u4vqVZDLMorQisndM50gPVz0UD1YVkM+UphBjy0W4Fcwy9BbNg/RNblqyRlxBCTE+or4iFXGmS5EGU1VWIGY6PRD8ZGoc3pfYLIYa385+pg6QK2UZwnwwXUh8Jg9StSHxdhRAzXGBVgJcEgbUeMm0LIUS3QnYTLESEhJUQ4v+P9MDSQXy3wFGfEEKMEnOwlamoDRVCtBuJCSGEEEKIjNCISwghNEgVQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIkaYWNiGEEEIIkQFVFYEQwz9CEkIIUS5x1QBeCqwG3KoiEUIIIYTonbHw+RagGbb9NCAWQgghhOhPXL0oCKsGcDWwAmbVqqiIhBBCCCGmj/tcrQfcC9SBecD2Yb+sV0IIIYQQXVDBrFdzgN+TTA3+KiW+hBBCCCHENJkVPk8Kwmo+8DBmzapKYAkhhBBC9Caujgnial74fEfYP6YiEkIIIYSYPu5XtX0QVePh80Jg8fB3ObYLIYQQQnQprp4JPBDE1ULgUWCd8DdNDQohhBBCTJNKEE+LAVfSOjV4ZPiOpgaFEEKIEejwa6FTb7dpqirbsp4VyvR0Eqf2JvAbiSshhBBiNDr7bjrzMTRt1S/u1H5iEFULgAngEbRqUIiRQiMlIWYmnu9uAlgJeC6wUyS8muHfNwJ/B64I3/V2Y0JF2DU1zNfqncCHQxlWw/5jsZyDKlshhBBiiMUVwNLA8Vjk8OYU2zXA24G1IxEmS0t34gpghyCy6iSrBi9PfUcIIYQQQ9rRbwBcFgmoidDhp7cJzNLl37sHODoSV7KCT1/QroZNBTaCwJoI27YSrEIIIcTwd/TLAP8m8QGKBVSnLba4NIE/AxtJZE2J+7kticW3akbiqgl8MyV8hRBCCDFEeAe+LnAdidWq2eXWwOI1uTXr1eG4s9FKw8nK/VySYKL1UI63B7FbVdkJIYQQw4dbrtYGbuhDXMVb/PvXR+eSUFhUXJ0QymlhquxeHP4uC6AQQggxhOKqAiyLrQaMU7L0u9XD1gQ+gFljYmEhcQXPicqqEYmrK8J3iiirSoHnEkIIIUYe71hndxBXDabnfzXVlKGLhn8GIQcz2yrjsaxWxlLf1COB5YJ06+i7eV+LEEIIITIUV965ntVBXDUz3Hz660bgGeG8s2Z4uf+Z1ilB/3xT+HveFqX4+K8F3iLRJYQQQvTXyXvqm/PbiCu3oiwAns5QcPlx/wccFq5ljJnll+VTst/oIK6uyFnkVFLCaiPgvOgZrRi+I185IYQQokt8eu7Dk4ircWBv4ADM+jSRschqYtHJyVlQlAm32B1Lq1UvjjO2FfnFvIqF1RzgVOCh6Bp+i4WLkMASQggheuxkjwod+sJIOLkf0L3AkeF7x6QEVlYiy4XWadE1jbKTtYvaT4XyjOOLucA9IfXdrIgFWw14M3Bz6pmcFn1X4koIIYToAregfJpFrUnxKrbnhO99kEUtLVluPi32Dyz+VnyNoyiuNgWeSAlVfwaXk30i53Sy7hcDV6aeweNBbM9F8baEEEKIrpkdPg8jsZqkLVfjwIHhe28KAmhB+M53gC2Bu2hd7ZaV8/t/ge1TgmQUcIvQYkFEpWOExVODkJ0VLz7OGsAp0TkXRKJuA70aQgghRG+4VWg/4KlpiKujon1NzOI1BjwTC0Q6QbZWLT/PQ8DBqWsednFVw/ydTmkjrvy+z8lQXFWj46wIfAxbVJAW1Z8P1+WCVpYrIYQQogdx9TxgPq0rAmOH9oPC9w4P+/y77oi+A/lNFaanK18ZCY7KCJT9F1l0qtWnCR8G1qN/x/b0dOALgWtY1Gr1aPSsQSEZhBBCiK6ptRFX9dTnoyQpWfYOHf6CNuLqQVpjWb0F8yfKMmZW7Pz+6SEXAS6u3pESOPHUaAN4HbBUH/eYFlbrkOQ1dPHsz+3fwHYjIl6FEEKIgTAWiStfsVan1XryCLBL+N4RtDpfu7jaHks67FNbN2AO6W8Jxx2ndeqp3y2+zjMYzvQ6fq37suiUbDw1+Mk+BWQ19bxPCAI59u3y8/6IxA9PuQ2FEEKIPsTVBiSWk9hy1QhWjV3D956b6vjfE/avS5L8uQnchFlm0t/PY/Pr/gG2wq0fIVIkfo0rYFa/dqs165gVcDl6WzkYW61qwBsw61TsOB8HMP1wB1EmhBBCiC47+JWAX9PqWB2LqwPC955N67RgJ3F1IRaE8qDwfZ92+h3mHO9iIssUO36OC7CVcC4oyor7Ua2EhZ5IO7XHovSQlBieLvH974BZpmJh1YjK7QbMF8t/pylBIYQQoge8E10JS6zcLhXLQpLVgs8GHos6aBdX62AWFt//rSAcjkod61vhnIsBd7LotFSWKwxvAtbqUZQUhV/Xn2hv4fNyO5dFfaemI5xdPK+MTQfOi85Tp9WH7abwHGFm5nwUQgghMrOegC29/2eqg/dO934Sy9Vukbh6EHh92L92Slz9POx/Pa2rC38c9q8CXE9+U4VpkbVOSUWWi5iTaR+c1X3LHgFWZ/qrBtNC7I0k1sJYtMVi7qMkIRhqejWEEEKI3sVVBfP7+TPtLVf/JLEAPTt09N4hvy7sT1uuTg37D8QifrtoOD7s3xq4Nvr+f4IAuJfspwv9Ph4gmV4ri3hwAfT8IKLa5W10AXTyNAViOinzDsCvWHQ6MBbQD4ZrSItuIYQQQvRALVhDzkhZT7zjXQA8I3x3i5S4ekXY/wzMQuT7vxP270hr3rwPhv2rp8TYTZj1iyDy6qnfZR0rq1cfpjzKHiwI6/20TtPFYqgeymhZpvaHii1bS2NxtJ7uIKz832eQpBtS4FAhhBCiT6qRcGrn0D5OMi24MXAryXThXmH/CsDfIkHwjSAC9sEsRhMpcbUGZq3y719KknLlu2RvvUqLLL+eYwYsKNwvalXgOto7tcf79kqJsk7HA1gC2D8lYic6/PuUNoJPCCGEEH3gFpyjSFLYxOLqReHvSwF/icSVB5xch9bVgqeF/duRpFhpAh8I+9dKiatrsSnHLYGfkPhpzQe+RuLnlaXg8qTUdeBTkbAoUmT5FF6NRRcUtJsa/HLqebU7lrN96pl0iqN1ExYyA8wHTFYrIYQQIiO8Yz6Y1mm0hSRL9NcnWdn2KLBt2J+e5nOfqx2wUAzeqXscpRWj43gHv24QDb+idXrSA5V+nWSaMmuR5fd6wgBElju1f5X2Tu2xFfEhbOVfu5hXsbDaAAu7EE8Htouh1QxiueyrKoUQQoiREFknBOvG4yTOzssAV4ZO+b5o/3IkFqc68N6wf8cgCLxT/2IQE+sD/4r234jl0AP4UmRZWQC8Juw/ELOCTZDPdGGD1pARRYksFzTvYPKAq77/VW2EULyKcEnMQvg07f3N0v//WJtrEUIIIUSObBjEEFgE9D+FTvk2YKvoez+MOmyfvtopElfzgXdGYuzfKXG1bvjbuyMx8XQkrg6j1apzPYm1LGv/LBcy50ViM6+I5S5oDg6ip1PcL7+mb6Z+l54OfC2tiwsmW4F4F/Dq6P4UlV0IIYQogHSH+xESJ/Q1Q+e+OPBtkmm7d4Xvrk6Sx+4R4E3RcX4bdfa/J5ma+nxKMHmg0mNonTa7KOz/RPju/BxElp/rW+SXWseF0XYk03ft7sP93+7HfNPcWhULq5WAs+nsZxUfx0NgrJe6DiGEEEIUhIdsWCOIjp+SBJ2cBXwhElcvCfvXJ0nt8j/MkkUQUudHHf4/MKf4Mcy53EXAY9iKQzALVhNLcuxJhpeNxESe+Qv92H/HVuFlKUbcYrQmtmIw9gHrJPZ82nU2ybTlksD7IjFb73CceN8ZQRiDpgSFEEKIgTIHi9buIQxmhY7d41MdHL73DCzNTRN4AjgiOsYvok7+BmxacBYWaNT3PxbOA/AWLH2Li6szgzD4cEp4nAv8l3ynC/8VxFAWIiv2l7qKzisGY2H0O2xqdU50nOfTGvV+Yop7eIpkmhY0JSiEEEIMlErUIS8b/v9KEkd3D92wBInl6kHMKd078W9EHf53gdXC/o9F4uAGYNew/wBaVwp+Luz/TEo0fDLsd9GVx3ThRCQK+00SHaeqOY3JrXCNsM2Lygtgc1p93ibL1+gC7fbwO3+OCsEghBBClExsVbBAoguA/cL+9YA/RuJqh+g3sbj6VrT/PdH+e0ic6Q8gib8VR4GP8/I9QuLv9QLM8lXEdGG/IsvF1eFMPcXp9+8hKtbGQl/MY/LpwHRIhu9HAk1TgkIIIURJxRVYqIBdo077DyRTaetH3z9lGuLqFiy4KJjVazwIhAmSvIZHpwTJkUHgPCcIPT/W5ZEAyXpzS9aN9DZdWIuE0qNMz/L03/C7F7Po6sCprjPO8wiaEhRCCCGGgrlBXH0lEh7PiP7+uQ7i6t20JnReKew/IBJXTczHKxZX84OY8hWJLwr73Bfrx2H/G5l66ixLkTUdq1AV8zfbniS8RJ3JY3I1sRhkcbywye6pEZXFfyIBrBAMQgghxJDg1pilQ6d/Q0pcHc2i6XIgmRrzaUEXV8+iNc7V+8P+t9NquXLRtV9KXP027N84XEtewUjTqWWmE/08dmr/Bb2tfqxPIcjiv52PRXpHwkoIIYQYPlw4bAYsFu1/KYlF5f3R/n1JVgReSBKHaTcsqKiLhDi4qIuHceDEsH/nIK5cpJyNJZjePIg2Fxp3kgQ6zcuSdROJv1mnvICe1+/TPYirxhTCKr6Wp4CTSKZx5W8lhBBCjABVYHcS/6mXRX/bDltx2MSc4ZcK+9eL9jexSORgaWOewvypngj/BwtNcD+J5eqcsH/LcBwXUvdiMbZeR37ThS6U/juJyPL/f43OOQazCIh6exCw/hy0SlAIIYQYAWHlQuKS0OF7XKxaEFcPRuLKg3auTqt/0WFh/x4pEbE/ZiF7Ia1hGH4Yvr8pcHe0/1YsAXUN+DNJuIM8Hd/Hw3XHosqnUV+bg8iLLVs/xxJntxN4QgghhBhi3GLyEuC50b5VgAdS4moO5qDuQTafJEka/fwgljxQ6WFBqDwTi1ZeT4mrzbBpQRcul4V9K2FR52MRND8nkeX+URPAy8N1eXqdLWmNaZWlqJsAPhqJKokrIYQQYsQZA5YhyTv4D5L0LBXg6khEuc/VyyIR8SSJRWhzzCrl4uqssH+VSIx5iIblsfQxV9A6hfZsWqcL8xJZDeCQcH1LYiEopuNH1e2U4P2YL5qXp6YEhRBCiBGmRpLOxaOrfwILTzCGTSf+OBJX7je0LeY35T5NLq42I0m90wR+Fs6xEXAziVXol0FcAfyJJD/iBBZ1fgUs598E+U0Xxlaq15OsGMxKXLnl6u+YRQ8SB3ohhBBCjDgeGuDZQdw4G2HJmt0pe6+wfxcSR/ebMZ8tsFADnnpnnCSv4ZYp0fW3SNR9n2Q68Clg7yC87iC/sA3t4ld1+n+vwsrF1TexZM8uZoUQQggxQ5kVPr9MErndV93tRBJ5/RGS4JgrROKqCXww7F8ltf9zWH5ESMIg+HYo5ot1V7Tvn5j1522ReMnaouVTgllYruLpTJ96jONqCSGEEGKGUSWxtuxCkstvHczZfT3M+tTEHN43wgKXboJNBbpYeWcQaSsAv4oEx5dInMk/HX3/3kiM3JQSV6uE/T8I350gnzhZWYg0v7ZLSRYBjKEpQSGEEGLG49NYbw3iaO3w/xUxX6sm8FeSoKMrkvguNYE3RGLtzylxVQ3f/ySt0eE3DL/5C60pebYI+79Kq0/TgpKJrNjy9XU0JSiEEEKIaTCGhVlwcbV02D+XJHSDO4qDWa9+Gu3/YvSbj0f778ViYi2OWX18/z9IUseclBJVb8SmKf9HsgpwkOLKpwTnYQmxwSxWEldCCCGEWIQ4Zcy+JA7tG0V//1IkMlxcrYLl1nMB8jGScA/viPbfDawf9sdi7CqSacGTIvHiqxvBgqI+Gc47KJHViMTVjcCOkbjUlKAQQgghOuKO2ZsBHyJxTgfLJ9jELEkeqHQOcF4kQk6Ovv+plLjaGJt+/E1KXKUtVy5ijgn7X0P204Ox/9R0pwT9/D8lSSMkq5UQQggheuZdJMmZN4z2n9lBXMWrBc8nsYL9Zwpx1cCSSp8U9r+Q1unC8zHn+DvoPfL6BO3jYk3lbzUe7guJKyGEEEL0QgWzTlWAPSNxtWv0nY9GIuTj0f7YcnUhyfTZOUw+Leg+Wi8I+18LPB6Jq/PC/hXD7yfoPjGzi6UHgIuYOhaWf/9WWnM3akpQCCGEED3hFpqXAL8jSfsC8OYgPB4HDo/2fyISJz/GwjZUSIKXukP7SuH7R0ZC5l5g67D/dbRam/6B+TotSZKsutcAo58BVg3n2Q2LHt8uVY7HyfoXsGb4/ixVCyGEEEL0SyWIJKcKvCkSIS+I/rZftP9HJP5cP4z2/zISV+8isUDNx1L1+HFih/LPY6sXtweujI51H/ABzPl9Kh8tF0/vi653dkrkjdPe7+pmYPWU6BRCCCGE6JtZQVxsRpJGZz+SqbLnYr5TLq5q4TdfjQTLT7DpPUhyIDaBx4Bnhf2vpdXn6kth/9rYyr04ZtZrsWm7hUwekb0RnWepcG01LBRFDXPm75RgOp4iXFciSwghhBBZEcd42jcIqO2iv+9LElbhApIQDadEQuVMkum1VwUx08B8oQ4L+1+eEldfDPtXIbFcLcAiv28cibHpWq+uCdfg21g4vvtidVpV6PtvkcgSQgghRBE8i8RydWS0/7hI9Hw22v8Okim9+4Ctwv7nAA9hU4Wx5WoNkiTTLnT+SRJhfrq+V+5jtUfq+j+HWcCmCtkw3kZkjenxCyGEECILPBhpDZvuu5kk2rpzLK2Jnp29SKxJ92IJncGmGp+mNcUOWCT4v9J5+q6bOFYushZiU4JfwBz3ewnvcAuWqxFkyRJCCCFEB8FUbbNNFobARcVWmHUpFldvjATJUdhUHsDewBNh/5PAlmH/dsDDJNHbTwj7l5pEXNWZ3Oeq15yC3aTJuYRkZWFV1UgIIYQQVWx6qzqN77kzeKWDOIstOK8P4mMh8Ipo/x4k04L3kkzTbQQ8EomXQ8L+zUiSQI+TT7qbcbqzgHUSWcuGMpDIEkIIIWYglQ5CaekgdDYMn76t2uYY7YSEi6xdInF1UvS3HbEVeL7yb4vwtw2i/Q8HcbYT5hjvwicrK1WeCZ9/GIlRBR8VQgghZhBpP6Htggj6GxadvZ2AeBi4DPgy8GpgsdTxXEy4o/ehwJ+xwJ2rhu8vS+Kj9UcslhWYk7iLqwaWp/Ac+pu6G6TIOkMiSwghhJg5xFN4S2MBQi/oUUzcguXh2yw6/mTTYssCF4fffo/EIrYhcCmdp/+6nRKs0990X1Yi60yJLCGEEGJmiCvnABKLUeyHNEESrdw331cP/06Ll3oQWn78WkpwzcasWr8I3/9o9PdZWIiFtJBqTCGQOiVk7iXRcx7bwpTIqkhkCSGEEKOHW5YWB06m1doyQRITaiprkTuDx993UfMHEn+qWkrULR9Ex6nh/7MxH6ur6T68wlTBP68Pgu9TkVgcpMj6QRCYsySyhBBCiNETV0vQuhKvHgmTRhtx4NufgdvaiK8JFp0Wewo4IpzPVyXG4m7J8Permdzq5NayOp2tVvPD+eLz34MFIgXz4ZrKEpb35hHoP5QSnkIIIYQYYjym1dKRuFpI+2m4q7HI61sAa0Wbi7P1gNcB38IirDdTIig+1nap61gbeD/mt9Vs89upnNljYfUJLGbWhuGaXVz9PlzjHsDf6X7KsNFBbGYRAqKORayvSGQJIYQQwy+uPNffd1LiKhYxF2Mr/uZ2OE47x/WNMUf1tDXLRdNdQQRtDXwDeLyNsGqkRFYj+vdtwM+DmIutVO+MruFX0TEvCCIQ4PLUvU5XCOVlxYrv66BwjbNUPYUQQojhFVhgKwXbiaunUoIFWqf14uk9t4SN0Zpv7yCSsA4TKbEyLyVcxiNh1S4Su//+nSTJoc+MfntU2FejNYRDnEz61B4FkF/DacD9OYguT8nzNLCPRJYQQggxnMKqgoVF2BWzHsWO7E3gDmDPSLDEcaymQzUSWmsDV3QQWbGPV1pY1bGpvEujfcdE5zgrEldvi+7txOj7PyCJxxWLqytJ0upMFj+rHoRPAzg8HOc3JP5TWcbeist+o0jQCiGEEGJIqGJTfhenRE4ds9CsF77XrxXFBcIckmnIWGQ12oicJ4GvYdOHs4E/YelxXh8d97uRuDowEoLfjo7z++j7sbi6Dlu1eOEUAive7+c+ju5XNfaSHPpOzIfM70sIIYQQJcc77FfSusLOO/dDMxJXsZirRIKuwaKr/5pYEugTgM1Tv39uJDbmAB8jsSAdEH3vQ9Exv0/iMxaLq58AK2FO/XU6x8vy63sIcz4Hc/CPV/79CAv5kPV0oT+PK4H1SfI7CiGEEKLEeHDPP5E4kru4uih8J+upKT/ezrSuTnTL2deBVVLfT0c4rwHHkoRgiMXVMbSuIqy0EVfXA6uH/Z+gc1wvF10PA3uH7x9F4jcW5xP8YCS68hBZl0T3ouTQQgghRInFFVhuv7SguBdYh1bn9SxxK8zvI3HlQsJ9q+a2OfcYiQ/YDcCDwP7R3w/G/MgaWL7EZ4b9p0X3+G3McgXwZjpP88UR6ndIibf54fN3mCVtV+AJ8psu9LL5JbBCjs9FCCGEEBmJnHeSWJI82vrXUt/JS9xtGoSJp9fx6cHFmTplzI60WrqeRRKm4ZSwbzXMQuVC5ZvR998Qvt8pnpVfz5vC91+XElcfC/u3CILUf3drziLrXJIYWRJZQgghRMnwzvkSFo3S/kzyD3Tp5z8/EhCNILjWTH1nKqG4CUlA00+QxLn6v0ignBb9Znts2q+TY7tbom4L3z8Yc7h3n6uPROLqjqjc7gji8DWpe8o6pc6Pw/mVt1AIIYQoocCaA1zFoilkli6g83bfquNozV3YDILGvzPZ9c8O/z47/O59WEiJtTEH/XokiDyY6jbAA2H/A0y+avCFwL4p0fXRIOqeCVwT/eYK4BnAcsAZZBu2oZ0l6yskybElsoQQQoiSiCuwlWntOm7If7WaH3/PSNT4NRw0DYEV38fBwKuj/bGj+6nR/t1JgoP+FHg7nX2w5gOfo3Wl44fDdW+HhYvw714Y3c8fSHy4niAJrpqHJetT4ZyzVaWFEEKI8gis9SLx4J32MZhFZKyga9gKW5HXi8Bqd0z362piTuzOFpG4ujB898yUuJzMYvTRcJzVMGuVi7JLQzlWsJQ9/psFWPyu3adxjn6SQx/eY1kJIYQQokCB9d6COuxK9Hlr6hq6FVg1bLoT4NfhGIdE97oBia/Z77FpvNlYAujJkka7iPLo8KsA/4i+c3Y49+LAn0msYfOxRNJLY/G+PM5WHnkLnwZeEZWDEEIIISSwqGHO5P0IrPh42wPPifYvBtwSjnsXSYiGY1Iiqp0P1pOYwzrAyiT+ap56x8vxXBIr1Xzg2Zi/1+0s6jif5ebX+TRmoZPIEkIIIUogsNaNOv54irBIgTUXW33Xr8BKM4blWPRVir8GVg1/e3EQJe0sSx4y4jFseo8gyv6REld+/Z+h1XK1O2YduzL6/r3Y1OUrSYK5ZmXRmojOsYxElhBCCDF4gfUMFvU1+mFBnbQff6dI1Pg1HNiHwPLVkZCsUPxx9PedIyHXTlz5v48I31+VRS1XLq7OicpuHrBbG3F1TxBXYKEiJkiSRmedt/BSYCmJLCGEEGIweAiGlUiCZLq4uTr8Le8glh5e4N0sGs395X0IrFhcHIilsPG4WLtF95v2u3LB8wTJisRV2ogr5zPR/nnYtGAsrhrA3cBm4fs/JB9n97TI+gWWwFoIIYQQA8AF1J9THfQ4SZLlagHnPzc6bx2bZtspJZSyYC2SYKS3pESVO4w/GoQSmBXsh23E1RzgS9H+28Nv5tI6jXhNOCfAV2mNAv8W4KXRebOyZrll7iJsteMSKEaWEEIIUbjAqmCJntMWpDeFv+flh+UWtA2weFJxrKmHSSxOlQzucW44jouiz2MxsGJR6Z8Hht/NBS6P/nY0SQ7EOGn0rdiU46yUuLoH2DIc6+yU+Dku7D823Pd4TiLr15FIlcgSQgghCsKtQweTTJlNtOmc82BW+PQ8geMkjt8Xhr9ndW63lL0obCuTJISOVxGeHomrM6MyeV90rOMiIXMLtgoTbFrO999JYgE8I3V/nwz7P5wSQ3lNF3485+cohBBCiA7iowrcEIkNtyS9MXwnayuWJyleN5zXrTduPXtVTudNi6TYejURhNRcbCrQhcrzot+9lcTKdFkQaksB34++fynJSsXjI5G2IIg7gBPD/z0x9U9o9Q3LypI1nnqOs1TdhRBCiGJwy8YHIrHhK/ruBVaMhFiWog7gZ23O+a8gBLL2/XKn/WWA/5FMSbq4uwpz+P9ZJHKOTYmrWES5E/nfo/2/icTVEZG4mkcSl+tYWn2xzgv7V8KmFX2FYVaBSBdi4Siek7NoFUIIIURKeFSweFEuPGJ/qH9glpqsOue5QUC9L5zDxYR/vjknIeArFp9P67Sgfx5FMl35EElw0cXCNbUTV/8X7T83EqvHp8TVwdhqxAOxwKWe4ubr4fvrk+QrzCsQ6f1YkutYVAshhBAiR7zDfRWtU0v++Vss5QtBHFV6PIeLpqNTIi6O4bQC03PKdmFYi7ZqtD+NW8R+T6vVrIGt9vtEJEoOiH733mj/RViKHYDPRvt/Gq4b4ITo3u4hCVT61pTg+V4kruJo7/8KYs8TSWcxXejn/B+2srAikSWEEEIUg6/a+2kHkfUP4JnR98emIYQqkfBxPhUJh9jJfB5JvKhOnb+vapyOdcu/V42Ot3tKcPjn17HwDI+Q+H8BHBr2N7Ekzh68NI5/9T1steAszOrlgmg+if/WPphVzMvyqLD/GSQpgprAf8K1vhizci0ku/Q6fpzfp56PEEIIIXLAO9lVQ+e+MmbRiTtlFyJPAa8nSceSFjNjKWETszvJyrxYYLnoeGd0rDTthNwYNn23RxAyz8NiTs1t83t37v4DrdarJvBv4CVYcNBnRb95Hjad1wS+iSVzTourc0imV0+MxNVtwC6RuHoyOt/7w/6tgP/SarmaA+wXxGad/KYLvx/uZ0wiSwghhMgft/RsGgmftMjyAJrHY47Tcyc53nLYdNuvWXRlWyyuvpo6fydhtTkWYf07wM0kq+58ezzsuzx85wQSv6PdUvfhISFekBKaADtGx/w5ic/VJ1PiysXgkbTmHFw77N87iCsvwxPD/o1ptVxdEwTPG1Nl9GPMovYY2cXJcl+3r6TEpxBCCCFyoJISOc+KBEycty89ZXUrFtbAt7PC5+9JoqanfxtbkDzv4VjqWmKxdSRwMe1X13nsrk5TaQ1sZeB1LBrr618k046V8LkkSZT3syMB8r7omMdH13sErRHd9wj7Xx7ElYuioyLReXMbcXUgrasLzw/Xtlwo4zrZrS7047yvg7AVQgghRA54h7s9cBOtqWRcpIwzvWmsichaFCdzrmOhIWKB4+LK//1CzLE8fbyF4Tj+OR79332XFtI5559f9+ui+/UpzZUwX6j3R+XxvEgonR7t3zcSa9cC24bjvCwlIl1cbRi+V48E3hKYxewpktWFF2DTn2uwaEqfrAORvl8iSwghhCgOt9CsCHyjjWBKi6305qIqHbzUHeZ3iwSVU406+1NY1ErVzoI2lYhopMSg//6S1H12Yl/MJ6oJfIhkFeG2wANh/99JVhHugU3puSB6a1SON9BquVoMm0J9isSq9HNsivGAIMBiq9NxwIMZCa64LPeUyBJCCCGKI3ZU35nWoJqx8BnvsKUtXDdggTYXb9Oh+7mWwyKbp9PnxMLq6SA+Tg3bKWHz/18JPEGr31c6qfPdmIWuk7AYC6LJj/MuzAl9ccy36uFIXHkw1u3DtTXD714b9i8D/C66nlMw37VnYdOIbmk7P5x3NeB6WlcX7hCOdVbYtyADkeWBVh/CLHdV8k3uLYQQQohAJep0x7BVbj8D7ppmJ/4g5hB+MK0O1dU2/16dZGXdeBtLzZPAF7HYUVOtflsbCwnxaMpqE38+hE3bdbqeLYOQOyT620YkcasuIbFcLU+S7PlxkvhXy2BxxPwavhz2PyuIsHpKXC1N67Tof7CpQjAL2mRTn/2k0/niJGJTCCGEEDmRtmwsDuyKrXz7DBZ4M94+CewVLCMx6dAAHhx0ZeCfqU7frVZPYNNj67U5VrstZq2U0EpPFd4YRFatzT3G11kLAtDF1V+AdSJxdSlJMM99wv4Vw/dczHwp7N+dVgubr+hbilYr4X+ANcPfvpMSRhdjU5FZpNPxstiuw7MWQgghRI5UOgiRqfBI65VJjnce7QOc3pYSVtM9f3ol4i6RIHGR5X5PP4gEW7vjjAGzsQTPHj5hFuZDFYurRzGfLb/OcyIh88VIXD1OYkV7V9i/NhZeop3l6vjoeueRrP77KtlMF/o07M9RlHchhBCiFGJrbJJtqkjv3pG/NyV43KLyB8wC5eKn2uN1+tTkptjUZrwi0oWci5b0Ofz/K2ArKj+JTeNVU+LqTmCL6L5+QHvLVWx18uCqKwJXdBBXH4zKZB4WFgIsDMQTZDNd6IsRFpDE8JIVSwghhBhSgVbBpt0eoDU34AQWt2qdSFz1i4u5jbFYU3Va0/XMw6YpK5OIwsVS//9ZEChXk6T5qQKfC/vnYdOTYJHyH4xEzTsi4XYDiQWqnbhaEITZkWH/obRarP5FEnOsV0uWLwR4a4ZlLoQQQoiCccHzLVqjurv16tnh71lGGnfR8IbUuVxcfG4ScVGJrmcWcHL47eVBPPk9+Sq/+Zh/GljoBg8WGosrSJJPu7haPSWuFoZr2zXs3zf83wOS/iic97Kwf2GPIsvL4kIS66MQQgghhgiffloN81uK42U1sdQ6s8jHiuLHPItW/6M65qD+DFpXTra77qXCb6/AVhWChXCIxdULw/4tgfsiIXNMJNi+G+3/UyiPWFy5IPtA2H8IlpDaA5KeG/Z/gdbpzl6nCX0F5PIpUSmEEEKIIcBXEqYtSR6XaePwvTysKB7raTUsZlUjJU7eTeLY3okKtuIujj5/QiRUPL/hxsA9keh6efju8lgCaRc3l5OEi/hytP9/wEvD/teSxAVrYpY/MD+u+PrPprfVhV4Oj5AEU5XAEkIIIYYItwT9msRy5cLhYnp3aJ8u7nz/axZN53NJ6hqnc5xjwnGeAl4T/rYM8EcSq9AukWg5PRI255IEXj0+Ja48uOj+JCmCmsCvwv63kvh6xTG23MG+m+lC/96jElhCCCHE8OGd9jokyZDjdDavDH/P08naLWMvpHWa0H2bNp2GyPLQE7Ox4KiPAc8Nf5tDEv/q/mh/elrwVyQO7b6S0iOrvyjsXw+LOu8C9NSw/+XhWl1c/STs3yWIpG6nCyWwhBBCiCHGRcsWtIYI8NVyaxbQufuxlwHuZdFk1rumhNhkx6lhyaDXjfa7A/wDwNaRYIzF1Vei77+TxGn9IZKAn+vQmr/w1EiM1Ul8sU4I+/enNQ/ivUx/dWHsgyWBJYQQQgwZLlqOYNFE0H/DLEJFxGByC9kPac172ATek/pON8LtjSRTfEdH9/x/HcRVelowFldxPsJvhv2vodXnKhZXcf7HfwYB+Q2mF4zU/3Zf+J0ElhBCCDFEuGj5aBthc15KhBVxHWdG1+Gi5ctdCiwPa7B4EEn/BVYBdgqC8U2RkDkx+t2Lov0P0NlydVrY/2ySXIQLgbeF/atjzukurr4X9h8ZfXe6OQl/w9RO/kIIIYQoqcD6YBuBdf4ABNYP2gisz3YpsIiu+9lYqAewcA4fj457bPTdvaL9V5OkA1o7ElcLMAuUi6VHSSxN74/E1b+jMjwjCL1307pC8xrMCb/TdKEHXj24wGcghBBCiIyFzYdLIrDOaiOwvtijwIqpBNHkgsbDP4CFXng4/O0GEv+tWFw1gVPC/p0w36gmtjDApzDXxIKT+vd/H/Z/IPz/6fB5CRZX7M0p0ZUWVzeSJN8WQgghxBDh/lV7RJ27C5ufD0BgnR4JLJ9i27+P66hFxz43iJkXRX/fNYgkF5RLhP07Y+mB/FqOwCxRryVxVJ8HHAgsiTnPx+LqjHCcV6fE1U+DuFoB+C2tiwp88ynEN2YgLIUQQggxQIG1Ka25Bz1VzFyKcXKvYuEULqM1yGk3qwg74Rag15HEsqqE47rl6tJwfhc0fh3zsYTSAK+PRNACzAJFEFexpev7Yf/bgrDy1YXfCmJsBWwaMo4On06Rc3mBZS+EEEKIjPFkyssDd7FoiISdSMIf5IUfe/eU6KgHwbFNnwKr3fmWJonq/ivMCb6CWZfOjwTP4eE3O2GO6z4t6BHdN4jKLXZof0nqXr4e9i8fiauFHcTVXSThMSSwhBBCiCEWWXOAa1l0mvDz4Tt5TlP5sd/PotODf08JwX6F1ezw75NIpkHnRt85P7qGt4Vz7gQ8SBIXyx3P18Cc1V0gfSLsP5DEytXEVmgSRNzVtM9T6OLqcWDHjAWlEEIIIQaAC5wvkkRxd9+gx4OQ6JRwOQtx5ylurmoj8E7LWOC5aDkZWzkZO5F/i8RC9ZKwb1ngNhKL025h/1rYakEXSKeH/Vtj04J+/SeF/atG99dJXN0DPDN8X5YrIYQQYkQE1ktpndZyIfC5jEVOO8FzaEpseK6/l6S+lzVVzKp1Wjjv3SSpeXbCYmh50FHPa7gGiUP7fOB9kbh6ILqH2HLVSVz5NOGV0XlluRJCCCFGALfgLI1FDncfLP98HAtxkLUVqxq2pbApOHds91yE/4quL+tQBe5UDxbTqolFan9W2LdVEFVNzBHenePXw6Kyp6cFtwniyve75WqLScSV//8KknQ4EldCCCHECOEd+zGpzt+tMb+PvpeF2Imjk381dS4/92HkG8U8tp6dTTI9twRwcSS63Cdq+VAOfq2vDfu3i8TVI1huQrB4Wjcx+bTgzySuhBBCiNHGrVN/YtHpujj/Xq1PMRD7PX2uw7l+Hb5XpOiYG7bfRKJy7ejv34mu8dVh39bA/ZFw8tANe5GEgIgDiTYisXVGm7IXQgghxAgKrAoWp+lBWsM1jKdEFphlqdLl8ccikfa51LH9fE9iTuRFCY94utBjXf0GWCz6ztdJfKZeEfZtH4mrx4BDwv4dSEJApMWVBxX9dFSGEldCCCHEiOMWo31IrC1pkXUmsHHqNy4UYrFQiURVbIlaD5saS4srd/g+KHUtRd73/li4iLmReDyeJOzCnmHf1sDtkbjaI+x/BnAniwYR9X/PI7F+ZTXdKoQQQoghEllHsqjlxS0yTwPvAFZr8/u00IqF1ReDIImPFYsrT8A86PQwLnxeE12rW65WA/5BEhfLxdX2wBOTiKungOeV5P6EEEIIMQBcAHyExMqUdnx3680vsKm1jYHVo2OsgjmOH4Pl4HucRZ28JyLx9qXo3IOy7HjYhgqwWbiue0nyIa6JhVTwoKAvCPv3BO5oUz7jUTl5RPpZql5CCCGERNY+kTiaiERRLCRiwfW3sD3c5u/j0W/99/NJps2qDH7azC14+2LxrnYJ/18KS9DcBB4lmS7cPxJSseXKrXJ3ROJKlishhBBC/H+xsVEkLuJo6xPRZ7PDNk7iyzWREiF/BbaMxFWZ+RpJXCyfFtwlCKlGB3H1KyyKe1yWQgghhBAtwuAFwAVtRJQLrYWYM/iCSFiNp8SHC6sDO5yjLHgMriqWf7AJXIclpQaL9H4vi1qu3Jr1PWAZiSshhBBCdCI9dfd84BTgVia3XsXbk1gsqRenREyZLVcujN6AJYZ2wfQizNE/Flexs/4XUmUnhBhBtAxYCJGl4HCndIAlgZUxq86mWAyt9cPfK8AlWPqdOzDn8LtTx6oPYRm8EHPanx3KohqVRyWIq3di1i9fgSmEEEIIMS2hVSvwd4PGVxeujAUhbWDToOkUP2+Ovq/BrRBCCCF6Ig4mOhYJKN/i/cM+VebhIz5Ba3R2j3G1XyQihRBCCCHENMVkBUurcxyWJmchFpLireE7s1VMQswc/h+khHvqDI6CuAAAAABJRU5ErkJggg==';

async function generarPDFBarbero(nombre, row) {
  // Cargar jsPDF + autoTable si no están
  if(!window.jspdf){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  await new Promise((res,rej)=>{
    if(typeof window.jspdf?.jsPDF?.prototype?.autoTable !== 'undefined'){ res(); return; }
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
    s.onload=res; s.onerror=rej; document.head.appendChild(s);
  });

  toast('Generando PDF...','info');
  const {jsPDF} = window.jspdf;
  const doc = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});
  const PW = 210, PH = 297, M = 28;
  let y = M;

  const CLR_RED=[220,38,38], CLR_GREEN=[22,163,74], CLR_NAVY=[30,58,95];
  const CLR_LGRAY=[241,245,249], CLR_DKGRAY=[100,116,139];
  const fCLP = n => n==null ? '—' : '$'+Math.round(n).toLocaleString('es-CL');
  const mesNombre = MESES[liqFiltros.mes-1];
  const periodoStr = `1 al ${new Date(liqFiltros.anio, liqFiltros.mes, 0).getDate()} de ${mesNombre} ${liqFiltros.anio}`;

  // ─── ENCABEZADO ───────────────────────────────────────────────────────────
  // Logo
  try { doc.addImage(LOGO_B64,'PNG', M, y, 40, 43); } catch(e){}
  // Texto alineado verticalmente al centro del logo (43mm alto)
  doc.setFontSize(18).setFont(undefined,'bold').setTextColor(...CLR_NAVY);
  doc.text('PÍSTON BARBERÍA', PW-M, y+12, {align:'right'});
  doc.setFontSize(10).setFont(undefined,'normal').setTextColor(...CLR_DKGRAY);
  doc.text('Liquidación de Pagos', PW-M, y+21, {align:'right'});
  doc.text(periodoStr, PW-M, y+28, {align:'right'});
  y += 50;

  // Línea divisoria
  doc.setDrawColor(...CLR_NAVY).setLineWidth(0.5).line(M, y, PW-M, y);
  y += 7;

  // Nombre barbero
  doc.setFontSize(16).setFont(undefined,'bold').setTextColor(...CLR_NAVY);
  doc.text(nombre, M, y);
  doc.setFontSize(10).setFont(undefined,'normal').setTextColor(...CLR_DKGRAY);
  doc.text('Barbero · Píston Barbería', M, y+5);
  // Comisión %
  const pct = Math.round((barberos.find(b=>b.nombre===nombre)?.comision||50));
  doc.setFontSize(9).setTextColor(...CLR_NAVY);
  doc.text(`Comisión: ${pct}%`, PW-M, y+2, {align:'right'});
  y += 16;

  // ─── SECCIÓN 1: LIQUIDACIÓN ────────────────────────────────────────────────
  // Título sección
  doc.setFillColor(...CLR_NAVY).rect(M, y, PW-M*2, 7, 'F');
  doc.setFontSize(10).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('SECCIÓN 1 — LIQUIDACIÓN DEL MES', M+3, y+5);
  y += 11;

  // BANCO SANTANDER
  doc.setFillColor(...CLR_RED).rect(M, y, PW-M*2, 6, 'F');
  doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('BANCO SANTANDER  (Servicios TK + TRF)', M+3, y+4.2);
  y += 8;

  const vMesBarb = liqVentas.filter(v=>v.barbero_nombre===nombre && v.n_mes===liqFiltros.mes);
  const vSant = vMesBarb.filter(v=>v.tipo==='servicio' && ['TK','TRF'].includes(v.forma_pago));
  const nSvcSant = vSant.length;

  doc.autoTable({
    startY: y,
    head:[['Concepto','Detalle','Monto']],
    body:[
      [`Ventas con boleta (${nSvcSant} servicios)`,`Comisión ${pct}%`, fCLP(row.comSant)],
      ['Propinas TK + TRF','',  fCLP(row.propSant)],
      ['Subtotal Santander','', fCLP(row.comSant + row.propSant)],
      ['Adelantos TRF (transferencias previas)','−', row.adelSant ? fCLP(row.adelSant) : '—'],
    ],
    foot:[[{content:'TOTAL A TRANSFERIR SANTANDER', colSpan:2, styles:{fontStyle:'bold',fillColor:CLR_RED,textColor:[255,255,255]}}, {content: fCLP(row.totalSant), styles:{fontStyle:'bold',fillColor:CLR_RED,textColor:[255,255,255]}}]],
    theme:'grid',
    headStyles:{fillColor:CLR_RED, textColor:[255,255,255], fontSize:8},
    bodyStyles:{fontSize:9},
    footStyles:{fillColor:CLR_RED},
    styles:{overflow:'linebreak', cellPadding:3},
    columnStyles:{0:{cellWidth:80}, 1:{cellWidth:44}, 2:{cellWidth:30, halign:'right'}},
    margin:{left:M, right:M},
  });
  y = doc.lastAutoTable.finalY + 7;

  // BANCO FALABELLA
  doc.setFillColor(...CLR_GREEN).rect(M, y, PW-M*2, 6, 'F');
  doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('BANCO FALABELLA  (Servicios EF)', M+3, y+4.2);
  y += 8;

  const vFall = vMesBarb.filter(v=>v.tipo==='servicio' && v.forma_pago==='EF');
  const nSvcFall = vFall.length;

  doc.autoTable({
    startY: y,
    head:[['Concepto','Detalle','Monto']],
    body:[
      [`Ventas sin boleta (${nSvcFall} servicios)`,`Comisión ${pct}%`, fCLP(row.comFall)],
      ['Propinas EF','', fCLP(row.propFall)],
      ['Comisión productos (10%)','', row.comProd ? fCLP(row.comProd) : '—'],
      ['Subtotal Falabella','', fCLP(row.totalFall)],
      ['Adelantos EF (desde gastos)','−', row.adelFall ? fCLP(row.adelFall) : '—'],
    ],
    foot:[[{content:'TOTAL A TRANSFERIR FALABELLA', colSpan:2, styles:{fontStyle:'bold',fillColor:CLR_GREEN,textColor:[255,255,255]}}, {content: fCLP(row.transferFall), styles:{fontStyle:'bold',fillColor:CLR_GREEN,textColor:[255,255,255]}}]],
    theme:'grid',
    headStyles:{fillColor:CLR_GREEN, textColor:[255,255,255], fontSize:8},
    bodyStyles:{fontSize:9},
    styles:{overflow:'linebreak', cellPadding:3},
    columnStyles:{0:{cellWidth:80}, 1:{cellWidth:44}, 2:{cellWidth:30, halign:'right'}},
    margin:{left:M, right:M},
  });
  y = doc.lastAutoTable.finalY + 5;

  // TOTAL GENERAL
  doc.setFillColor(...CLR_NAVY).setDrawColor(...CLR_NAVY).setLineWidth(0.3);
  doc.rect(M, y, PW-M*2, 10, 'F');
  doc.setFontSize(12).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('TOTAL PAGO DEL MES', M+4, y+7);
  doc.text(fCLP(row.totalSant + row.transferFall), PW-M-4, y+7, {align:'right'});
  y += 16;

  // ─── ADELANTOS (justo bajo la liquidación) ────────────────────────────────
  // Prepare data early (needed here and later)
  const aSant = liqAdelantosSantander.filter(a=>a.barbero_nombre===nombre && a.mes===liqFiltros.mes);
  const aMesGastos = liqGastos.filter(g=>
    g.barbero_nombre===nombre &&
    g.fecha && Number(g.fecha.split('-')[0])===liqFiltros.anio &&
    Number(g.fecha.split('-')[1])===liqFiltros.mes
  );

  // Adelantos Santander
  if(y > PH - 70) { doc.addPage(); y = M + 5; }
  doc.setFillColor(...CLR_RED).rect(M, y, PW-M*2, 6, 'F');
  doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('Adelantos Santander (Transferencias TRF previas)', M+3, y+4.2);
  y += 8;
  if(aSant.length>0){
    doc.autoTable({
      startY: y,
      head:[['Fecha','Descripcion','Monto']],
      body: aSant.map(a=>[a.fecha||'—', a.descripcion||'Adelanto', fCLP(a.monto)]),
      foot:[[{content:'Total adelantos Santander', colSpan:2, styles:{fontStyle:'bold'}},
             fCLP(aSant.reduce((s,a)=>s+a.monto,0))]],
      theme:'grid',
      headStyles:{fillColor:CLR_RED, textColor:[255,255,255], fontSize:8},
      bodyStyles:{fontSize:9},
      footStyles:{fillColor:CLR_RED, textColor:[255,255,255], fontStyle:'bold'},
      styles:{overflow:'linebreak', cellPadding:3},
      columnStyles:{0:{cellWidth:28},1:{cellWidth:94},2:{cellWidth:32,halign:'right'}},
      margin:{left:M, right:M},
    });
    y = doc.lastAutoTable.finalY + 7;
  } else {
    doc.setFontSize(9).setTextColor(...CLR_DKGRAY).text('Sin adelantos Santander registrados.', M, y); y += 8;
  }

  // Adelantos Falabella
  if(y > PH - 70) { doc.addPage(); y = M + 5; }
  doc.setFillColor(...CLR_GREEN).rect(M, y, PW-M*2, 6, 'F');
  doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('Adelantos Falabella (Efectivo EF)', M+3, y+4.2);
  y += 8;
  if(aMesGastos.length>0){
    doc.autoTable({
      startY: y,
      head:[['Fecha','Descripcion','Monto']],
      body: aMesGastos.map(g=>[g.fecha||'—', g.descripcion||g.detalle||'Adelanto', fCLP(g.monto)]),
      foot:[[{content:'Total adelantos Falabella', colSpan:2, styles:{fontStyle:'bold'}},
             fCLP(aMesGastos.reduce((s,g)=>s+g.monto,0))]],
      theme:'grid',
      headStyles:{fillColor:CLR_GREEN, textColor:[255,255,255], fontSize:8},
      bodyStyles:{fontSize:9},
      footStyles:{fillColor:CLR_GREEN, textColor:[255,255,255], fontStyle:'bold'},
      styles:{overflow:'linebreak', cellPadding:3},
      columnStyles:{0:{cellWidth:28},1:{cellWidth:94},2:{cellWidth:32,halign:'right'}},
      margin:{left:M, right:M},
    });
    y = doc.lastAutoTable.finalY + 7;
  } else {
    doc.setFontSize(9).setTextColor(...CLR_DKGRAY).text('Sin adelantos EF registrados.', M, y); y += 8;
  }

  // ─── SECCIÓN 2: COMPARACIÓN MENSUAL ───────────────────────────────────────
  doc.addPage();
  y = M;

  // Mini header en página 2
  try { doc.addImage(LOGO_B64,'PNG', M, y, 22, 24); } catch(e){}
  doc.setFontSize(11).setFont(undefined,'bold').setTextColor(...CLR_NAVY);
  doc.text('PÍSTON BARBERÍA — ' + nombre, M+28, y+9);
  doc.setFontSize(9).setFont(undefined,'normal').setTextColor(...CLR_DKGRAY);
  doc.text('Liquidación ' + mesNombre + ' ' + liqFiltros.anio, M+28, y+16);
  y += 30;

  doc.setFillColor(...CLR_NAVY).rect(M, y, PW-M*2, 7, 'F');
  doc.setFontSize(10).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('SECCIÓN 2 — COMPARACIÓN MENSUAL ' + liqFiltros.anio, M+3, y+5);
  y += 11;

  // Datos mensuales del año
  const vAnioBarb = liqVentas.filter(v=>v.barbero_nombre===nombre);
  const mesData = MESES.map((m,i)=>{
    const vm = vAnioBarb.filter(v=>v.n_mes===i+1);
    const total = vm.reduce((s,v)=>s+(v.total||0),0);
    const svcCount = vm.filter(v=>v.tipo==='servicio').length;
    return {mes:m, total, svcCount, esMesActual: i+1===liqFiltros.mes};
  });

  // Año anterior (datos ya cargados si existen en liqVentas filtrado por anio anterior — no tenemos)
  // Los datos solo son del año actual, indicar N/D para año anterior

  const bodyMes = mesData.map(d=>[
    d.mes,
    d.total>0 ? fCLP(d.total) : '—',
    d.svcCount>0 ? d.svcCount.toString() : '—',
    d.esMesActual ? '<< MES ACTUAL' : '',
  ]);

  doc.autoTable({
    startY: y,
    head:[['Mes', 'Total Ventas', 'N° Servicios', '']],
    body: bodyMes,
    theme:'striped',
    headStyles:{fillColor:CLR_NAVY, textColor:[255,255,255], fontSize:9},
    bodyStyles:{fontSize:9},
    didParseCell: (data)=>{
      if(data.row.index === liqFiltros.mes-1 && data.section==='body'){
        data.cell.styles.fontStyle='bold';
        data.cell.styles.fillColor=[219,234,254];
      }
    },
    styles:{overflow:'linebreak', cellPadding:3},
    columnStyles:{
      0:{cellWidth:42},
      1:{cellWidth:50, halign:'right'},
      2:{cellWidth:40, halign:'center'},
      3:{cellWidth:22, textColor:[30,58,95], halign:'center'},
    },
    margin:{left:M, right:M},
  });
  y = doc.lastAutoTable.finalY + 5;

  // Nota año anterior
  doc.setFontSize(8).setTextColor(...CLR_DKGRAY);
  doc.text('* La comparación con el año anterior estará disponible cuando existan datos de ' + (liqFiltros.anio-1) + '.', M, y);

  // ─── SECCIÓN 3: DETALLE DE SERVICIOS ───────────────────────────────────────
  doc.addPage();
  y = M;

  // Mini header pág 3
  try { doc.addImage(LOGO_B64,'PNG', M, y, 22, 24); } catch(e){}
  doc.setFontSize(11).setFont(undefined,'bold').setTextColor(...CLR_NAVY);
  doc.text('PÍSTON BARBERÍA — ' + nombre, M+28, y+9);
  doc.setFontSize(9).setFont(undefined,'normal').setTextColor(...CLR_DKGRAY);
  doc.text('Liquidación ' + mesNombre + ' ' + liqFiltros.anio, M+28, y+16);
  y += 30;

  doc.setFillColor(...CLR_NAVY).rect(M, y, PW-M*2, 7, 'F');
  doc.setFontSize(10).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('SECCIÓN 3 — DETALLE DE SERVICIOS', M+3, y+5);
  y += 11;

  // A) Servicios TK + TRF
  doc.setFillColor(...CLR_RED).rect(M, y, PW-M*2, 6, 'F');
  doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('Servicios con Boleta - TK / TRF', M+3, y+4.2);
  y += 8;

  if(vSant.length>0){
    doc.autoTable({
      startY: y,
      head:[['Fecha','Servicio','Monto','Propina','Total','Cod. Auth']],
      body: vSant.sort((a,b)=>a.fecha>b.fecha?1:-1).map(v=>[
        v.fecha||'', v.servicio_producto||'', fCLP(v.monto), v.propina?fCLP(v.propina):'—', fCLP(v.total), v.cod_autorizacion||'—'
      ]),
      foot:[[{content:`Total: ${vSant.length} servicios`, colSpan:2, styles:{fontStyle:'bold'}},
             fCLP(vSant.reduce((s,v)=>s+(v.monto||0),0)),
             fCLP(vSant.reduce((s,v)=>s+(v.propina||0),0)),
             fCLP(vSant.reduce((s,v)=>s+(v.total||0),0)), '']],
      theme:'grid',
      headStyles:{fillColor:CLR_RED, textColor:[255,255,255], fontSize:7},
      bodyStyles:{fontSize:8},
      footStyles:{fillColor:CLR_RED, textColor:[255,255,255], fontStyle:'bold'},
      styles:{overflow:'linebreak', cellPadding:2, fontSize:7},
      columnStyles:{0:{cellWidth:22},1:{cellWidth:52},2:{cellWidth:22,halign:'right'},3:{cellWidth:18,halign:'right'},4:{cellWidth:20,halign:'right'},5:{cellWidth:20,halign:'center'}},
      margin:{left:M, right:M},
    });
    y = doc.lastAutoTable.finalY + 7;
  } else {
    doc.setFontSize(9).setTextColor(...CLR_DKGRAY).text('Sin servicios TK/TRF en este período.', M, y); y += 8;
  }

  // Check if we need a new page
  if(y > PH - 60) { doc.addPage(); y = M + 5; }

  // B) Servicios EF
  doc.setFillColor(...CLR_GREEN).rect(M, y, PW-M*2, 6, 'F');
  doc.setFontSize(9).setFont(undefined,'bold').setTextColor(255,255,255);
  doc.text('Servicios sin Boleta - EF', M+3, y+4.2);
  y += 8;

  if(vFall.length>0){
    doc.autoTable({
      startY: y,
      head:[['Fecha','Servicio','Monto','Propina','Total']],
      body: vFall.sort((a,b)=>a.fecha>b.fecha?1:-1).map(v=>[
        v.fecha||'', v.servicio_producto||'', fCLP(v.monto), v.propina?fCLP(v.propina):'—', fCLP(v.total)
      ]),
      foot:[[{content:`Total: ${vFall.length} servicios`, colSpan:2, styles:{fontStyle:'bold'}},
             fCLP(vFall.reduce((s,v)=>s+(v.monto||0),0)),
             fCLP(vFall.reduce((s,v)=>s+(v.propina||0),0)),
             fCLP(vFall.reduce((s,v)=>s+(v.total||0),0))]],
      theme:'grid',
      headStyles:{fillColor:CLR_GREEN, textColor:[255,255,255], fontSize:7},
      bodyStyles:{fontSize:8},
      footStyles:{fillColor:CLR_GREEN, textColor:[255,255,255], fontStyle:'bold'},
      styles:{overflow:'linebreak', cellPadding:2, fontSize:7},
      columnStyles:{0:{cellWidth:22},1:{cellWidth:72},2:{cellWidth:22,halign:'right'},3:{cellWidth:20,halign:'right'},4:{cellWidth:18,halign:'right'}},
      margin:{left:M, right:M},
    });
    y = doc.lastAutoTable.finalY + 7;
  } else {
    doc.setFontSize(9).setTextColor(...CLR_DKGRAY).text('Sin servicios EF en este período.', M, y); y += 8;
  }

  // ─── FIRMA ─────────────────────────────────────────────────────────────────
  if(y > PH - 55) { doc.addPage(); y = M + 5; }

  y = Math.max(y + 10, PH - 55);
  doc.setDrawColor(180,180,180).setLineWidth(0.3);
  doc.line(M, y, M+70, y);
  doc.line(PW-M-70, y, PW-M, y);
  doc.setFontSize(8).setTextColor(...CLR_DKGRAY).setFont(undefined,'normal');
  doc.text('Firma Barbero', M+35, y+5, {align:'center'});
  doc.text('Firma Administración', PW-M-35, y+5, {align:'center'});
  doc.text(nombre, M+35, y+9, {align:'center'});
  doc.text('Píston Barbería', PW-M-35, y+9, {align:'center'});

  // Pie de página en todas las páginas
  const totalPags = doc.getNumberOfPages();
  for(let p=1; p<=totalPags; p++){
    doc.setPage(p);
    doc.setFontSize(7).setTextColor(...CLR_DKGRAY);
    doc.text(`Píston Barbería · Liquidación ${mesNombre} ${liqFiltros.anio} · ${nombre} · Pág. ${p}/${totalPags}`,
      PW/2, PH-6, {align:'center'});
  }

  doc.save(`Liquidacion_${nombre.split(' ')[0]}_${mesNombre}_${liqFiltros.anio}.pdf`);
  toast('✓ PDF generado para ' + nombre.split(' ')[0]);
}

function exportLiqCSV(){
  const vMes = liqVentas.filter(v=>v.n_mes==liqFiltros.mes);
  const gMes = liqGastos.filter(g=>g.fecha&&Number(g.fecha.split('-')[0])==liqFiltros.anio&&Number(g.fecha.split('-')[1])==liqFiltros.mes);
  const aMes = liqAdelantosSantander.filter(a=>a.mes==liqFiltros.mes);
  const barbNombres = [...new Set(vMes.map(v=>v.barbero_nombre).filter(n=>n&&!n.toUpperCase().includes('PISTON')))].sort();
  const hdr='Mes;Barbero;Con Boleta;Com.Santander;Propina Sant;Subtotal Sant;Total Transf Santander;Adelanto TRF;Sin Boleta;Com.Falabella;Propina Fall;Com.Productos;Adelanto EF;Total Transf Falabella;TOTAL';
  const lines=[`Liquidación ${MESES[liqFiltros.mes-1]} ${liqFiltros.anio}`,hdr];
  barbNombres.forEach(nombre=>{
    const vBarb=vMes.filter(v=>v.barbero_nombre===nombre);
    const vSant=vBarb.filter(v=>v.tipo==='servicio'&&['TK','TRF'].includes(v.forma_pago));
    const montoSant=vSant.reduce((s,v)=>s+(v.monto||0),0);
    const comSant=Math.round(vSant.reduce((s,v)=>{const p=(servicios.find(sx=>sx.nombre===v.servicio_producto)?.comision||50)/100;return s+(v.monto||0)*p;},0));
    const propSant=vSant.reduce((s,v)=>s+(v.propina||0),0);
    const adelSant=aMes.filter(a=>a.barbero_nombre===nombre).reduce((s,a)=>s+a.monto,0);
    const vFall=vBarb.filter(v=>v.tipo==='servicio'&&v.forma_pago==='EF');
    const montoFall=vFall.reduce((s,v)=>s+(v.monto||0),0);
    const comFall=Math.round(vFall.reduce((s,v)=>{const p=(servicios.find(sx=>sx.nombre===v.servicio_producto)?.comision||50)/100;return s+(v.monto||0)*p;},0));
    const propFall=vFall.reduce((s,v)=>s+(v.propina||0),0);
    const comProd=Math.round(vBarb.filter(v=>v.tipo==='PRODUCTO').reduce((s,v)=>s+(v.monto||0)*0.1,0));
    const adelFall=gMes.filter(g=>g.barbero_nombre===nombre).reduce((s,g)=>s+g.monto,0);
    const totalSant=comSant+propSant-adelSant;
    const totalFall=comFall+propFall+comProd-adelFall;
    lines.push([MESES[liqFiltros.mes-1],nombre,montoSant,comSant,propSant,comSant+propSant,totalSant,adelSant,montoFall,comFall,propFall,comProd,adelFall,totalFall,totalSant+totalFall].join(';'));
  });
  const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`liquidacion_${MESES[liqFiltros.mes-1]}_${liqFiltros.anio}.csv`;a.click();
}

export { loadLiquidacion };
