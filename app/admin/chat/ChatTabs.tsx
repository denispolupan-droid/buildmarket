'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, MessagesSquare } from 'lucide-react';
import MarketplaceChatsClient from '../marketplace-chats/MarketplaceChatsClient';

// Обʼєднаний розділ «Чати»: вкладка «Сайт» — власний чат-віджет (chat_sessions,
// AI-автопілот, takeover), вкладка «Маркетплейси» — живі діалоги Rozetka/Prom.
// Механіки різні, тому вкладки, а не спільна стрічка.

export type SiteChatSession = {
  id: string;
  status: string;
  last_message_at: string;
  unread_count: number;
};

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв тому`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год тому`;
  return `${Math.floor(diff / 86400)} дн тому`;
}

export default function ChatTabs({
  sessions, lastMessages, initialTab,
}: {
  sessions: SiteChatSession[];
  lastMessages: Record<string, string>;
  initialTab: 'site' | 'mp';
}) {
  const [tab, setTab] = useState<'site' | 'mp'>(initialTab);
  const siteUnread = sessions.reduce((s, c) => s + (c.unread_count ?? 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '24px 24px 0' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Чати</h1>
        {/* Вкладки «зростаються» з панеллю: активна перекриває верхню межу панелі
            (marginBottom -1px + нижня межа кольору панелі) — виглядає одним цілим */}
        {/* Кожна вкладка має свій акцент у стилі сайту: «Сайт» — фірмовий синій,
            «Маркетплейси» — індиго (як бейджі Rozetka/Prom у списках) */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '14px' }}>
          {([
            ['site', 'Сайт', MessageSquare, siteUnread, '#1E3A5F', '#EBF1F8'],
            ['mp', 'Маркетплейси', MessagesSquare, 0, '#6366F1', '#EEF2FF'],
          ] as const).map(([key, label, Icon, unread, accent, tint]) => {
            const active = tab === key;
            return (
              <button key={key} onClick={() => setTab(key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px', height: '40px', padding: '0 18px',
                  borderRadius: '10px 10px 0 0',
                  border: '1px solid var(--border)',
                  borderTop: `3px solid ${active ? accent : 'var(--border)'}`,
                  borderBottom: active ? '1px solid var(--bg-card)' : '1px solid var(--border)',
                  marginBottom: '-1px', position: 'relative', zIndex: active ? 2 : 1,
                  background: active ? 'var(--bg-card)' : tint,
                  color: active ? accent : 'var(--text-secondary)',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}>
                <Icon size={14} color={accent} /> {label}
                {unread > 0 && (
                  <span style={{ background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '9px', padding: '1px 6px' }}>{unread}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Єдина панель під вкладками — вміст обох вкладок живе всередині неї */}
      <div style={{
        flex: 1, minHeight: 0, margin: '0 24px 24px', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '0 12px 12px 12px', overflow: 'hidden',
      }}>
      {tab === 'mp' ? (
        <MarketplaceChatsClient embedded />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {!sessions.length ? (
            <div style={{ padding: '48px', textAlign: 'center', borderRadius: '12px', border: '1px dashed #CBD5E1', color: 'var(--text-muted)' }}>
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
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Розмова</span>
                      {s.status === 'resolved' && (
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--border-light)', borderRadius: '4px', padding: '1px 6px' }}>вирішено</span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lastMessages[s.id] ?? '—'}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {timeAgo(s.last_message_at)}
                    </div>
                    {s.unread_count > 0 && (
                      <span style={{ display: 'inline-block', background: '#EF4444', color: '#fff', fontSize: '11px', fontWeight: 700, borderRadius: '20px', padding: '1px 7px', minWidth: '20px', textAlign: 'center' }}>
                        {s.unread_count}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
