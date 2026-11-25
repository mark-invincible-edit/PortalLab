// Dev tool: node tools/self_review.mjs   -> static checks that mirror the README self-review list.
//  1. every relative import resolves to an existing file   2. bare imports exist in the importmap (index.html)
//  3. config keys used in code (CONFIG.a.b and simple aliases like `const C = CONFIG.body`) exist in config.js
//  4. texture/sound keys used in code exist in config.js   5. every asset in config.js is listed in docs/ASSET_MANIFEST.md
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../src/config.js';

let fails = 0;
const bad = (m) => { console.log('FAIL ' + m); fails++; };
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })('src');

const html = fs.readFileSync('index.html', 'utf8');
const importmap = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;

const get = (obj, pathStr) => pathStr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  // imports
  for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (spec.startsWith('.')) { const t = path.resolve(path.dirname(f), spec); if (!fs.existsSync(t)) bad(`${f}: import ${spec} does not exist`); }
    else { const ok = Object.keys(importmap).some((k) => spec === k || (k.endsWith('/') && spec.startsWith(k))); if (!ok) bad(`${f}: bare import "${spec}" not in importmap`); }
  }
  // CONFIG.x.y paths
  for (const m of src.matchAll(/CONFIG\.([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g)) {
    const parts = m[1].split('.'); let o = CONFIG, i = 0;
    for (; i < parts.length; i++) { if (o == null || typeof o !== 'object' || !(parts[i] in o)) break; o = o[parts[i]]; }
    if (i < parts.length && !(Array.isArray(o) || typeof o !== 'object')) bad(`${f}: CONFIG.${m[1]} missing at "${parts[i]}"`);
    else if (i < parts.length && typeof o === 'object' && !Array.isArray(o)) bad(`${f}: CONFIG.${m[1]} missing at "${parts[i]}"`);
  }
  // aliases: const C = CONFIG.body  /  const C = CONFIG  (an alias reused for different objects passes if the key exists in ANY of them)
  const aliases = new Map();
  for (const m of src.matchAll(/(?:const|let|,)\s*(\w+)\s*=\s*CONFIG(?:\.([\w.]+))?\s*(?=[,;\n])/g)) { if (!aliases.has(m[1])) aliases.set(m[1], []); aliases.get(m[1]).push(m[2] || ''); }
  for (const [al, paths] of aliases) {
    const bases = paths.map((p) => (p ? get(CONFIG, p) : CONFIG)).filter((b) => b && typeof b === 'object');
    if (!bases.length) continue;
    const others = (src.match(new RegExp(`(?:const|let|,)\\s*${al}\\s*=\\s*(?!CONFIG)`, 'g')) || []).length;   // alias also assigned to something else -> skip
    if (others) continue;
    for (const m of src.matchAll(new RegExp(`(?<![\\w.])${al}\\.([A-Za-z_]\\w*)`, 'g'))) {
      if (!bases.some((b) => m[1] in b)) bad(`${f}: ${al}.${m[1]} (alias of CONFIG${paths.map((p) => p ? '.' + p : '').join(' | ')}) missing in config.js`);
    }
  }
  // texture / sound keys
  for (const m of src.matchAll(/\.tex\(\s*['"](\w+)['"]\s*\)/g)) if (!CONFIG.textures[m[1]]) bad(`${f}: texture key "${m[1]}" not in config.textures`);
  for (const m of src.matchAll(/audio\.(?:play|loop|setAmbience)\(\s*['"](\w+)['"]/g)) if (!CONFIG.sounds[m[1]]) bad(`${f}: sound key "${m[1]}" not in config.sounds`);
  for (const m of src.matchAll(/ambience:\s*['"](\w+)['"]/g)) if (!CONFIG.sounds[m[1]]) bad(`${f}: ambience "${m[1]}" not in config.sounds`);
  for (const m of src.matchAll(/tex:\s*['"](\w+)['"]/g)) if (!CONFIG.textures[m[1]]) bad(`${f}: level tex "${m[1]}" not in config.textures`);
}
// manifest coverage
const manifest = fs.readFileSync('docs/ASSET_MANIFEST.md', 'utf8');
for (const [k, v] of Object.entries(CONFIG.textures)) if (!manifest.includes(v.file)) bad(`manifest missing texture ${v.file}`);
for (const [k, v] of Object.entries(CONFIG.sounds)) if (!manifest.includes(v.file)) bad(`manifest missing sound ${v.file}`);
for (const [k, v] of Object.entries(CONFIG.models)) if (!manifest.includes(v.path)) bad(`manifest missing model ${v.path}`);
if (!manifest.includes(CONFIG.font.file)) bad('manifest missing font');
// lowercase relative paths
for (const v of [...Object.values(CONFIG.textures).map((t) => CONFIG.paths.textures + t.file), ...Object.values(CONFIG.sounds).map((s) => CONFIG.paths.sounds + s.file)]) if (v !== v.toLowerCase()) bad(`path not lowercase: ${v}`);
console.log(fails ? `\n${fails} problem(s)` : `all self-review checks passed (${files.length} files)`);
process.exit(fails ? 1 : 0);
