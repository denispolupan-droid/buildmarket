import { createClient } from '@supabase/supabase-js';
import ChatTabs from './ChatTabs';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Чати | FIXLINE' };

export default async function AdminChatPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; order?: string }>;
}) {
  // order — наш id замовлення: перехід із картки одразу відкриває його чат МП
  const { tab, order } = await searchParams;

  const { data: sessions } = await db
    .from('chat_sessions')
    .select('id, status, created_at, last_message_at, unread_count')
    .order('last_message_at', { ascending: false })
    .limit(100);

  const sessionIds = (sessions ?? []).map(s => s.id);
  const lastMessages: Record<string, string> = {};

  if (sessionIds.length) {
    const { data: msgs } = await db
      .from('chat_messages')
      .select('session_id, content, role')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(1000);

    const seen = new Set<string>();
    for (const m of msgs ?? []) {
      if (!seen.has(m.session_id)) {
        seen.add(m.session_id);
        lastMessages[m.session_id] = m.content;
      }
    }
  }

  return (
    <ChatTabs
      sessions={sessions ?? []}
      lastMessages={lastMessages}
      initialTab={tab === 'mp' || order ? 'mp' : 'site'}
      autoOpenOrderId={order ?? null}
    />
  );
}
