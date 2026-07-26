'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { MessagesSquare, RefreshCw, Send, ArrowLeft, ExternalLink } from 'lucide-react';

type ChatItem = {
  mp: 'rozetka' | 'prom';
  id: string;
  subject: string;
  contact: string | null;
  updatedAt: string | null;
  unread: number;
  orderNumber: number | null;
  ourOrderId: string | null;
  receiverId: number | null;
};

type ChatMessage = {
  body: string;
  at: string | null;
  fromUs: boolean;
  author: string | null;
};

const MP_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  prom:    { label: 'Prom',    color: '#8B5CF6', bg: '#F5F3FF' },
  rozetka: { label: 'Rozetka', color: '#6366F1', bg: '#EEF2FF' },
};

// Rozetka шле HTML у body (сервісні повідомлення з <br>, посиланнями) —
// рендеримо як текст: <br> → перенос, решту тегів прибираємо.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000);
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год`;
  return `${Math.floor(diff / 86400)} дн`;
}

export default function MarketplaceChatsClient({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listErrors, setListErrors] = useState<string[]>([]);
  const [selected, setSelected] = useState<ChatItem | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [threadContact, setThreadContact] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<number | null>(null);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/admin/marketplace-chats');
      const d = await res.json();
      if (res.ok) { setItems(d.items ?? []); setListErrors(d.errors ?? []); }
      else setListErrors([d.error ?? 'Помилка завантаження']);
    } catch (e) {
      setListErrors([e instanceof Error ? e.message : String(e)]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  async function openChat(item: ChatItem) {
    setSelected(item);
    setMessages([]); setThreadError(''); setThreadContact(item.contact); setReceiverId(item.receiverId);
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/admin/marketplace-chats/thread?mp=${item.mp}&id=${encodeURIComponent(item.id)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Помилка');
      setMessages(d.messages ?? []);
      if (d.contact) setThreadContact(d.contact);
      if (d.receiverId) setReceiverId(d.receiverId);
      // Локально гасимо лічильник непрочитаних
      setItems(prev => prev.map(i => i.mp === item.mp && i.id === item.id ? { ...i, unread: 0 } : i));
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : String(e));
    } finally {
      setThreadLoading(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim() || sending) return;
    setSending(true); setThreadError('');
    try {
      const res = await fetch('/api/admin/marketplace-chats/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mp: selected.mp, id: selected.id, receiverId, text: reply.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося надіслати');
      setMessages(prev => [...prev, { body: reply.trim(), at: new Date().toISOString(), fromUs: true, author: 'Ми' }]);
      setReply('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const listPane = (
    <div style={{ width: '340px', minWidth: '280px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)' }} className="mpc-list">
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Діалоги</span>
        <button onClick={() => loadList()} disabled={listLoading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 10px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={12} style={listLoading ? { animation: 'spin 1s linear infinite' } : undefined} /> Оновити
        </button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {listLoading && items.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Завантаження…</div>
        )}
        {!listLoading && items.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Діалогів немає</div>
        )}
        {items.map(item => {
          const s = MP_STYLE[item.mp];
          const active = selected && selected.mp === item.mp && selected.id === item.id;
          return (
            <div key={`${item.mp}-${item.id}`} onClick={() => openChat(item)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-light)', background: active ? 'var(--bg-soft)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, color: s.color, background: s.bg, flexShrink: 0 }}>{s.label}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {item.contact ?? item.subject}
                </span>
                {item.unread > 0 && (
                  <span style={{ background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 700, borderRadius: '9px', padding: '1px 6px', flexShrink: 0 }}>{item.unread}</span>
                )}
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(item.updatedAt)}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.orderNumber ? `Замовлення №${item.orderNumber} · ` : ''}{item.subject}
              </div>
            </div>
          );
        })}
      </div>
      {listErrors.length > 0 && (
        <div style={{ padding: '8px 14px', fontSize: '11px', color: '#DC2626', borderTop: '1px solid var(--border)' }}>{listErrors.join(' · ')}</div>
      )}
    </div>
  );

  const threadPane = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-soft)' }}>
      {!selected ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', gap: '8px' }}>
          <MessagesSquare size={16} /> Оберіть діалог зліва
        </div>
      ) : (
        <>
          <div style={{ padding: '10px 16px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={() => setSelected(null)} className="mpc-back"
              style={{ display: 'none', alignItems: 'center', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}>
              <ArrowLeft size={16} />
            </button>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {threadContact ?? selected.subject}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {MP_STYLE[selected.mp].label}{selected.orderNumber ? ` · Замовлення №${selected.orderNumber}` : ''} · {selected.subject}
              </div>
            </div>
            {selected.ourOrderId && (
              <Link href={`/admin?expand=${selected.ourOrderId}`} target="_blank"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 10px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                <ExternalLink size={12} /> №{selected.orderNumber}
              </Link>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            {threadLoading && <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Завантаження…</div>}
            {threadError && <div style={{ textAlign: 'center', color: '#DC2626', fontSize: '12px', marginBottom: '10px' }}>{threadError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {messages.map((m, i) => {
                const text = htmlToText(m.body);
                if (!text) return null;
                const system = !m.fromUs && m.author === 'Система';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: m.fromUs ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '72%', padding: '8px 12px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.45,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      background: m.fromUs ? '#1E3A5F' : system ? 'var(--bg-soft)' : 'var(--bg-card)',
                      color: m.fromUs ? '#fff' : system ? 'var(--text-muted)' : 'var(--text-primary)',
                      border: m.fromUs ? 'none' : '1px solid var(--border)',
                    }}>
                      {!m.fromUs && m.author && (
                        <div style={{ fontSize: '10px', fontWeight: 700, color: system ? 'var(--text-muted)' : '#6366F1', marginBottom: '2px' }}>{m.author}</div>
                      )}
                      {text}
                      <div style={{ fontSize: '10px', color: m.fromUs ? 'rgba(255,255,255,0.55)' : 'var(--text-muted)', marginTop: '3px', textAlign: 'right' }}>
                        {m.at ? new Date(m.at.replace(' ', 'T')).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: '12px 16px', background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
              placeholder="Відповідь покупцю… (Enter — надіслати)"
              rows={2}
              style={{ flex: 1, resize: 'none', padding: '9px 12px', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '13px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
            />
            <button onClick={() => sendReply()} disabled={sending || !reply.trim()}
              style={{ height: '40px', width: '44px', borderRadius: '10px', border: 'none', background: '#1E3A5F', color: '#fff', cursor: sending || !reply.trim() ? 'default' : 'pointer', opacity: sending || !reply.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {!embedded && (
        <div style={{ padding: '20px 24px 14px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '9px' }}>
            <MessagesSquare size={20} /> Чати маркетплейсів
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
            Повідомлення покупців з Rozetka та Prom — відповідайте, не заходячи в кабінети
          </p>
        </div>
      )}
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden',
        border: embedded ? 'none' : '1px solid var(--border)',
        borderRadius: embedded ? 0 : '14px 14px 0 0',
        margin: embedded ? 0 : '0 24px',
      }} className={selected ? 'mpc-has-selected' : ''}>
        {listPane}
        {threadPane}
      </div>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @media (max-width: 760px) {
          .mpc-has-selected .mpc-list { display: none !important; }
          .mpc-back { display: inline-flex !important; }
        }
      `}</style>
    </div>
  );
}
