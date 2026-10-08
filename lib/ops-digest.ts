import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from './supabase';
import { costOf } from './ai-cost';
import { logAgentRun } from './ai-agent-runs';
import { sendTelegramResult } from './telegram';
import { alertAdmin } from './alert';
import { kyivDayRange, kyivHuman } from './kyiv-date';
import { unsettledNpCod } from './novapay-ingest';
import { getRozetkaChats, getRozetkaReviewCounts } from './rozetka-api';
import { getPromChatRooms } from './prom-api';
import { loadChatSeen, isChatUnread } from './marketplace-chat-seen';
import { SITE_URL } from './site';
import { renderDigestHtml, type DigestData, type DigestSignal, type DigestText } from './ops-digest-render';

/**
 * Ранковий дайджест по операціях (агент №3).
 *
 * Поділ праці: ЦИФРИ рахує код — детерміновані перевірки по БД і площадках
 * (ті самі предикати, що й у журналі замовлень та «Огляді»), МОДЕЛЬ лише
 * розставляє пріоритети і пише людською мовою. Жодне число не походить від
 * моделі. Якщо модель не відповіла — йде детермінований текст без неї.
 *
 * Вимикач: app_settings.ops_digest = 'off'.
 */

export const DIGEST_MODEL = 'claude-opus-5-5';
const DIGEST_AGENT = 'ops_digest';

type Db = ReturnType<typeof createServiceClient>;
type OrderLite = { order_number: number; status: string; channel_code: string | null; total_price: number | null; created_at: string; shipped_at: string | null; carrier_accepted_at: string | null; carrier_status_text: string | null; tracking_number: string | null; delivery_type: string | null };

const money = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} грн`;
const daysAgo = (iso: string | null, now: Date) => iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000) : 0;
const CHANNEL_LABEL: Record<string, string> = { website: 'сайт', phone: 'телефон', retail: 'роздріб', prom: 'Prom', rozetka: 'Rozetka', epicentr: 'Епіцентр', dropship: 'дропшип' };

// ── Перевірки ───────────────────────────────────────────────────────────────

async function yesterdaySales(db: Db, now: Date): Promise<DigestSignal> {
  const y = kyivDayRange(now, -1);
  const weekStart = kyivDayRange(now, -8).start;
  const { data } = await db.from('orders')
    .select('order_number, status, channel_code, total_price, created_at')
    .gte('created_at', weekStart.toISOString()).lt('created_at', y.end.toISOString())
    .neq('status', 'cancelled').order('id').limit(5000);
  const rows = (data ?? []) as Pick<OrderLite, 'channel_code' | 'total_price' | 'created_at'>[];
  const yRows = rows.filter(r => r.created_at >= y.start.toISOString());
  const prev = rows.filter(r => r.created_at < y.start.toISOString());
  const byCh = new Map<string, { n: number; sum: number }>();
  for (const r of yRows) {
    const k = CHANNEL_LABEL[r.channel_code ?? 'website'] ?? r.channel_code ?? 'сайт';
    const cur = byCh.get(k) ?? { n: 0, sum: 0 };
    cur.n++; cur.sum += Number(r.total_price ?? 0);
    byCh.set(k, cur);
  }
  const sum = yRows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  const avgN = prev.length / 7;
  return {
    key: 'yesterday', title: `Вчора (${y.ymd})`,
    level: yRows.length === 0 ? 'yellow' : 'info',
    summary: `${yRows.length} замовлень на ${money(sum)}; середнє за попередні 7 днів — ${avgN.toFixed(1)} на день`,
    items: [...byCh.entries()].sort((a, b) => b[1].sum - a[1].sum).map(([k, v]) => `${k}: ${v.n} на ${money(v.sum)}`),
  };
}

async function orderPipeline(db: Db, now: Date): Promise<DigestSignal[]> {
  const { data } = await db.from('orders')
    .select('order_number, status, channel_code, total_price, created_at, shipped_at, carrier_accepted_at, carrier_status_text, tracking_number, delivery_type')
    .in('status', ['new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped'])
    .order('id').limit(5000);
  const rows = (data ?? []) as OrderLite[];
  const num = (o: OrderLite) => `№${o.order_number}`;
  const out: DigestSignal[] = [];

  // Нові без руху більше доби + очікують оплату понад 3 дні
  const staleNew = rows.filter(o => o.status === 'new' && daysAgo(o.created_at, now) >= 1);
  const payStuck = rows.filter(o => o.status === 'pending_payment' && daysAgo(o.created_at, now) >= 3);
  out.push({
    key: 'new', title: 'Нові й неоплачені',
    level: staleNew.length ? 'red' : payStuck.length ? 'yellow' : 'green',
    summary: `нових без підтвердження понад добу: ${staleNew.length}; очікують оплату понад 3 дні: ${payStuck.length}`,
    items: [
      ...staleNew.slice(0, 6).map(o => `${num(o)} (${CHANNEL_LABEL[o.channel_code ?? 'website'] ?? o.channel_code}, ${daysAgo(o.created_at, now)} дн, ${money(Number(o.total_price ?? 0))})`),
      ...payStuck.slice(0, 4).map(o => `${num(o)} без оплати ${daysAgo(o.created_at, now)} дн`),
    ],
  });

  // У роботі: підтверджені/комплектуються без відправки понад 2 дні
  const inWork = rows.filter(o => ['confirmed', 'awaiting_stock', 'picking'].includes(o.status));
  const inWorkStale = inWork.filter(o => daysAgo(o.created_at, now) >= 2);
  out.push({
    key: 'in_work', title: 'У роботі',
    level: inWorkStale.length ? 'yellow' : 'green',
    summary: `${inWork.length} у роботі, з них понад 2 дні без відправки: ${inWorkStale.length}`,
    items: inWorkStale.slice(0, 6).map(o => `${num(o)} (${o.status}, ${daysAgo(o.created_at, now)} дн)`),
  });

  // До відправки: ЕН є, перевізник ще не прийняв (той самий предикат, що й вкладка журналу)
  const ready = rows.filter(o => o.status === 'shipped' && !o.carrier_accepted_at);
  const readyStale = ready.filter(o => daysAgo(o.shipped_at, now) >= 1);
  out.push({
    key: 'ready', title: 'До відправки',
    level: readyStale.length ? 'red' : 'green',
    summary: `${ready.length} з ЕН чекають передачі перевізнику; понад добу: ${readyStale.length}`,
    items: readyStale.slice(0, 6).map(o => `${num(o)} — ${daysAgo(o.shipped_at, now)} дн з ЕН ${o.tracking_number ?? '—'}`),
  });

  // В дорозі понад 7 днів і «прибув у відділення» без вручення
  const transit = rows.filter(o => o.status === 'shipped' && o.carrier_accepted_at);
  const long = transit.filter(o => daysAgo(o.shipped_at, now) >= 7);
  const atBranch = transit.filter(o => /прибув|очікує в пункті|at_point/i.test(o.carrier_status_text ?? '') && daysAgo(o.shipped_at, now) >= 4);
  out.push({
    key: 'transit', title: 'В дорозі',
    level: long.length ? 'yellow' : 'green',
    summary: `${transit.length} в дорозі; понад 7 днів: ${long.length}; лежать у відділенні від 4 днів: ${atBranch.length}`,
    items: [
      ...long.slice(0, 5).map(o => `${num(o)} — ${daysAgo(o.shipped_at, now)} дн, ${o.carrier_status_text ?? 'статус невідомий'}`),
      ...atBranch.filter(o => !long.includes(o)).slice(0, 4).map(o => `${num(o)} — ${o.carrier_status_text}`),
    ],
  });
  return out;
}

async function returnsPending(db: Db): Promise<DigestSignal> {
  const { data } = await db.from('orders')
    .select('order_number, np_return_tracking')
    .or('and(status.eq.cancelled,carrier_accepted_at.not.is.null),np_return_ref.not.is.null,np_return_tracking.not.is.null')
    .not('flags', 'cs', '{return_received}').not('flags', 'cs', '{return_abandoned}')
    .order('id').limit(200);
  const rows = data ?? [];
  return {
    key: 'returns', title: 'Повернення без рішення',
    level: rows.length ? 'yellow' : 'green',
    summary: `${rows.length} повернень чекають приймання або рішення`,
    items: rows.slice(0, 6).map(r => `№${r.order_number}${(r.np_return_tracking as { status?: string } | null)?.status ? ` — ${(r.np_return_tracking as { status: string }).status}` : ''}`),
  };
}

async function novapayCod(db: Db, now: Date): Promise<DigestSignal> {
  const all = await unsettledNpCod();
  const today = kyivDayRange(now, 0).ymd;
  const yesterday = kyivDayRange(now, -1).ymd;
  // Вручені сьогодні/вчора без виплати — норма (екран НоваПей); старші — питання
  const old = all.filter(o => o.delivered < yesterday);
  const sum = old.reduce((s, o) => s + o.gross, 0);
  void db; void today;
  return {
    key: 'np_cod', title: 'НоваПей: наложка без виплати',
    level: old.length >= 3 ? 'red' : old.length ? 'yellow' : 'green',
    summary: `${old.length} ЕН вручені раніше ніж учора, виплати немає — ${money(sum)}`,
    items: old.slice(0, 6).map(o => `№${o.order_number} вручено ${o.delivered}, ${money(o.gross)}`),
  };
}

async function monoUnmatched(db: Db): Promise<DigestSignal> {
  const { data } = await db.from('mono_bank_txns')
    .select('txn_time, amount, direction, counter_name, description')
    .eq('status', 'unmatched').order('txn_time', { ascending: true }).limit(100);
  const rows = data ?? [];
  const inc = rows.filter(r => r.direction === 'in');
  const sum = inc.reduce((s, r) => s + Number(r.amount), 0);
  return {
    key: 'mono', title: 'Mono: нерозібрані операції',
    level: inc.length ? 'yellow' : 'green',
    summary: `${inc.length} надходжень на ${money(sum)} і ${rows.length - inc.length} списань чекають розноски`,
    items: inc.slice(0, 5).map(r => `${String(r.txn_time).slice(0, 10)} +${money(Number(r.amount))} — ${(r.counter_name || r.description || '').slice(0, 50)}`),
  };
}

async function marketplaceChats(): Promise<DigestSignal> {
  const [seen, rzOrders, rzItems, rooms, reviews] = await Promise.all([
    loadChatSeen(),
    getRozetkaChats('orders').catch(() => ({ chats: [] })),
    getRozetkaChats('items').catch(() => ({ chats: [] })),
    getPromChatRooms({ limit: 20 }).catch(() => []),
    getRozetkaReviewCounts().catch(() => ({ marketUnread: 0, itemsUnread: 0 })),
  ]);
  const rzUnread = [...rzOrders.chats, ...rzItems.chats].filter(c => isChatUnread(seen, 'rozetka', String(c.id), c.updated ?? c.created ?? null)).length;
  const promUnread = rooms.filter(r => isChatUnread(seen, 'prom', r.ident, r.date_sent ?? null)).length;
  const rev = reviews.marketUnread + reviews.itemsUnread;
  return {
    key: 'chats', title: 'Чати й відгуки МП',
    level: rzUnread + promUnread > 0 ? 'red' : rev > 0 ? 'yellow' : 'green',
    summary: `непрочитаних чатів: Rozetka ${rzUnread}, Prom ${promUnread}; непрочитаних відгуків Rozetka: ${rev}`,
    items: [],
  };
}

async function suppliers(db: Db, now: Date): Promise<DigestSignal> {
  const [{ data: sups }, { count: unmapped }] = await Promise.all([
    db.from('suppliers').select('name, last_synced_at, sync_interval_h, source_url').eq('is_active', true).limit(50),
    db.from('supplier_unmapped_skus').select('supplier_sku', { count: 'exact', head: true }),
  ]);
  const stale = (sups ?? []).filter(s => s.source_url && (!s.last_synced_at || (now.getTime() - new Date(s.last_synced_at).getTime()) > 2 * Math.max(1, Number(s.sync_interval_h ?? 2)) * 3_600_000));
  return {
    key: 'suppliers', title: 'Постачальники',
    level: stale.length ? 'red' : 'green',
    summary: `прайси не оновлювались удвічі довше за інтервал: ${stale.length}; нових позицій у черзі немаплених: ${unmapped ?? 0}`,
    items: stale.map(s => `${s.name} — останній синк ${s.last_synced_at ? String(s.last_synced_at).slice(0, 16).replace('T', ' ') : 'ніколи'}`),
  };
}

async function catalogHealth(db: Db): Promise<DigestSignal> {
  const { data } = await db.from('products').select('sku, name, stock:product_stock(price_retail, stock_status)').eq('is_active', true).order('id').limit(5000);
  const rows = (data ?? []) as { sku: string; name: string; stock: { price_retail: number | null; stock_status: string | null } | { price_retail: number | null; stock_status: string | null }[] | null }[];
  const st = (r: typeof rows[number]) => Array.isArray(r.stock) ? r.stock[0] : r.stock;
  const noPrice = rows.filter(r => !st(r)?.price_retail);
  const out = rows.filter(r => st(r)?.stock_status === 'out_of_stock').length;
  return {
    key: 'catalog', title: 'Каталог',
    level: noPrice.length ? 'yellow' : 'green',
    summary: `активних товарів ${rows.length}; без роздрібної ціни: ${noPrice.length}; немає в наявності: ${out}`,
    items: noPrice.slice(0, 5).map(r => `${r.sku} ${r.name}`),
  };
}

async function contentAndModeration(db: Db): Promise<DigestSignal[]> {
  const [{ data: drafts }, { data: mod }] = await Promise.all([
    db.from('blog_posts').select('title, created_at').eq('is_published', false).order('created_at', { ascending: true }).limit(50),
    db.from('rozetka_moderation_state').select('sku, change_status, reasons').limit(500),
  ]);
  const rejected = (mod ?? []).filter(m => /відхил/i.test(m.change_status ?? '') || (m.reasons ?? []).length > 0);
  const pending = (mod ?? []).length - rejected.length;
  return [
    {
      key: 'blog', title: 'Блог',
      level: (drafts?.length ?? 0) >= 3 ? 'yellow' : 'info',
      summary: `чернеток чекають публікації: ${drafts?.length ?? 0}${drafts?.length ? `, найстарша від ${String(drafts[0].created_at).slice(0, 10)}` : ''}`,
      items: (drafts ?? []).slice(0, 4).map(d => d.title),
    },
    {
      key: 'moderation', title: 'Модерація Rozetka',
      level: rejected.length ? 'yellow' : 'info',
      summary: `відхилено: ${rejected.length}; очікують: ${pending}`,
      items: rejected.slice(0, 4).map(m => `${m.sku}: ${(m.reasons ?? []).join('; ').slice(0, 80)}`),
    },
  ];
}

async function aiAgentsYesterday(db: Db, now: Date): Promise<DigestSignal> {
  const y = kyivDayRange(now, -1);
  const [{ data: drafts }, { data: runs }] = await Promise.all([
    db.from('marketplace_chat_drafts').select('cost_usd, outcome').gte('created_at', y.start.toISOString()).lt('created_at', y.end.toISOString()).limit(500),
    db.from('ai_agent_runs').select('agent, cost_usd, outcome').gte('created_at', y.start.toISOString()).lt('created_at', y.end.toISOString()).limit(500),
  ]);
  const d = drafts ?? [], r = runs ?? [];
  const cost = d.reduce((s, x) => s + Number(x.cost_usd), 0) + r.reduce((s, x) => s + Number(x.cost_usd), 0);
  const asIs = d.filter(x => x.outcome === 'sent_as_is').length;
  const edited = d.filter(x => x.outcome === 'edited').length;
  return {
    key: 'ai', title: 'ШІ-агенти вчора',
    level: 'info',
    summary: `чернеток відповідей ${d.length} (як є ${asIs}, з правками ${edited}); інших запусків ${r.length}; витрати $${cost.toFixed(2)}`,
    items: [],
  };
}

// ── Збір ────────────────────────────────────────────────────────────────────

export async function collectOpsSignals(now = new Date()): Promise<DigestData> {
  const db = createServiceClient();
  const failed = (key: string, title: string) => (e: unknown): DigestSignal => ({
    key, title, level: 'yellow', summary: `перевірка не відпрацювала: ${e instanceof Error ? e.message : String(e)}`, items: [],
  });
  const parts = await Promise.all([
    yesterdaySales(db, now).catch(failed('yesterday', 'Вчора')),
    orderPipeline(db, now).catch(e => [failed('orders', 'Замовлення')(e)]),
    returnsPending(db).catch(failed('returns', 'Повернення')),
    novapayCod(db, now).catch(failed('np_cod', 'НоваПей')),
    monoUnmatched(db).catch(failed('mono', 'Mono')),
    marketplaceChats().catch(failed('chats', 'Чати МП')),
    suppliers(db, now).catch(failed('suppliers', 'Постачальники')),
    catalogHealth(db).catch(failed('catalog', 'Каталог')),
    contentAndModeration(db).catch(e => [failed('content', 'Контент')(e)]),
    aiAgentsYesterday(db, now).catch(failed('ai', 'ШІ-агенти')),
  ]);
  return { generatedAt: now.toISOString(), dateHuman: kyivHuman(now), signals: parts.flat() };
}

// ── Текст від моделі ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ти — операційний асистент власника інтернет-магазину будівельної хімії FIXLINE. Щоранку отримуєш результати ДЕТЕРМІНОВАНИХ перевірок (замовлення, доставка, гроші, чати, постачальники, каталог) і пишеш короткий дайджест у Telegram.

Правила:
- Цифри, номери замовлень і суми — лише з даних. Нічого не додавай, не округлюй, не вигадуй причин.
- Спочатку те, що вимагає ДІЇ сьогодні (level red), потім що варто глянути (yellow), потім одним рядком що в нормі (green/info). Якщо червоного немає — так і скажи першим рядком.
- 5–12 пунктів, кожен до 20 слів, конкретно: «№26091234 третій день з ЕН без передачі — зʼясувати на НП», а не «є проблеми з відправками».
- Українською, без вступів, без порад загального характеру, без markdown.`;

const TEXT_SCHEMA = {
  type: 'object' as const,
  properties: {
    headline: { type: 'string' as const, description: 'Один рядок: головне на сьогодні' },
    items: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          level: { type: 'string' as const, enum: ['red', 'yellow', 'green', 'info'] },
          text: { type: 'string' as const },
        },
        required: ['level', 'text'], additionalProperties: false,
      },
    },
  },
  required: ['headline', 'items'], additionalProperties: false,
};

export async function writeDigestText(data: DigestData): Promise<{ text: DigestText; costUsd: number; usage: Anthropic.Usage }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const payload = data.signals.map(s => `[${s.level}] ${s.title}: ${s.summary}${s.items.length ? `\n  - ${s.items.join('\n  - ')}` : ''}`).join('\n');
  const res = await anthropic.messages.create({
    model: DIGEST_MODEL,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: TEXT_SCHEMA } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Дата: ${data.dateHuman}\n\nПеревірки:\n${payload}` }],
  });
  if (res.stop_reason !== 'end_turn') throw new Error(`stop_reason=${res.stop_reason}`);
  const block = res.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('порожня відповідь');
  return { text: JSON.parse(block.text) as DigestText, costUsd: costOf(DIGEST_MODEL, res.usage), usage: res.usage };
}

// ── Запуск ──────────────────────────────────────────────────────────────────

export async function isDigestEnabled(): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('value').eq('key', 'ops_digest').maybeSingle();
  return (data?.value ?? '').trim().toLowerCase() !== 'off';
}

export type DigestRun = { html: string; data: DigestData; text: DigestText | null; costUsd: number; sent: boolean; runId: string | null; error?: string };

/** Зібрати, написати, (за потреби) надіслати. Текст без моделі — якщо вона не відповіла. */
export async function runOpsDigest(opts: { send: boolean; createdBy?: string | null }): Promise<DigestRun> {
  const started = Date.now();
  const data = await collectOpsSignals();
  let text: DigestText | null = null;
  let costUsd = 0;
  let error: string | undefined;
  let usage: Anthropic.Usage | null = null;
  try {
    const r = await writeDigestText(data);
    text = r.text; costUsd = r.costUsd; usage = r.usage;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const html = renderDigestHtml(data, text, `${SITE_URL}/admin`);

  // «Відправлено» — лише коли Telegram повернув message_id. До 08.10.2026 прапорець
  // ставився без перевірки, і відмова Telegram (чи порожній chat_id у проді) не
  // лишала сліду ні в журналі, ні в алертах.
  let sent = false;
  let tgError: string | null = null;
  let tgMessageId: number | null = null;
  if (opts.send) {
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const r = chatId ? await sendTelegramResult(chatId, html) : { messageId: null, error: 'TELEGRAM_ADMIN_CHAT_ID не заданий' };
    sent = r.messageId != null; tgError = r.error; tgMessageId = r.messageId;
    if (!sent) alertAdmin('Ранковий дайджест не надіслано в Telegram', tgError ?? 'без причини');
  }
  const runId = await logAgentRun({
    agent: DIGEST_AGENT,
    input: { send: opts.send, signals: data.signals.map(s => ({ key: s.key, level: s.level, summary: s.summary })) },
    output: { text, sent, tg_message_id: tgMessageId, tg_error: tgError },
    model: DIGEST_MODEL, costUsd,
    inputTokens: (usage?.input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0),
    outputTokens: usage?.output_tokens ?? 0, toolCalls: 0, durationMs: Date.now() - started,
    error: error ?? null, createdBy: opts.createdBy ?? 'cron',
  });
  return { html, data, text, costUsd, sent, runId, error };
}
