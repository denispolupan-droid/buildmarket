import { NextResponse, type NextRequest } from 'next/server';
import { log } from '../../../lib/log';
import { alertAdmin } from '../../../lib/alert';
import { withApi } from '../../../lib/api-handler';

// Помилки з клієнтських error boundary (app/error.tsx, app/global-error.tsx):
// у структурований лог і в той самий Telegram-канал, що й серверні алерти
// (раніше lib/monitoring слав email через Resend — другий канал поруч із
// alertAdmin; аудит 31.10, §4). Публічний роут: тіло обрізаємо й нічого не
// віддаємо назад, щоб його не можна було використати як відкритий релей.
const MAX = 2000;

async function _POST(req: NextRequest) {
  let body: { message?: unknown; digest?: unknown; scope?: unknown; url?: unknown; stack?: unknown } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const message = String(body.message ?? '').slice(0, MAX);
  const digest = String(body.digest ?? '').slice(0, 64);
  const scope = String(body.scope ?? 'error').slice(0, 32);
  const url = String(body.url ?? '').slice(0, 300);
  const stack = String(body.stack ?? '').slice(0, MAX);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });
  log.error('client.error', { message, digest, scope, url, stack, ua: req.headers.get('user-agent')?.slice(0, 160) });
  alertAdmin(`Помилка на сайті (${scope})`, `${message}\n${url}${digest ? `\ndigest ${digest}` : ''}`);
  return NextResponse.json({ ok: true });
}

export const POST = withApi('client-error', _POST);
