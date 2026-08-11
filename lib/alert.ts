// Серверні алерти адміну в Telegram (той самий бот, що надсилає повідомлення про замовлення).
// Використовуй у catch-блоках критичних шляхів (оплата, збереження замовлення, синки), щоб
// про серверну помилку одразу приходило повідомлення в Telegram, а не лягало мовчки в логи
// Vercel. Fire-and-forget: алерт ніколи не ламає основний потік.
//
// Тротлінг: по одному заголовку — не частіше одного Telegram-повідомлення на 30 хвилин
// (інакше аварія зовнішнього API перетворює крон кожні 5 хв на спам однаковими 🚨).
// Час останнього надсилання — у таблиці alert_throttle: пам'ять процесу в serverless
// між викликами не гарантується. У логи Vercel помилка пишеться завжди, без тротлінгу.
//
// Тільки серверний код (використовує TELEGRAM_BOT_TOKEN — не NEXT_PUBLIC).

import { createClient } from '@supabase/supabase-js';

const THROTTLE_MS = 30 * 60 * 1000;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function shouldSendTelegram(title: string): Promise<boolean> {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await db.from('alert_throttle').select('last_sent_at').eq('title', title).maybeSingle();
    if (data?.last_sent_at && Date.now() - new Date(data.last_sent_at).getTime() < THROTTLE_MS) {
      return false;
    }
    await db.from('alert_throttle').upsert({ title, last_sent_at: new Date().toISOString() });
    return true;
  } catch {
    // Якщо БД недоступна — алерт важливіший за тротлінг
    return true;
  }
}

export function alertAdmin(title: string, detail?: unknown): void {
  // У логи Vercel — завжди (навіть якщо Telegram не налаштований або алерт затротлено).
  console.error('[alert]', title, detail);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;

  const detailStr =
    detail == null ? '' :
    detail instanceof Error ? detail.message :
    typeof detail === 'string' ? detail :
    JSON.stringify(detail);

  const text = `🚨 <b>${esc(title)}</b>${detailStr ? `\n\n${esc(detailStr).slice(0, 900)}` : ''}\n\n<code>${new Date().toISOString()}</code>`;

  void (async () => {
    if (!(await shouldSendTelegram(title))) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  })().catch(() => {});
}
