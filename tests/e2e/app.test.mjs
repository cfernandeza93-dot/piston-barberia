// Pruebas de pantalla: abre la app real en Chrome con una base de datos falsa (mock-supabase.js).
// Correr con:  cd tests && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let server, browser, base;

before(async () => {
  server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
});
after(async () => { await browser?.close(); server?.close(); });

const mockSrc = () => {
  const fx = fs.readFileSync(path.join(ROOT, 'tests/e2e/fixtures.js'), 'utf8').replace('export const seed', 'const seed');
  const mk = fs.readFileSync(path.join(ROOT, 'tests/e2e/mock-supabase.js'), 'utf8').replace(/^import .*fixtures\.js.*$/m, '');
  return fx + '\n' + mk;
};

async function abrir({ login = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  page.on('pageerror', e => errores.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push('console: ' + m.text()); });
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(base)) return route.continue();
    if (u.startsWith('https://esm.sh/@supabase/supabase-js')) return route.fulfill({ contentType: 'text/javascript', body: mockSrc() });
    if (u.includes('/xlsx/') && u.endsWith('xlsx.full.min.js')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'), 'utf8') });
    return route.abort();
  });
  await page.goto(base + '/index.html');
  await page.waitForFunction(() => window._bridge && typeof window._bridge.checkPw === 'function');
  if (login) {
    await page.fill('#pwInput', 'clave-de-prueba');
    await page.click('#loginScreen button');
    await page.waitForSelector('#app', { state: 'visible' });
  }
  return { page, errores };
}
const esperar = (page, ms = 400) => page.waitForTimeout(ms);

test('login: rechaza una clave incorrecta y entra con la correcta', async () => {
  const { page, errores } = await abrir({ login: false });
  assert.ok(await page.isVisible('#loginScreen'));
  await page.fill('#pwInput', 'mala');
  await page.click('#loginScreen button');
  await page.waitForFunction(() => document.getElementById('loginErr').textContent.includes('incorrecta'));
  await page.fill('#pwInput', 'clave-de-prueba');
  await page.click('#loginScreen button');
  await page.waitForSelector('#app', { state: 'visible' });
  assert.deepEqual(errores, []);
  await page.close();
});

test('todas las pestañas cargan sin errores', async () => {
  const { page, errores } = await abrir();
  const tabs = await page.$$eval('.tab-btn', bs => bs.map(b => b.textContent.trim()));
  assert.ok(tabs.length >= 12, 'deberían existir al menos 12 pestañas');
  for (let i = 0; i < tabs.length; i++) {
    await page.click(`.tab-btn >> nth=${i}`);
    await esperar(page, 600);
    const txt = await page.textContent('#mainContent');
    assert.ok(txt.trim().length > 30, `la pestaña "${tabs[i]}" quedó vacía`);
    assert.ok(!/Cargando/.test(txt) || /Liquidaci/.test(tabs[i]), `la pestaña "${tabs[i]}" se quedó cargando`);
    assert.deepEqual(errores, [], `errores en la pestaña "${tabs[i]}"`);
  }
  // Liquidación sigue protegida
  await page.click('.tab-btn:has-text("Liquidación")');
  await esperar(page);
  assert.match(await page.textContent('#mainContent'), /Módulo restringido/);
  await page.close();
});

test('Nueva Venta registra una venta en efectivo', async () => {
  const { page, errores } = await abrir();
  await page.click('.tab-btn:has-text("Nueva Venta")');
  await esperar(page);
  const antes = await page.evaluate(() => window.__db.ventas.length);
  await page.selectOption('#vBarbero', { label: 'HUGO JARAMILLO' });
  await page.selectOption('#vServicio', { index: 2 });
  await page.selectOption('#vFormaPago', 'EF');
  await page.fill('#vCliente', 'CLIENTE E2E');
  await page.click('button:has-text("Registrar Venta")');
  await page.waitForFunction(n => window.__db.ventas.length > n, antes);
  const v = await page.evaluate(() => window.__db.ventas.at(-1));
  assert.equal(v.barbero_nombre, 'HUGO JARAMILLO');
  assert.equal(v.forma_pago, 'EF');
  assert.equal(v.cliente, 'CLIENTE E2E');
  assert.ok(v.monto > 0);
  assert.deepEqual(errores, []);
  await page.close();
});

test('Propuestas: importa el reporte de AgendaPro, sugiere y acepta', async () => {
  const { page, errores } = await abrir();
  // Reporte con el formato real de AgendaPro (Nombre / Apellido / Pago asociado)
  const filas = [
    ['Fecha de realización', 'Local', 'N° de Cliente', 'Nombre', 'Apellido', 'Servicio', 'Precio real', 'Prestador', 'Estado', 'Estado de pago'],
    ['15/11/2026 17:00', 'P', '', 'Esteban', 'Prueba', 'Corte de Cabello', 16000, 'Samuel Leon', 'Asiste', 'No pagada'],
    ['16/11/2026 10:20', 'P', '', 'Ana', 'Prueba', 'Corte de Cabello', 16000, 'Samuel Leon', 'Asiste', 'No pagada'],
    ['16/11/2026 17:00', 'P', '', 'Juan', 'Prueba', 'Corte de Cabello', 16000, 'Lebrom Avendaño', 'Asiste', 'No pagada'],
    ['16/11/2026 18:00', 'P', '', 'Clemente', 'Prueba', 'Corte de Cabello', 16000, 'Hugo Jaramillo', 'Asiste', 'No pagada'],
    ['16/11/2026 18:40', 'P', '', 'Clemente', 'Prueba', 'Corte de Cabello', 16000, 'Hugo Jaramillo', 'Asiste', 'No pagada'],
    ['16/11/2026 12:00', 'P', '', 'Pedro', 'Prueba', 'Corte de Cabello', 16000, 'Mailin Chaparro', 'Asiste', 'Pago asociado'],
    ['16/11/2026 13:00', 'P', '', 'No', 'Vino', 'Corte de Cabello', 16000, 'Mailin Chaparro', 'No Asiste', 'No pagada'],
  ];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Reservas');
  const tmp = path.join(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'ap-')), 'reservas.xlsx');
  XLSX.writeFile(wb, tmp);

  await page.click('.tab-btn:has-text("Propuestas")');
  await esperar(page);
  await page.setInputFiles('#mainContent input[type=file]', tmp);
  await page.waitForFunction(() => window.__db.propuestas_venta.length === 6);
  await esperar(page, 600);
  const P = await page.evaluate(() => window.__db.propuestas_venta);
  assert.equal(P.filter(p => p.estado === 'registrada').length, 1, 'la cita del 15 ya tenía venta');
  assert.equal(P.filter(p => p.estado === 'pendiente').length, 5);
  assert.ok(P.find(p => p.cliente === 'Pedro Prueba').pagada_agenda, '"Pago asociado" = $ verde');

  const txt = await page.textContent('#mainContent');
  assert.match(txt, /Pago GetNet a las 11:05 \(cita 10:20\)/);
  assert.match(txt, /= 2 servicios de Clemente Prueba/);
  assert.match(txt, /Cuadra con GetNet/);

  // Aceptar la de Ana (falta boleta -> error; con boleta -> venta creada)
  const ana = P.find(p => p.cliente === 'Ana Prueba');
  const card = page.locator(`.prop-card[data-prop-id="${ana.id}"]`);
  await card.locator('button:has-text("Aceptar")').click();
  await page.waitForSelector('.toast-error:has-text("Boleta")');
  await card.locator('input[placeholder="N° Boleta *"]').fill('555');
  await card.locator('input[placeholder="N° Boleta *"]').dispatchEvent('change');
  // el borrador se guarda solo
  await page.waitForFunction(id => window.__db.propuestas_venta.find(p => p.id === id).borrador?.boleta === '555', ana.id);
  await card.locator('button:has-text("Aceptar")').click();
  await page.waitForFunction(() => window.__db.ventas.some(v => v.cod_autorizacion === '200001'));
  const v = await page.evaluate(() => window.__db.ventas.find(v => v.cod_autorizacion === '200001'));
  assert.equal(v.barbero_nombre, 'SAMUEL LEON');
  assert.equal(v.forma_pago, 'TK');
  assert.equal(v.boleta, '555');
  assert.equal(v.total, 16000);
  const anaDb = await page.evaluate(id => window.__db.propuestas_venta.find(p => p.id === id), ana.id);
  assert.equal(anaDb.estado, 'aceptada');
  assert.equal(anaDb.borrador, null);

  // Si el pago no cuadra con GetNet, pide confirmar antes de crear la venta
  const juan = P.find(p => p.cliente === 'Juan Prueba');
  const cj = page.locator(`.prop-card[data-prop-id="${juan.id}"]`);
  await cj.locator('input[placeholder="N° Boleta *"]').fill('777');
  await cj.locator('input[placeholder="N° Boleta *"]').dispatchEvent('change');
  const monto = page.locator(`.prop-card[data-prop-id="${juan.id}"] label:has-text("Monto") input`).first();
  await monto.fill('15000'); await monto.dispatchEvent('change');
  const antes = await page.evaluate(() => window.__db.ventas.length);
  await page.locator(`.prop-card[data-prop-id="${juan.id}"] button:has-text("Aceptar")`).click();
  await page.waitForSelector(`.prop-card[data-prop-id="${juan.id}"] button:has-text("Confirmar de todas formas")`);
  assert.equal(await page.evaluate(() => window.__db.ventas.length), antes, 'no debe crear la venta sin confirmar');
  await page.locator(`.prop-card[data-prop-id="${juan.id}"] button:has-text("Confirmar de todas formas")`).click();
  await page.waitForFunction(n => window.__db.ventas.length > n, antes);
  assert.deepEqual(errores, []);
  await page.close();
});

test('Análisis: clientes en riesgo, retención, ocupación, margen y totales', async () => {
  const { page, errores } = await abrir();
  await page.click('.tab-btn:has-text("Análisis")');
  await page.waitForSelector('#anContenido .metric');
  let txt = await page.textContent('#anContenido');
  assert.match(txt, /En riesgo/);
  assert.match(txt, /Cliente Fiel Riesgo/, 'el cliente que venía cada 14 días y no volvió debe estar en riesgo');
  assert.match(txt, /Cliente Nuevo/, 'el que vino una vez hace 45 días debe aparecer');
  assert.ok(!/Cliente Activo/.test(txt.split('Vinieron una vez')[0]), 'el cliente activo no está en riesgo');
  assert.ok(await page.locator('#anContenido a[href^="https://wa.me/56911112222"]').count() >= 1, 'link de WhatsApp');

  await page.click('button:has-text("Retención")');
  await page.waitForSelector('#anContenido >> text=Retención por barbero');
  txt = await page.textContent('#anContenido');
  assert.match(txt, /Volvieron en 60 días/);

  await page.click('button:has-text("Ocupación")');
  await page.waitForSelector('#anContenido >> text=Ocupación por día y hora');
  assert.ok(await page.locator('#anContenido table td:has-text("%")').count() > 0);

  await page.click('button:has-text("Margen real")');
  await page.waitForSelector('#anContenido >> text=Margen bruto');
  await page.selectOption('#anContenido select >> nth=0', '2026');
  await page.waitForTimeout(300);
  await page.selectOption('#anContenido select >> nth=1', '11');
  await page.waitForSelector('#anContenido >> text=Por servicio');
  txt = await page.textContent('#anContenido');
  assert.match(txt, /Corte de Cabello/);
  assert.match(txt, /Insumos/, 'gastos sin adelantos');

  await page.click('button:has-text("Totales")');
  await page.waitForTimeout(800);
  assert.match(await page.textContent('#anContenido'), /Análisis/);
  assert.deepEqual(errores, []);
  await page.close();
});

test('Historial: un producto pagado con tarjeta también muestra su estado de GetNet', async () => {
  const { page, errores } = await abrir();
  await page.click('.tab-btn:has-text("Historial")');
  await page.waitForTimeout(800);
  // venta de servicio + producto con el mismo código 100002 (cuadran juntos con GetNet)
  const fila = page.locator('tr', { hasText: 'CERA MATE' }).first();
  const txt = await fila.textContent();
  assert.match(txt, /OK/);
  assert.match(txt, /2 ventas/);
  assert.deepEqual(errores, []);
  await page.close();
});

test('Análisis: seguimiento de clientes (comentario, no contactar, WhatsApp registra contacto)', async () => {
  const { page, errores } = await abrir();
  await page.click('.tab-btn:has-text("Análisis")');
  await page.waitForSelector('#anContenido >> text=Cliente Fiel Riesgo');
  // WhatsApp: queda "contactado hoy" (la ventana de WhatsApp se bloquea en la prueba)
  page.on('popup', p => p.close().catch(() => {}));
  await page.locator('#anContenido tr', { hasText: 'Cliente Nuevo' }).locator('a[href^="https://wa.me/"]').click();
  await page.waitForFunction(() => window.__db.clientes_seguimiento.some(s => s.nombre === 'Cliente Nuevo' && s.contactado_en));
  await page.waitForSelector('#anContenido tr:has-text("Cliente Nuevo") >> text=Contactado hoy');
  // Comentario + no contactar
  await page.locator('#anContenido tr', { hasText: 'Cliente Fiel Riesgo' }).locator('button:has-text("Comentar")').click();
  await page.selectOption('#anSegEstado', 'no_contactar');
  await page.selectOption('#anSegMotivo', 'Se cambió de ciudad');
  await page.fill('#anSegComentario', 'Se mudó a Viña');
  await page.click('#anContenido button:has-text("Guardar")');
  await page.waitForFunction(() => window.__db.clientes_seguimiento.some(s => s.estado === 'no_contactar' && s.comentario === 'Se mudó a Viña'));
  await page.waitForTimeout(300);
  assert.ok(!/Cliente Fiel Riesgo/.test(await page.textContent('#anContenido')), 'ya no debe aparecer en la lista');
  await page.check('#anContenido input[type=checkbox]');
  await page.waitForSelector('#anContenido >> text=No contactar: Se cambió de ciudad');
  assert.match(await page.textContent('#anContenido'), /Se mudó a Viña/);
  assert.deepEqual(errores, []);
  await page.close();
});
