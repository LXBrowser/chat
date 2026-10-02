/**
 * static.mjs — the structural invariants this repository has asserted across rounds.
 *
 * These are the ones that were written after a real defect slipped past them: boot()
 * being defined and never called, the manifest declaring no `permissions`, `el()`
 * throwing on `dataset`, and the uncalled-function sweep.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checks, EXT as ROOT } from './harness.mjs';
const t = checks();

/** Every file under src/, recursively. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, 'src'));
const rel = (f) => relative(ROOT, f);

// --- every module parses -------------------------------------------------------
let parseFails = [];
for (const f of files.filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync('node', ['--check', f], { stdio: 'pipe' });
  } catch (err) {
    parseFails.push(`${rel(f)}: ${err.stderr?.toString().split('\n')[2] ?? 'parse error'}`);
  }
}
t.ok('every module parses', parseFails.length === 0, parseFails.join(' | ') || `${files.filter((f) => f.endsWith('.js')).length} modules`);

// --- no inline style attribute or assignment -----------------------------------
const styleAttr = files
  .filter((f) => /\.(js|html|css)$/.test(f))
  .filter((f) => /style\s*=\s*["']|\.style\.\w+\s*=/.test(readFileSync(f, 'utf8')))
  .map(rel);
t.ok('no inline style anywhere in src/', styleAttr.length === 0, styleAttr.join(', ') || "CSP is style-src 'self', so this would be a console error");

// --- stylesheets balance -------------------------------------------------------
for (const css of ['layout.css', 'components.css', 'tokens.css']) {
  const text = readFileSync(join(ROOT, 'src/ui/css', css), 'utf8');
  const open = (text.match(/{/g) ?? []).length;
  const close = (text.match(/}/g) ?? []).length;
  t.ok(`${css} brace-balances`, open === close, `${open} open / ${close} close`);
}

// --- every top-level function in app.js is called ------------------------------
const app = readFileSync(join(ROOT, 'src/ui/app.js'), 'utf8');
const declared = [...app.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
const uncalled = declared.filter((name) => {
  const uses = [...app.matchAll(new RegExp(`\\b${name}\\s*\\(`, 'g'))].length;
  const refs = [...app.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
  return uses <= 1 && refs <= 1;
});
t.ok('no top-level function in app.js is uncalled', uncalled.length === 0, uncalled.join(', ') || `${declared.length} functions`);

// --- every DOM id app.js reaches for exists in index.html ----------------------
const html = readFileSync(join(ROOT, 'src/ui/index.html'), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const wanted = new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]));
const missing = [...wanted].filter((id) => !ids.has(id));
t.ok('every DOM id app.js reaches for exists', missing.length === 0, missing.join(', ') || `${wanted.size} ids`);

// --- the manifest has not drifted from the code --------------------------------
const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
const srcText = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(f, 'utf8')).join('\n');
const apis = new Set([...srcText.matchAll(/chrome\.(\w+)\./g)].map((m) => m[1]));
const needsNone = new Set(['runtime']);
const undeclared = [...apis].filter((a) => !manifest.permissions?.includes(a) && !needsNone.has(a));
t.ok('every chrome API used is declared or needs no permission', undeclared.length === 0, `apis: ${[...apis].join(', ')}; permissions: ${(manifest.permissions ?? []).join(', ')}`);

const unused = (manifest.permissions ?? []).filter((p) => !apis.has(p));
t.ok('no permission is declared but unused', unused.length === 0, unused.join(', ') || `${manifest.permissions?.length ?? 0} declared`);

// --- the version has not moved -------------------------------------------------
t.ok('the version is still 0.1.0', manifest.version === '0.1.0', manifest.version);

// --- no session identifiers in anything that would be committed ----------------
const tracked = ['src', 'manifest.json', 'wiki', '.agents'];
const leaks = [];
for (const p of tracked) {
  let full;
  try { full = join(ROOT, p); } catch { continue; }
  if (!existsSyncSafe(full)) continue;
  const scan = statSync(full).isDirectory() ? walk(full) : [full];
  for (const f of scan) {
    if (!/\.(js|css|html|md|json)$/.test(f)) continue;
    const text = readFileSync(f, 'utf8');

    // This has to match an identifier VALUE, not the word. `session_id` is this
    // product's own IndexedDB foreign key for a chat session — matching the word caught
    // `src/db.js` and `sessions.js`, which are correct.
    const patterns = [
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,   // a session uuid
      /claude\.ai\/chat\//i,                                                // a session url
      /\b(?:session|conversation|run|trace)[-_]?[0-9a-f]{7,}\b/i,             // an opaque id
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (m) { leaks.push(`${rel(f)}: ${m[0].slice(0, 40)}`); break; }
    }
  }
}
t.ok('no session identifier in anything that would be committed', leaks.length === 0, leaks.join(' | ') || 'clean');

function existsSyncSafe(p) {
  try { statSync(p); return true; } catch { return false; }
}

const ok = t.report();
process.exit(ok ? 0 : 1);