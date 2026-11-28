// Dev tool: node tools/lint_static.mjs  (needs the `acorn` package; set ACORN=/path/to/acorn.mjs if it is not at the default path)
// A tiny static checker, because the game cannot be run headless without three.js:
//   1. every identifier that is used must be declared somewhere in its file (import / var / let / const / function / class / parameter) or be a known global
//   2. every named import from a relative module must exist in that module's exports
// It ignores scoping (a name declared anywhere in the file counts), so it catches typos and missing imports, not shadowing bugs.
import fs from 'fs';
import path from 'path';
const acornPath = process.env.ACORN || '/opt/npm-tools/node_modules/acorn/dist/acorn.mjs';
const acorn = await import(acornPath);

const GLOBALS = new Set(['window', 'document', 'navigator', 'console', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Promise', 'Map', 'Set', 'WeakMap', 'Symbol', 'Error', 'Date', 'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'undefined', 'NaN', 'Infinity',
  'Float32Array', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'Int16Array', 'Int32Array', 'Float64Array', 'ArrayBuffer', 'DataView', 'URL', 'URLSearchParams', 'fetch', 'Image', 'Audio', 'AudioContext', 'webkitAudioContext',
  'localStorage', 'sessionStorage', 'location', 'history', 'alert', 'SpeechSynthesisUtterance', 'XRSession', 'globalThis', 'process', 'Buffer', 'structuredClone', 'queueMicrotask', 'TextDecoder', 'TextEncoder', 'Blob', 'FileReader',
  'HTMLElement', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'arguments', 'require', 'module', 'exports', 'atob', 'btoa', 'AbortController', 'crypto', 'WebAssembly', 'Intl', 'Proxy', 'Reflect', 'BigInt', 'eval', 'FontFace']);

const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f)) files.push(p); } })('src');

const parse = (f) => acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true });
const asts = new Map(files.map((f) => [f, parse(f)]));
const exportsOf = (f) => {
  const names = new Set();
  for (const n of asts.get(f).body) {
    if (n.type === 'ExportNamedDeclaration') {
      if (n.declaration) { if (n.declaration.declarations) n.declaration.declarations.forEach((d) => collect(d.id, names)); else if (n.declaration.id) names.add(n.declaration.id.name); }
      for (const s of n.specifiers) names.add(s.exported.name);
    } else if (n.type === 'ExportDefaultDeclaration') names.add('default');
  }
  return names;
};
function collect(pat, set) {
  if (!pat) return;
  switch (pat.type) {
    case 'Identifier': set.add(pat.name); break;
    case 'ObjectPattern': pat.properties.forEach((p) => collect(p.value || p.argument, set)); break;
    case 'ArrayPattern': pat.elements.forEach((e) => collect(e, set)); break;
    case 'AssignmentPattern': collect(pat.left, set); break;
    case 'RestElement': collect(pat.argument, set); break;
    default: break;
  }
}

let problems = 0;
for (const [f, ast] of asts) {
  const declared = new Set(), refs = [];
  const visit = (n, parent, key) => {
    if (!n || typeof n.type !== 'string') return;
    switch (n.type) {
      case 'ImportDeclaration': {
        for (const s of n.specifiers) declared.add(s.local.name);
        if (n.source.value.startsWith('.')) {
          const target = path.normalize(path.join(path.dirname(f), n.source.value));
          if (!asts.has(target)) { console.log(`${f}:${n.loc.start.line} import of missing file ${n.source.value}`); problems++; }
          else { const ex = exportsOf(target); for (const s of n.specifiers) if (s.type === 'ImportSpecifier' && !ex.has(s.imported.name)) { console.log(`${f}:${n.loc.start.line} '${s.imported.name}' is not exported by ${n.source.value}`); problems++; } }
        }
        return;
      }
      case 'VariableDeclarator': collect(n.id, declared); break;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        if (n.id) declared.add(n.id.name); n.params.forEach((p) => collect(p, declared)); break;
      case 'ClassDeclaration': case 'ClassExpression': if (n.id) declared.add(n.id.name); break;
      case 'CatchClause': collect(n.param, declared); break;
      case 'LabeledStatement': return visit(n.body, n, 'body');
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'Identifier': {
        const isProp = parent && ((parent.type === 'MemberExpression' && key === 'property' && !parent.computed) || (parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)
          || (parent.type === 'MethodDefinition' && key === 'key' && !parent.computed) || (parent.type === 'PropertyDefinition' && key === 'key' && !parent.computed)
          || (parent.type === 'ExportSpecifier') || (parent.type === 'ImportSpecifier'));
        if (!isProp) refs.push(n);
        return;
      }
      default: break;
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'type') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, n, k)); else if (v && typeof v.type === 'string') visit(v, n, k);
    }
  };
  visit(ast, null, null);
  const seen = new Set();
  for (const r of refs) if (!declared.has(r.name) && !GLOBALS.has(r.name) && !seen.has(r.name + r.loc.start.line)) { seen.add(r.name + r.loc.start.line); console.log(`${f}:${r.loc.start.line} undeclared identifier '${r.name}'`); problems++; }
}
console.log(problems ? `\n${problems} problem(s)` : `static check ok (${files.length} files)`);
process.exit(problems ? 1 : 0);
