#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { extractInlineScripts } = require('./html-utils');
const { findInlineCallbackLogic } = require('./inline-callback-logic');

const rule = process.argv[2];
const outputFile = process.argv[3];

if (!rule || !outputFile) {
  console.error("Usage: node arch-check.js <rule> <outputFile>");
  process.exit(1);
}

const ROOT = process.cwd();

function getAllFiles(dir, ext = ['.js']) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(full, ext));
    } else if (ext.includes(path.extname(full))) {
      results.push(full);
    }
  });
  return results;
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}


function findMatches(content, regex) {
  const re = new RegExp(regex.source, 'g');
  const results = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    const line = content.slice(0, m.index).split('\n').length;
    results.push({ line, text: m[0].slice(0, 60).replace(/\s+/g, ' ') });
  }
  return results;
}

let violations = [];
let scanned = [];

if (rule === 'no-dom-in-core') {
  const files = getAllFiles(path.join(ROOT, 'core'));
  files.forEach(file => {
    const content = read(file);
    scanned.push(file);
    if (/\bdocument\b/.test(content) || /\bwindow\b/.test(content)) {
      violations.push(`${file} uses DOM globals`);
    }
  });
}

if (rule === 'no-ui-imports') {
  const files = getAllFiles(path.join(ROOT, 'core'));
  files.forEach(file => {
    const content = read(file);
    scanned.push(file);
    if (content.match(/from ['"].*\/ui\//)) {
      violations.push(`${file} imports from /ui`);
    }
  });
}

if (rule === 'no-stray-files') {
  const EXCLUDED = new Set(['scripts', 'tests', '.github', '.githooks', 'node_modules', 'coverage', 'reports', '.claude', 'verify-flows']);
  const LAYERS = new Set(['core', 'ui', 'app', 'companion', 'components', 'styles', 'assets', 'content']);
  const allFiles = getAllFiles(ROOT);
  allFiles.forEach(file => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const parts = rel.split('/');
    if (parts.length === 1) return; // root-level config files (vitest.config.js etc.)
    const topDir = parts[0];
    if (EXCLUDED.has(topDir)) return;
    scanned.push(file);
    if (!LAYERS.has(topDir)) {
      violations.push(`${rel} is outside a recognised layer (core/ui/app/components/styles/assets/content)`);
    }
  });
}

if (rule === 'no-guard-chain') {
  const CHAIN_LINE = /('true'\s*:\s*\(\)\s*=>\s*\w+\[).*('false'\s*:\s*\(\)\s*=>\s*\{\s*\})/;
  const WINDOW = 10;

  function checkGuardChain(lines, label) {
    for (let i = 0; i < lines.length; i++) {
      if (!CHAIN_LINE.test(lines[i])) continue;
      const chainLines = [i];
      for (let j = i + 1; j < Math.min(i + WINDOW, lines.length); j++) {
        if (CHAIN_LINE.test(lines[j])) chainLines.push(j);
      }
      if (chainLines.length >= 2) {
        violations.push(`${label} — chained noop-guard dispatch tables at lines ${chainLines.map(l => l + 1).join(', ')} (use [fn].filter(() => [...].every(Boolean)).forEach(f => f()))`);
        break;
      }
    }
  }

  getAllFiles(path.join(ROOT, 'ui'), ['.js']).forEach(file => {
    const content = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    checkGuardChain(content.split('\n'), rel);
  });

  getAllFiles(path.join(ROOT, 'app'), ['.html']).forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, blockIdx) => {
      const label = `${rel} (block ${blockIdx + 1})`;
      scanned.push(label);
      checkGuardChain(script.split('\n'), label);
    });
  });
}

if (rule === 'no-app-exports') {
  const files = getAllFiles(path.join(ROOT, 'app'));
  files.forEach(file => {
    const content = read(file);
    scanned.push(file);
    if (/^export\s/m.test(content)) {
      violations.push(`${path.relative(ROOT, file).replace(/\\/g, '/')} exports from app/ (move to core/ or ui/)`);
    }
  });
}

if (rule === 'no-filter-conditional') {
  // [null] or [undefined] used as a conditional sentinel (use boolean dispatch table instead)
  const NULL_SENTINEL = /\[\s*(null|undefined)\s*\]\s*\.filter\s*\(/;
  // negation filter where the callback negates its OWN parameter — the "else" side of an if/else
  // backreference \1 ensures we only catch: function(x){return !x  not: function(){return !outerVar
  const NEGATION_FILTER = /\[[^\[\],\n]{1,80}\]\s*\.filter\s*\(\s*function\s*\((\w+)\)\s*\{[^{}]{0,60}return\s*!\1\b/;

  function checkContent(content, label) {
    findMatches(content, NULL_SENTINEL).forEach(({ line, text }) => {
      violations.push(`${label} — null/undefined sentinel as conditional at line ${line}: \`${text}\` (use boolean dispatch table)`);
    });
    findMatches(content, NEGATION_FILTER).forEach(({ line, text }) => {
      violations.push(`${label} — negation filter on single-element array at line ${line}: \`${text}\` (use boolean dispatch table)`);
    });
  }

  getAllFiles(path.join(ROOT, 'ui'), ['.js']).forEach(file => {
    const content = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    checkContent(content, rel);
  });

  getAllFiles(path.join(ROOT, 'app'), ['.html']).forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      scanned.push(rel + ' (block ' + (i + 1) + ')');
      checkContent(script, rel);
    });
  });
}

if (rule === 'no-json-in-repo') {
  // `.contract` holds the gitignored backend contract fixtures pulled from the
  // private grew-tv for the TASK-311 conformance test (npm run contract:pull) —
  // never committed, so exclude it here too (a dev who populated it locally else
  // trips this check on JSON that isn't in the repo).
  const EXCLUDED_DIRS = new Set(['node_modules', 'content', 'coverage', 'reports', 'test-results', '.claude', '.stryker-tmp', '.contract']);
  const ALLOWED_FILES = new Set(['package.json', 'package-lock.json', 'scripts/package.json', 'manifest.json', 'stryker.conf.json']);

  function walkJson(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) walkJson(full);
      } else if (entry.name.endsWith('.json')) {
        if (!ALLOWED_FILES.has(rel)) {
          scanned.push(rel);
          violations.push(`${rel} — JSON must live under content/`);
        }
      }
    }
  }
  walkJson(ROOT);
}

if (rule === 'app-index-only') {
  function walkHtmlOnly(dir, label) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(entry => {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) { walkHtmlOnly(full, label); return; }
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      scanned.push(rel);
      if (path.extname(full).toLowerCase() !== '.html') {
        violations.push(`${rel} — ${label}/ must contain only HTML pages (no JS/CSS/media)`);
      }
    });
  }
  walkHtmlOnly(path.join(ROOT, 'app'), 'app');
  walkHtmlOnly(path.join(ROOT, 'remote'), 'remote');
}

if (rule === 'no-media-outside-assets') {
  const MEDIA_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.mp3', '.mp4', '.wav', '.ogg']);
  const EXCLUDED = new Set(['node_modules', 'assets', 'content', 'coverage', 'reports', 'test-results', '.claude', '.github', '.githooks']);
  function walkMedia(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED.has(entry.name)) walkMedia(full);
        return;
      }
      if (MEDIA_EXT.has(path.extname(entry.name).toLowerCase())) {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        scanned.push(rel);
        violations.push(`${rel} — media files must live under assets/`);
      }
    });
  }
  walkMedia(ROOT);
}

if (rule === 'no-css-outside-styles') {
  const EXCLUDED = new Set(['node_modules', 'styles', 'coverage', 'reports', '.claude', '.github', '.githooks']);
  function walkCss(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED.has(entry.name)) walkCss(full);
        return;
      }
      if (path.extname(entry.name) === '.css') {
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        scanned.push(rel);
        violations.push(`${rel} — CSS files must live under styles/`);
      }
    });
  }
  walkCss(ROOT);
}

if (rule === 'no-md-outside-docs') {
  const ALLOWED_ROOT_FILES = new Set(['README.md', 'CLAUDE.md', 'LICENCE', 'LICENSE']);
  const EXCLUDED_DIRS = new Set(['node_modules', 'docs', 'coverage', 'reports', '.claude', '.github', '.githooks', 'test-results', 'verify-flows']);
  function walkMd(dir, depth) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) walkMd(full, depth + 1);
        return;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (ext === '.md' || ext === '.txt') {
        if (depth === 0 && ALLOWED_ROOT_FILES.has(entry.name)) return;
        scanned.push(rel);
        violations.push(`${rel} — .md/.txt files must live under docs/`);
      }
    });
  }
  walkMd(ROOT, 0);
}

if (rule === 'no-pure-fn-outside-core') {
  // Named function declarations outside core/ with params + logic + no DOM access belong in core/.
  // "Logic" = top-level return OR Math.* / numeric computation in body.
  // Once in core/, the per-file coverage floor (vitest.config.js) enforces tests exist.
  const DOM_PATTERN = /\b(document|window|navigator|location|requestAnimationFrame|cancelAnimationFrame|fetch|decodeAudioBuffer|decodeAudioData)\b|\.(?:style\b|classList\b|textContent\b|innerHTML\b|innerText\b|appendChild\b|removeChild\b|remove\b|insertBefore\b|addEventListener\b|removeEventListener\b|setAttribute\b|getAttribute\b|querySelector\b|querySelectorAll\b|getElementById\b|offsetTop\b|offsetLeft\b|offsetWidth\b|offsetHeight\b|clientHeight\b|clientWidth\b|scrollTo\b|scrollLeft\b|scrollTop\b|cssText\b|createElementNS\b|createBufferSource\b|createGain\b|resume\b|decodeAudioData\b|clearRect\b|fillRect\b|strokeRect\b|drawImage\b|beginPath\b|moveTo\b|lineTo\b|arc\b|fill\b|stroke\b|fillText\b|strokeText\b|getImageData\b|putImageData\b|createLinearGradient\b|createRadialGradient\b)/;
  const THIN_DISPATCHER = /^\s*return\s+\w+\[.*\]\s*\(.*\)\s*;?\s*$/s;
  const COMPUTATION_PATTERN = /\bMath\.\w+\s*\(|\bparseInt\b|\bparseFloat\b|\bNumber\b|\bisNaN\b|\bisFinite\b/;

  function hasTopLevelReturn(body) {
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '{') { depth++; continue; }
      if (body[i] === '}') { depth--; continue; }
      if (depth === 0 && /^return\b/.test(body.slice(i))) return true;
    }
    return false;
  }

  function hasLogic(body) {
    return hasTopLevelReturn(body) || COMPUTATION_PATTERN.test(body);
  }

  function extractFunctions(content) {
    const results = [];
    const fnRegex = /\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
    let m;
    while ((m = fnRegex.exec(content)) !== null) {
      const params = m[2].trim();
      if (!params) continue;
      const name = m[1];
      const bodyStart = m.index + m[0].length;
      let depth = 1, i = bodyStart;
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++;
        else if (content[i] === '}') depth--;
        i++;
      }
      const body = content.slice(bodyStart, i - 1);
      const line = content.slice(0, m.index).split('\n').length;
      results.push({ name, body, line });
    }
    return results;
  }

  function checkJsFile(file) {
    const content = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    extractFunctions(content).forEach(({ name, body, line }) => {
      if (DOM_PATTERN.test(body)) return;
      if (!hasLogic(body)) return;
      if (THIN_DISPATCHER.test(body)) return;
      violations.push(`${rel}:${line} — '${name}' has no DOM access; move to core/`);
    });
  }

  ['ui', 'components'].forEach(layer => {
    getAllFiles(path.join(ROOT, layer), ['.js']).forEach(checkJsFile);
  });

  getAllFiles(path.join(ROOT, 'app'), ['.html']).forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = rel + ' (block ' + (i + 1) + ')';
      scanned.push(label);
      extractFunctions(script).forEach(({ name, body, line }) => {
        if (DOM_PATTERN.test(body)) return;
        if (!hasTopLevelReturn(body)) return;
        if (THIN_DISPATCHER.test(body)) return;
        violations.push(`${label}:${line} — '${name}' has no DOM access; move to core/`);
      });
    });
  });
}

function getAppAndCompanionHtml() {
  return [
    ...getAllFiles(path.join(ROOT, 'app'), ['.html']),
    ...getAllFiles(path.join(ROOT, 'companion'), ['.html']),
  ];
}

if (rule === 'no-fetch-in-app') {
  const PATTERN = /fetch\s*\(/;
  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = `${rel} (block ${i + 1})`;
      scanned.push(label);
      if (PATTERN.test(script)) {
        violations.push(`${label} — fetch() in app/companion HTML; move to core/`);
      }
    });
  });
}

if (rule === 'no-storage-in-app') {
  const PATTERN = /localStorage/;
  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = `${rel} (block ${i + 1})`;
      scanned.push(label);
      if (PATTERN.test(script)) {
        violations.push(`${label} — localStorage in app/companion HTML; move to core/state.js`);
      }
    });
  });
}

if (rule === 'no-ws-in-app') {
  const PATTERN = /new WebSocket\s*\(/;
  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = `${rel} (block ${i + 1})`;
      scanned.push(label);
      if (PATTERN.test(script)) {
        violations.push(`${label} — new WebSocket() in app/companion HTML; move to core/`);
      }
    });
  });
}

if (rule === 'max-inline-script-lines') {
  const LIMIT = 30;
  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = `${rel} (block ${i + 1})`;
      scanned.push(label);
      const lines = script.split('\n').length;
      if (lines > LIMIT) {
        violations.push(`${label} — ${lines} lines exceeds ${LIMIT}-line limit; extract to core/ or ui/`);
      }
    });
  });
}

if (rule === 'no-multi-screen-html') {
  const PATTERN = /(?:initPage|registerScreen)\s*\(/g;
  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    const matches = html.match(PATTERN);
    const count = matches ? matches.length : 0;
    if (count > 1) {
      violations.push(`${rel} — ${count} screen registrations (initPage/registerScreen); max 1 per file`);
    }
  });
}

if (rule === 'companion-in-layers') {
  const archCheckPath = path.join(ROOT, 'scripts', 'arch-check.js');
  scanned.push('scripts/arch-check.js');
  const content = read(archCheckPath);
  const layersMatch = content.match(/const LAYERS\s*=\s*new Set\s*\(\s*\[([^\]]*)\]/);
  if (!layersMatch) {
    violations.push(`scripts/arch-check.js — could not find LAYERS definition`);
  } else if (!layersMatch[1].includes("'companion'")) {
    violations.push(`scripts/arch-check.js — 'companion' missing from LAYERS set in no-stray-files rule`);
  }
}

if (rule === 'no-missing-card-route') {
  // Every table that dispatches on cardRoute(card)'s return value must handle
  // (or explicitly declare unhandled) every value core/home-rails.js's
  // CARD_ROUTES lists (TASK-383) — a gap silently no-ops instead of failing CI
  // (TASK-374 provenance). A table opts in by marking the line directly above
  // its `var/const/let NAME = {...}` declaration with `// @card-route-table`,
  // optionally `unhandled: routeA, routeB` for a route that table deliberately
  // doesn't serve.
  const routesSrc = read(path.join(ROOT, 'core', 'home-rails.js'));
  const routesMatch = routesSrc.match(/CARD_ROUTES\s*=\s*\[([^\]]*)\]/);
  const ALL_ROUTES = routesMatch
    ? Array.from(routesMatch[1].matchAll(/['"]([\w-]+)['"]/g)).map(m => m[1])
    : null;

  if (!ALL_ROUTES) {
    violations.push(`core/home-rails.js — no CARD_ROUTES array found (single source of truth for cardRoute()'s possible return values)`);
  }

  const MARKER = /@card-route-table(?:\s+unhandled:\s*([\w,\s-]+))?/;
  const TABLE_DECL = /\b(?:var|const|let)\s+(\w+)\s*=\s*\{/;

  // Strip // line comments first — an explanatory comment between entries can
  // itself contain a comma, which would otherwise read as a top-level separator.
  function stripLineComments(text) {
    return text.split('\n').map(line => {
      const idx = line.indexOf('//');
      return idx === -1 ? line : line.slice(0, idx);
    }).join('\n');
  }

  // Top-level keys of an object literal (the text starting at its opening `{`
  // through the matching `}`) — depth-tracked so a value's own nested object
  // (e.g. a navTo() params literal) never masquerades as a table entry.
  function topLevelKeys(objLiteral) {
    const clean = stripLineComments(objLiteral);
    const keys = [];
    let depth = 0;
    let segStart = null;
    const KEY = /^\s*(?:'([\w-]+)'|"([\w-]+)"|(\w[\w-]*))\s*:/;
    function push(seg) {
      const m = seg.match(KEY);
      if (m) keys.push(m[1] || m[2] || m[3]);
    }
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (ch === '{') { depth++; if (depth === 1) segStart = i + 1; continue; }
      if (ch === '}') { if (depth === 1) push(clean.slice(segStart, i)); depth--; continue; }
      if (ch === ',' && depth === 1) { push(clean.slice(segStart, i)); segStart = i + 1; }
    }
    return keys;
  }

  function checkTables(lines, label) {
    for (let i = 0; i < lines.length && ALL_ROUTES; i++) {
      const markerMatch = lines[i].match(MARKER);
      if (!markerMatch) continue;
      const unhandled = (markerMatch[1] || '').split(',').map(s => s.trim()).filter(Boolean);

      let declLine = -1, name = null;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const declMatch = lines[j].match(TABLE_DECL);
        if (declMatch) { declLine = j; name = declMatch[1]; break; }
      }
      if (declLine === -1) {
        violations.push(`${label}:${i + 1} — @card-route-table marker has no 'var/const/let NAME = {' within 4 lines`);
        continue;
      }

      const fullText = lines.slice(declLine).join('\n');
      const braceStart = fullText.indexOf('{');
      let depth = 0, k = braceStart;
      for (; k < fullText.length; k++) {
        if (fullText[k] === '{') depth++;
        else if (fullText[k] === '}') { depth--; if (depth === 0) break; }
      }
      const objLiteral = fullText.slice(braceStart, k + 1);
      const declared = new Set([...topLevelKeys(objLiteral), ...unhandled]);
      const missing = ALL_ROUTES.filter(r => !declared.has(r));
      if (missing.length > 0) {
        violations.push(`${label}:${declLine + 1} — '${name}' is missing cardRoute value(s) [${missing.join(', ')}] — add a handler, or list them in the @card-route-table 'unhandled:' comment above it`);
      }
    }
  }

  getAllFiles(path.join(ROOT, 'core'), ['.js']).concat(getAllFiles(path.join(ROOT, 'ui'), ['.js'])).forEach(file => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    checkTables(read(file).split('\n'), rel);
  });

  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = `${rel} (block ${i + 1})`;
      scanned.push(label);
      checkTables(script.split('\n'), label);
    });
  });
}

if (rule === 'no-logic-in-inline-callbacks') {
  getAppAndCompanionHtml().forEach(file => {
    const html = read(file);
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    extractInlineScripts(html).forEach((script, i) => {
      const label = `${rel} (block ${i + 1})`;
      scanned.push(label);
      findInlineCallbackLogic(script).forEach(({ line }) => {
        violations.push(`${rel} (block ${i + 1}):${line} — transform callback with pure logic; extract to core/ + unit test`);
      });
    });
  });
}

let output = `## ${rule}\n`;

if (violations.length === 0) {
  output += `✅ No issues (scanned ${scanned.length} files)\n`;
} else {
  output += `❌ Violations (scanned ${scanned.length} files):\n`;
  violations.forEach(v => output += `- ${v}\n`);
}

output += `\nSUMMARY: ${violations.length === 0 ? '✅' : '❌'} ${violations.length} / ${scanned.length} files\n`;

fs.writeFileSync(outputFile, output);
console.log(output);

process.exit(violations.length > 0 ? 1 : 0);
