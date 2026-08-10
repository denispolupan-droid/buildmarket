import Anthropic from '@anthropic-ai/sdk';

// Опис товару для фідів маркетплейсів — окремий текст, не той, що на сайті.
//
// Причина розділення в міграції 093: однаковий текст у нас і на Rozetka Google
// склеює й показує авторитетнішу сторінку (їхню), а хвіст про магазин і доставку
// їхня модерація блокує як згадку стороннього ресурсу. Тому тут — стисло, від
// характеристик і застосування, без жодних згадок магазину, сайту й доставки.
//
// Моделі підібрані за місцем витрат: український текст пише сильніша модель
// (він визначає якість обох мов), переклад короткого технічного абзацу віддано
// Haiku — та сама схема, що вже працює в lib/product-content-gen для сайту.

import { MP_MIN_CHARS } from './marketplace-description';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MP_MODEL_UA = 'claude-sonnet-5';
export const MP_MODEL_RU = 'claude-haiku-4-5-20251001';

const ITEM_TIMEOUT_MS = 120_000;


const UA_SCHEMA = {
  type: 'object' as const,
  properties: {
    description_mp: { type: 'string' as const, description: 'Опис товару для маркетплейсу, 700-900 знаків, 2-3 абзаци' },
  },
  required: ['description_mp'],
  additionalProperties: false,
};

const RU_SCHEMA = {
  type: 'object' as const,
  properties: {
    description_mp_ru: { type: 'string' as const },
  },
  required: ['description_mp_ru'],
  additionalProperties: false,
};

export type MpProduct = {
  sku: string;
  name: string;
  brand: string;
  /** Характеристики картки — головне джерело фактів, щоб текст не був водою */
  chars?: { label: string; value: string }[];
};

function parseStructured<T>(msg: Anthropic.Message): T {
  if (msg.stop_reason !== 'end_turn') throw new Error(`stop_reason=${msg.stop_reason}`);
  const block = msg.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block in response');
  return JSON.parse(block.text) as T;
}

export function buildMpPrompt(product: MpProduct, categoryName: string): string {
  const chars = (product.chars ?? [])
    .map(c => `${c.label}: ${c.value}`)
    .join('\n');
  return `Ти пишеш описи товарів для карток на маркетплейсах (Rozetka, Prom). Це НЕ текст для сайту магазину: покупець уже стоїть на картці й обирає між кількома схожими товарами.

Напиши опис товару українською, 700-900 знаків, 2-3 абзаци (порожній рядок між абзацами), без markdown і заголовків:
1) що це і для чого — почни з бренду, назви й фасування;
2) де застосовується: конкретні поверхні, типи робіт, внутрішні/зовнішні;
3) робочі властивості з характеристик (витрата, час висихання, температура, стійкість) — вплетені в речення, не списком.

ЗАБОРОНЕНО:
- згадувати магазин, сайт, бренд продавця, доставку, оплату, ціну, акції, гарантії продавця;
- посилання, адреси, назви інших ресурсів, заклики «замовляйте», «телефонуйте»;
- вигадувати числові значення, яких немає в наданих даних;
- перебільшення в дусі «найкращий у світі», «№1» — модерація маркетплейсу знімає такі формулювання.

Пиши сухо й конкретно: це технічний опис, за яким приймають рішення про покупку.

МОВА: чиста українська. Жодних русизмів і російських слів у тексті («діаметр», а не «диаметр»; «різання», а не «різка»). Власні назви брендів і артикули — як в оригіналі.

Товар:
Назва: ${product.name}
Бренд: ${product.brand}
Категорія: ${categoryName}
${chars ? `Характеристики:\n${chars}` : 'Характеристики: немає — спирайся лише на назву й категорію.'}`;
}

/** Український текст (Sonnet). */
export async function generateMpUA(product: MpProduct, categoryName: string): Promise<string> {
  const msg = await anthropic.messages.create(
    {
      model: MP_MODEL_UA,
      max_tokens: 2000,
      output_config: { format: { type: 'json_schema', schema: UA_SCHEMA } },
      messages: [{ role: 'user', content: buildMpPrompt(product, categoryName) }],
    },
    { timeout: ITEM_TIMEOUT_MS },
  );
  const { description_mp } = parseStructured<{ description_mp: string }>(msg);
  const text = description_mp.trim();
  if (text.length < MP_MIN_CHARS) throw new Error(`опис закороткий: ${text.length} знаків — «${text.slice(0, 120)}»`);
  return text;
}

/** Російський переклад (Haiku): дешевша модель там, де немає творчої роботи. */
export async function translateMpRU(ua: string): Promise<string> {
  const msg = await anthropic.messages.create(
    {
      model: MP_MODEL_RU,
      max_tokens: 2000,
      output_config: { format: { type: 'json_schema', schema: RU_SCHEMA } },
      messages: [{
        role: 'user',
        content: `Переведи описание товара с украинского на русский (аудитория — русскоязычные покупатели в Украине).
Правила:
- бренды, артикулы и числа — без изменений;
- название линейки в составе имени товара оставляй как в оригинале, но то же слово в обычном тексте переводи по смыслу («Надміцний» в названии — «Надміцний», «надміцне з'єднання» в тексте — «сверхпрочное соединение»); транслитерации вроде «надмицный» недопустимы;
- естественный русский без кальки с украинского; в тексте не должно остаться ни одного украинского слова, кроме имён собственных («по металлу», а не «по металу»);
- сохрани разбиение на абзацы (пустая строка между абзацами);
- ничего не добавляй и не сокращай.

${ua}`,
      }],
    },
    { timeout: ITEM_TIMEOUT_MS },
  );
  const { description_mp_ru } = parseStructured<{ description_mp_ru: string }>(msg);
  return description_mp_ru.trim();
}

