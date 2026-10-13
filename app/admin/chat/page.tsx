import { createServiceClient } from '../../../lib/supabase';
import { siteChatTitle, siteChatPreview, siteChatState } from '../../../lib/site-chat-rules';
import ChatInbox from './ChatInbox';
import type { SiteChatRow } from './SiteChatsPane';

export const metadata = { title: 'Чати | FIXLINE' };

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; order?: string; chat?: string }>;
}) {
  // order — наш id замовлення: перехід із картки одразу відкриває його чат МП;
  // chat — «mp:id» з Telegram-алерту про чернетку або «site:id» (колишні
  // посилання /admin/chat/<id>): відкриває саме цей діалог
  const { tab, order, chat } = await searchParams;
  const siteChatId = chat?.startsWith('site:') ? chat.slice(5) : null;
  const mpChatKey = chat && !siteChatId ? chat : null;

  const db = createServiceClient();
  const { data: sessions } = await db
    .from('chat_sessions')
    .select('id, status, ai_enabled, created_at, last_message_at, unread_count')
    .order('last_message_at', { ascending: false })
    .limit(100);

  const ids = (sessions ?? []).map(s => s.id);
  // Останні повідомлення (стан і прев'ю) та перше повідомлення відвідувача
  // (заголовок) — двома вибірками, щоб не тягнути всю історію ста розмов
  const [{ data: recent }, { data: firsts }] = ids.length
    ? await Promise.all([
        db.from('chat_messages').select('session_id, role, content').in('session_id', ids).order('created_at', { ascending: false }).limit(1000),
        db.from('chat_messages').select('session_id, role, content').in('session_id', ids).eq('role', 'user').order('created_at', { ascending: true }).limit(1000),
      ])
    : [{ data: [] }, { data: [] }];

  const recentBy = new Map<string, { role: string; content: string }[]>();
  for (const m of recent ?? []) {
    const arr = recentBy.get(m.session_id) ?? [];
    if (arr.length < 6) { arr.unshift(m); recentBy.set(m.session_id, arr); } // у хронологічному порядку
  }
  const firstBy = new Map<string, string>();
  for (const m of firsts ?? []) if (!firstBy.has(m.session_id)) firstBy.set(m.session_id, m.content);

  const rows: SiteChatRow[] = (sessions ?? []).map(s => {
    const msgs = recentBy.get(s.id) ?? [];
    const first = firstBy.get(s.id);
    return {
      id: s.id, status: s.status, ai_enabled: s.ai_enabled, created_at: s.created_at,
      last_message_at: s.last_message_at, unread_count: s.unread_count ?? 0,
      title: siteChatTitle(first ? [{ role: 'user', content: first }] : []),
      preview: siteChatPreview(msgs),
      state: siteChatState(s, msgs),
    };
  });

  return (
    <ChatInbox
      rows={rows}
      initialTab={tab === 'mp' || order || mpChatKey ? 'mp' : 'site'}
      autoOpenSiteId={siteChatId}
      autoOpenOrderId={order ?? null}
      autoOpenChatKey={mpChatKey}
    />
  );
}
