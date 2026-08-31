/**
 * Розбір і перерахунок рядків видаткової при ручному редагуванні.
 *
 * Винесено в чисту функцію, бо це гроші: сума накладної рахується ТУТ, а не в
 * браузері. З клієнта приходить лише склад — що за товар, скільки й почому;
 * підсумок, який користувач бачив на екрані, до документа не потрапляє взагалі
 * (див. правило «ціні від клієнта не довіряй» в AGENTS.md).
 */

export type RawSaleLine = { sku?: unknown; qty?: unknown; price?: unknown };

export type CleanSaleLine = { sku: string; qty: number; price: number };

export type ParsedSaleLines =
  | { ok: true; lines: CleanSaleLine[]; total: number }
  | { ok: false; error: string };

/** Копійки. Накопичувати добутки без округлення не можна: 0.1×3 дає 0.30000000000000004. */
const round2 = (n: number) => Math.round(n * 100) / 100;

export function parseSaleLines(raw: unknown): ParsedSaleLines {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: 'У накладній має бути хоча б один рядок' };
  }

  const lines: CleanSaleLine[] = [];
  for (const item of raw as RawSaleLine[]) {
    const sku = String(item?.sku ?? '').trim();
    if (!sku) return { ok: false, error: 'Рядок без артикула' };

    // Кома як десятковий роздільник — норма для української розкладки, і
    // «1,5» не має перетворюватись на NaN мовчки.
    const qty = toNumber(item?.qty);
    const price = toNumber(item?.price);

    if (qty === null || qty <= 0) {
      return { ok: false, error: `Кількість у рядку ${sku} має бути більшою за нуль` };
    }
    if (price === null || price < 0) {
      return { ok: false, error: `Некоректна ціна у рядку ${sku}` };
    }
    lines.push({ sku, qty, price: round2(price) });
  }

  // Дублікати склеюємо: той самий артикул двома рядками у друкованій формі
  // читається як помилка оформлення, а в обліку дав би два списання з FIFO.
  const merged = new Map<string, CleanSaleLine>();
  for (const l of lines) {
    const cur = merged.get(l.sku);
    // Ціну лишаємо останню введену: саме її користувач бачив у рядку, який
    // редагував останнім.
    if (cur) merged.set(l.sku, { sku: l.sku, qty: round2(cur.qty + l.qty), price: l.price });
    else merged.set(l.sku, l);
  }

  const out = [...merged.values()];
  const total = round2(out.reduce((s, l) => s + round2(l.qty * l.price), 0));
  return { ok: true, lines: out, total };
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
