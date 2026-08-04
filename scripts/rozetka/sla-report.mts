// Звіт: на яких товарах Rozetka увімкнена доставка в точки видачі.
//
// Логіка живе в lib/rozetka-sla.ts — той самий модуль читає кнопка «Точки видачі»
// на екрані «Товари Rozetka». Тут лише друк у консоль і вивантаження CSV.
//
// Запуск:
//   npm run rz:sla                       — зведення по наборах і групах товарів
//   npm run rz:sla -- --off              — плюс повний перелік товарів БЕЗ точок видачі
//   npm run rz:sla -- --csv              — вивантажити rozetka-sla.csv
//   npm run rz:sla -- --csv=шлях.csv
//
// Тільки читання: жодного запису ні в Rozetka, ні в базу.
import { writeFileSync } from 'fs';
import * as slaNS from '../../lib/rozetka-sla';
const SLA = (slaNS as unknown as { default: typeof slaNS }).default ?? slaNS;

const args = process.argv.slice(2);
const SHOW_OFF = args.includes('--off');
const csvArg = args.find(a => a === '--csv' || a.startsWith('--csv='));
const CSV_PATH = csvArg ? (csvArg.split('=')[1] || 'rozetka-sla.csv') : null;

const [slas, items] = await Promise.all([SLA.fetchRozetkaSlas(), SLA.fetchRozetkaItems()]);
const report = SLA.buildRozetkaSlaReport(slas, items);

console.log('=== Набори доставки ===');
for (const s of report.slas) {
  const marks = [s.isStandard ? 'стандартний' : null, s.isReserve ? 'резерв' : null, s.ff ? 'fulfillment' : null]
    .filter(Boolean).join(', ');
  console.log(`\n${s.pickup ? '✅' : '❌'} #${s.id} «${s.title}»${marks ? ` — ${marks}` : ''} · ${s.itemCount} товарів`);
  for (const svc of s.services) console.log(`     · ${svc}`);
  if (!s.services.length) console.log('     (служби не вказані)');
}
if (!report.slas.some(s => s.pickup)) {
  console.log('\n⚠ Жоден набір не містить ROZETKA Delivery — точки видачі не увімкнені взагалі.');
}

const { items: total, withPickup, withoutPickup } = report.totals;
console.log(`\n=== Товари: ${total} усього · ${withPickup} з точками видачі · ${withoutPickup} без ===`);
console.table(report.slas.map(s => ({
  набір: `#${s.id} ${s.title}`, 'точки видачі': s.pickup ? 'так' : 'ні', товарів: s.itemCount,
})));

console.log(`\n=== Групи без точок видачі (топ-25 із ${report.groups.length}) ===`);
console.table(report.groups.slice(0, 25).map(g => ({
  група: g.group, 'без точок': g.off, 'з точками': g.on,
})));

if (SHOW_OFF) {
  console.log(`\n=== Усі ${report.off.length} товарів без точок видачі ===`);
  for (const i of report.off) {
    console.log(`  ${i.article} — ${String(i.name).slice(0, 70)} (набір #${i.slaId}, ${i.stock} шт)`);
  }
}

if (CSV_PATH) {
  const slaTitle = new Map(report.slas.map(s => [s.id, s.title]));
  const pickup = new Set(report.slas.filter(s => s.pickup).map(s => s.id));
  const esc = (v: unknown) => String(v ?? '').replace(/;/g, ',').replace(/[\r\n]+/g, ' ');
  const rows = ['article;name;sla_id;sla;pickup;stock;price'];
  for (const i of items) {
    rows.push([esc(i.article), esc(i.name), i.sla_id, esc(slaTitle.get(Number(i.sla_id))),
      pickup.has(Number(i.sla_id)) ? 'так' : 'ні', i.stock_quantity ?? '', i.price ?? ''].join(';'));
  }
  // BOM — щоб Excel не зіпсував кирилицю
  writeFileSync(CSV_PATH, '﻿' + rows.join('\n'), 'utf8');
  console.log(`\nCSV: ${CSV_PATH} (${items.length} рядків)`);
}
