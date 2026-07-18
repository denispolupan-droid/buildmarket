import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`;
  return `${Math.floor(diff / 86400)} дн тому`;
}

export default async function AdminChatPage() {
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
      .order('created_at', { ascending: false });

    const seen = new Set<string>();
    for (const m of msgs ?? []) {
      if (!seen.has(m.session_id)) {
        seen.add(m.session_id);
        lastMessages[m.session_id] = m.content;
      }
    }
  }

  const totalUnread = (sessions ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <div style={{ padding: '32px 36px 64px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Чат підтримки</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Всього: {sessions?.length ?? 0}
          {totalUnread > 0 && (
            <span style={{ marginLeft: '10px', color: '#DC2626', fontWeight: 700 }}>· Непрочитаних: {totalUnread}</span>
          )}
        </p>
      </div>

      {!sessions?.length ? (
        <div style={{
          padding: '48px', textAlign: 'center', borderRadius: '12px',
          border: '1px dashed #CBD5E1', color: 'var(--text-muted)',
        }}>
          <MessageSquare size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ margin: 0, fontSize: '14px' }}>Повідомлень поки немає</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sessions.map(s => (
            <Link
              key={s.id}
              href={`/admin/chat/${s.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px',
                padding: '14px 16px', borderRadius: '10px',
                background: s.unread_count > 0 ? 'var(--brand-blue-light)' : 'var(--bg-card)',
                border: `1px solid ${s.unread_count > 0 ? '#4880B840' : 'var(--border)'}`,
                textDecoration: 'none', transition: 'border-color 0.12s',
              }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: s.status === 'resolved' ? 'var(--bg-soft)' : '#1E3A5F',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MessageSquare size={16} color={s.status === 'resolved' ? '#94A3B8' : '#fff'} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Розмова
                  </span>
                  {s.status === 'resolved' && (
                    <span style={{
                      fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)',
                      background: 'var(--border-light)', borderRadius: '4px', padding: '1px 6px',
                    }}>вирішено</span>
                  )}
                </div>
                <p style={{
                  margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {lastMessages[s.id] ?? '—'}
                </p>
              </div>

              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  {timeAgo(s.last_message_at)}
                </div>
                {s.unread_count > 0 && (
                  <span style={{
                    display: 'inline-block', background: '#EF4444', color: '#fff',
                    fontSize: '11px', fontWeight: 700, borderRadius: '20px',
                    padding: '1px 7px', minWidth: '20px', textAlign: 'center',
                  }}>
                    {s.unread_count}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
