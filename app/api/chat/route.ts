import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { sendTelegram } from '../../../lib/telegram';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';
import { FIXLINE_FACTS } from '../../../lib/fixline-facts';
import { searchProductsText, productDetailsText } from '../../../lib/product-lookup';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SYSTEM_PROMPT = `Ти — AI-помічник FIXLINE, платформи для закупівель будівельної хімії в Україні (fixline.com.ua).

${FIXLINE_FACTS}

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

// ── Agentic loop ──────────────────────────────────────────────────────────────
// Інструменти пошуку/картки товару — спільні з помічником чатів МП (lib/product-lookup).

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
        result = await searchProductsText(input.query, input.category);
      } else if (block.name === 'get_product_details') {
        const input = block.input as { sku: string };
        result = await productDetailsText(input.sku);
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
