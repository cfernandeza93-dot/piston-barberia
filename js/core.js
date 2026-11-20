// Núcleo: conexión a Supabase, utilidades, catálogos y respaldo
// (archivo generado al separar index.html; desde ahora se edita directamente)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = 'https://ssirnhqtmjxuuuwyilmp.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzaXJuaHF0bWp4dXV1d3lpbG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTc5MTYsImV4cCI6MjA4OTU3MzkxNn0.4CS47Dk7B5cgTiJdLctKxuqXuDvPvnwLfg9RODu4FN8';
const sb = createClient(SB_URL, SB_KEY);

// Usuario único de la barbería en Supabase Auth. La contraseña NO está en el código:
// se valida en Supabase. Para cambiarla: Supabase > Authentication > Users.
const LOGIN_EMAIL = 'equipo@pistonbarberia.cl';
let MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let DIAS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let barberos = [], servicios = [], productos = [];

// ============ UTILS ============
function showOverlay(){document.getElementById('overlay').style.display='flex'}
function hideOverlay(){document.getElementById('overlay').style.display='none'}
function toast(msg,type='success'){
  const c=document.getElementById('toast-container');
  const t=document.createElement('div');
  t.className=`toast toast-${type}`;t.textContent=msg;c.appendChild(t);
  setTimeout(()=>t.remove(),3000);
}
function fmt(n){return Number(n||0).toLocaleString('es-CL')}
function fmtCLP(n){return '$'+fmt(n)}
// Fecha local (Chile) en formato YYYY-MM-DD. No usar toISOString(): trabaja en UTC
// y después de las 21:00 en Chile devuelve la fecha del día siguiente.
function localISODate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function today(){return localISODate(new Date())}
function pad(n){return String(n).padStart(2,'0')}

async function loadCatalogos(){
  const [b,s,p]=await Promise.all([
    sb.from('barberos').select('*').order('nombre'),
    sb.from('servicios').select('*').order('nombre'),
    sb.from('productos').select('*').order('nombre')
  ]);
  barberos=b.data||[];servicios=s.data||[];productos=p.data||[];
}

// ============ RESPALDO ============
// Descarga una copia completa de todas las tablas en un archivo .json
const TABLAS_RESPALDO=['ventas','gastos','barberos','servicios','productos','getnet_transacciones','adelantos_santander','caja_saldo_inicial','gift_cards','horarios_barbero','bloqueos_barbero','citas','propuestas_venta','agenda_citas','clientes_seguimiento'];
async function descargarRespaldo(){
  showOverlay();
  try{
    const out={generado:new Date().toISOString(),tablas:{}};
    for(const t of TABLAS_RESPALDO){
      const filas=[];
      for(let desde=0;;desde+=1000){
        const {data,error}=await sb.from(t).select('*').range(desde,desde+999);
        if(error) throw new Error(`${t}: ${error.message}`);
        filas.push(...data);
        if(data.length<1000) break;
      }
      out.tablas[t]=filas;
    }
    const blob=new Blob([JSON.stringify(out)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`respaldo_piston_${today()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    const total=Object.values(out.tablas).reduce((s,x)=>s+x.length,0);
    toast(`Respaldo descargado (${fmt(total)} registros)`);
  }catch(e){
    toast('Error al generar respaldo: '+e.message,'error');
  }finally{hideOverlay();}
}

// SheetJS loaded on demand
let XLSX_LIB = null;
async function getXLSX(){
  if(XLSX_LIB) return XLSX_LIB;
  await new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
  XLSX_LIB=window.XLSX;
  return XLSX_LIB;
}

export { DIAS_ES, LOGIN_EMAIL, MESES, barberos, descargarRespaldo, fmtCLP, getXLSX, hideOverlay, loadCatalogos, localISODate, productos, sb, servicios, showOverlay, toast, today };
