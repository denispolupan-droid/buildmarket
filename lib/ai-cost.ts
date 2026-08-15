/**
 * Фактична вартість викликів Anthropic API.
 *
 * У розділі SEO вартість показувалась хардкодною константою ($0.04 за товар),
 * тому «скільки ми витратили на дожими» дізнатись було ніде. Тепер кожна дія
 * рахує ціну зі свого ж usage і кладе її в журнал (seo_actions.cost_usd).
 *
 * Ціни — долари за мільйон токенів, прайс Anthropic. Кеш: читання ~0.1×
 * від вхідної ціни, запис 1.25× (TTL 5 хв — той, що ми використовуємо).
 */

type Price = { input: number; output: number };

const PRICES: Record<string, Price> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Дата в кінці ID (claude-haiku-4-5-20251001) — той самий тариф, що й аліас. */
function priceFor(model: string): Price | null {
  const id = model.replace(/-\d{8}$/, '');
  return PRICES[id] ?? null;
}

export type AiUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Вартість одного виклику, $. Невідома модель → 0 (краще нуль, ніж вигадка). */
export function costOf(model: string, usage: AiUsage | null | undefined): number {
  const price = priceFor(model);
  if (!price || !usage) return 0;
  const perToken = price.input / 1_000_000;
  const cost =
    (usage.input_tokens ?? 0) * perToken
    + (usage.cache_read_input_tokens ?? 0) * perToken * 0.1
    + (usage.cache_creation_input_tokens ?? 0) * perToken * 1.25
    + (usage.output_tokens ?? 0) * (price.output / 1_000_000);
  return Math.round(cost * 10_000) / 10_000;
}

/** Сума вартостей кількох викликів. */
export function totalCost(calls: { model: string; usage: AiUsage | null | undefined }[]): number {
  return Math.round(calls.reduce((s, c) => s + costOf(c.model, c.usage), 0) * 10_000) / 10_000;
}

/**
 * Лічильник витрат на одну одиницю роботи (напр. одну картку товару).
 * Передається вниз по стеку генерації як необовʼязковий аргумент: так вартість
 * збирається з КОЖНОГО виклику (opus за укр + haiku за рос), а не оцінюється
 * константою, і при цьому жоден наявний виклик не ламається.
 */
export class CostSink {
  private total = 0;

  add(model: string, usage: AiUsage | null | undefined): void {
    this.total += costOf(model, usage);
  }

  get usd(): number {
    return Math.round(this.total * 10_000) / 10_000;
  }
}
