// Pestaña Importar
import { DIAS_ES, MESES, barberos, fmtCLP, getXLSX, loadCatalogos, sb, toast } from './core.js';

// ============ IMPORTAR ============
let importPreview = [];

function loadImportar(){
  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">Importar Datos Históricos</div>

  <div class="section-card" style="margin-bottom:16px;border-left:4px solid var(--blue)">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:24px">📋</span>
      <div>
        <div style="font-weight:700;margin-bottom:6px">Formato soportado — Cierre Diario Oficial (XLSX o CSV)</div>
        <div style="color:#64748B;font-size:12px;line-height:1.8">
          ✅ <strong>XLSX del Cierre Diario</strong> — lee automáticamente la hoja <strong>"Ventas v3"</strong><br>
          ✅ <strong>CSV genérico</strong> — con columnas separadas por <code>;</code> o <code>,</code><br>
          <strong>Columnas detectadas:</strong> Barbero · Cod Autorizacion · N° Boleta · Año · N° Mes · dia · Mes · Día · Fecha · Tipo de Venta · Cliente · servicio/Producto · Monto · Propina · Total · Forma de pago · Comentarios<br>
          <strong>Normalización automática:</strong> TF→TRF · tipos en mayúscula/minúscula · espacios extra · fechas en cualquier formato
        </div>
      </div>
    </div>
  </div>

  <div class="section-card" style="margin-bottom:16px">
    <div class="card-title">1 · Selecciona el tipo y el archivo</div>
    <div class="form-row" style="align-items:flex-end">
      <div class="form-group" style="flex:0 0 200px">
        <label>Tipo de importación</label>
        <select id="importTipo">
          <option value="ventas">Ventas (Ventas v3)</option>
          <option value="gastos">Gastos</option>
        </select>
      </div>
      <div class="form-group">
        <label>Archivo XLSX o CSV</label>
        <input type="file" id="importFile" accept=".xlsx,.xls,.csv,.txt" onchange="processImportFile(this)">
      </div>
    </div>
    <div id="importLoading" style="display:none;color:#64748B;font-size:12px;margin-top:8px">⏳ Procesando archivo...</div>
  </div>

  <div id="importPreviewSection" style="display:none">
    <div class="section-card" style="margin-bottom:16px">
      <div class="card-title">2 · Vista previa — primeras 10 filas</div>
      <div id="importStats" style="margin-bottom:12px"></div>
      <div style="overflow-x:auto" id="importPreviewTable"></div>
      <div id="importWarnings" style="margin-top:10px"></div>
    </div>
    <div class="section-card">
      <div class="card-title">3 · Confirmar importación</div>
      <div id="importConfirmInfo" style="margin-bottom:14px;color:#64748B;font-size:13px"></div>
      <div style="display:flex;gap:10px" id="importBtns">
        <button class="btn btn-primary" onclick="confirmImport()" style="padding:10px 24px">⬆ Importar al sistema</button>
        <button class="btn btn-ghost" onclick="cancelImport()">Cancelar</button>
      </div>
      <div id="importProgress" style="margin-top:12px;display:none">
        <div class="progress-bar" style="height:10px;margin-bottom:6px"><div class="progress-fill" id="importProgressFill" style="width:0%;background:var(--blue)"></div></div>
        <div id="importProgressText" style="font-size:12px;color:#64748B"></div>
      </div>
    </div>
  </div>
  `;
}

async function processImportFile(input){
  const file = input.files[0];
  if(!file) return;
  const tipo = document.getElementById('importTipo').value;
  const loading = document.getElementById('importLoading');
  loading.style.display='block';
  document.getElementById('importPreviewSection').style.display='none';

  try {
    const isXLSX = file.name.match(/\.xlsx?$/i);
    let rows = [];

    if(isXLSX){
      const XL = await getXLSX();
      const buf = await file.arrayBuffer();
      const wb = XL.read(buf, {type:'array', cellDates:true});

      // Find the right sheet
      let sheetName = wb.SheetNames[0];
      if(tipo==='ventas'){
        const v3 = wb.SheetNames.find(n=>n.toLowerCase().includes('venta'));
        if(v3) sheetName = v3;
      }

      const ws = wb.Sheets[sheetName];
      // Get all rows as array of arrays (raw, to handle multi-row headers)
      const raw = XL.utils.sheet_to_json(ws, {header:1, defval:null, raw:false});

      // Find header row: the row that contains "Barbero" and "Fecha"
      let headerIdx = 0;
      for(let i=0;i<Math.min(5,raw.length);i++){
        const row = raw[i].map(c=>String(c||'').toLowerCase());
        if(row.some(c=>c.includes('barbero')) && row.some(c=>c.includes('fecha'))){
          headerIdx = i; break;
        }
      }
      const headers = raw[headerIdx].map(h=>String(h||'').trim());
      // Data rows start after header
      const dataRaws = raw.slice(headerIdx+1).filter(r=>r.some(c=>c!==null&&String(c).trim()!==''));
      rows = dataRaws.map(r=>{
        const obj={};
        headers.forEach((h,i)=>{ obj[h] = r[i]!=null ? String(r[i]).trim() : ''; });
        return obj;
      });

    } else {
      // CSV
      const buf = await file.arrayBuffer();
      // Handle BOM (UTF-8 BOM = EF BB BF)
      let text = new TextDecoder('utf-8').decode(buf);
      if(text.charCodeAt(0)===0xFEFF) text=text.slice(1); // strip BOM

      const lines = text.split(/\r?\n/).filter(l=>l.trim());
      if(lines.length<2){ toast('Archivo vacío','error'); loading.style.display='none'; return; }
      const delim = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';

      // Find the real header row: the first row that contains "Barbero" or "barbero"
      let headerIdx = 0;
      for(let i=0;i<Math.min(5,lines.length);i++){
        const low = lines[i].toLowerCase();
        if(low.includes('barbero') && (low.includes('fecha') || low.includes('monto'))){
          headerIdx = i; break;
        }
      }

      const headers = lines[headerIdx].split(delim).map(h=>h.trim().replace(/^"|"$/g,''));
      rows = lines.slice(headerIdx+1).map(line=>{
        const cols=[]; let cur='', inQ=false;
        for(const ch of line){
          if(ch==='"') inQ=!inQ;
          else if(ch===delim&&!inQ){cols.push(cur.trim());cur='';}
          else cur+=ch;
        }
        cols.push(cur.trim());
        const obj={};
        headers.forEach((h,i)=>obj[h]=(cols[i]||'').replace(/^"|"$/g,'').trim());
        return obj;
      }).filter(r=>Object.values(r).some(v=>v));
    }

    if(rows.length===0){ toast('No se encontraron datos','error'); loading.style.display='none'; return; }

    await loadCatalogos();
    importPreview = tipo==='ventas' ? parseVentasRows(rows) : parseGastosRows(rows);
    loading.style.display='none';
    renderImportPreview(tipo);

  } catch(err){
    loading.style.display='none';
    toast('Error al procesar: '+err.message,'error');
    console.error(err);
  }
}

// ---- helpers ----
function nH(h){ return String(h||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); }

function getCol(row, ...keys){
  for(const k of keys){
    const nk=nH(k);
    const found=Object.keys(row).find(rk=>nH(rk)===nk||nH(rk).startsWith(nk)||nk.startsWith(nH(rk)));
    if(found!==undefined && row[found]!==null && String(row[found]).trim()!=='') return String(row[found]).trim();
  }
  return '';
}

function pNum(v){
  if(v===null||v===undefined||v==='') return 0;
  // Handle Chilean format: $16.000 or $ 16.000 or 16.000 or 16,000
  // Step 1: remove currency symbol, spaces
  let s = String(v).replace(/\$/g,'').replace(/\s+/g,'');
  // Step 2: if dot is used as thousands separator (e.g. 16.000 → 16000)
  // Detect: if dot exists but no comma, and the part after last dot is exactly 3 digits → thousands dot
  // Also handles 1.600.000 style
  if(s.includes('.') && !s.includes(',')){
    // Check if ALL dots are thousands separators (every group after dot = 3 digits)
    const parts = s.split('.');
    const allThousands = parts.slice(1).every(p=>p.length===3&&/^\d+$/.test(p));
    if(allThousands) s = parts.join(''); // remove all dots → 16000
    // else treat dot as decimal separator (leave as is)
  } else if(s.includes(',')&&s.includes('.')){
    // e.g. 1.600,50 → 1600.50
    s = s.replace(/\./g,'').replace(',','.');
  } else if(s.includes(',')){
    // comma as decimal: 16,000 → could be 16.0 or 16000; assume thousands if 3 digits after comma
    const afterComma = s.split(',')[1]||'';
    if(afterComma.length===3&&/^\d+$/.test(afterComma)) s=s.replace(',','');
    else s=s.replace(',','.');
  }
  const n=parseFloat(s);
  return isNaN(n)?0:Math.round(n);
}

function pFecha(v){
  if(!v||String(v).trim()==='') return null;
  v=String(v).trim();
  // Already YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  // Excel date string like "2026-01-03T00:00:00.000Z" or "Sat Jan 03 2026..."
  const iso=v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy=v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if(dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // MM/DD/YYYY (US)
  const mdy=v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(mdy&&Number(mdy[1])<=12) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`;
  // Date serial (Excel number)
  const n=Number(v);
  if(!isNaN(n)&&n>40000&&n<60000){
    const d=new Date(Math.round((n-25569)*86400*1000));
    return d.toISOString().split('T')[0];
  }
  return null;
}

function normalizeFP(v){
  // TF → TRF (used in the Cierre Diario), TK  → TK, EF → EF
  const s=String(v||'').toUpperCase().trim().replace(/\s+/g,'');
  if(s==='TF'||s==='TRF'||s.includes('TRANSF')) return 'TRF';
  if(s==='TK'||s.includes('TARJ')||s.includes('CARD')) return 'TK';
  return 'EF';
}

function normalizeTipo(v){
  const s=String(v||'').toLowerCase().trim();
  return s.includes('prod')?'PRODUCTO':'servicio';
}

function normalizeDiaSemana(v){
  // Capitalise and strip accents for display; map to canonical
  const map={domingo:'Domingo',lunes:'Lunes',martes:'Martes',miercoles:'Miércoles',
             'miércoles':'Miércoles',jueves:'Jueves',viernes:'Viernes',sabado:'Sábado','sábado':'Sábado'};
  const k=String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return map[k]||String(v||'').trim();
}

function parseVentasRows(rows){
  return rows.map((r,idx)=>{
    // === Compatible con el CSV limpio exportado Y con el XLSX Ventas v3 ===
    const barberoNombre = (getCol(r,'barbero','Barbero') || '').toUpperCase().trim();
    const fechaRaw = getCol(r,'fecha','Fecha');
    const fecha = pFecha(fechaRaw);
    const d = fecha ? new Date(fecha+'T12:00:00') : null;

    // Campos de fecha — vienen pre-calculados en el CSV limpio
    const anio   = pNum(getCol(r,'anio','Año','año')) || (d?d.getFullYear():null);
    const nMes   = pNum(getCol(r,'n_mes','N° Mes','nmes')) || (d?d.getMonth()+1:null);
    const mesNom = getCol(r,'mes','Mes') || (d?MESES[d.getMonth()]:'');
    const diaNum = pNum(getCol(r,'dia','Día Num')) || (d?d.getDate():null);
    const diaSem = normalizeDiaSemana(getCol(r,'dia_semana','Día','Dia semana')) || (d?DIAS_ES[d.getDay()]:'');

    const tipo   = normalizeTipo(getCol(r,'tipo','Tipo de Venta'));
    const fp     = normalizeFP(getCol(r,'forma_pago','Forma de pago','Forma pago'));
    const monto  = pNum(getCol(r,'monto','Monto'));
    const propina= pNum(getCol(r,'propina','Propina'));
    const desc   = pNum(getCol(r,'descuento','Descuento'));
    const totalR = pNum(getCol(r,'total','Total'));
    const total  = totalR || (monto+propina-desc);

    const codAuth= getCol(r,'cod_autorizacion','Cod Autorizacion','Cod. Autorizacion') || null;
    const boleta = getCol(r,'boleta','N° Boleta') || null;
    const cliente= getCol(r,'cliente','Cliente') || null;
    const svcProd= getCol(r,'servicio_producto','servicio/ Producto','servicio/producto') || '';
    const coment = getCol(r,'comentarios','Comentarios') || null;

    const errors=[];
    if(!fecha) errors.push('sin fecha');
    if(!barberoNombre) errors.push('sin barbero');
    if(!monto&&!total) errors.push('sin monto');

    return {
      _row:idx+2, _errors:errors, _barberoNombre:barberoNombre,
      barbero_nombre:barberoNombre, barbero_id:null,
      cod_autorizacion:codAuth||null, boleta:boleta||null,
      anio, n_mes:nMes, mes:mesNom, dia:diaNum, dia_semana:diaSem,
      fecha, tipo, cliente:cliente||null,
      servicio_producto:svcProd.trim(),
      monto, propina, descuento:desc, total,
      forma_pago:fp, es_web:false, comentarios:coment||null,
    };
  }).filter(r=>r._barberoNombre||r.fecha);
}

function parseGastosRows(rows){
  const CATS=['Arriendo','Servicios básicos','Insumos y productos','Equipamiento','Marketing','Sueldos/Comisiones','Anticipos','Mantenimiento','Otro'];
  return rows.map((r,idx)=>{
    const fecha=pFecha(getCol(r,'Fecha','fecha'));
    const monto=pNum(getCol(r,'Monto','monto','importe'));
    const desc=getCol(r,'Descripcion','descripción','descripcion','detalle')||'';
    let cat=getCol(r,'Categoria','categoría','categoria')||'Otro';
    cat=CATS.find(c=>c.toLowerCase()===cat.toLowerCase())||'Otro';
    const fp=normalizeFP(getCol(r,'Forma de pago','forma pago','pago'));
    const errors=[];
    if(!fecha) errors.push('sin fecha');
    if(!monto) errors.push('sin monto');
    if(!desc) errors.push('sin descripción');
    return {
      _row:idx+2,_errors:errors,
      fecha,descripcion:desc,categoria:cat,monto,
      forma_pago:fp,
      notas:getCol(r,'Notas','notas','comentarios')||null,
    };
  }).filter(r=>r.fecha||r.monto);
}

function renderImportPreview(tipo){
  const sec=document.getElementById('importPreviewSection');
  sec.style.display='block';
  const total=importPreview.length;
  const errRows=importPreview.filter(r=>r._errors&&r._errors.length>0);
  const okRows=importPreview.filter(r=>!r._errors||r._errors.length===0);

  // Resolve barbero IDs
  if(tipo==='ventas'){
    importPreview.forEach(r=>{
      if(!r._barberoNombre) return;
      const b=barberos.find(b=>
        b.nombre.toUpperCase()===r._barberoNombre ||
        b.nombre.toUpperCase().replace(/\s+/g,' ')===r._barberoNombre.replace(/\s+/g,' ')
      );
      if(b){r.barbero_id=b.id;r.barbero_nombre=b.nombre;}
      else if(!r._errors.find(e=>e.startsWith('barbero'))) r._errors.push('barbero no encontrado: '+r._barberoNombre);
    });
  }

  document.getElementById('importStats').innerHTML=`
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <span class="badge badge-blue">📄 ${total} filas leídas</span>
      <span class="badge badge-green">✓ ${okRows.length} válidas</span>
      ${errRows.length?`<span class="badge badge-amber">⚠ ${errRows.length} con advertencias</span>`:''}
    </div>`;

  const preview=importPreview.slice(0,10);
  let tbl='';
  if(tipo==='ventas'){
    tbl=`<table><thead><tr><th>#</th><th>Fecha</th><th>Barbero</th><th>Tipo</th><th>Servicio/Producto</th><th>Monto</th><th>Propina</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead><tbody>
    ${preview.map(r=>`<tr style="${r._errors.length?'background:#FFFBEB':''}">
      <td style="color:#64748B">${r._row}</td>
      <td>${r.fecha||'—'}</td>
      <td>${r.barbero_nombre||r._barberoNombre||'—'}</td>
      <td><span class="badge ${r.tipo==='servicio'?'badge-blue':'badge-green'}">${r.tipo}</span></td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.servicio_producto}">${r.servicio_producto||'—'}</td>
      <td>${fmtCLP(r.monto)}</td><td>${fmtCLP(r.propina)}</td>
      <td><strong>${fmtCLP(r.total)}</strong></td>
      <td><span class="badge ${r.forma_pago==='EF'?'badge-green':r.forma_pago==='TK'?'badge-blue':r.forma_pago==='MP'?'badge-mp':'badge-purple'}">${r.forma_pago}</span></td>
      <td>${r._errors.length?`<span class="badge badge-amber" title="${r._errors.join(', ')}">⚠ ${r._errors[0]}</span>`:'<span class="badge badge-green">✓</span>'}</td>
    </tr>`).join('')}
    </tbody></table>`;
  } else {
    tbl=`<table><thead><tr><th>#</th><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th>Pago</th><th>Estado</th></tr></thead><tbody>
    ${preview.map(r=>`<tr style="${r._errors.length?'background:#FFFBEB':''}">
      <td style="color:#64748B">${r._row}</td>
      <td>${r.fecha||'—'}</td><td>${r.descripcion||'—'}</td>
      <td><span class="badge badge-amber">${r.categoria}</span></td>
      <td><strong>${fmtCLP(r.monto)}</strong></td><td>${r.forma_pago}</td>
      <td>${r._errors.length?`<span class="badge badge-amber">${r._errors[0]}</span>`:'<span class="badge badge-green">✓</span>'}</td>
    </tr>`).join('')}
    </tbody></table>`;
  }
  if(importPreview.length>10) tbl+=`<p style="color:#64748B;font-size:12px;margin-top:8px">... y ${importPreview.length-10} filas más no mostradas</p>`;
  document.getElementById('importPreviewTable').innerHTML=tbl;

  // Warnings box
  let warn='';
  if(tipo==='ventas'){
    const noB=importPreview.filter(r=>!r.barbero_id);
    if(noB.length){
      const noms=[...new Set(noB.map(r=>r._barberoNombre))].filter(Boolean);
      warn+=`<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:10px;font-size:12px">
        <strong>⚠ Barberos no encontrados (${noB.length} filas):</strong> ${noms.join(', ')}<br>
        <span style="color:#64748B">Se importarán igual, sin asociar a barbero. Corrígelos después en Historial.</span>
      </div>`;
    }
  }
  document.getElementById('importWarnings').innerHTML=warn;

  const skip=importPreview.filter(r=>r._errors.includes('sin fecha')&&r._errors.includes('sin monto'));
  const toImport=total-skip.length;
  document.getElementById('importConfirmInfo').innerHTML=`
    Se importarán <strong>${toImport} registros</strong> de ${tipo}.
    ${skip.length?`<span style="color:var(--amber)"> (${skip.length} filas ignoradas por falta de fecha y monto)</span>`:''}
    <br><span style="color:#64748B;font-size:12px">⚠ Esta acción insertará los datos. Asegúrate de no duplicar importaciones del mismo período.</span>`;
}

async function confirmImport(){
  const tipo=document.getElementById('importTipo').value;
  const toInsert=importPreview.filter(r=>!(r._errors.includes('sin fecha')&&r._errors.includes('sin monto')));
  if(!toInsert.length){toast('No hay datos válidos','error');return;}
  if(!confirm(`¿Importar ${toInsert.length} registros de ${tipo}?`)) return;

  document.getElementById('importBtns').style.display='none';
  document.getElementById('importProgress').style.display='block';
  const fill=document.getElementById('importProgressFill');
  const txt=document.getElementById('importProgressText');

  const cleanRows=toInsert.map(r=>{
    const c={...r};
    delete c._row; delete c._errors; delete c._barberoNombre;
    Object.keys(c).forEach(k=>{if(c[k]===''||c[k]===undefined) c[k]=null;});
    return c;
  });

  const BATCH=50; let inserted=0, errs=0;
  for(let i=0;i<cleanRows.length;i+=BATCH){
    const batch=cleanRows.slice(i,i+BATCH);
    const {error}=tipo==='ventas'
      ?await sb.from('ventas').insert(batch)
      :await sb.from('gastos').insert(batch);
    if(error){errs+=batch.length;console.error(error);}
    else inserted+=batch.length;
    const pct=Math.round((i+batch.length)/cleanRows.length*100);
    fill.style.width=pct+'%';
    txt.textContent=`Procesando... ${i+batch.length} / ${cleanRows.length} (${pct}%)`;
    await new Promise(r=>setTimeout(r,30));
  }

  fill.style.width='100%';
  if(errs===0){
    txt.textContent=`✓ ¡Listo! ${inserted} registros importados correctamente.`;
    txt.style.color='var(--green)';
    toast(`✓ ${inserted} registros importados`);
  } else {
    txt.textContent=`Completado: ${inserted} OK · ${errs} con error`;
    txt.style.color='var(--amber)';
    toast(`${inserted} OK, ${errs} errores`,'error');
  }
  importPreview=[];
}

function cancelImport(){importPreview=[];loadImportar();}

export { cancelImport, confirmImport, loadImportar, processImportFile };
