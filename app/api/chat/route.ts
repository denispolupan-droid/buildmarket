import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram } from '../../../lib/telegram';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `Ти — AI-помічник FIXLINE, платформи для закупівель будівельної хімії в Україні (fixline.com.ua).

Асортимент: герметики (акрилові, силіконові, поліуретанові, MS-полімерні), монтажна піна, рідкі цвяхи, ґрунтовки, фарби, клеї, стрічки, замазки для швів, свердла та кріплення.

Формати роботи:
- Роздріб — без реєстрації, розділ "Магазин"
- Опт (B2B) — після реєстрації, оптові ціни від 1 упаковки
- Дропшип — перепродаж без власного складу

Доставка: Нова Пошта по всій Україні.

Правила пошуку товарів:
- ЗАВЖДИ перекладай пошуковий запит на українську перед викликом search_products
- Приклади перекладу: "белый силикон" → "білий силікон", "монтажная пена" → "монтажна піна", "грунтовка" → "ґрунтовка"
- Якщо не знайдено — спробуй ширший запит (тільки тип товару без кольору/розміру)

Правила відповіді:
- ЗАВЖДИ відповідай українською мовою, навіть якщо питання російською або іншою мовою
- Єдиний виняток: якщо питання написане англійською — відповідай англійською
- Ніколи не використовуй markdown (**, *, #) — тільки звичайний текст
- Будь конкретним: називай реальні назви товарів, ціни та наявність
- Коротко — 3–5 речень максимум
- Якщо товар не знайдено — запропонуй звернутись до менеджера`;

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
    const term = `%${word}%`;
    q = q.or(`name.ilike.${term},brand.ilike.${term},description.ilike.${term},category_slug.ilike.${term}`);
  }

  if (category) q = q.eq('category_slug', category);

  const { data } = await q;
  if (!data?.length) return 'Товарів не знайдено.';

  return data.map(p => {
    const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    const retail = stock?.price_retail ? `${stock.price_retail} грн` : '—';
    const unit   = stock?.price_unit   ? `${stock.price_unit} грн` : '—';
    const status = stock?.stock_status === 'in_stock' ? '✅ є в наявності' : '❌ немає';
    return `• ${p.name} (${p.brand}${p.volume ? ', ' + p.volume : ''})\n  SKU: ${p.sku} | Роздріб: ${retail} | Опт: ${unit} | ${status}`;
  }).join('\n\n');
}

async function getProductDetails(sku: string): Promise<string> {
  const { data: p } = await db
    .from('products')
    .select(`sku, name, brand, volume, description,
             stock:product_stock(price_retail, price_unit, price_drop, stock_status, stock_qty)`)
    .eq('sku', sku)
    .eq('is_active', true)
    .maybeSingle();

  if (!p) return `Товар з SKU ${sku} не знайдено.`;

  const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
  const lines = [
    `${p.name} (${p.brand}${p.volume ? ', ' + p.volume : ''})`,
    `SKU: ${p.sku}`,
    stock?.price_retail ? `Роздріб: ${stock.price_retail} грн` : null,
    stock?.price_unit   ? `Опт: ${stock.price_unit} грн`       : null,
    stock?.price_drop   ? `Дроп: ${stock.price_drop} грн`      : null,
    stock?.stock_status === 'in_stock' ? '✅ Є в наявності' : '❌ Немає в наявності',
    p.description ? `\n${p.description}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

// ── Agentic loop ──────────────────────────────────────────────────────────────

async function runAgent(messages: Anthropic.MessageParam[]): Promise<string> {
  const MAX_ROUNDS = 3;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      tools:      TOOLS,
      messages,
    });

    if (response.stop_reason === 'end_turn') {
      const text = response.content.find(b => b.type === 'text');
      return text?.type === 'text' ? text.text : '';
    }

    if (response.stop_reason !== 'tool_use') break;

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
      const { data } = await db.from('chat_sessions').select('id, unread_count').eq('id', sessionId).single();
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

    try {
      reply = await runAgent(messages);
      if (!reply) throw new Error('empty reply');
    } catch {
      mode  = 'manager';
      reply = 'Зараз AI-помічник недоступний — передаю вас до менеджера. Ми відповімо найближчим часом у цьому чаті.';
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
      if (mode === 'manager') {
        sendTelegram(adminId,
          `🔴 <b>Потрібна відповідь менеджера!</b>\n\n💬 ${message}\n\n🔗 fixline.com.ua/admin/chat/${session!.id}`);
      } else if (isNew) {
        sendTelegram(adminId,
          `💬 <b>Новий чат на сайті</b>\n\n💬 ${message}\n\n🔗 fixline.com.ua/admin/chat/${session!.id}`);
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
