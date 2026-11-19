// Actualiza el número de versión (?v=...) de los archivos js/ y css/ en index.html.
// Úsalo antes de publicar cambios:  node tools/bump-version.mjs
import fs from 'fs';
const p = new URL('../index.html', import.meta.url);
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
let html = fs.readFileSync(p, 'utf8');
const mods = fs.readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js')).sort();
const imap = mods.map(m => `    "./js/${m}": "./js/${m}?v=${v}"`).join(',\n');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, `<script type="importmap">\n{\n  "imports": {\n${imap}\n  }\n}\n</script>`);
html = html.replace(/(\.\/js\/main\.js|css\/app\.css)\?v=\d+/g, `$1?v=${v}`);
fs.writeFileSync(p, html);
console.log(`Versión ${v} (${mods.length} módulos)`);
