import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from './supabase';
import { escapeOrTerm } from './pg-filter';
import { FIXLINE_FACTS } from './fixline-facts';
import { searchProductsText, productDetailsText } from './product-lookup';
import { costOf } from './ai-cost';
import type { MarketplaceId } from './marketplace-chat-seen';
import type { MarketplaceChatMessage } from './marketplace-chat-thread';
import { DRAFT_CATEGORIES, type DraftCategory } from './marketplace-chat-draft-types';
import { buildTranscript, draftOutcome, findPolicyViolations } from './marketplace-chat-draft-rules';

/**
 * ШІ-помічник чатів маркетплейсів: готує ЧЕРНЕТКУ відповіді покупцю.
 *
 * Це агент у вузькому сенсі: модель сама вирішує, що їй подивитись (замовлення,
 * товар, історію покупця), і завершує структурованою відповіддю через
 * інструмент submit_reply. Усі інструменти — лише на читання. Відправляє
 * покупцю ТІЛЬКИ людина (роут reply); помічник ніколи не пише на площадку.
 *
 * Чому чернетка, а не автовідповідь: рейтинг і «успішні замовлення» Prom
 * залежать від швидкості відповіді, але помилка в чаті — це спір і штраф.
 * Спершу збираємо статистику (marketplace_chat_drafts.outcome), потім
 * вирішуємо, які категорії можна буде відповідати самі.
 */

export const DRAFT_MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 6;

export { DRAFT_CATEGORIES, CATEGORY_LABELS, type DraftCategory } from './marketplace-chat-draft-types';
export { lastIncomingAt, awaitingOurReply, buildTranscript, findPolicyViolations, draftOutcome } from './marketplace-chat-draft-rules';

export type DraftReply = {
  category: DraftCategory;
  summary: string;
  reply: string;
  needsHuman: boolean;
  reason: string | null;
};

export type DraftRun = DraftReply & {
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
};

// ── Інструменти (лише читання) ──────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  new: 'нове, ще не підтверджене',
  pending_payment: 'очікує оплати',
  confirmed: 'підтверджене, готується',
  awaiting_stock: 'очікує надходження товару',
  picking: 'комплектується',
  shipped: 'відправлене',
  delivered: 'вручене',
  cancelled: 'скасоване',
};

const DELIVERY_LABELS: Record<string, string> = {
  nova: 'Нова Пошта', nova_poshta: 'Нова Пошта', kharkiv: 'адресна доставка по Харкову',
  pickup: 'самовивіз', rz_delivery: 'ROZETKA Доставка (точка видачі)', rozetka_delivery: 'доставка Rozetka',
};

const PAYMENT_LABELS: Record<string, string> = {
  cod: 'накладений платіж', card: 'картка онлайн', online: 'оплата онлайн', invoice: 'безготівковий рахунок',
  cash: 'готівка', mono: 'оплата онлайн', liqpay: 'оплата онлайн', deferred: 'відстрочка', pay_on_pickup: 'при отриманні',
};

type OrderRow = {
  id: string; order_number: number; status: string | null; created_at: string;
  items: unknown; total_price: number | null; payment_type: string | null; payment_confirmed: boolean | null;
  delivery_type: string | null; delivery_city_name: string | null; delivery_address: string | null;
  tracking_number: string | null; carrier_status_text: string | null;
  shipped_at: string | null; delivered_at: string | null; cancelled_at: string | null;
  channel_code: string | null; contact: string | null; phone: string | null; mp_refund_status: string | null;
};

const ORDER_COLS = 'id, order_number, status, created_at, items, total_price, payment_type, payment_confirmed, delivery_type, delivery_city_name, delivery_address, tracking_number, carrier_status_text, shipped_at, delivered_at, cancelled_at, channel_code, contact, phone, mp_refund_status';

const kyivDate = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

function orderText(o: OrderRow): string {
  const items = Array.isArray(o.items) ? o.items as { name?: string; sku?: string; qty?: number; price?: number }[] : [];
  const lines = [
    `Замовлення №${o.order_number} (канал: ${o.channel_code ?? '—'}), створене ${kyivDate(o.created_at)}`,
    `Статус: ${STATUS_LABELS[o.status ?? ''] ?? o.status ?? '—'}`,
    `Покупець: ${o.contact ?? '—'}${o.phone ? `, тел. ${o.phone}` : ''}`,
    `Позиції: ${items.map(i => `${i.name ?? i.sku ?? '?'} × ${i.qty ?? '?'}`).join('; ') || '—'}`,
    `Сума: ${o.total_price ?? '—'} грн; оплата: ${PAYMENT_LABELS[o.payment_type ?? ''] ?? o.payment_type ?? '—'}${o.payment_confirmed ? ' (оплачено)' : ''}`,
    `Доставка: ${DELIVERY_LABELS[o.delivery_type ?? ''] ?? o.delivery_type ?? '—'}${o.delivery_city_name ? `, ${o.delivery_city_name}` : ''}${o.delivery_address ? `, ${o.delivery_address}` : ''}`,
    `ТТН: ${o.tracking_number ?? 'ще немає'}${o.carrier_status_text ? ` — ${o.carrier_status_text}` : ''}`,
    o.shipped_at ? `Відправлено: ${kyivDate(o.shipped_at)}` : null,
    o.delivered_at ? `Вручено: ${kyivDate(o.delivered_at)}` : null,
    o.cancelled_at ? `Скасовано: ${kyivDate(o.cancelled_at)}` : null,
    o.mp_refund_status ? `Повернення коштів на площадці: ${o.mp_refund_status}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

async function getOrderText(mp: MarketplaceId, ref: { id?: string; number?: number; mpOrderId?: string }): Promise<string> {
  const db = createServiceClient();
  let q = db.from('orders').select(ORDER_COLS);
  if (ref.id) q = q.eq('id', ref.id);
  else if (ref.number) q = q.eq('order_number', ref.number);
  else if (ref.mpOrderId) {
    // Тема чату Rozetka — «Замовлення №906439810», це номер площадки, не наш
    const raw = ref.mpOrderId.replace(/\D/g, '');
    if (!raw) return 'Порожній номер замовлення площадки.';
    q = mp === 'rozetka' ? q.eq('rozetka_order_id', Number(raw)) : q.eq('prom_order_id', Number(raw));
  } else return 'Вкажіть order_number, order_id або marketplace_order_id.';
  const { data } = await q.limit(1).maybeSingle();
  return data ? orderText(data as OrderRow) : 'Замовлення не знайдено.';
}

async function findOrdersText(mp: MarketplaceId, contact: string | null, phone: string | null): Promise<string> {
  const db = createServiceClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const ors: string[] = [];
  const name = contact ? escapeOrTerm(contact).split(/\s+/).filter(w => w.length > 2)[0] : '';
  if (name) ors.push(`contact.ilike.%${name}%`);
  const digits = (phone ?? '').replace(/\D/g, '').slice(-9);
  if (digits.length === 9) ors.push(`phone.ilike.%${digits}%`);
  if (!ors.length) return 'Немає імені чи телефону для пошуку.';
  const { data } = await db.from('orders').select(ORDER_COLS)
    .eq('channel_code', mp).gte('created_at', since).or(ors.join(','))
    .order('created_at', { ascending: false }).limit(5);
  if (!data?.length) return 'Замовлень цього покупця за 90 днів не знайдено.';
  return (data as OrderRow[]).map(orderText).join('\n\n---\n\n');
}

// ── Промпт і схема ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ти — помічник менеджера інтернет-магазину FIXLINE (будівельна хімія, Харків). Готуєш ЧЕРНЕТКУ відповіді покупцю в чаті маркетплейсу (Rozetka або Prom). Відправляє чернетку людина — після перевірки.

${FIXLINE_FACTS}

=== ПРАВИЛА ПЛОЩАДОК (порушення = санкції магазину) ===
- Покупець купує на маркетплейсі, не на нашому сайті. НІКОЛИ не давай у відповіді телефон, Viber, email, посилання на fixline.com.ua чи будь-які інші посилання. Не пропонуй перейти на сайт.
- Ціни для покупця — ті, що на сторінці товару на площадці. Наша роздрібна ціна з бази може відрізнятись: ціну не називай, кажи «ціна вказана на сторінці товару». Наявність називати можна.
- Знижок, промокодів, безкоштовної доставки сам не пропонуй — це рішення менеджера, не правило площадки.

=== ЯК ПРАЦЮВАТИ ===
1. Прочитай листування. Визнач, що саме питає покупець в ОСТАННЬОМУ повідомленні.
2. Якщо питання про замовлення (статус, ТТН, коли відправите, зміна, повернення) — подивись замовлення: get_order, якщо номер відомий, інакше find_buyer_orders. Не вигадуй статус чи ТТН — лише з інструментів.
3. Якщо питання про товар — search_products / get_product. Відповідай по суті: характеристики, застосування, витрата, сумісність — коротко і по-людськи, без переказу всього опису.
4. Заверши ЗАВЖДИ викликом submit_reply. Без нього робота не зарахована.

=== КОЛИ ПОТРІБНА ЛЮДИНА (needs_human = true) ===
Претензія, пошкоджений або не той товар, повернення чи обмін, повернення грошей, скасування чи зміна замовлення, суперечка, торг, питання, на яке немає даних в інструментах, покупець роздратований. У цих випадках усе одно напиши чернетку — ввічливу, яка підтверджує отримання і каже, що менеджер розбереться, — але не обіцяй конкретного рішення. У reason коротко поясни менеджеру, що перевірити чи вирішити.

=== СТИЛЬ ВІДПОВІДІ ===
- Українською, на «Ви», 1–4 речення. Дружньо, без канцеляриту і без вибачень «за незручності» без приводу.
- Без markdown, без емодзі, без підпису — площадка сама показує назву магазину.
- Не повторюй питання покупця. Якщо даних бракує — постав одне уточнююче питання.
- Якщо останнє повідомлення покупця — лише подяка, «ок» чи прощання без питання: category = other, одне коротке ввічливе речення у відповідь. Не переказуй статус замовлення, якого не питали.
- Часи: доставка Новою Поштою 1–2 дні; замовлення до 14:00 відправляємо того ж дня (у робочі дні, Пн–Пт). Якщо замовлення вже відправлене — дай ТТН і статус із замовлення.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_order',
    description: 'Наше замовлення: статус, позиції, оплата, доставка, ТТН, рух посилки. Шукає за нашим номером (order_number, 8 цифр, напр. 26091002), внутрішнім id або номером замовлення на площадці (marketplace_order_id — з теми чату Rozetka «Замовлення №906439810» чи з повідомлення покупця).',
    input_schema: {
      type: 'object',
      properties: {
        order_number: { type: 'integer', description: 'Номер замовлення FIXLINE (8 цифр)' },
        order_id: { type: 'string', description: 'Внутрішній id замовлення, якщо відомий з контексту' },
        marketplace_order_id: { type: 'string', description: 'Номер замовлення на площадці (Rozetka 9 цифр / Prom)' },
      },
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'find_buyer_orders',
    description: 'Останні замовлення цього покупця на цій площадці за 90 днів — за імʼям і телефоном з чату. Використовуй, коли номер замовлення невідомий.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    strict: true,
  },
  {
    name: 'search_products',
    description: 'Пошук товарів у нашому каталозі за назвою, брендом, типом. Запит — українською.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'get_product',
    description: 'Картка товару за SKU: опис, наявність.',
    input_schema: {
      type: 'object',
      properties: { sku: { type: 'string' } },
      required: ['sku'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'submit_reply',
    description: 'Завершити роботу: віддати класифікацію і чернетку відповіді покупцю.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: [...DRAFT_CATEGORIES] },
        summary: { type: 'string', description: 'Один рядок для менеджера: про що питає покупець' },
        reply: { type: 'string', description: 'Текст відповіді покупцю, як його побачить покупець' },
        needs_human: { type: 'boolean' },
        reason: { type: 'string', description: 'Що менеджеру перевірити або вирішити; порожній рядок, якщо нічого' },
      },
      required: ['category', 'summary', 'reply', 'needs_human', 'reason'],
      additionalProperties: false,
    },
    strict: true,
  },
];

// ── Запуск ──────────────────────────────────────────────────────────────────

export type DraftContext = {
  mp: MarketplaceId;
  messages: MarketplaceChatMessage[];
  contact: string | null;
  phone: string | null;
  orderNumber: number | null;
  ourOrderId: string | null;
  subject?: string | null;
};

export async function draftMarketplaceReply(ctx: DraftContext): Promise<DraftRun> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const now = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const header = [
    `Площадка: ${ctx.mp === 'rozetka' ? 'Rozetka' : 'Prom'}`,
    `Зараз (Київ): ${now}`,
    ctx.subject ? `Тема чату: ${ctx.subject}` : null,
    `Покупець: ${ctx.contact ?? 'імʼя невідоме'}${ctx.phone ? `, тел. ${ctx.phone}` : ''}`,
    ctx.orderNumber ? `Чат привʼязаний до нашого замовлення №${ctx.orderNumber}${ctx.ourOrderId ? ` (id ${ctx.ourOrderId})` : ''}` : 'Привʼязки до замовлення немає',
  ].filter(Boolean).join('\n');

  let messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `${header}\n\n=== ЛИСТУВАННЯ ===\n${buildTranscript(ctx.messages)}\n\nПідготуй чернетку відповіді на останнє повідомлення покупця і виклич submit_reply.`,
  }];

  let costUsd = 0, inputTokens = 0, outputTokens = 0, toolCalls = 0;
  let nudged = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await anthropic.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
    });
    costUsd += costOf(DRAFT_MODEL, res.usage);
    inputTokens += (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    outputTokens += res.usage.output_tokens ?? 0;

    if (res.stop_reason === 'refusal') throw new Error('Модель відмовилась відповідати (refusal)');
    if (res.stop_reason === 'max_tokens') throw new Error('Відповідь моделі обірвана (max_tokens)');

    const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    const submit = uses.find(u => u.name === 'submit_reply');
    if (submit) {
      const inp = submit.input as { category: string; summary: string; reply: string; needs_human: boolean; reason: string };
      const category = (DRAFT_CATEGORIES as readonly string[]).includes(inp.category) ? inp.category as DraftCategory : 'other';
      const violations = findPolicyViolations(inp.reply);
      const reasonParts = [inp.reason?.trim() || null];
      if (violations.length) reasonParts.push(`У чернетці є ${violations.join(', ')} — площадки за це штрафують, приберіть перед відправкою.`);
      return {
        category,
        summary: inp.summary?.trim() || '',
        reply: inp.reply?.trim() || '',
        needsHuman: Boolean(inp.needs_human) || violations.length > 0,
        reason: reasonParts.filter(Boolean).join(' ') || null,
        model: DRAFT_MODEL, costUsd, inputTokens, outputTokens, toolCalls,
      };
    }

    if (uses.length === 0) {
      // Закінчила текстом без submit_reply — один раз нагадуємо
      if (nudged) break;
      nudged = true;
      messages = [...messages, { role: 'assistant', content: res.content }, { role: 'user', content: 'Виклич submit_reply із чернеткою.' }];
      continue;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      toolCalls++;
      let out: string;
      try {
        if (u.name === 'get_order') {
          const inp = u.input as { order_number?: number; order_id?: string; marketplace_order_id?: string };
          out = inp.order_id ? await getOrderText(ctx.mp, { id: inp.order_id })
            : inp.order_number ? await getOrderText(ctx.mp, { number: inp.order_number })
            : inp.marketplace_order_id ? await getOrderText(ctx.mp, { mpOrderId: inp.marketplace_order_id })
            : ctx.ourOrderId ? await getOrderText(ctx.mp, { id: ctx.ourOrderId })
            : 'Вкажіть order_number, order_id або marketplace_order_id.';
        } else if (u.name === 'find_buyer_orders') {
          out = await findOrdersText(ctx.mp, ctx.contact, ctx.phone);
        } else if (u.name === 'search_products') {
          out = await searchProductsText((u.input as { query: string }).query);
        } else if (u.name === 'get_product') {
          out = await productDetailsText((u.input as { sku: string }).sku);
        } else {
          out = 'Невідомий інструмент.';
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
      } catch (err) {
        results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: err instanceof Error ? err.message : String(err) });
      }
    }
    messages = [...messages, { role: 'assistant', content: res.content }, { role: 'user', content: results }];
  }

  throw new Error('Помічник не дав чернетку за відведену кількість кроків');
}

// ── Кеш і журнал (marketplace_chat_drafts, міграція 122) ────────────────────

export type StoredDraft = DraftReply & { id: string | null; cached: boolean; costUsd: number };

/**
 * Чернетка для треда: з журналу, якщо для цього самого останнього вхідного
 * вже є; інакше — новий запуск і запис. Журнал необовʼязковий: якщо таблиці
 * ще немає (міграцію не накотили), чернетка все одно повертається, просто без
 * кешу й статистики.
 */
export async function getOrCreateDraft(
  key: { mp: MarketplaceId; chatId: string; lastIncomingAt: string },
  ctx: DraftContext,
  opts?: { force?: boolean },
): Promise<StoredDraft> {
  const db = createServiceClient();

  if (!opts?.force) {
    const { data } = await db.from('marketplace_chat_drafts')
      .select('id, category, summary, draft, needs_human, reason, cost_usd')
      .eq('mp', key.mp).eq('chat_id', key.chatId).eq('last_incoming_at', key.lastIncomingAt)
      .maybeSingle();
    if (data) {
      return {
        id: data.id, cached: true,
        category: data.category as DraftCategory, summary: data.summary, reply: data.draft,
        needsHuman: data.needs_human, reason: data.reason, costUsd: Number(data.cost_usd),
      };
    }
  }

  const run = await draftMarketplaceReply(ctx);
  const row = {
    mp: key.mp, chat_id: key.chatId, last_incoming_at: key.lastIncomingAt,
    category: run.category, summary: run.summary, draft: run.reply,
    needs_human: run.needsHuman, reason: run.reason,
    model: run.model, cost_usd: run.costUsd, input_tokens: run.inputTokens, output_tokens: run.outputTokens, tool_calls: run.toolCalls,
  };
  let id: string | null = null;
  try {
    const { data, error } = await db.from('marketplace_chat_drafts')
      .upsert(row, { onConflict: 'mp,chat_id,last_incoming_at' })
      .select('id').single();
    if (error) throw error;
    id = data?.id ?? null;
  } catch (err) {
    console.error('[mp-chat-assistant] draft log failed (міграція 122?):', err instanceof Error ? err.message : err);
  }
  return { id, cached: false, category: run.category, summary: run.summary, reply: run.reply, needsHuman: run.needsHuman, reason: run.reason, costUsd: run.costUsd };
}

/** Після відправки: як є чи з правками. Помилки журналу не валять відправку. */
export async function recordDraftOutcome(draftId: string, sentText: string): Promise<void> {
  try {
    const db = createServiceClient();
    const { data } = await db.from('marketplace_chat_drafts').select('draft').eq('id', draftId).maybeSingle();
    if (!data) return;
    await db.from('marketplace_chat_drafts').update({
      outcome: draftOutcome(data.draft, sentText),
      sent_text: sentText,
      outcome_at: new Date().toISOString(),
    }).eq('id', draftId);
  } catch (err) {
    console.error('[mp-chat-assistant] outcome log failed:', err instanceof Error ? err.message : err);
  }
}
