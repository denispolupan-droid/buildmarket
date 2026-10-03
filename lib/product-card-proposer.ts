import Anthropic from '@anthropic-ai/sdk';
import { createServiceClient } from './supabase';
import { escapeOrTerm } from './pg-filter';
import { costOf } from './ai-cost';
import { getCategoryLabels } from './product-content-gen';
import { normalizeCharsDb } from './characteristics';
import { logAgentRun, markAgentRunOutcome } from './ai-agent-runs';
import { mapEpicentrAttributes } from './epicentr-attributes';
import { canonicalVolume, majority, matchBrand, mostCommon, validateProposal, type ProposalIssue } from './product-card-rules';

/**
 * Агент заведення картки товару: з назви в прайсі постачальника збирає
 * ЧЕРНЕТКУ картки — бренд, категорію, канонічну назву, фасування,
 * характеристики зі словника категорії. Менеджер бачить її вже у формі
 * нового товару, править і зберігає звичайним шляхом (POST /api/admin/products);
 * тексти далі робить наявний AI-філер по збереженому SKU.
 *
 * Що агент робить сам, а людина раніше робила руками:
 *  • знаходить у каталозі «сусідів» (та сама лінійка в іншому фасуванні) і
 *    копіює їхні назву й характеристики — стандарт §2 вимагає, щоб фасовки
 *    однієї лінійки називались однаково;
 *  • читає стандарт категорії (обовʼязкові ярлики, закриті списки значень);
 *  • шукає технічний лист виробника в інтернеті, щоб не вигадувати цифри
 *    (витрата, час висихання, щільність) — з посиланнями на джерела.
 * Інструменти — лише на читання; у БД агент нічого не пише.
 */

export const CARD_MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 14;

export type CardInput = {
  supplierName: string;        // назва з прайсу постачальника
  supplierSku?: string | null;
  supplierTitle?: string | null; // назва постачальника (ЗРХ, …)
  priceCost?: number | null;
  brandHint?: string | null;   // якщо менеджер уже вказав бренд у формі
};

export type CardProposal = {
  brand: string;
  brandIsNew: boolean;
  category_slug: string;
  product_type: string;
  name: string;
  name_ru: string;
  volume: string;
  pack_qty: number;
  characteristics: { label: string; value: string }[];
  img_type: 'tube' | 'canister' | null;
  sibling_sku: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  sources: string[];
  issues: ProposalIssue[];
  /** Прапорці площадок — як у більшості сусідів по категорії (націнки лишаємо порожніми: їх дає категорія). */
  marketplace: { on_prom: boolean; on_rozetka: boolean; on_epicentr: boolean; rozetka_smart: boolean };
  /** Перевірка фіду Епіцентру для цієї категорії: чи закриються обовʼязкові атрибути цими характеристиками. */
  epicentr: { set: string | null; missingRequired: string[]; unmatched: string[] };
};

export type CardRun = {
  proposal: CardProposal;
  runId: string | null;
  model: string;
  costUsd: number;
  durationMs: number;
};

// ── Інструменти (лише читання) ──────────────────────────────────────────────

type CatRow = { slug: string; name: string; parent_slug: string | null; epicentr_category_code: string | null };

async function loadCatalogContext() {
  const db = createServiceClient();
  const [{ data: cats }, { data: brandRows }] = await Promise.all([
    db.from('categories').select('slug, name, parent_slug, epicentr_category_code').order('sort_order').limit(500),
    db.from('products').select('brand').eq('is_active', true).limit(2000),
  ]);
  const categories = (cats ?? []) as CatRow[];
  const hasChildren = new Set(categories.filter(c => c.parent_slug).map(c => c.parent_slug as string));
  const brands = [...new Set((brandRows ?? []).map(r => (r.brand as string)?.trim()).filter(Boolean))].sort();
  return { categories, leafSlugs: categories.filter(c => !hasChildren.has(c.slug)).map(c => c.slug), brands };
}

function categoriesText(categories: CatRow[]): string {
  const byParent = new Map<string | null, CatRow[]>();
  for (const c of categories) byParent.set(c.parent_slug, [...(byParent.get(c.parent_slug) ?? []), c]);
  const lines: string[] = [];
  for (const root of byParent.get(null) ?? []) {
    const kids = byParent.get(root.slug) ?? [];
    lines.push(`${root.slug} — ${root.name}${kids.length ? '' : ' (листова)'}`);
    for (const k of kids) lines.push(`  ${k.slug} — ${k.name} (листова)`);
  }
  return lines.join('\n');
}

async function categoryStandardText(slug: string): Promise<string> {
  const db = createServiceClient();
  const [spec, { data: examples }] = await Promise.all([
    getCategoryLabels(db, slug),
    db.from('products').select('sku, name, brand, product_type, volume, img_type')
      .eq('category_slug', slug).eq('is_active', true).order('sort_order').limit(6),
  ]);
  const lines = [
    `Категорія ${slug}.`,
    `Обовʼязкові характеристики: ${spec.required.join(', ') || '—'}`,
    `Додаткові типові: ${spec.optional.join(', ') || '—'}`,
  ];
  if (spec.facets.length) {
    lines.push('Закриті списки значень (бери ЛИШЕ з них):');
    for (const f of spec.facets) lines.push(`  - ${f.label}${f.multi ? ' (кілька через "; ")' : ''}: ${f.values.join(' | ')}`);
  }
  if (examples?.length) {
    lines.push('Приклади товарів цієї категорії (назва · тип · фасування · img_type):');
    for (const p of examples) lines.push(`  - ${p.sku}: ${p.name} · ${p.product_type ?? '—'} · ${p.volume ?? '—'} · ${p.img_type ?? '—'}`);
  }
  return lines.join('\n');
}

async function findSimilarText(query: string): Promise<string> {
  const db = createServiceClient();
  const words = query.trim().split(/\s+/).filter(w => w.length > 1).slice(0, 4);
  if (!words.length) return 'Порожній запит.';
  let q = db.from('products').select('sku, name, brand, category_slug, product_type, volume, img_type, is_active').limit(8);
  for (const w of words) {
    const term = `%${escapeOrTerm(w)}%`;
    q = q.or(`name.ilike.${term},brand.ilike.${term},product_type.ilike.${term}`);
  }
  const { data } = await q;
  if (!data?.length) return 'Схожих товарів не знайдено.';
  return data.map(p => `${p.sku}: ${p.name} · бренд ${p.brand} · категорія ${p.category_slug ?? '—'} · тип ${p.product_type ?? '—'} · ${p.volume ?? '—'} · img_type ${p.img_type ?? '—'}${p.is_active ? '' : ' · (неактивний)'}`).join('\n');
}

async function productCharsText(sku: string): Promise<string> {
  const db = createServiceClient();
  const [{ data: p }, { data: chars }] = await Promise.all([
    db.from('products').select('sku, name, brand, category_slug, product_type, volume, pack_qty, img_type, description').eq('sku', sku).maybeSingle(),
    db.from('product_characteristics').select('label, value').eq('product_sku', sku).order('sort_order').limit(60),
  ]);
  if (!p) return `Товар ${sku} не знайдено.`;
  return [
    `${p.sku}: ${p.name} · бренд ${p.brand} · категорія ${p.category_slug ?? '—'} · тип ${p.product_type ?? '—'} · ${p.volume ?? '—'} · в упаковці ${p.pack_qty ?? 1} · img_type ${p.img_type ?? '—'}`,
    p.description ? `Короткий опис: ${p.description}` : null,
    'Характеристики:',
    ...(chars ?? []).map(c => `  - ${c.label}: ${c.value}`),
  ].filter(Boolean).join('\n');
}

// ── Промпт і схема ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ти — товарознавець інтернет-магазину будівельної хімії FIXLINE (Україна). Твоє завдання: з назви позиції в прайсі постачальника підготувати ЧЕРНЕТКУ картки товару для нашого каталогу. Чернетку перевіряє і зберігає людина.

=== СТАНДАРТ КАРТКИ (docs/CONTENT-STANDARD.md §2) ===
- Назва: «Бренд Тип Модель, фасування» — українською, так, як на етикетці. Приклад: «Ceresit CS 25 Силіконовий герметик санітарний білий, 280 мл».
- Фасовки однієї лінійки називаються ОДНАКОВО, різниться лише фасування. Якщо в каталозі вже є цей продукт в іншому фасуванні — повтори його назву й характеристики, зміни лише фасування (і те, що від нього залежить). Повідом sibling_sku.
- Категорія — тільки ЛИСТОВА зі списку (у списку позначено). Якщо жодна не підходить точно — найближча, і скажи про це в notes.
- Характеристики — тільки ярлики зі стандарту категорії (category_standard), значення із закритих списків — ТІЛЬКИ з них. Обовʼязкові ярлики заповни всі; якщо точного значення немає — типове для цього виду товару, без вигаданої точності (діапазон або загальне формулювання).
- Цифри (витрата, час висихання, щільність, температура) — лише з технічного листа виробника чи його сайту. Шукай у вебі: «<бренд> <модель> технічний лист» / «TDS» / «технические характеристики». Якщо не знайшов — не вигадуй, лиши ярлик без значення й напиши в notes, чого бракує. У sources — URL сторінок, звідки взяв дані.
- Фасування у форматі «280 мл», «750 мл», «5 кг», «1 л». pack_qty — скільки штук у коробці/упаковці від постачальника, якщо це видно з назви (напр. «12 шт»); інакше 1.
- name_ru — та сама назва російською: бренди, артикули, числа лишай без змін.
- Усе українською (крім name_ru). Без markdown.

=== ЯК ПРАЦЮВАТИ ===
1. Розбери назву постачальника: бренд, модель, тип, фасування, колір.
2. find_similar_products — чи є лінійка в каталозі. Якщо є — product_characteristics(sku) сусіда і копіюй конвенції.
3. Обери категорію, виклич category_standard(slug) — обовʼязкові ярлики й допустимі значення.
4. Технічні дані — з сайту виробника. Спершу web_fetch сторінки товару на сайті виробника (знайди її через web_search «<бренд> <модель>» або сайт бренду). Якщо на сторінці є посилання на технічний опис/лист (PDF) — web_fetch і його: цифри найчастіше саме там. Якщо після цього обовʼязкові ярлики категорії все ще порожні — ще один web_search саме за документом: «<бренд> <модель> технічний опис pdf», «<бренд> <модель> TDS», «<бренд> <модель> технические характеристики». Зупиняйся лише коли обовʼязкові заповнені або всі спроби вичерпані — тоді чесно перелічи в notes, чого бракує.
5. Заверши ЗАВЖДИ викликом submit_card. confidence: high — лінійка є в каталозі або знайдено TDS; medium — категорія і тип зрозумілі, частина цифр типова; low — назва неоднозначна.`;

const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_similar_products',
    description: 'Пошук у нашому каталозі за словами з назви (бренд, модель, тип). Повертає до 8 товарів: SKU, назва, категорія, тип, фасування.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'product_characteristics',
    description: 'Картка товару з нашого каталогу за SKU: назва, тип, фасування, усі характеристики — щоб скопіювати конвенції лінійки.',
    input_schema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'category_standard',
    description: 'Стандарт категорії: обовʼязкові й типові ярлики характеристик, закриті списки значень, приклади товарів категорії.',
    input_schema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    strict: true,
  },
  {
    name: 'submit_card',
    description: 'Завершити роботу: віддати чернетку картки.',
    input_schema: {
      type: 'object',
      properties: {
        brand: { type: 'string' },
        category_slug: { type: 'string', description: 'Листова категорія зі списку' },
        product_type: { type: 'string', description: 'Тип продукту, напр. «Силіконовий герметик»' },
        name: { type: 'string', description: '«Бренд Тип Модель, фасування» українською' },
        name_ru: { type: 'string' },
        volume: { type: 'string', description: 'Фасування: «280 мл», «5 кг»; порожній рядок, якщо невідомо' },
        pack_qty: { type: 'integer', description: 'Штук в упаковці; 1, якщо невідомо' },
        characteristics: {
          type: 'array',
          items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } }, required: ['label', 'value'], additionalProperties: false },
        },
        sibling_sku: { type: 'string', description: 'SKU товару тієї ж лінійки в каталозі; порожній рядок, якщо немає' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        notes: { type: 'string', description: 'Для менеджера: що перевірити, чого не знайшов, чому обрав категорію' },
        sources: { type: 'array', items: { type: 'string' }, description: 'URL джерел технічних даних' },
      },
      required: ['brand', 'category_slug', 'product_type', 'name', 'name_ru', 'volume', 'pack_qty', 'characteristics', 'sibling_sku', 'confidence', 'notes', 'sources'],
      additionalProperties: false,
    },
    strict: true,
  },
];

// Прогін 03.10: з 4 пошуками агент то знаходив PDF-техлист Siltek (14 характеристик),
// то не знаходив (8, три обовʼязкові порожні). Більший бюджет і явний порядок
// (сторінка виробника → PDF → повторний пошук) — дешевше за неповну картку.
const SERVER_TOOLS = [
  { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 7 },
  { type: 'web_fetch_20260209' as const, name: 'web_fetch' as const, max_uses: 6 },
];

type SubmitInput = {
  brand: string; category_slug: string; product_type: string; name: string; name_ru: string;
  volume: string; pack_qty: number; characteristics: { label: string; value: string }[];
  sibling_sku: string; confidence: 'high' | 'medium' | 'low'; notes: string; sources: string[];
};

// ── Запуск ──────────────────────────────────────────────────────────────────

export async function proposeProductCard(input: CardInput, opts?: { createdBy?: string | null }): Promise<CardRun> {
  const started = Date.now();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const ctx = await loadCatalogContext();

  const header = [
    `Позиція в прайсі постачальника${input.supplierTitle ? ` «${input.supplierTitle}»` : ''}: ${input.supplierName}`,
    input.supplierSku ? `Код постачальника: ${input.supplierSku}` : null,
    input.priceCost ? `Закупівельна ціна: ${input.priceCost} грн` : null,
    input.brandHint ? `Менеджер вказав бренд: ${input.brandHint}` : null,
    '',
    `Бренди, які вже є в каталозі: ${ctx.brands.join(', ')}`,
    '',
    'Категорії каталогу (slug — назва):',
    categoriesText(ctx.categories),
    '',
    'Підготуй чернетку картки і виклич submit_card.',
  ].filter(l => l !== null).join('\n');

  let messages: Anthropic.MessageParam[] = [{ role: 'user', content: header }];
  let costUsd = 0, inputTokens = 0, outputTokens = 0, toolCalls = 0;
  let nudged = false;
  let submit: SubmitInput | null = null;

  try {
    for (let round = 0; round < MAX_ROUNDS && !submit; round++) {
      const res = await anthropic.messages.create({
        model: CARD_MODEL,
        max_tokens: 12000,
        // Якість картки важливіша за різницю в кілька центів: high менше кидає пошук на півдорозі
        output_config: { effort: 'high' },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [...CUSTOM_TOOLS, ...SERVER_TOOLS],
        messages,
      });
      costUsd += costOf(CARD_MODEL, res.usage);
      inputTokens += (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
      outputTokens += res.usage.output_tokens ?? 0;
      // Пошук у вебі тарифікується окремо від токенів
      const searches = res.usage.server_tool_use?.web_search_requests ?? 0;
      costUsd += searches * 0.01;

      if (res.stop_reason === 'refusal') throw new Error('Модель відмовилась (refusal)');
      if (res.stop_reason === 'max_tokens') throw new Error('Відповідь обірвана (max_tokens)');
      if (res.stop_reason === 'pause_turn') {
        messages = [...messages, { role: 'assistant', content: res.content }];
        continue;
      }

      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const sub = uses.find(u => u.name === 'submit_card');
      if (sub) { submit = sub.input as SubmitInput; break; }

      if (uses.length === 0) {
        if (nudged) break;
        nudged = true;
        messages = [...messages, { role: 'assistant', content: res.content }, { role: 'user', content: 'Виклич submit_card із чернеткою картки.' }];
        continue;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const u of uses) {
        toolCalls++;
        try {
          let out: string;
          if (u.name === 'find_similar_products') out = await findSimilarText((u.input as { query: string }).query);
          else if (u.name === 'product_characteristics') out = await productCharsText((u.input as { sku: string }).sku);
          else if (u.name === 'category_standard') out = await categoryStandardText((u.input as { slug: string }).slug);
          else out = 'Невідомий інструмент.';
          results.push({ type: 'tool_result', tool_use_id: u.id, content: out });
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: err instanceof Error ? err.message : String(err) });
        }
      }
      messages = [...messages, { role: 'assistant', content: res.content }, { role: 'user', content: results }];
    }
    if (!submit) throw new Error('Агент не віддав чернетку за відведену кількість кроків');
  } catch (err) {
    const durationMs = Date.now() - started;
    await logAgentRun({
      agent: 'product_card', input: input as unknown as Record<string, unknown>, model: CARD_MODEL,
      costUsd, inputTokens, outputTokens, toolCalls, durationMs,
      error: err instanceof Error ? err.message : String(err), createdBy: opts?.createdBy ?? null,
    });
    throw err;
  }

  // ── Постобробка: каталог — джерело правди, модель — лише пропозиція ───────
  const db = createServiceClient();
  const brandPick = matchBrand(input.brandHint?.trim() || submit.brand, ctx.brands);
  const categorySlugs = new Set(ctx.categories.map(c => c.slug));
  const category = categorySlugs.has(submit.category_slug) ? submit.category_slug : '';
  const volume = canonicalVolume(submit.volume) ?? submit.volume.trim();

  type Neighbour = { img_type: string | null; on_prom: boolean | null; on_rozetka: boolean | null; on_epicentr: boolean | null; rozetka_smart: boolean | null };
  const [normalized, spec, { data: neighbours }] = await Promise.all([
    normalizeCharsDb(db, submit.characteristics.filter(c => c.label.trim() && c.value.trim()), category || null),
    getCategoryLabels(db, category || null),
    category
      ? db.from('products').select('img_type, on_prom, on_rozetka, on_epicentr, rozetka_smart').eq('category_slug', category).eq('is_active', true).limit(50)
      : Promise.resolve({ data: [] as Neighbour[] }),
  ]);
  const nb = (neighbours ?? []) as Neighbour[];
  const characteristics = normalized.map(c => ({ label: c.label, value: c.value }));
  const imgType = mostCommon(nb.map(n => n.img_type as 'tube' | 'canister' | null));
  // Прапорці площадок — як у сусідів: у БД on_epicentr за замовчуванням false,
  // хоча всі 773 активні товари на Епіцентрі увімкнені; нова картка без цього
  // випадала б із фіду мовчки.
  const marketplace = {
    on_prom: majority(nb.map(n => n.on_prom), true),
    on_rozetka: majority(nb.map(n => n.on_rozetka), true),
    on_epicentr: majority(nb.map(n => n.on_epicentr), true),
    rozetka_smart: majority(nb.map(n => n.rozetka_smart), false),
  };
  // Фід Епіцентру віддає лише атрибути зі словників: перевіряємо наперед, чи
  // закриються обовʼязкові цими характеристиками — щоб менеджер дозаповнив у формі.
  const epiSet = ctx.categories.find(c => c.slug === category)?.epicentr_category_code ?? null;
  const epi = mapEpicentrAttributes(epiSet, {
    name: submit.name, volume, characteristics,
    color: characteristics.find(c => /^колір$/i.test(c.label))?.value ?? null,
  });
  const epicentr = {
    set: epiSet,
    missingRequired: epi.missingRequired.map(m => m.title),
    unmatched: epi.unmatched.map(u => `${u.title}: ${u.raw}`),
  };

  const proposal: CardProposal = {
    brand: brandPick.brand,
    brandIsNew: brandPick.isNew,
    category_slug: category,
    product_type: submit.product_type.trim(),
    name: submit.name.trim(),
    name_ru: submit.name_ru.trim(),
    volume,
    pack_qty: Math.max(1, Math.round(submit.pack_qty || 1)),
    characteristics,
    img_type: imgType,
    sibling_sku: submit.sibling_sku?.trim() || null,
    confidence: submit.confidence,
    notes: submit.notes.trim(),
    sources: submit.sources.filter(s => /^https?:\/\//.test(s)).slice(0, 8),
    issues: [],
    marketplace,
    epicentr,
  };
  proposal.issues = validateProposal(proposal, { categorySlugs, requiredLabels: spec.required });
  if (epicentr.set && epicentr.missingRequired.length) {
    proposal.issues.push({ field: 'epicentr', message: `Епіцентр, набір ${epicentr.set}: не закриті обовʼязкові атрибути — ${epicentr.missingRequired.join(', ')}` });
  }
  if (!categorySlugs.has(submit.category_slug) && submit.category_slug) {
    proposal.issues.unshift({ field: 'category_slug', message: `Модель запропонувала неіснуючу категорію «${submit.category_slug}»` });
  }
  if (brandPick.isNew) proposal.issues.push({ field: 'brand', message: `Бренду «${brandPick.brand}» ще немає в каталозі — перевірте написання` });

  const durationMs = Date.now() - started;
  const runId = await logAgentRun({
    agent: 'product_card', input: input as unknown as Record<string, unknown>,
    output: proposal as unknown as Record<string, unknown>, model: CARD_MODEL,
    costUsd, inputTokens, outputTokens, toolCalls, durationMs, createdBy: opts?.createdBy ?? null,
  });

  return { proposal, runId, model: CARD_MODEL, costUsd: Math.round(costUsd * 10_000) / 10_000, durationMs };
}

// ── Після збереження картки менеджером ──────────────────────────────────────

export type CardFollowUps = {
  sku: string;
  runId?: string | null;
  siblingSku?: string | null;
  supplierId?: number | null;
  supplierSku?: string | null;
};

/**
 * Те, що раніше робили руками після заведення картки (чек-лист 14.09.2026):
 *  • лінійка: якщо сусід уже в лінійці (variant_main_sku), нова фасовка стає
 *    її частиною з тією ж головною — так само зробив би scripts/seo-variant-lines;
 *    головну не перепризначаємо (стандарт §2);
 *  • маппінг коду постачальника + прибрати з черги немаплених — як кнопка
 *    «Замапити» на /admin/suppliers/unmapped;
 *  • журнал агента: чернетку застосували.
 * Тексти (описи, FAQ, MP-опис) робить наявний AI-філер — його кличе форма.
 */
export async function applyCardFollowUps(f: CardFollowUps): Promise<{ lineMain: string | null; mapped: boolean }> {
  const db = createServiceClient();
  let lineMain: string | null = null;
  let mapped = false;

  if (f.siblingSku) {
    const { data: sib } = await db.from('products').select('sku, variant_main_sku').eq('sku', f.siblingSku).maybeSingle();
    if (sib?.variant_main_sku) {
      lineMain = sib.variant_main_sku as string;
      await db.from('products').update({ variant_main_sku: lineMain, variant_canonical: false }).eq('sku', f.sku);
    }
  }

  if (f.supplierId && f.supplierSku) {
    const { error } = await db.from('supplier_sku_map')
      .upsert({ supplier_id: f.supplierId, supplier_sku: f.supplierSku, our_sku: f.sku }, { onConflict: 'supplier_id,supplier_sku' });
    if (!error) {
      mapped = true;
      await db.from('supplier_unmapped_skus').delete().eq('supplier_id', f.supplierId).eq('supplier_sku', f.supplierSku);
    }
  }

  if (f.runId) await markAgentRunOutcome(f.runId, 'applied', f.sku);
  return { lineMain, mapped };
}
