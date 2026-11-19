# Píston Barbería — Sistema de gestión

Plataforma interna (ventas, conciliación con GetNet, arqueo, liquidaciones y propuestas desde AgendaPro).
Se publica con GitHub Pages en https://cfernandeza93-dot.github.io/piston-barberia/ y usa Supabase como base de datos.

## Cómo está organizado

| Archivo | Qué contiene |
|---|---|
| `index.html` | Estructura de la página (login, barra superior y pestañas) |
| `css/app.css` | Estilos |
| `js/core.js` | Conexión a Supabase, utilidades, catálogos (barberos, servicios, productos) y respaldo |
| `js/main.js` | Login, cambio de pestañas y registro de los botones de la pantalla |
| `js/<pestaña>.js` | Una pestaña por archivo: `dashboard`, `venta`, `propuestas`, `historial`, `inventario`, `gastos`, `conciliacion`, `equipo`, `arqueo`, `analisis`, `liquidacion`, `importar`, `giftcards` |
| `js/propuestas_logic.js` | Lógica de las propuestas (leer el reporte de AgendaPro, cruzar con GetNet). No toca la base ni la pantalla |
| `netlify/functions/` | Webhook de Jumpseller (ventas web) |
| `tests/` | Pruebas automáticas |

No hay paso de compilación: el navegador carga los archivos de `js/` directamente.

## Antes de publicar un cambio

1. `node tools/bump-version.mjs` — actualiza el número de versión de los archivos para que nadie quede con una mezcla de archivos viejos y nuevos en caché.
2. Correr las pruebas:
   ```
   cd tests
   npm install
   npx playwright install chromium
   npm test
   ```
   Las pruebas también corren solas en GitHub en cada publicación (pestaña **Actions**).

Las pruebas de pantalla abren la app en Chrome con una base de datos falsa (`tests/e2e/mock-supabase.js` y `tests/e2e/fixtures.js`); nunca tocan los datos reales.
