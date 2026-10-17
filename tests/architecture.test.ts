import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Архітектурні правила з AGENTS.md, які інакше тримаються лише на пам'яті.
 * Не стиль, а межі: порушення кожного з них уже давало інцидент в обліку.
 *
 * 1. orders.status пишеться лише через lib/orders/status (transitionOrder /
 *    buildStatusPatch). 03.10.2026 статус «Відправлено», виставлений повз
 *    відгрузку, дав замовлення без видаткової (I7).
 * 2. money_entries не пишуться напряму — лише функція БД record_money_txn через
 *    lib/accounting (подвійний запис, ідемпотентність).
 * 3. Крон-роути авторизуються через cronAuthorized, а не порівнянням рядків із
 *    CRON_SECRET (без змінної те порівняння пропускало всіх).
 */

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'node_modules' || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const files = SCAN_DIRS.flatMap(d => walk(path.join(ROOT, d)));
const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p: string) => readFileSync(p, 'utf8');

describe('архітектурні межі (AGENTS.md)', () => {
  it('orders.status пишеться лише в lib/orders/status.ts', () => {
    const allowed = new Set(['lib/orders/status.ts']);
    // .from('orders') … .update({ … status: '<літерал>' або status: змінна }) — у межах одного ланцюжка.
    // Вставки (insert) зі status: 'new' — створення замовлення, це не перехід статусу.
    const re = /\.from\(\s*['"]orders['"]\s*\)[\s\S]{0,400}?\.update\(\s*\{[^}]*\bstatus\s*:/g;
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (allowed.has(r)) continue;
      const src = read(f);
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${r}:${line}`);
      }
    }
    expect(offenders, 'пиши статус через transitionOrder/buildStatusPatch:\n' + offenders.join('\n')).toEqual([]);
  });

  it('money_entries не вставляються напряму поза lib/accounting', () => {
    const re = /\.from\(\s*['"]money_entries['"]\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/g;
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (r.startsWith('lib/accounting/')) continue;
      for (const m of read(f).matchAll(re)) offenders.push(`${r}:${read(f).slice(0, m.index).split('\n').length}`);
    }
    expect(offenders, 'леджер пишеться лише через record_money_txn у lib/accounting:\n' + offenders.join('\n')).toEqual([]);
  });

  it('крони перевіряють секрет через cronAuthorized', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const r = rel(f);
      if (!r.startsWith('app/api/cron/')) continue;
      const src = read(f);
      if (/!==\s*`Bearer \$\{process\.env\.CRON_SECRET\}`/.test(src)) offenders.push(r);
    }
    expect(offenders, 'використовуй cronAuthorized з lib/cron-auth:\n' + offenders.join('\n')).toEqual([]);
  });
});
