/**
 * Ориентовні габарити упаковки товару й підбір коробки для посилки (12.11.2026).
 *
 * Навіщо. У каталозі габаритів немає, а накладні Rozetka, ROZETKA Доставки,
 * Meest-Епіцентр і поштоматів НП їх вимагають; фід Епіцентру теж (обов'язкові
 * поля з листопада). Правила — ті самі, за якими 09.11 рахували розміри для
 * імпорту в Епіцентр (картридж 230×55×55, балон піни, банка/відро з ваги тощо).
 * Ручне значення з картки товару (products.package_*_mm) має пріоритет.
 *
 * Новій Пошті для звичайного відділення габарити НЕ передаємо (рішення власника
 * 12.11): оцінка з запасом підняла б об'ємну вагу, і доплатив би покупець —
 * відділення поміряє саме. Там лише підказка.
 *
 * Чистий модуль: без мережі, його читають роути й вікна накладних.
 */

/** Сторони в мм, від більшої до меншої. */
export type Dims = [number, number, number];

export type PackageEstimate = { dims: Dims; kind: string };

const sortDesc = (d: number[]): Dims => [...d].sort((a, b) => b - a) as Dims;
const r5 = (v: number) => Math.max(10, Math.round(v / 5) * 5);

/** Банка/відро з ваги: циліндр, щільність ~1,2 г/см³, висота ≈ 1,15 діаметра. */
function cylinder(weightG: number): PackageEstimate {
  const vCm3 = weightG * 1.2;
  const dMm = Math.cbrt((4 * vCm3) / (Math.PI * 1.15)) * 10;
  return { dims: sortDesc([r5(dMm * 1.15), r5(dMm + 10), r5(dMm + 10)]), kind: 'банка/відро' };
}

/**
 * Упаковка одного товару за назвою й вагою (г). Порядок правил важливий:
 * конкретні форми (правило, диск, картридж) — раніше за загальну «банку».
 */
export function estimateItemPackage(name: string, weightG: number): PackageEstimate {
  const s = name.toLowerCase();
  const w = weightG > 0 ? weightG : 0;
  let m: RegExpMatchArray | null;
  const out = (d: number[], kind: string): PackageEstimate => ({ dims: sortDesc(d), kind });

  if (/правило|рівень/.test(s) && (m = s.match(/(\d{2,3})\s*см/))) return out([+m[1] * 10 + 20, 110, 40], 'правило');
  if (/правило|рівень/.test(s) && (m = s.match(/(\d{3,4})\s*мм/))) return out([+m[1] + 20, 110, 40], 'правило');
  if (/пістолет/.test(s)) return out([320, 170, 60], 'пістолет');
  if (/лезо|леза/.test(s)) return out([120, 30, 10], 'леза');
  if (/електрод/.test(s)) return out([360, 70, 70], 'електроди');
  // «Шуруп … з буром» — кріплення, не бур
  if (/(бур|свердл)/.test(s) && !/(дюбел|анкер|саморіз|шуруп)/.test(s)) {
    const nums = (s.match(/\d{2,4}/g) ?? []).map(Number).filter(v => v <= 1000);
    if (nums.length) return out([Math.max(...nums) + 20, 30, 20], 'бур');
  }
  if (/(диск|круг)/.test(s) && (m = s.match(/(\d{2,3})\s*(?:[хx*]|мм)/))) return out([+m[1] + 10, +m[1] + 10, /алмаз/.test(s) ? 15 : 10], 'диск');
  if (/(дюбел|анкер|саморіз|шуруп)/.test(s) && w > 120) return out([r5(100 + w / 20), r5(70 + w / 30), r5(50 + w / 40)], 'коробка кріплення');
  if (/(дюбел|анкер|саморіз|шуруп)/.test(s)) {
    const a = (s.match(/\d+[,.]?\d*\s*[хx]\s*\d+/)?.[0] ?? '').split(/[хx]/).map(v => parseFloat(v.replace(',', '.')));
    const l = a[1] || 60, d = a[0] || 8;
    return out([r5(l + 10), r5(d * 2.5), r5(d * 2.5)], 'кріплення');
  }
  if (/сітк/.test(s)) return out([1100, 120, 120], 'рулон сітки');
  if (/(стрічк|нитка|фугенд)/.test(s)) return out([130, 130, 60], 'стрічка');
  if (/(піна|аерозоль|спрей)/.test(s) && w >= 200) return out([w >= 650 ? 330 : 210, 70, 70], 'балон');
  if (/(герметик|клей)/.test(s) && w >= 250 && w <= 480 && !/шпалер|пва|столяр/.test(s)) return out([230, 55, 55], 'картридж');
  if (/герметик/.test(s) && w > 480 && w <= 800) return out([310, 65, 65], 'файл-пакет');
  if (/(затирк|фуга|шпалер)/.test(s) && w > 0 && w <= 5500) return out([r5(170 + w / 40), r5(110 + w / 80), r5(40 + w / 100)], 'пакет/коробка');
  if ((/(клей).*(плитк)|шпакл|штукатур|сух/.test(s)) && w >= 4000 && !/пастоподіб/.test(s)) return out([r5(300 + w / 100), r5(200 + w / 250), r5(70 + w / 400)], 'мішок');
  if (w <= 160) return out([190, 120, 35], 'блістер');
  return cylinder(w);
}

export type PackageOverride = { package_length_mm?: number | null; package_width_mm?: number | null; package_height_mm?: number | null };

/** Габарити товару: ручні з картки (усі три), інакше оцінка. */
export function itemPackage(p: { name: string; weightG: number } & PackageOverride): PackageEstimate & { manual: boolean } {
  const o = [p.package_length_mm, p.package_width_mm, p.package_height_mm].map(Number);
  if (o.every(v => Number.isFinite(v) && v > 0)) return { dims: sortDesc(o), kind: 'з картки', manual: true };
  return { ...estimateItemPackage(p.name, p.weightG), manual: false };
}

// ── Коробка на посилку ───────────────────────────────────────────────────────

/**
 * Типові коробки, см (Д×Ш×В), за зростанням об'єму — перша, куди все влізе, і є
 * пропозиція. «Довга» — під балон піни / картриджі (не влазять у M за довжиною),
 * «M+» — під відро 3–5 кг (без неї йшло в L 40×30×30).
 */
export const PARCEL_BOXES: readonly { label: string; dims: Dims }[] = [
  { label: 'XS',    dims: [15, 10, 8] },
  { label: 'S',     dims: [26, 17, 10] },
  { label: 'довга', dims: [36, 16, 12] },
  { label: 'M',     dims: [30, 20, 15] },
  { label: 'M+',    dims: [30, 25, 25] },
  { label: 'L',     dims: [40, 30, 30] },
  { label: 'XL',    dims: [60, 40, 40] },
];

/** Запас на пакування: +1 см з кожного боку товару, об'єм ×1,25 (порожнини, наповнювач). */
const PAD_CM = 2;
const FILL = 1.25;

export type BoxSuggestion = {
  /** см, від більшої сторони */
  dims: Dims;
  label: string;
  /** Не влізло в найбільшу типову — XL, решту доведеться ділити на місця */
  overflow: boolean;
  /** Об'ємна вага НП, кг: Д×Ш×В / 4000 (для підказки) */
  volumetricKg: number;
};

const fits = (item: Dims, box: Dims) => item.every((s, i) => s <= box[i]);
const vol = (d: Dims) => d[0] * d[1] * d[2];

/**
 * Коробка для набору товарів (габарити в мм, кількість). Найбільший товар має
 * влізти за сторонами, сумарний об'єм із запасом — за об'ємом. Довгий товар
 * (правило 1,2 м, рулон сітки) у типові не влазить — тоді «коробка» = товар + запас.
 */
export function suggestParcelBox(items: { dims: Dims; qty: number }[]): BoxSuggestion | null {
  const list = items.filter(i => i.qty > 0 && i.dims.every(v => v > 0));
  if (!list.length) return null;
  const cm = list.map(i => ({ d: sortDesc(i.dims.map(v => v / 10 + PAD_CM)), qty: i.qty }));
  const biggest = cm.reduce((b, i) => (vol(i.d) > vol(b) ? i.d : b), cm[0].d);
  const needVol = cm.reduce((s, i) => s + vol(sortDesc(i.d.map(v => v - PAD_CM))) * i.qty, 0) * FILL;
  const vw = (d: Dims) => Math.round((vol(d) / 4000) * 100) / 100;

  const box = PARCEL_BOXES.find(b => fits(biggest, b.dims) && vol(b.dims) >= needVol);
  if (box) return { dims: box.dims, label: box.label, overflow: false, volumetricKg: vw(box.dims) };

  const xl = PARCEL_BOXES[PARCEL_BOXES.length - 1];
  if (!fits(biggest, xl.dims) && list.length === 1 && list[0].qty === 1) {
    const d = sortDesc(biggest.map(v => Math.ceil(v)));
    return { dims: d, label: 'за товаром', overflow: false, volumetricKg: vw(d) };
  }
  return { dims: xl.dims, label: xl.label, overflow: true, volumetricKg: vw(xl.dims) };
}
