// Перебудова baseline для tests/admin-color-tokens.test.ts: скільки hex-кольорів
// лишилось у кожному файлі app/admin. Запускати після того, як кількість ЗМЕНШИЛАСЬ.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?![0-9a-fA-F])/g;
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
};
const out = {};
let total = 0;
for (const f of walk(join(ROOT, 'app/admin'))) {
  const n = (readFileSync(f, 'utf8').match(HEX) ?? []).filter(h => !/^#\d+$/.test(h) || h.length === 4).length;
  if (n) { out[relative(ROOT, f).replace(/\\/g, '/')] = n; total += n; }
}
const sorted = Object.fromEntries(Object.entries(out).sort());
writeFileSync(join(ROOT, 'tests/admin-color-tokens.baseline.json'), JSON.stringify(sorted, null, 2) + '\n');
console.log('baseline:', Object.keys(sorted).length, 'files,', total, 'hex');
