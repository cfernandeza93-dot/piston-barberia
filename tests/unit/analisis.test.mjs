// Pruebas de js/analisis_logic.js con casos armados a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../js/analisis_logic.js';

const HOY = '2026-11-19';
const haceDias = n => { const d = new Date(HOY + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const cita = (dias, cliente, tel, prestador = 'Samuel Leon', extra = {}) =>
  ({ fecha: haceDias(dias), hora: '10:00', cliente, telefono: tel, email: '', servicio: 'Corte de Cabello', precio: 16000, prestador, estado: 'Asiste', ...extra });

const citas = [
  // A: viene cada 14 días, la última hace 40 -> en riesgo (y su nombre está escrito de dos formas)
  ...[110, 96, 82, 68, 54].map(d => cita(d, 'Diego Castillo', '+56 9 1111 2222')), cita(40, 'DIEGO CASTILLO R.', '911112222'),
  // B: viene cada 30 días, la última hace 20 -> activo
  ...[80, 50, 20].map(d => cita(d, 'Bruno Activo', '922223333', 'Hugo Jaramillo')),
  // C: una sola visita hace 50 días -> nuevo que no volvió
  cita(50, 'Carla Nueva', '933334444', 'Mailin Chaparro'),
  // D: 3 visitas, la última hace 300 -> perdido
  ...[360, 330, 300].map(d => cita(d, 'Dario Perdido', '944445555')),
  // genéricos y no asistió: no cuentan
  cita(10, 'cliente cliente', ''), cita(5, 'Bruno Activo', '922223333', 'Hugo Jaramillo', { estado: 'No Asiste' }),
];

test('el mismo teléfono escrito distinto es el mismo cliente', () => {
  const keys = new Set(A.anAsignarClientes(citas).filter(c => /castillo/i.test(c.cliente)).map(c => c.clienteKey));
  assert.equal(keys.size, 1);
  assert.equal(A.anTel('+56 9 1111 2222'), '11112222');
  assert.equal(A.anTel('11111111'), null, 'números de relleno no sirven');
});

test('clientes en riesgo, nuevos que no volvieron y perdidos', () => {
  const r = A.anClientesEnRiesgo(citas, HOY);
  assert.deepEqual(r.riesgo.map(x => x.nombre), ['DIEGO CASTILLO R.']);
  assert.equal(r.riesgo[0].visitas, 6);
  assert.equal(r.riesgo[0].frecuencia, 14);
  assert.equal(r.riesgo[0].diasSinVenir, 40);
  assert.deepEqual(r.nuevosSinVolver.map(x => x.nombre), ['Carla Nueva']);
  assert.deepEqual(r.perdidos.map(x => x.nombre), ['Dario Perdido']);
  assert.equal(r.activos, 1);
});

test('retención: de los clientes nuevos, quién volvió y con qué barbero', () => {
  const cs = [
    cita(400, 'Viejo Cliente', '955550000'),                      // inicio del historial (calentamiento)
    cita(200, 'Nuevo Uno', '955551111', 'Hugo Jaramillo'), cita(180, 'Nuevo Uno', '955551111', 'Hugo Jaramillo'),   // volvió a los 20 días, mismo barbero
    cita(200, 'Nuevo Dos', '955552222', 'Hugo Jaramillo'), cita(100, 'Nuevo Dos', '955552222', 'Hugo Jaramillo'),   // volvió a los 100 días: no cuenta
    cita(150, 'Nuevo Tres', '955553333', 'Mailin Chaparro'), cita(140, 'Nuevo Tres', '955553333', 'Samuel Leon'),   // volvió, otro barbero
    cita(20, 'Muy Reciente', '955554444', 'Mailin Chaparro'),     // aún no se puede saber
  ];
  const r = A.anRetencion(cs, HOY, { ventana: 60, calentamiento: 60 });
  assert.equal(r.total.nuevos, 3);
  assert.equal(r.total.volvieron, 2);
  const hugo = r.porBarbero.find(b => b.clave === 'Hugo Jaramillo');
  assert.equal(hugo.nuevos, 2); assert.equal(hugo.volvieron, 1); assert.equal(hugo.pctMismo, 1);
  const mailin = r.porBarbero.find(b => b.clave === 'Mailin Chaparro');
  assert.equal(mailin.volvieron, 1); assert.equal(mailin.pctMismo, 0);
});

test('ocupación cuenta minutos, no citas que empiezan', () => {
  const f = '2026-11-16'; // lunes
  const cs = ['10:00', '10:40', '11:20'].map(h => ({ fecha: f, hora: h, cliente: 'x', servicio: 'Corte de Cabello', prestador: 'Samuel Leon', estado: 'Asiste' }))
    .concat([{ fecha: f, hora: '15:00', cliente: 'y', servicio: 'Corte de Cabello', prestador: 'Hugo Jaramillo', estado: 'Asiste' }]);
  const o = A.anOcupacion(cs, {});
  // 2 barberos trabajaron el lunes: 10h = 60 min ocupados de 120 disponibles
  assert.equal(o.barberoDias[1], 2);
  assert.equal(o.matriz[1][10].ocupacion, 0.5);
  assert.equal(o.matriz[1][11].ocupacion, 0.5);
  assert.equal(Math.round(o.matriz[1][15].ocupacion * 100), 33);
  assert.equal(A.anDuracion('Corte de Cabello + Perfilado de Barba'), 60);
  assert.equal(A.anDuracion('Experiencia Píston II'), 80);
  assert.equal(o.barberos.find(b => b.barbero === 'Samuel Leon').citasPorDia, 3);
});

test('margen real: descuenta comisión del barbero, de GetNet y costo de productos', () => {
  const servicios = [{ nombre: 'Corte de Cabello', comision: 50 }];
  const productos = [{ nombre: 'CERA MATE', precio: 14000, costo: 7000 }];
  const ventas = [
    { fecha: '2026-11-05', tipo: 'servicio', servicio_producto: 'Corte de Cabello', monto: 16000, propina: 1600, forma_pago: 'TK', cod_autorizacion: '000123', barbero_nombre: 'HUGO' },
    { fecha: '2026-11-05', tipo: 'PRODUCTO', servicio_producto: 'CERA MATE', monto: 14000, propina: 0, forma_pago: 'EF', barbero_nombre: 'HUGO' },
    { fecha: '2026-11-06', tipo: 'servicio', servicio_producto: 'Corte de Cabello', monto: 16000, propina: 0, forma_pago: 'TK', cod_autorizacion: '999', barbero_nombre: 'SAMUEL' },
  ];
  const getnet = [
    { cod_aut: '123', fecha_venta: '2026-11-05', valor_venta: 16000, comision: 420, tipo: 'Crédito' },
    { cod_aut: '999', fecha_venta: '2026-11-06', valor_venta: 16000, comision: null, tipo: 'Crédito' },
  ];
  const gastos = [{ categoria: 'Adelantos', monto: 50000 }, { categoria: 'Insumos', monto: 10000 }];
  const m = A.anMargen(ventas, getnet, servicios, productos, gastos);
  const hugo = m.porBarbero.find(b => b.clave === 'HUGO');
  assert.equal(hugo.venta, 30000);
  assert.equal(hugo.comBarbero, 8000 + 1400);
  assert.equal(hugo.comGetnet, 420);
  assert.equal(hugo.costo, 7000);
  assert.equal(hugo.margen, 30000 - 9400 - 420 - 7000);
  // comisión estimada con la tasa observada de crédito (420/16000)
  assert.equal(m.porBarbero.find(b => b.clave === 'SAMUEL').comGetnet, 420);
  assert.ok(m.comisionEstimada);
  assert.equal(m.totalGastos, 10000, 'los adelantos no son gasto: ya están en la comisión');
  assert.equal(m.utilidad, m.total.margen - 10000);
  const m2 = A.anMargen([...ventas, { ...ventas[0], servicio_producto: 'corte de  cabello', cod_autorizacion: null, forma_pago: 'EF' }], getnet, servicios, productos);
  assert.equal(m2.porServicio.find(x => x.clave === 'Corte de Cabello').cantidad, 3, 'agrupa el mismo servicio escrito distinto');
});

test('lee el reporte completo de AgendaPro con teléfono, origen y estado', () => {
  const aoa = [
    ['Fecha de realización', 'Fecha de creación', 'Local', 'N° de Cliente', 'Nombre', 'Apellido', 'E-mail', 'Teléfono', 'Servicio', 'Precio lista', 'Precio real', 'Prestador', 'Estado', 'Estado de pago', 'Origen'],
    ['18/11/2026 18:00', '18/11/2026 17:55', 'P', '', 'santiago', 'gallegos', '', '+56957780736', 'Corte de Cabello', 16000, 16000, 'Mailin Chaparro', 'Asiste', 'No pagada', 'Manual'],
    ['17/11/2026 19:20', '', 'P', '', 'antoine', 'zuñiga', 'AZ@GMAIL.COM', '+56995957709', 'Corte de Cabello y  Cejas  (Perfilado)', 19000, 19000, 'Samuel Leon', 'Cancelado', 'No pagada', 'Online'],
  ];
  const c = A.anParseAgendaCompleta(aoa);
  assert.equal(c.length, 2);
  assert.equal(c[0].telefono, '+56957780736'); assert.equal(c[0].origen, 'Manual'); assert.equal(c[0].precio, 16000);
  assert.equal(c[1].estado, 'Cancelado'); assert.equal(c[1].email, 'az@gmail.com');
  assert.equal(c[1].servicio, 'Corte de Cabello y Cejas (Perfilado)');
  assert.notEqual(A.anClaveCita(c[0]), A.anClaveCita(c[1]));
});
