// Datos de prueba (inventados) para la base falsa de las pruebas de pantalla.
const B = {
  HUGO: 'b0000000-0000-4000-8000-000000000001', LEBROM: 'b0000000-0000-4000-8000-000000000002',
  MAILIN: 'b0000000-0000-4000-8000-000000000003', SAMUEL: 'b0000000-0000-4000-8000-000000000004',
  PISTON: 'b0000000-0000-4000-8000-000000000005',
};
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let n = 0;
function venta(fecha, barbero, tipo, item, monto, forma, extra = {}) {
  const d = new Date(fecha + 'T12:00:00');
  const propina = extra.propina || 0;
  return {
    id: `v0000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    barbero_id: B[barbero.split(' ')[0]], barbero_nombre: barbero, cod_autorizacion: extra.cod || null, boleta: extra.boleta || null,
    anio: d.getFullYear(), n_mes: d.getMonth() + 1, mes: MESES[d.getMonth()], dia: d.getDate(), dia_semana: DIAS[d.getDay()], fecha,
    tipo, cliente: extra.cliente || 'CLIENTE PRUEBA', servicio_producto: item, monto, propina, descuento: 0, total: monto + propina,
    forma_pago: forma, es_web: false, comentarios: null, created_at: fecha + 'T15:00:00Z',
  };
}
const gn = (cod, fecha, hora, venta, propina = 0, marca = 'Visa', tipo = 'Débito') => ({
  id: 'g-' + cod, cod_aut: cod, fecha_venta: fecha, hora_venta: hora, mes: +fecha.slice(5, 7), anio: +fecha.slice(0, 4),
  marca, tipo, propina, valor_venta: venta, valor_transaccion: venta + propina, estado: 'Aprobada', archivo_origen: 'prueba.xlsx',
});

export const seed = {
  barberos: [
    { id: B.HUGO, nombre: 'HUGO JARAMILLO', apodo: 'Hugo', comision: 50 },
    { id: B.LEBROM, nombre: 'LEBROM AVENDAÑO', apodo: 'Lebrom', comision: 50 },
    { id: B.MAILIN, nombre: 'MAILIN CHAPARRO', apodo: 'Mailin', comision: 50 },
    { id: B.SAMUEL, nombre: 'SAMUEL LEON', apodo: 'Samuel', comision: 50 },
    { id: B.PISTON, nombre: 'PISTON', apodo: 'Web', comision: 100 },
  ],
  servicios: [
    { id: 's1', nombre: 'Corte de Cabello', precio: 14000, precio_promo: 14000, tipo: 'promo', comision: 50 },
    { id: 's2', nombre: 'Corte de Cabello', precio: 16000, precio_promo: 0, tipo: 'normal', comision: 50 },
    { id: 's3', nombre: 'Corte de Cabello + Perfilado de Barba', precio: 25000, precio_promo: 0, tipo: 'normal', comision: 50 },
    { id: 's4', nombre: 'Corte de Cabello y Cejas (Perfilado)', precio: 19000, precio_promo: 0, tipo: 'normal', comision: 50 },
    { id: 's5', nombre: 'Perfilado de Barba', precio: 14000, precio_promo: 0, tipo: 'normal', comision: 50 },
  ],
  productos: [
    { id: 'p1', categoria: 'CERA DE CABELLO', marca: 'MARCA A', nombre: 'CERA MATE', formato: '100 ML', precio: 14000, costo: 7000, stock: 5, stock_minimo: 1 },
    { id: 'p2', categoria: 'ACEITE DE BARBA', marca: 'MARCA B', nombre: 'ACEITE BARBA', formato: '30 ML', precio: 19900, costo: 9000, stock: 2, stock_minimo: 1 },
  ],
  ventas: [
    venta('2026-11-03', 'SAMUEL LEON', 'servicio', 'Corte de Cabello', 16000, 'TK', { cod: '100001', boleta: '1', cliente: 'ANDRES PRUEBA' }),
    venta('2026-11-03', 'HUGO JARAMILLO', 'servicio', 'Corte de Cabello', 16000, 'EF', { cliente: 'BRUNO PRUEBA' }),
    venta('2026-11-05', 'MAILIN CHAPARRO', 'servicio', 'Corte de Cabello + Perfilado de Barba', 25000, 'TK', { cod: '100002', boleta: '2', propina: 2500, cliente: 'CARLOS PRUEBA' }),
    venta('2026-11-05', 'MAILIN CHAPARRO', 'PRODUCTO', 'CERA MATE', 14000, 'TK', { cod: '100002', boleta: '2', cliente: 'CARLOS PRUEBA' }),
    venta('2026-11-10', 'LEBROM AVENDAÑO', 'servicio', 'Perfilado de Barba', 14000, 'TRF', { cod: 'T1', boleta: '3', cliente: 'DIEGO PRUEBA' }),
    venta('2026-11-15', 'SAMUEL LEON', 'servicio', 'Corte de Cabello', 16000, 'TK', { cod: '100003', boleta: '4', cliente: 'ESTEBAN PRUEBA' }),
  ],
  getnet_transacciones: [
    gn('100001', '2026-11-03', '11:00:00', 16000),
    gn('100002', '2026-11-05', '13:00:00', 39000, 2500),
    gn('100003', '2026-11-15', '18:00:00', 16000),
    gn('200001', '2026-11-16', '11:05:00', 16000),
    gn('200002', '2026-11-16', '19:30:00', 32000, 2000),
    gn('200003', '2026-11-16', '17:40:00', 16000, 1600, 'MasterCard', 'Crédito'),
  ],
  gastos: [
    { id: 'gx1', descripcion: 'Adelanto – HUGO JARAMILLO', monto: 50000, categoria: 'Adelantos', forma_pago: 'EF', fecha: '2026-11-07', barbero_nombre: 'HUGO JARAMILLO', created_at: '2026-11-07T12:00:00Z' },
    { id: 'gx2', descripcion: 'Insumos', monto: 30000, categoria: 'Insumos', forma_pago: 'TK', fecha: '2026-11-08', barbero_nombre: null, created_at: '2026-11-08T12:00:00Z' },
  ],
  caja_saldo_inicial: [{ id: 'c1', anio: 2026, mes: 11, monto: 50000, notas: null, updated_at: '2026-11-01T12:00:00Z', saldo_final_real: null, notas_final: null }],
  adelantos_santander: [{ id: 'a1', barbero_nombre: 'SAMUEL LEON', monto: 40000, mes: 11, anio: 2026, descripcion: null, fecha: '2026-11-12', created_at: '2026-11-12T12:00:00Z' }],
  gift_cards: [], propuestas_venta: [], horarios_barbero: [], bloqueos_barbero: [], citas: [],
  agenda_citas: agendaRelativa(),
};

// Citas de AgendaPro con fechas relativas a hoy, para que el Análisis dé lo mismo cualquier día que se corra la prueba.
function agendaRelativa() {
  const f = n => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const c = (n, cliente, telefono, prestador, hora = '10:00', estado = 'Asiste') => ({ fecha: f(n), hora, cliente, telefono, email: '', servicio: 'Corte de Cabello', precio: 16000, prestador, estado, pagada: false, origen: 'Online' });
  return [
    ...[200, 186, 172, 158, 144, 130, 116, 102, 88, 74, 60].map(n => c(n, 'Cliente Fiel Riesgo', '+56911112222', 'Samuel Leon')),
    ...[90, 60, 30, 3].map(n => c(n, 'Cliente Activo', '922223333', 'Hugo Jaramillo', '18:00')),
    c(45, 'Cliente Nuevo', '933334444', 'Mailin Chaparro', '12:00'),
    ...[150, 140].map(n => c(n, 'Vuelve Rapido', '944445555', 'Mailin Chaparro', '17:20')),
    c(2, 'No Vino', '955556666', 'Hugo Jaramillo', '11:00', 'No Asiste'),
  ];
}
