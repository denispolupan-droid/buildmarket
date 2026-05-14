import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { Bot, User } from 'lucide-react';
import ResolveButton from './ResolveButton';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function ChatSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [{ data: session }, { data: messages }] = await Promise.all([
    db.from('chat_sessions').select('*').eq('id', id).single(),
    db.from('chat_messages').select('*').eq('session_id', id).order('created_at', { ascending: true }),
  ]);

  if (!session) notFound();

  // Mark as read
  await db.from('chat_sessions').update({ unread_count: 0 }).eq('id', id);

  return (
    <div style={{ padding: '32px 36px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Чат</h1>
          <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', fontFamily: 'monospace' }}>{id}</p>
          <p style={{ fontSize: '13px', color: '#64748B', marginTop: '2px' }}>
            Розпочато: {formatTime(session.created_at)}
            {session.status === 'resolved' && (
              <span style={{
                marginLeft: '10px', fontSize: '12px', fontWeight: 600, color: '#64748B',
                background: '#F1F5F9', borderRadius: '4px', padding: '2px 8px',
              }}>вирішено</span>
            )}
          </p>
        </div>
        {session.status === 'open' && <ResolveButton sessionId={id} />}
      </div>

      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0',
        padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px',
        maxWidth: '720px',
      }}>
        {(messages ?? []).length === 0 && (
          <p style={{ color: '#94A3B8', fontSize: '14px', textAlign: 'center', padding: '24px 0', margin: 0 }}>
            Повідомлень немає
          </p>
        )}
        {(messages ?? []).map(m => (
          <div key={m.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div style={{
              width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
              background: m.role === 'user' ? '#EFF6FF' : '#F0FDF4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {m.role === 'user'
                ? <User size={15} color="#3B82F6" />
                : <Bot size={15} color="#22C55E" />
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A' }}>
                  {m.role === 'user' ? 'Відвідувач' : 'AI-помічник'}
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>{formatTime(m.created_at)}</span>
              </div>
              <div style={{
                fontSize: '13.5px', color: '#334155', lineHeight: '1.6',
                background: '#F8FAFC', borderRadius: '8px', padding: '10px 12px',
                whiteSpace: 'pre-wrap',
              }}>
                {m.content}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
