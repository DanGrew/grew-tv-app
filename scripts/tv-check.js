#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rule = process.argv[2];
const outputFile = process.argv[3];

if (!rule || !outputFile) {
  console.error('Usage: node tv-check.js <rule> <outputFile>');
  process.exit(1);
}

const ROOT = process.cwd();

function getAllHtml(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  fs.readdirSync(dir).forEach(entry => {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results = results.concat(getAllHtml(full));
    } else if (entry.endsWith('.html')) {
      results.push(full);
    }
  });
  return results;
}

function read(file) { return fs.readFileSync(file, 'utf8'); }

function extractStyleBlocks(html) {
  const blocks = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  return blocks.join('\n');
}

let violations = [];
let scanned = [];

if (rule === 'tv-focus-rings') {
  getAllHtml(path.join(ROOT, 'app')).forEach(file => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    const html = read(file);
    const styles = extractStyleBlocks(html);

    const hasFocusRule = /:focus\s*\{[^}]*(border-color|outline)\s*:/.test(styles);

    const buttonCount = (html.match(/<button[\s>]/gi) || []).length;
    const tabindexCount = (html.match(/tabindex\s*=/gi) || []).length;

    if ((buttonCount > 0 || tabindexCount > 0) && !hasFocusRule) {
      violations.push(`${rel}: has interactive elements but no :focus rule with border-color or outline`);
    }
  });
}

if (rule === 'tv-min-font-size') {
  // Lowered 20 -> 10 (TASK-074): the FEAT-017-glass mockup is the design
  // authority and uses 10-15px labels; matching it takes priority over the
  // old 10ft-legibility floor. 10px keeps a sane guard against typos.
  const MIN_PX = 10;
  getAllHtml(path.join(ROOT, 'app')).forEach(file => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    const html = read(file);
    const styles = extractStyleBlocks(html);
    const inlineStyles = (html.match(/style="([^"]*)"/gi) || []).join(' ');
    const combined = styles + ' ' + inlineStyles;

    const re = /font-size\s*:\s*(\d+(?:\.\d+)?)px/gi;
    let m;
    while ((m = re.exec(combined)) !== null) {
      const px = parseFloat(m[1]);
      if (px < MIN_PX) {
        violations.push(`${rel}: font-size ${px}px is below minimum ${MIN_PX}px`);
      }
    }
  });
}

if (rule === 'tv-no-blank-screen') {
  getAllHtml(path.join(ROOT, 'app')).forEach(file => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    scanned.push(rel);
    const html = read(file);
    if (!/(?:id|class)="[^"]*error[^"]*"/i.test(html)) {
      violations.push(`${rel}: no error screen element found (id or class containing "error")`);
    }
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
