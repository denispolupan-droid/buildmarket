// Звіт: на яких товарах Rozetka увімкнена доставка в точки видачі.
//
// Це налаштування не по товару, а по НАБОРУ ДОСТАВКИ (SLA), який до товару
// прив'язаний полем sla_id. Набір з точками видачі впізнаємо не за id (він свій
// у кожного продавця), а за складом служб: у ньому є «ROZETKA Delivery».
//
// Запуск:
//   npm run rz:sla                       — зведення по наборах і групах товарів
//   npm run rz:sla -- --off              — плюс повний перелік товарів БЕЗ точок видачі
//   npm run rz:sla -- --csv              — вивантажити rozetka-sla.csv
//   npm run rz:sla -- --csv=шлях.csv
//
// Тільки читання: жодного запису ні в Rozetka, ні в базу.
import { writeFileSync } from 'fs';
import * as apiNS from '../../lib/rozetka-api';
const API = (apiNS as unknown as { default: typeof apiNS }).default ?? apiNS;

const args = process.argv.slice(2);
const SHOW_OFF = args.includes('--off');
const csvArg = args.find(a => a === '--csv' || a.startsWith('--csv='));
const CSV_PATH = csvArg ? (csvArg.split('=')[1] || 'rozetka-sla.csv') : null;

type Sla = {
  roz_id: number;
  title: string;
  rz_self_pickup?: boolean;
  is_standard?: boolean;
  is_reserve?: boolean;
  ff?: boolean;
  deliveryServices?: { delivery_service_name?: string; title?: string }[];
};

type Item = {
  article: string; name: string; sla_id: number; sla_rz_id?: number;
  stock_quantity?: number; price?: number | string;
};

/** Набір дає точки видачі, якщо серед його служб є ROZETKA Delivery. */
function hasPickup(sla: Sla): boolean {
  return (sla.deliveryServices ?? []).some(d =>
    /rozetka\s*delivery/i.test(`${d.delivery_service_name ?? ''} ${d.title ?? ''}`));
}

const { slas } = await API.rozetkaFetch<{ slas: Sla[] }>('/sla/search');

console.log('=== Набори доставки ===');
const pickupIds = new Set<number>();
for (const s of slas) {
  const pick = hasPickup(s);
  if (pick) pickupIds.add(Number(s.roz_id));
  const marks = [s.is_standard ? 'стандартний' : null, s.is_reserve ? 'резерв' : null, s.ff ? 'fulfillment' : null]
    .filter(Boolean).join(', ');
  console.log(`\n${pick ? '✅' : '❌'} #${s.roz_id} «${s.title}»${marks ? ` — ${marks}` : ''}`);
  for (const d of s.deliveryServices ?? []) console.log(`     · ${d.delivery_service_name} — ${d.title}`);
  if (!(s.deliveryServices ?? []).length) console.log('     (служби не вказані)');
}

if (!pickupIds.size) {
  console.log('\n⚠ Жоден набір не містить ROZETKA Delivery — точки видачі не увімкнені взагалі.');
}

// /items/search віддає по 20 позицій на сторінку, per_page він ігнорує.
const items: Item[] = [];
let page = 1, pages = 1;
do {
  const c = await API.rozetkaFetch<{ items: Item[]; _meta?: { pageCount?: number; totalCount?: number } }>(
    `/items/search?page=${page}`);
  items.push(...(c.items ?? []));
  pages = c._meta?.pageCount ?? 1;
  page++;
} while (page <= pages);

const isOn = (i: Item) => pickupIds.has(Number(i.sla_id));
const on  = items.filter(isOn);
const off = items.filter(i => !isOn(i));

console.log(`\n=== Товари: ${items.length} усього · ${on.length} з точками видачі · ${off.length} без ===`);

const title = new Map(slas.map(s => [Number(s.roz_id), s.title]));
const perSla = new Map<number, number>();
for (const i of items) perSla.set(Number(i.sla_id), (perSla.get(Number(i.sla_id)) ?? 0) + 1);
console.table([...perSla.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({
  набір: `#${id} ${title.get(id) ?? '(невідомий)'}`,
  'точки видачі': pickupIds.has(id) ? 'так' : 'ні',
  товарів: n,
})));

// Групуємо за перших двох слів назви — цього досить, щоб побачити, де набір
// «розʼїхався» всередині однієї товарної групи.
const byGroup = new Map<string, { on: number; off: number }>();
for (const i of items) {
  const key = String(i.name ?? '').split(/\s+/).slice(0, 2).join(' ');
  const e = byGroup.get(key) ?? { on: 0, off: 0 };
  if (isOn(i)) e.on++; else e.off++;
  byGroup.set(key, e);
}
const worst = [...byGroup.entries()].filter(([, v]) => v.off > 0).sort((a, b) => b[1].off - a[1].off);
console.log(`\n=== Групи без точок видачі (топ-25 із ${worst.length}) ===`);
console.table(worst.slice(0, 25).map(([k, v]) => ({ група: k, 'без точок': v.off, 'з точками': v.on })));

if (SHOW_OFF) {
  console.log(`\n=== Усі ${off.length} товарів без точок видачі ===`);
  for (const i of off) {
    console.log(`  ${i.article} — ${String(i.name).slice(0, 70)} (набір #${i.sla_id}, ${i.stock_quantity ?? '?'} шт)`);
  }
}

if (CSV_PATH) {
  const esc = (v: unknown) => String(v ?? '').replace(/;/g, ',').replace(/[\r\n]+/g, ' ');
  const rows = ['article;name;sla_id;sla;pickup;stock;price'];
  for (const i of items) {
    rows.push([esc(i.article), esc(i.name), i.sla_id, esc(title.get(Number(i.sla_id))),
      isOn(i) ? 'так' : 'ні', i.stock_quantity ?? '', i.price ?? ''].join(';'));
  }
  // BOM — щоб Excel не зіпсував кирилицю
  writeFileSync(CSV_PATH, '﻿' + rows.join('\n'), 'utf8');
  console.log(`\nCSV: ${CSV_PATH} (${items.length} рядків)`);
}
