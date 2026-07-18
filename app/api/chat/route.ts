import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { escapeOrTerm } from '../../../lib/pg-filter';
import { sendTelegram } from '../../../lib/telegram';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `Ти — AI-помічник FIXLINE, платформи для закупівель будівельної хімії в Україні (fixline.com.ua).

=== КОНТАКТИ ТА ГРАФІК ===
Телефон: +38 (099) 199-77-88 (також Viber)
Email: info@fixline.com.ua
Графік роботи: Пн–Пт з 9:00 до 16:00
Місцезнаходження: Харків, доставка по всій Україні

=== АСОРТИМЕНТ ===
Герметики (акрилові, силіконові, поліуретанові, MS-полімерні), монтажна піна, рідкі цвяхи, ґрунтовки, фарби (інтер'єрні, фасадні, алкідні), клеї, замазки для швів, герметизуючі стрічки, свердла та кріплення. Бренди: Lacrysil, Ceresit, Polifarb, Aura, BudMonster, Aqua Protect, Siltek та інші.

=== ФОРМАТИ РОБОТИ ===
Роздріб: від 1 одиниці, без реєстрації, розділ "Магазин" на сайті
Опт (B2B): після реєстрації та верифікації — оптові ціни, персональний менеджер, умови оплати. Мінімальна сума замовлення — 3000 грн.
Дропшип: продаж без свого складу — реєструєшся, поповнюєш баланс (мінімум 500 грн), оформлюєш замовлення, ми відправляємо від свого імені. Мінімальної суми замовлення немає.

=== ДОСТАВКА ===
Нова Пошта по всій Україні, 1–2 дні
Замовлення до 14:00 — відправка того ж дня
Для великих оптових партій — адресна доставка по Харкову та регіону

=== ОПЛАТА ===
Роздріб: накладений платіж (оплата при отриманні у НП) або передоплата на картку
Опт: передоплата на рахунок або через платіжну систему
Дропшип: баланс-система — поповнюєш баланс, замовлення списується з балансу

=== ПОВЕРНЕННЯ ===
Повернення протягом 14 днів за умови збереження товарного вигляду та упаковки
Для оформлення — звертатись до менеджера

=== РЕЄСТРАЦІЯ ДЛЯ ОПТУ ===
Зареєструватись на сайті → менеджер верифікує → відкриваються оптові ціни та кабінет

=== ПРАВИЛА ПОШУКУ ТОВАРІВ ===
- ЗАВЖДИ перекладай запит українською перед search_products
- Переклади: "белый силикон" → "білий силікон", "монтажная пена" → "монтажна піна", "грунтовка" → "ґрунтовка", "жидкие гвозди" → "рідкі цвяхи"
- Якщо не знайдено з кількома словами — спробуй тільки тип товару

=== ПРАВИЛА ВІДПОВІДІ ===
- ЗАВЖДИ відповідай українською, навіть якщо питання російською
- Єдиний виняток: питання англійською → відповідай англійською
- Ніколи не використовуй markdown (**, *, #) — тільки звичайний текст
- Для кожного знайденого товару вказуй посилання з результатів пошуку
- Формат: "Назва — ціна грн, є в наявності\nhttps://fixline.com.ua/product/SKU"
- Показуй не більше 4 товарів, потім: "Більше варіантів — на сайті fixline.com.ua"
- Якщо не знаєш відповіді — не вигадуй, пропонуй зателефонувати: +38 (099) 199-77-88`;

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_products',
    description: 'Шукає товари за назвою, брендом, описом або категорією. Повертає список з назвою, ціною та наявністю. Використовуй для відповідей на питання про асортимент.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query:    { type: 'string', description: 'Пошуковий запит (назва, бренд, тип товару)' },
        category: { type: 'string', description: 'Slug категорії (опціонально, напр. "hermetyky", "montazhna-pina")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_product_details',
    description: 'Отримує детальну інформацію про конкретний товар за SKU: опис, ціна роздріб/опт, наявність.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sku: { type: 'string', description: 'SKU товару (напр. "1000-001")' },
      },
      required: ['sku'],
    },
  },
];

// ── Tool executors ────────────────────────────────────────────────────────────

async function searchProducts(query: string, category?: string): Promise<string> {
  // Split into words, search each word separately (implicit AND between words)
  const words = query.trim().split(/\s+/).filter(w => w.length > 1).slice(0, 4);

  let q = db
    .from('products')
    .select(`sku, name, brand, volume, category_slug, description,
             stock:product_stock(price_retail, price_unit, stock_status)`)
    .eq('is_active', true)
    .limit(6);

  for (const word of words) {
    const term = `%${escapeOrTerm(word)}%`;
    q = q.or(`name.ilike.${term},brand.ilike.${term},description.ilike.${term},category_slug.ilike.${term}`);
  }

  if (category) q = q.eq('category_slug', category);

  const { data } = await q;
  if (!data?.length) return 'Товарів не знайдено.';

  return data.map(p => {
    const stock  = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    const retail = stock?.price_retail ? `${stock.price_retail} грн` : '—';
    const status = stock?.stock_status === 'in_stock' ? 'є в наявності' : 'немає в наявності';
    const url    = `https://fixline.com.ua/product/${p.sku}`;
    return `${p.name} — ${retail}, ${status}\n${url}`;
  }).join('\n\n');
}

async function getProductDetails(sku: string): Promise<string> {
  const { data: p } = await db
    .from('products')
    .select(`sku, name, brand, volume, description, min_order,
             stock:product_stock(price_retail, price_unit, price_drop, stock_status, stock_qty)`)
    .eq('sku', sku)
    .eq('is_active', true)
    .maybeSingle();

  if (!p) return `Товар з SKU ${sku} не знайдено.`;

  const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
  const url   = `https://fixline.com.ua/product/${p.sku}`;
  const lines = [
    `${p.name}`,
    `Ціна роздріб: ${stock?.price_retail ? stock.price_retail + ' грн' : '—'}`,
    stock?.stock_status === 'in_stock' ? 'Є в наявності' : 'Немає в наявності',
    p.min_order && p.min_order > 1 ? `Мін. замовлення (опт): ${p.min_order} шт` : null,
    p.description ?? null,
    url,
  ].filter(Boolean);

  return lines.join('\n');
}

// ── Agentic loop ──────────────────────────────────────────────────────────────

async function runAgent(messages: Anthropic.MessageParam[]): Promise<string> {
  const MAX_ROUNDS = 3;
  // Haiku for simple questions, Sonnet when tools are needed (product search)
  let model = 'claude-haiku-4-5-20251001';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 600,
      system:     SYSTEM_PROMPT,
      tools:      TOOLS,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text');
      return text?.type === 'text' ? text.text : '';
    }

    if (response.stop_reason !== 'tool_use') break;

    // Switch to Sonnet when tools are needed — better quality for product responses
    model = 'claude-sonnet-4-6';

    // Execute tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: string;
      if (block.name === 'search_products') {
        const input = block.input as { query: string; category?: string };
        result = await searchProducts(input.query, input.category);
      } else if (block.name === 'get_product_details') {
        const input = block.input as { sku: string };
        result = await getProductDetails(input.sku);
      } else {
        result = 'Невідомий інструмент.';
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    messages = [
      ...messages,
      { role: 'assistant', content: response.content },
      { role: 'user',      content: toolResults },
    ];
  }

  return '';
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`chat:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Занадто багато запитів. Спробуйте пізніше.' }, { status: 429 });
  }

  try {
    const { sessionId, message } = await req.json() as { sessionId?: string; message: string };

    if (!message?.trim()) return NextResponse.json({ error: 'empty message' }, { status: 400 });
    if (message.length > 2000) return NextResponse.json({ error: 'Повідомлення занадто довге' }, { status: 400 });

    // ── Session ───────────────────────────────────────────────────────────────
    let session: { id: string; unread_count: number } | null = null;
    let isNew = false;

    if (sessionId) {
      const { data } = await db.from('chat_sessions').select('id, unread_count, ai_enabled').eq('id', sessionId).single();
      session = data;
    }

    if (!session) {
      isNew = true;
      const { data, error } = await db
        .from('chat_sessions')
        .insert({ visitor_id: sessionId ?? crypto.randomUUID() })
        .select('id, unread_count')
        .single();
      if (error) return NextResponse.json({ error: `db_session: ${error.message}` }, { status: 500 });
      session = data;
    }

    await db.from('chat_messages').insert({ session_id: session!.id, role: 'user', content: message });

    // ── History ───────────────────────────────────────────────────────────────
    const { data: history } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', session!.id)
      .order('created_at', { ascending: true })
      .limit(20);

    const isEnglish = /^[\x20-\x7E\s]+$/.test(message.trim());

    const messages: Anthropic.MessageParam[] = (history ?? []).map((m, i) => {
      const isLast = i === (history ?? []).length - 1;
      if (isLast && m.role === 'user' && !isEnglish) {
        return { role: 'user' as const, content: m.content + '\n\n[ВАЖЛИВО: відповідай виключно українською мовою]' };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

    // ── AI agent ──────────────────────────────────────────────────────────────
    let reply: string;
    let mode: 'ai' | 'manager' = 'ai';

    const aiEnabled = (session as { ai_enabled?: boolean }).ai_enabled ?? true;

    if (!aiEnabled) {
      mode  = 'manager';
      reply = 'Менеджер вже підключився до розмови — відповість найближчим часом.';
    } else {
      try {
        reply = await runAgent(messages);
        if (!reply) throw new Error('empty reply');
      } catch {
        mode  = 'manager';
        reply = 'Зараз AI-помічник недоступний — передаю вас до менеджера. Ми відповімо найближчим часом у цьому чаті.';
      }
    }

    // ── Save & notify ─────────────────────────────────────────────────────────
    await Promise.all([
      db.from('chat_messages').insert({ session_id: session!.id, role: 'assistant', content: reply }),
      db.from('chat_sessions').update({
        last_message_at: new Date().toISOString(),
        unread_count:    session!.unread_count + 1,
      }).eq('id', session!.id),
    ]);

    const adminId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    if (adminId) {
      const link = `fixline.com.ua/admin/chat/${session!.id}`;
      const text = message.length > 200 ? message.slice(0, 200) + '…' : message;

      if (isNew) {
        sendTelegram(adminId,
          `💬 <b>Новий чат</b>\n\n${text}\n\n🔗 ${link}`);
      } else if (mode === 'manager') {
        sendTelegram(adminId,
          `👤 <b>Повідомлення (ви ведете чат)</b>\n\n${text}\n\n🔗 ${link}`);
      } else {
        sendTelegram(adminId,
          `💬 <b>Повідомлення в чаті</b>\n\n${text}\n\nAI відповідає автоматично\n🔗 ${link}`);
      }
    }

    return NextResponse.json({ sessionId: session!.id, reply, mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[chat]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return NextResponse.json({ messages: [] });

  const { data: messages } = await db
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  return NextResponse.json({ messages: messages ?? [] });
}
