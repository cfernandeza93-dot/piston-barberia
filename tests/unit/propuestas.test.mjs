// Pruebas de la lógica de Propuestas (js/propuestas_logic.js) con citas y pagos reales del 16-18 nov 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../js/propuestas_logic.js';

const servicios = [
  { nombre: 'Corte de Cabello', precio: 14000, precio_promo: 14000, tipo: 'promo' },
  { nombre: 'Corte de Cabello', precio: 16000, precio_promo: 0, tipo: 'normal' },
  { nombre: 'Corte de Cabello + Perfilado de Barba', precio: 25000, precio_promo: 0, tipo: 'normal' },
  { nombre: 'Corte de Cabello y Cejas (Perfilado)', precio: 19000, precio_promo: 0, tipo: 'normal' },
  { nombre: 'Perfilado de Barba', precio: 14000, precio_promo: 0, tipo: 'normal' },
];
const C = 'Corte de Cabello', CP = 'Corte de Cabello + Perfilado de Barba', CC = 'Corte de Cabello y Cejas (Perfilado)', PB = 'Perfilado de Barba';
const citas = [
  ['2026-11-16', '10:20', 'Christian Castro', C, 'SAMUEL LEON', 0], ['2026-11-16', '11:00', 'Carlos Jerez', C, 'SAMUEL LEON', 0],
  ['2026-11-16', '11:40', 'José Sánchez', C, 'HUGO JARAMILLO', 1], ['2026-11-16', '16:00', 'Juan Aguila', C, 'LEBROM AVENDAÑO', 0],
  ['2026-11-16', '16:40', 'Tomas Reimberg', C, 'HUGO JARAMILLO', 0], ['2026-11-16', '17:20', 'Sebastian Salamanca', C, 'SAMUEL LEON', 0],
  ['2026-11-16', '17:40', 'clemente veloso', C, 'HUGO JARAMILLO', 0], ['2026-11-16', '18:20', 'clemente veloso', C, 'HUGO JARAMILLO', 0],
  ['2026-11-16', '18:40', 'Samuel Moder', C, 'SAMUEL LEON', 1], ['2026-11-16', '19:00', 'CARLOS JERIA', C, 'HUGO JARAMILLO', 0],
  ['2026-11-17', '10:40', 'Abraham Monsalve', CC, 'SAMUEL LEON', 0],
  ['2026-11-17', '13:00', 'David Fisher', CP, 'MAILIN CHAPARRO', 0], ['2026-11-17', '14:00', 'David Fisher', CP, 'MAILIN CHAPARRO', 0],
  ['2026-11-18', '12:00', 'Enrique Guillaume', PB, 'LEBROM AVENDAÑO', 0], ['2026-11-18', '12:40', 'MIGUEL GUERRA', C, 'LEBROM AVENDAÑO', 0],
  ['2026-11-18', '18:00', 'santiago gallegos', C, 'MAILIN CHAPARRO', 0],
].map((r, i) => ({ id: 'p' + i, fecha: r[0], hora: r[1], cliente: r[2], servicio_agenda: r[3], barbero_nombre: r[4], pagada_agenda: !!r[5], origen: 'agendapro', estado: 'pendiente' }));
const gn = [
  ['000882', '2026-11-16', 16000, 2400, '19:31:19'], ['008888', '2026-11-16', 32000, 2000, '18:56:40'], ['009403', '2026-11-16', 14000, 0, '18:58:53'],
  ['262597', '2026-11-16', 16000, 0, '11:19:14'], ['375690', '2026-11-16', 16000, 0, '17:24:14'], ['4ALYEZ', '2026-11-16', 16000, 1600, '17:37:30'],
  ['592542', '2026-11-16', 16000, 0, '11:59:23'], ['247389', '2026-11-17', 50000, 20000, '13:52:53'],
  ['009480', '2026-11-18', 14000, 0, '18:14:32'], ['151798', '2026-11-18', 16000, 1600, '13:15:41'], ['982941', '2026-11-18', 14000, 0, '12:41:29'],
].map(r => ({ cod_aut: r[0], fecha_venta: r[1], valor_venta: r[2], propina: r[3], valor_transaccion: r[2] + r[3], hora_venta: r[4], marca: 'Visa', tipo: 'Débito' }));

const sugerir = (fecha, ventas = [], conHora = true) => {
  const g = gn.filter(x => x.fecha_venta === fecha).map(x => conHora ? x : { ...x, hora_venta: null });
  return L.propSugerirDia(citas.filter(p => p.fecha === fecha), g, ventas, servicios);
};
const de = (sug, cliente, hora) => sug[citas.find(p => p.cliente === cliente && (!hora || p.hora === hora)).id];

test('mismo cliente con dos citas pagadas juntas', () => {
  const { sug } = sugerir('2026-11-16');
  for (const h of ['17:40', '18:20']) {
    const s = de(sug, 'clemente veloso', h);
    assert.equal(s.cod, '008888'); assert.equal(s.precio, 16000); assert.equal(s.propina, 1000); assert.equal(s.conf, 'alta');
  }
  const { sug: s17 } = sugerir('2026-11-17');
  assert.equal(de(s17, 'David Fisher', '13:00').cod, '247389');
  assert.equal(de(s17, 'David Fisher', '13:00').propina + de(s17, 'David Fisher', '14:00').propina, 20000);
});

test('$ verde se sugiere como efectivo', () => {
  const { sug } = sugerir('2026-11-16');
  assert.equal(de(sug, 'José Sánchez').forma, 'EF');
  assert.equal(de(sug, 'Samuel Moder').forma, 'EF');
});

test('con la hora de GetNet cada pago va a la cita correcta', () => {
  const { sug } = sugerir('2026-11-18');
  assert.equal(de(sug, 'Enrique Guillaume').cod, '982941');
  assert.equal(de(sug, 'MIGUEL GUERRA').cod, '151798');
  assert.equal(de(sug, 'MIGUEL GUERRA').propina, 1600);
  assert.equal(de(sug, 'santiago gallegos').cod, '009480');
  const { sug: s16 } = sugerir('2026-11-16');
  assert.equal(de(s16, 'Christian Castro').cod, '262597');
  assert.equal(de(s16, 'CARLOS JERIA').cod, '000882');
  assert.equal(de(s16, 'CARLOS JERIA').conf, 'alta');
});

test('sin hora, los pagos ambiguos quedan marcados para confirmar', () => {
  const { sug } = sugerir('2026-11-16', [], false);
  assert.equal(de(sug, 'Christian Castro').conf, 'baja');
});

test('servicio sin pago posible queda "por confirmar"', () => {
  const { sug } = sugerir('2026-11-17');
  assert.equal(de(sug, 'Abraham Monsalve').forma, '');
  assert.equal(de(sug, 'Abraham Monsalve').precio, 19000);
});

test('el resto de un pago compartido ya registrado en parte', () => {
  const ventas = [{ fecha: '2026-11-16', forma_pago: 'TK', cod_autorizacion: '008888', total: 17000, propina: 1000, cliente: 'CLEMENTE VELOSO' }];
  // la cita de las 17:40 ya se aceptó; queda pendiente solo la de las 18:20
  const pend = citas.filter(p => p.fecha === '2026-11-16' && !(p.cliente === 'clemente veloso' && p.hora === '17:40'));
  const { sug, disponibles } = L.propSugerirDia(pend, gn.filter(x => x.fecha_venta === '2026-11-16'), ventas, servicios);
  const d = disponibles.find(x => x.cod === '008888');
  assert.equal(d.venta, 16000); assert.equal(d.prop, 1000); assert.ok(d.parcial);
  const s = de(sug, 'clemente veloso', '18:20');
  assert.equal(s.cod, '008888'); assert.equal(s.propina, 1000); assert.equal(s.conf, 'alta');
});

test('un pago que calza con servicios de dos barberos', () => {
  const p = [
    { id: 'a', fecha: '2026-11-04', hora: '17:20', cliente: 'Pablo', servicio_agenda: C, barbero_nombre: 'LEBROM AVENDAÑO', origen: 'agendapro' },
    { id: 'b', fecha: '2026-11-04', hora: '17:40', cliente: 'Ignacio', servicio_agenda: C, barbero_nombre: 'HUGO JARAMILLO', origen: 'agendapro' },
  ];
  const g = [{ cod_aut: '598356', fecha_venta: '2026-11-04', valor_venta: 32000, propina: 3000, valor_transaccion: 35000 }];
  const { sug } = L.propSugerirDia(p, g, [], servicios);
  assert.equal(sug.a.cod, '598356'); assert.equal(sug.b.cod, '598356');
  assert.equal(sug.a.propina + sug.b.propina, 3000);
});

test('lee el reporte real de AgendaPro (Nombre + Apellido, "Pago asociado")', () => {
  const aoa = [
    ['Fecha de realización', 'Fecha de creación', 'Local', 'N° de Cliente', 'Nombre', 'Apellido', 'Servicio', 'Prestador', 'Estado', 'Estado de pago'],
    ['18/11/2026 18:00', '18/11/2026 17:55', 'Piston', '', 'santiago', 'gallegos', 'Corte de Cabello', 'Mailin Chaparro', 'Asiste', 'No pagada'],
    ['16/11/2026 11:40', '', 'Piston', '', 'José ', 'Sánchez', 'Corte de Cabello y  Cejas  (Perfilado)', 'Hugo Jaramillo', 'Asiste', 'Pago asociado'],
    ['16/11/2026 12:20', '', 'Piston', '', 'Alexis', 'Valle', 'Corte de Cabello', 'Hugo Jaramillo', 'No Asiste', 'No pagada'],
  ];
  const r = L.propParseAgenda(aoa);
  assert.equal(r.citas.length, 2);
  assert.deepEqual(r.omitidas, { 'No Asiste': 1 });
  assert.equal(r.citas[0].cliente, 'santiago gallegos');
  assert.equal(r.citas[0].hora, '18:00');
  assert.equal(r.citas[1].cliente, 'José Sánchez');
  assert.ok(r.citas[1].pagada);
  assert.equal(L.propServicio(r.citas[1].servicio, '2026-11-16', servicios).normal.precio, 19000);
});

test('detecta citas que ya tienen venta (por nombre y por cantidad)', () => {
  const c = [
    { key: 'a', fecha: '2026-11-03', barbero_nombre: 'SAMUEL LEON', cliente: 'THOMAS THOMAS' },
    { key: 'b', fecha: '2026-11-10', barbero_nombre: 'SAMUEL LEON', cliente: 'CLIENTE PISTON' },
    { key: 'c', fecha: '2026-11-16', barbero_nombre: 'SAMUEL LEON', cliente: 'Carlos Jerez' },
  ];
  const v = [
    { fecha: '2026-11-03', barbero_nombre: 'SAMUEL LEON', cliente: 'THOMAS TONSON' },
    { fecha: '2026-11-10', barbero_nombre: 'SAMUEL LEON', cliente: 'ABIEL ALDAZORO' },
  ];
  assert.deepEqual([...L.propDetectarRegistradas(c, v)].sort(), ['a', 'b']);
});

test('en un día sin promo no se sugiere el precio promo (caso 009403 del 16-nov)', () => {
  const { sug } = sugerir('2026-11-16');
  const s = de(sug, 'Juan Aguila');
  assert.notEqual(s.cod, '009403', 'el pago de $14.000 no es un corte de lunes');
  assert.equal(s.precio, 16000);
});

test('un pago compartido no le quita el pago propio a una cita, ni puede ser anterior a ella (caso 19-nov)', () => {
  const p = [
    { id: 'rojas', fecha: '2026-11-19', hora: '12:00', cliente: 'Patricio Rojas', servicio_agenda: C, barbero_nombre: 'SAMUEL LEON', origen: 'agendapro' },
    { id: 'gutierrez', fecha: '2026-11-19', hora: '14:40', cliente: 'Francisco Gutierrez', servicio_agenda: PB, barbero_nombre: 'SAMUEL LEON', origen: 'agendapro' },
  ];
  const g = [['005570', '12:09:10', 16000], ['007042', '12:58:01', 30000], ['950386', '15:22:57', 14000]]
    .map(([cod, hora, v]) => ({ cod_aut: cod, fecha_venta: '2026-11-19', hora_venta: hora, valor_venta: v, propina: 0, valor_transaccion: v }));
  const { sug } = L.propSugerirDia(p, g, [], servicios);
  assert.equal(sug.rojas.cod, '005570');
  assert.equal(sug.gutierrez.cod, '950386');
  assert.equal(sug.gutierrez.conf, 'alta');
});
