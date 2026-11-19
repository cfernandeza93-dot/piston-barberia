// Gift Cards (pestaña oculta)
import { hideOverlay, loadCatalogos, localISODate, sb, servicios, showOverlay, toast, today } from './core.js';

// ============ GIFT CARDS ============
let gcData = [];

function gcGenerarCodigo(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'GC-';
  for(let i=0;i<4;i++){
    for(let j=0;j<4;j++) code+=chars[Math.floor(Math.random()*chars.length)];
    if(i<3) code+='-';
  }
  return code;
}

async function loadGiftCards(){
  showOverlay();
  await loadCatalogos();
  const {data} = await sb.from('gift_cards').select('*').order('created_at',{ascending:false});
  gcData = data||[];
  hideOverlay();
  renderGiftCards();
}

function renderGiftCards(){
  const activas    = gcData.filter(g=>g.estado==='activa').length;
  const canjeadas  = gcData.filter(g=>g.estado==='canjeada').length;
  const svcOpts    = servicios.map(s=>`<option value="${s.nombre}">${s.nombre}</option>`).join('');

  document.getElementById('mainContent').innerHTML=`
  <div class="sec-title">🎁 Gift Cards</div>

  <div class="grid-3" style="margin-bottom:20px">
    <div class="metric"><div class="metric-label">Emitidas</div><div class="metric-value">${gcData.length}</div><div class="metric-sub">en total</div></div>
    <div class="metric"><div class="metric-label">Activas</div><div class="metric-value" style="color:var(--green)">${activas}</div><div class="metric-sub">por canjear</div></div>
    <div class="metric"><div class="metric-label">Canjeadas</div><div class="metric-value" style="color:var(--blue)">${canjeadas}</div></div>
  </div>

  <div class="grid-2" style="align-items:start;gap:20px">
    <!-- FORMULARIO -->
    <div>
      <div class="section-card" style="margin-bottom:16px">
        <div class="card-title">Nueva Gift Card</div>

        <div class="form-row">
          <div class="form-group">
            <label>Nombre del destinatario</label>
            <input type="text" id="gcNombre" placeholder="Ej: Juan Pérez" oninput="gcPreview()">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Servicio</label>
            <select id="gcServicio" onchange="gcPreview()">
              <option value="">-- Seleccionar servicio --</option>
              ${svcOpts}
              <option value="__custom__">Otro (escribir)...</option>
            </select>
          </div>
        </div>
        <div id="gcServicioCustomDiv" style="display:none;margin-bottom:12px">
          <div class="form-group">
            <label>Servicio personalizado</label>
            <input type="text" id="gcServicioCustom" placeholder="Describe el servicio" oninput="gcPreview()">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group" style="flex:0 0 180px">
            <label>Válida hasta</label>
            <input type="date" id="gcVencimiento" oninput="gcPreview()">
          </div>
          <div class="form-group">
            <label>Código</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="text" id="gcCodigo" value="${gcGenerarCodigo()}" style="font-family:monospace;font-weight:700;letter-spacing:1px">
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('gcCodigo').value=gcGenerarCodigo();gcPreview()" title="Nuevo código">🔄</button>
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn btn-primary" style="flex:1;padding:10px;font-size:13px" onclick="gcSave()">💾 Guardar y Descargar PNG</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px;justify-content:center">
          <button class="btn btn-ghost btn-sm" onclick="gcDescargarPNG()">⬇ Solo PNG</button>
          <button class="btn btn-ghost btn-sm" onclick="gcDescargarPDF()">⬇ Solo PDF</button>
        </div>
      </div>

      <!-- Vista Previa -->
      <div class="card" style="padding:16px">
        <div class="card-title">Vista Previa</div>
        <canvas id="gcCanvas" style="width:100%;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.2)"></canvas>
      </div>
    </div>

    <!-- HISTORIAL -->
    <div class="card">
      <div class="card-title">Historial (${gcData.length})</div>
      <div style="overflow-x:auto;max-height:680px;overflow-y:auto">
      <table>
        <thead><tr><th>Código</th><th>Nombre</th><th>Servicio</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${gcData.length===0
            ? '<tr><td colspan="6" style="text-align:center;color:#64748B;padding:20px">Sin gift cards emitidas</td></tr>'
            : gcData.map(g=>`<tr>
                <td style="font-family:monospace;font-size:11px;font-weight:700">${g.codigo}</td>
                <td>${g.destinatario||'—'}</td>
                <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">${g.servicio||g.mensaje||'—'}</td>
                <td style="font-size:11px;color:#64748B">${g.fecha_vencimiento||'—'}</td>
                <td><span class="badge ${g.estado==='activa'?'badge-green':'badge-blue'}">${g.estado}</span></td>
                <td style="white-space:nowrap">
                  <button class="btn btn-ghost btn-sm" onclick="window._bridge.gcReimprimir('${g.id}')" title="Reimprimir">🖨</button>
                  ${g.estado==='activa'?`<button class="btn btn-primary btn-sm" onclick="gcCanjear('${g.id}')">✓</button>`:''}
                  <button class="btn btn-danger btn-sm" onclick="gcDeleteCard('${g.id}')">🗑</button>
                </td>
              </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
  </div>`;

  // Servicio custom handler
  document.getElementById('gcServicio').onchange = function(){
    const isCustom = this.value==='__custom__';
    document.getElementById('gcServicioCustomDiv').style.display = isCustom?'block':'none';
    gcPreview();
  };

  // Default vencimiento 6 meses
  const def=new Date(); def.setMonth(def.getMonth()+6);
  document.getElementById('gcVencimiento').value = localISODate(def);

  setTimeout(gcPreview, 80);

  // Reimprimir desde historial
  window._bridge.gcReimprimir = id=>{
    const g=gcData.find(x=>x.id===id); if(!g) return;
    document.getElementById('gcNombre').value = g.destinatario||'';
    // Set servicio
    const sel=document.getElementById('gcServicio');
    const opt=[...sel.options].find(o=>o.value===g.servicio||o.value===g.mensaje);
    if(opt){ sel.value=opt.value; document.getElementById('gcServicioCustomDiv').style.display='none'; }
    else if(g.servicio){ sel.value='__custom__'; document.getElementById('gcServicioCustomDiv').style.display='block'; document.getElementById('gcServicioCustom').value=g.servicio; }
    document.getElementById('gcVencimiento').value = g.fecha_vencimiento||'';
    document.getElementById('gcCodigo').value = g.codigo;
    gcPreview();
    window.scrollTo(0,0);
  };
}

function gcPreview(){
  const canvas=document.getElementById('gcCanvas'); if(!canvas) return;

  // Tamaño real de la card (proporción 16:9 landscape)
  const W=900, H=506;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,W,H);

  // =============================================
  // PANEL IZQUIERDO — simulación foto B&W
  // =============================================
  const splitX = 380;

  // Fondo oscuro B&W panel izquierdo
  const bgGrad=ctx.createLinearGradient(0,0,splitX,H);
  bgGrad.addColorStop(0,'#1a1a1a');
  bgGrad.addColorStop(0.4,'#2d2d2d');
  bgGrad.addColorStop(1,'#111111');
  ctx.fillStyle=bgGrad;
  ctx.fillRect(0,0,splitX,H);

  // Clip al panel izquierdo para decoraciones
  ctx.save();
  ctx.beginPath(); ctx.rect(0,0,splitX,H); ctx.clip();

  // Siluetas estilizadas de sillones de barbería (B&W)
  function drawChair(cx,cy,scale,alpha){
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.translate(cx,cy);
    ctx.scale(scale,scale);
    ctx.fillStyle='#888';
    // Base del sillón
    ctx.beginPath();ctx.roundRect(-30,30,60,15,4);ctx.fill();
    // Pata central
    ctx.fillRect(-6,45,12,30);
    // Base giratoria
    ctx.beginPath();ctx.ellipse(0,78,20,5,0,0,Math.PI*2);ctx.fill();
    // Asiento
    ctx.fillStyle='#555';
    ctx.beginPath();ctx.roundRect(-28,10,56,22,5);ctx.fill();
    // Respaldo
    ctx.fillStyle='#444';
    ctx.beginPath();ctx.roundRect(-24,-40,48,52,8);ctx.fill();
    // Cabecero
    ctx.fillStyle='#666';
    ctx.beginPath();ctx.roundRect(-18,-52,36,14,4);ctx.fill();
    // Brazos
    ctx.fillStyle='#555';
    ctx.beginPath();ctx.roundRect(-32,5,8,20,3);ctx.fill();
    ctx.beginPath();ctx.roundRect(24,5,8,20,3);ctx.fill();
    // Ribetes dorados sutiles
    ctx.strokeStyle='rgba(180,150,60,0.4)'; ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(-24,-40,48,52,8);ctx.stroke();
    ctx.restore();
  }

  drawChair(100,340,1.6,0.9);
  drawChair(240,360,1.4,0.75);
  drawChair(340,370,1.2,0.5);

  // Efecto techo con vigas
  ctx.fillStyle='rgba(50,50,50,0.8)';
  ctx.fillRect(0,0,splitX,60);
  for(let i=0;i<5;i++){
    ctx.fillStyle='rgba(80,80,80,0.6)';
    ctx.fillRect(i*80-10,0,12,60);
  }
  // Luces en techo
  [60,180,300].forEach(lx=>{
    const lg=ctx.createRadialGradient(lx,30,0,lx,30,40);
    lg.addColorStop(0,'rgba(255,255,220,0.25)');
    lg.addColorStop(1,'rgba(255,255,220,0)');
    ctx.fillStyle=lg;
    ctx.beginPath();ctx.arc(lx,30,40,0,Math.PI*2);ctx.fill();
  });

  // Overlay gradiente para integrar los dos paneles
  const overlayGrad=ctx.createLinearGradient(splitX-80,0,splitX,0);
  overlayGrad.addColorStop(0,'rgba(0,0,0,0)');
  overlayGrad.addColorStop(1,'rgba(0,0,0,1)');
  ctx.fillStyle=overlayGrad;
  ctx.fillRect(splitX-80,0,80,H);

  ctx.restore();

  // =============================================
  // PANEL DERECHO — negro con diseño Píston
  // =============================================
  ctx.fillStyle='#000000';
  ctx.fillRect(splitX,0,W-splitX,H);

  const RX=splitX+20; // margen izquierdo del panel derecho
  const RW=W-splitX-40; // ancho útil

  // --- LOGO PISTÓN ---
  // Nombre grande estilo display
  ctx.save();
  ctx.textAlign='center';
  const centerX=splitX+(W-splitX)/2;

  // "PISTÓN" grande
  ctx.fillStyle='#FFFFFF';
  ctx.font=`bold 68px "Georgia", serif`;
  ctx.letterSpacing='8px';
  ctx.fillText('PISTÓN', centerX, 105);
  ctx.letterSpacing='0px';

  // Líneas decorativas al costado de "BARBERIA"
  ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=0.8;
  const barbW=ctx.measureText('· BARBERIA ·').width;
  ctx.beginPath();ctx.moveTo(centerX-120,127);ctx.lineTo(centerX-55,127);ctx.stroke();
  ctx.beginPath();ctx.moveTo(centerX+55,127);ctx.lineTo(centerX+120,127);ctx.stroke();

  ctx.fillStyle='rgba(255,255,255,0.7)';
  ctx.font='bold 13px "Segoe UI", sans-serif';
  ctx.letterSpacing='5px';
  ctx.fillText('· BARBERIA ·', centerX, 131);
  ctx.letterSpacing='0px';

  // --- "Gift Card" en script ---
  ctx.fillStyle='#FFFFFF';
  ctx.font=`italic bold 52px "Georgia", "Times New Roman", serif`;
  ctx.fillText('Gift Card', centerX, 200);

  // Línea decorativa separadora con ornamento
  const lineY=222;
  ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=0.8;
  ctx.beginPath();ctx.moveTo(RX,lineY);ctx.lineTo(W-20,lineY);ctx.stroke();
  // Ornamento central
  ctx.fillStyle='rgba(255,255,255,0.3)';
  ctx.font='14px serif';
  ctx.fillText('❖', centerX-6, lineY+4);

  ctx.restore();

  // --- CAMPOS NOMBRE y SERVICIO ---
  const fieldY1=255, fieldY2=320;
  const fieldX=RX+10;
  const fieldW=RW-20;
  const fieldH=36;

  function drawField(label, value, y){
    // Label
    ctx.fillStyle='#FFFFFF';
    ctx.font=`bold 13px "Georgia", serif`;
    ctx.letterSpacing='1px';
    ctx.fillText(label.toUpperCase()+':', fieldX, y-6);
    ctx.letterSpacing='0px';
    // Campo (rectángulo gris redondeado)
    ctx.fillStyle='rgba(140,140,140,0.55)';
    ctx.beginPath(); ctx.roundRect(fieldX, y, fieldW, fieldH, 18); ctx.fill();
    // Valor dentro del campo
    if(value){
      ctx.fillStyle='#FFFFFF';
      ctx.font=`bold 16px "Segoe UI", sans-serif`;
      ctx.textAlign='left';
      // Truncate if too long
      let txt=value;
      while(ctx.measureText(txt).width > fieldW-24 && txt.length>1) txt=txt.slice(0,-1)+'…';
      ctx.fillText(txt, fieldX+16, y+24);
    }
  }

  ctx.textAlign='left';
  const nombre  = document.getElementById('gcNombre')?.value||'';
  const servicio= gcGetServicio();
  drawField('Nombre',  nombre,   fieldY1);
  drawField('Servicio', servicio, fieldY2);

  // --- FOOTER con info de contacto ---
  const footerY=H-50;
  ctx.fillStyle='rgba(255,255,255,0.08)';
  ctx.fillRect(splitX, footerY-10, W-splitX, H-(footerY-10));

  ctx.fillStyle='rgba(255,255,255,0.55)';
  ctx.font='11px "Segoe UI", sans-serif';
  ctx.textAlign='left';

  // Instagram
  ctx.fillText('📷', RX, footerY+16);
  ctx.fillText('@piston.barberia', RX+18, footerY+16);
  // WhatsApp
  const wp=RX+145;
  ctx.fillText('💬', wp, footerY+16);
  ctx.fillText('+56 9 3083 3374', wp+18, footerY+16);
  // Dirección
  const loc=wp+145;
  ctx.fillText('📍', loc, footerY+16);
  ctx.fillText('Av. Consistorial 2590, Peñalolén', loc+18, footerY+16);

  // Código y vencimiento en footer
  const cod=document.getElementById('gcCodigo')?.value||'';
  const venc=document.getElementById('gcVencimiento')?.value;
  if(cod){
    ctx.textAlign='right';
    ctx.fillStyle='rgba(255,255,255,0.35)';
    ctx.font='9px "Courier New", monospace';
    ctx.fillText(cod, W-20, footerY+8);
    if(venc){
      const d=new Date(venc+'T12:00:00');
      ctx.fillText('Válida hasta: '+d.toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'}), W-20, footerY+20);
    }
    ctx.textAlign='left';
  }
}

function gcGetServicio(){
  const sel=document.getElementById('gcServicio');
  if(!sel) return '';
  if(sel.value==='__custom__') return document.getElementById('gcServicioCustom')?.value||'';
  return sel.value;
}

async function gcSave(){
  const nombre = document.getElementById('gcNombre')?.value?.trim();
  const servicio = gcGetServicio();
  const codigo  = document.getElementById('gcCodigo')?.value?.trim();
  if(!nombre){toast('Ingresa el nombre del destinatario','error');return;}
  if(!servicio){toast('Selecciona el servicio','error');return;}
  if(!codigo){toast('Genera un código','error');return;}
  const obj={
    codigo, destinatario:nombre, servicio, mensaje:servicio, monto:0,
    fecha_vencimiento:document.getElementById('gcVencimiento')?.value||null,
    fecha_emision:today(), estado:'activa',
  };
  showOverlay();
  const {error}=await sb.from('gift_cards').insert(obj);
  hideOverlay();
  if(error){ if(error.message.includes('unique')) toast('Código duplicado, genera uno nuevo','error'); else toast('Error: '+error.message,'error'); return; }
  toast('✓ Gift card guardada');
  gcPreview();
  setTimeout(()=>gcDescargarPNG(false),100);
  loadGiftCards();
}

function gcDescargarPNG(standalone=true){
  const canvas=document.getElementById('gcCanvas');
  if(!canvas){if(standalone)toast('Genera una vista previa primero','error');return;}
  gcPreview();
  const codigo=document.getElementById('gcCodigo')?.value||'giftcard';
  const link=document.createElement('a');
  link.download=`GiftCard_Piston_${codigo}.png`;
  link.href=canvas.toDataURL('image/png',1.0);
  link.click();
  if(standalone) toast('✓ PNG descargado');
}

async function gcDescargarPDF(){
  const canvas=document.getElementById('gcCanvas');
  if(!canvas){toast('Genera una vista previa primero','error');return;}
  gcPreview();
  if(!window.jspdf){
    await new Promise((res,rej)=>{
      const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
  }
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF({orientation:'landscape',unit:'px',format:[900,506],hotfixes:['px_scaling']});
  pdf.addImage(canvas.toDataURL('image/png',1.0),'PNG',0,0,900,506);
  const codigo=document.getElementById('gcCodigo')?.value||'giftcard';
  pdf.save(`GiftCard_Piston_${codigo}.pdf`);
  toast('✓ PDF descargado');
}

async function gcCanjear(id){
  if(!confirm('¿Marcar como canjeada?')) return;
  showOverlay();
  const {error}=await sb.from('gift_cards').update({estado:'canjeada',canjeada_en:today()}).eq('id',id);
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  toast('✓ Gift card canjeada');
  loadGiftCards();
}

async function gcDeleteCard(id){
  if(!confirm('¿Eliminar esta gift card?')) return;
  showOverlay();
  const {error}=await sb.from('gift_cards').delete().eq('id',id);
  hideOverlay();
  if(error){toast('Error: '+error.message,'error');return;}
  gcData=gcData.filter(g=>g.id!==id);
  toast('✓ Eliminada');
  renderGiftCards();
}

export { gcCanjear, gcDeleteCard, gcDescargarPDF, gcDescargarPNG, gcPreview, gcSave, loadGiftCards };
