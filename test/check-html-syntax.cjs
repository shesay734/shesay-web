// CI-equivalent check: parse every *.html, extract local <script src> refs and
// inline scripts, node --check each. Mirrors .github/workflows/web-check.yml.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = process.argv[2] || '.';
const htmlFiles = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
let failures = 0;
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(dir, file), 'utf8');
  const scriptRe = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const body = m[2] || '';
    const srcMatch = /\bsrc\s*=\s*"([^"]+)"/.exec(attrs);
    if (srcMatch) {
      const local = srcMatch[1];
      if (/^(https?:|\.\.?\/|\/)/.test(local)) continue;
      const p = path.join(dir, local);
      if (!fs.existsSync(p)) { console.error(`${file}: missing local script ${local}`); failures++; }
      continue;
    }
    if (!body.trim()) continue;
    const tmp = path.join(require('node:os').tmpdir(), `chk-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
    fs.writeFileSync(tmp, body);
    try { execFileSync('node', ['--check', tmp], { stdio: 'pipe', encoding: 'utf8' }); }
    catch (e) { console.error(`${file}: inline script syntax error:\n${e.stderr}`); failures++; }
    finally { fs.unlinkSync(tmp); }
  }
  console.log(`checked ${file}`);
}
if (failures) { console.error(`FAILED: ${failures} issue(s)`); process.exit(1); }
console.log(`OK: all ${htmlFiles.length} html files check clean`);