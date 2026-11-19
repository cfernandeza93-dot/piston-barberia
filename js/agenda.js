// Citas de AgendaPro guardadas en la base (tabla agenda_citas): importar reportes y leerlas.
// La usan Propuestas (cada reporte que se sube también alimenta esta tabla) y Análisis.
import { sb } from './core.js';
import { anClaveCita, anParseAgendaCompleta } from './analisis_logic.js';

// Supabase entrega máximo 1.000 filas por consulta: se piden por páginas.
async function traerTodo(consulta, pagina = 1000) {
  const out = [];
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await consulta().range(desde, desde + pagina - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < pagina) return out;
  }
}

// Guarda (o actualiza) todas las citas de un reporte de AgendaPro ya convertido a filas.
async function guardarAgendaCitas(aoa, archivo) {
  const citas = anParseAgendaCompleta(aoa);
  const filas = [...new Map(citas.map(c => [anClaveCita(c), {
    clave: anClaveCita(c), fecha: c.fecha, hora: c.hora || null, cliente: c.cliente || null,
    telefono: c.telefono || null, email: c.email || null, servicio: c.servicio || null, precio: c.precio,
    prestador: c.prestador || null, estado: c.estado, pagada: c.pagada, origen: c.origen,
    creada_en: c.creada_en, archivo_origen: archivo || null,
  }])).values()];
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await sb.from('agenda_citas').upsert(filas.slice(i, i + 500), { onConflict: 'clave' });
    if (error) throw error;
  }
  const fechas = filas.map(f => f.fecha).sort();
  return { total: filas.length, desde: fechas[0], hasta: fechas[fechas.length - 1] };
}

let cache = null;
async function cargarAgendaCitas(forzar = false) {
  if (cache && !forzar) return cache;
  cache = await traerTodo(() => sb.from('agenda_citas')
    .select('fecha,hora,cliente,telefono,email,servicio,precio,prestador,estado,pagada,origen').order('fecha').order('hora'));
  return cache;
}
function olvidarAgendaCitas() { cache = null; }

export { cargarAgendaCitas, guardarAgendaCitas, olvidarAgendaCitas, traerTodo };
