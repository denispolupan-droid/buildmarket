import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { getMarketplaceInboxCached } from '../../../../../lib/marketplace-chat-inbox';

// Лічильники для бейджа «Чати» в сайдбарі: маркетплейси — за правилом
// lib/marketplace-chat-inbox (той самий список, що й у вкладці), сайт —
// сесії з непрочитаними. Сайдбар опитує раз на хвилину і за подією
// admin-unread-refresh (відкрили чат, відповіли), тож бейдж гасне без
// переходу між сторінками.

export async function GET() {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const db = createServiceClient();
  const [inbox, { count: site }] = await Promise.all([
    // Площадка недоступна — бейдж не вигадуємо, але й сайдбар не ламаємо.
    getMarketplaceInboxCached().catch(() => ({ items: [], errors: ['unavailable'] })),
    db.from('chat_sessions').select('id', { count: 'exact', head: true }).gt('unread_count', 0),
  ]);
  const mp = inbox.items.filter(i => i.unread > 0).length;
  return NextResponse.json({ count: mp, mp, site: site ?? 0 });
}
