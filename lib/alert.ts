// Серверні алерти адміну в Telegram (той самий бот, що надсилає повідомлення про замовлення).
// Використовуй у catch-блоках критичних шляхів (оплата, збереження замовлення, синки), щоб
// про серверну помилку одразу приходило повідомлення в Telegram, а не лягало мовчки в логи
// Vercel. Fire-and-forget: алерт ніколи не ламає основний потік.
//
// Тільки серверний код (використовує TELEGRAM_BOT_TOKEN — не NEXT_PUBLIC).

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function alertAdmin(title: string, detail?: unknown): void {
  // У логи Vercel — завжди (навіть якщо Telegram не налаштований).
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

  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  }).catch(() => {});
}
