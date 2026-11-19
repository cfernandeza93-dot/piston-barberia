// Inicio: login, navegación entre pestañas y registro de acciones de la pantalla
import { LOGIN_EMAIL, descargarRespaldo, sb } from './core.js';
import { addCartItem, clearCart, filtrarProductos, limpiarSeleccionProducto, loadVenta, removeCartItem, seleccionarProducto, submitVenta, ventaEsWebChange, ventaFechaChange, ventaFormaPagoChange, ventaServicioChange, ventaTipoChange } from './venta.js';
import { loadDashboard } from './dashboard.js';
import { cancelEditVenta, deleteVenta, exportHistorialCSV, loadHistorial, renderHistorial, saveEditVenta, startEditVenta } from './historial.js';
import { cancelEditProducto, deleteProducto, loadInventario, saveEditProducto, saveProducto, startEditProducto } from './inventario.js';
import { cancelEditGasto, deleteGasto, gastoFiltros, loadGastos, renderGastos, saveEditGasto, saveGasto, startEditGasto } from './gastos.js';
import { concilState, exportConcilErrors, loadConciliacion, processConcilFile, renderConciliacion, runConciliacion } from './conciliacion.js';
import { cancelEditBarbero, cancelEditServicio, deleteBarbero, deleteServicio, loadEquipo, saveBarbero, saveEditBarbero, saveEditServicio, saveServicio, startEditBarbero, startEditServicio } from './equipo.js';
import { cancelImport, confirmImport, loadImportar, processImportFile } from './importar.js';
import { arqueoExportCSV, loadArqueo, propagarSiguienteMes, saveSaldoFinal, saveSaldoInicial } from './arqueo.js';
import { gcCanjear, gcDeleteCard, gcDescargarPDF, gcDescargarPNG, gcPreview, gcSave, loadGiftCards } from './giftcards.js';
import { loadAnalisis } from './analisis.js';
import { loadLiquidacion } from './liquidacion.js';
import { loadPropuestas } from './propuestas.js';
import './propuestas_logic.js';

let currentTab = 'dashboard';

// ============ LOGIN ============
function enterApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='flex';
  const d=new Date();
  document.getElementById('topbarDate').textContent=d.toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  go('dashboard');
}
let loggingIn=false;
async function checkPw(){
  if(loggingIn) return;
  const v=document.getElementById('pwInput').value;
  const err=document.getElementById('loginErr');
  const btn=document.querySelector('#loginScreen button');
  err.textContent='';
  if(!v){err.textContent='Ingresa la contraseña';return;}
  loggingIn=true; if(btn){btn.disabled=true;btn.textContent='Ingresando...';}
  try{
    const {error}=await sb.auth.signInWithPassword({email:LOGIN_EMAIL,password:v});
    if(error){
      err.textContent = /invalid/i.test(error.message) ? 'Contraseña incorrecta' : 'No se pudo conectar. Revisa internet e intenta de nuevo.';
    } else {
      document.getElementById('pwInput').value='';
      enterApp();
    }
  } finally {
    loggingIn=false; if(btn){btn.disabled=false;btn.textContent='Ingresar';}
  }
}
async function logout(){
  await sb.auth.signOut();
  location.reload();
}
// Si este equipo ya inició sesión antes, entrar directo (la sesión se recuerda en el navegador)
sb.auth.getSession().then(({data})=>{ if(data?.session) enterApp(); });
// Si la sesión se pierde (p. ej. se cambió la contraseña), volver a la pantalla de login
sb.auth.onAuthStateChange((event, session)=>{
  if(event==='SIGNED_OUT' && document.getElementById('app').style.display==='flex') location.reload();
});

// ============ TABS ============
function go(tab){
  currentTab=tab;
  document.querySelectorAll('.tab-btn').forEach((b,i)=>{
    const tabs=['dashboard','venta','propuestas','historial','inventario','gastos','conciliacion','equipo','arqueo','analisis','liquidacion','importar'];
    b.classList.toggle('active',tabs[i]===tab);
  });
  const fns={dashboard:loadDashboard,venta:loadVenta,propuestas:loadPropuestas,historial:loadHistorial,inventario:loadInventario,gastos:loadGastos,conciliacion:loadConciliacion,equipo:loadEquipo,arqueo:loadArqueo,analisis:loadAnalisis,liquidacion:loadLiquidacion,importar:loadImportar};
  fns[tab]&&fns[tab]();
}

// ============ BRIDGE ASSIGNMENTS ============
window._bridge.checkPw=checkPw;
window._bridge.go=go;
window._bridge.loadDashboard=loadDashboard;
window._bridge.loadVenta=loadVenta;
window._bridge.loadHistorial=loadHistorial;
window._bridge.loadInventario=loadInventario;
window._bridge.loadGastos=loadGastos;
window._bridge.loadConciliacion=loadConciliacion;
window._bridge.loadEquipo=loadEquipo;
window._bridge.submitVenta=submitVenta;
window._bridge.addCartItem=addCartItem;
window._bridge.removeCartItem=removeCartItem;
window._bridge.clearCart=clearCart;
window._bridge.filtrarProductos=filtrarProductos;
window._bridge.seleccionarProducto=seleccionarProducto;
window._bridge.limpiarSeleccionProducto=limpiarSeleccionProducto;
window._bridge.filterHistorial=renderHistorial;
window._bridge.deleteVenta=deleteVenta;
window._bridge.startEditVenta=startEditVenta;
window._bridge.saveEditVenta=saveEditVenta;
window._bridge.cancelEditVenta=cancelEditVenta;
window._bridge.exportHistorialCSV=exportHistorialCSV;
window._bridge.saveProducto=saveProducto;
window._bridge.deleteProducto=deleteProducto;
window._bridge.startEditProducto=startEditProducto;
window._bridge.saveEditProducto=saveEditProducto;
window._bridge.cancelEditProducto=cancelEditProducto;
window._bridge.saveGasto=saveGasto;
window._bridge.deleteGasto=deleteGasto;
window._bridge.startEditGasto=startEditGasto;
window._bridge.saveEditGasto=saveEditGasto;
window._bridge.cancelEditGasto=cancelEditGasto;
window._bridge.processConcilFile=processConcilFile;
window._bridge.exportConcilErrors=exportConcilErrors;
window._bridge.saveBarbero=saveBarbero;
window._bridge.deleteBarbero=deleteBarbero;
window._bridge.startEditBarbero=startEditBarbero;
window._bridge.saveEditBarbero=saveEditBarbero;
window._bridge.cancelEditBarbero=cancelEditBarbero;
window._bridge.saveServicio=saveServicio;
window._bridge.deleteServicio=deleteServicio;
window._bridge.startEditServicio=startEditServicio;
window._bridge.saveEditServicio=saveEditServicio;
window._bridge.cancelEditServicio=cancelEditServicio;
window._bridge.ventaFechaChange=ventaFechaChange;
window._bridge.ventaTipoChange=ventaTipoChange;
window._bridge.ventaFormaPagoChange=ventaFormaPagoChange;
window._bridge.ventaServicioChange=ventaServicioChange;
window._bridge.ventaEsWebChange=ventaEsWebChange;
window._bridge.loadImportar=loadImportar;
window._bridge.processImportFile=processImportFile;
window._bridge.confirmImport=confirmImport;
window._bridge.cancelImport=cancelImport;
window._bridge.concilSetAnio=v=>{concilState.anio=Number(v);renderConciliacion();};
window._bridge.concilSetMes=v=>{concilState.mes=Number(v);renderConciliacion();};
window._bridge.runConciliacion=runConciliacion;
window._bridge.loadArqueo=loadArqueo;
window._bridge.loadAnalisis=loadAnalisis;
window._bridge.loadLiquidacion=loadLiquidacion;
window._bridge.arqueoExportCSV=arqueoExportCSV;
window._bridge.saveSaldoInicial=saveSaldoInicial;
window._bridge.saveSaldoFinal=saveSaldoFinal;
window._bridge.propagarSiguienteMes=propagarSiguienteMes;
window._bridge.gastoSetAnio=v=>{gastoFiltros.anio=Number(v);renderGastos();};
window._bridge.gastoSetMes=v=>{gastoFiltros.mes=Number(v);renderGastos();};
window._bridge.loadGiftCards=loadGiftCards;
window._bridge.gcPreview=gcPreview;
window._bridge.gcSave=gcSave;
window._bridge.gcDescargarPNG=gcDescargarPNG;
window._bridge.gcDescargarPDF=gcDescargarPDF;
window._bridge.gcCanjear=gcCanjear;
window._bridge.gcDeleteCard=gcDeleteCard;
window._bridge.dshTab=()=>{};
window._bridge.logout=logout;
window._bridge.descargarRespaldo=descargarRespaldo;
