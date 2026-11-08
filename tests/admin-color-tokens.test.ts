import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import baseline from './admin-color-tokens.baseline.json';

/**
 * Дизайн-токени адмінки (етап 1 плану docs/ADMIN-MODERNIZATION-PLAN.md): кольори в
 * app/admin — лише через var(--…) з app/globals.css. Захардкожені hex «храповиком»:
 * кількість у файлі не може зрости проти baseline, новий файл — лише 0.
 * Зменшив кількість — онови baseline: npx vitest run tests/admin-color-tokens.test.ts -u
 * не працює для JSON, тому запусти `node scripts/admin-color-baseline.mjs`.
 */
const ROOT = join(__dirname, '..');
const HEX = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?![0-9a-fA-F])/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

export function countHex(src: string): number {
  // JSX-атрибути (color="#…", fill="#…") рахуємо теж: вони також мають піти в токени
  return (src.match(HEX) ?? []).filter(h => !/^#\d+$/.test(h) || h.length === 4).length;
}

describe('адмінка: кольори через токени', () => {
  it('захардкожених hex не більше, ніж у baseline; нові файли — без hex', () => {
    const files = walk(join(ROOT, 'app/admin'));
    const over: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      const n = countHex(readFileSync(f, 'utf8'));
      const allowed = (baseline as Record<string, number>)[rel] ?? 0;
      if (n > allowed) over.push(`${rel}: ${n} > ${allowed}`);
    }
    expect(over, 'нові hex-кольори в адмінці — використай var(--token) з app/globals.css').toEqual([]);
  });
});
