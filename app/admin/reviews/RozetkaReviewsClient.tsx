'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Send, ExternalLink, ThumbsUp, ThumbsDown, Store, Package } from 'lucide-react';

type Row = {
  kind: 'market' | 'item';
  id: number;
  author: string | null;
  text: string | null;
  dignity: string | null;
  shortcomings: string | null;
  mark: number | null;
  vote: string | null;
  createdAt: string | null;
  unread: boolean;
  itemTitle: string | null;
  itemId: number | null;
  mpOrderId: number | null;
  orderNumber: number | null;
  ourOrderId: string | null;
  ourReply: string | null;
  replies: Array<{ author: string | null; text: string | null; at: string | null }>;
};

function Stars({ mark }: { mark: number }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} style={{ color: mark >= i ? '#F59E0B' : '#D1D5DB', fontSize: '13px' }}>★</span>
      ))}
    </span>
  );
}

export default function RozetkaReviewsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'market' | 'item'>('all');
  const [replyFor, setReplyFor] = useState<string | null>(null);   // `${kind}-${id}`
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin/rozetka-reviews');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Помилка завантаження');
      setRows(d.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function sendReply(row: Row) {
    if (!replyText.trim() || sending) return;
    setSending(true); setError('');
    try {
      const res = await fetch('/api/admin/rozetka-reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: row.kind, id: row.id, mpOrderId: row.mpOrderId, itemId: row.itemId, text: replyText.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося надіслати');
      setRows(prev => prev.map(r => r.kind === row.kind && r.id === row.id
        ? { ...r, unread: false, replies: [...r.replies, { author: 'Ми', text: replyText.trim(), at: new Date().toISOString() }], ourReply: row.kind === 'market' ? replyText.trim() : r.ourReply }
        : r));
      setReplyFor(null); setReplyText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function markRead(row: Row) {
    setRows(prev => prev.map(r => r.kind === row.kind && r.id === row.id ? { ...r, unread: false } : r));
    fetch('/api/admin/rozetka-reviews', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: row.kind, id: row.id }),
    }).catch(() => {});
  }

  const filtered = rows.filter(r => filter === 'all' || r.kind === filter);
  const marketCount = rows.filter(r => r.kind === 'market').length;
  const itemCount = rows.filter(r => r.kind === 'item').length;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {([['all', `Всі (${rows.length})`], ['market', `Про магазин (${marketCount})`], ['item', `Про товари (${itemCount})`]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            style={{ height: '30px', padding: '0 13px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: filter === key ? '#6366F1' : 'var(--bg-card)', color: filter === key ? '#fff' : 'var(--text-secondary)' }}>
            {label}
          </button>
        ))}
        <button onClick={() => load()} disabled={loading}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', height: '30px', padding: '0 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Оновити
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {error && <div style={{ color: '#DC2626', fontSize: '12px', marginBottom: '10px' }}>{error}</div>}
        {loading && rows.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Завантаження…</div>}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Відгуків на Rozetka поки немає — зʼявляться тут одразу після публікації покупцем
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(row => {
            const key = `${row.kind}-${row.id}`;
            return (
              <div key={key} style={{
                border: `1px solid ${row.unread ? '#FCA5A5' : 'var(--border)'}`,
                background: row.unread ? '#FFF7F7' : 'var(--bg-card)',
                borderRadius: '12px', padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 700, color: '#6366F1', background: '#EEF2FF' }}>
                    {row.kind === 'market' ? <Store size={10} /> : <Package size={10} />}
                    {row.kind === 'market' ? 'Магазин' : 'Товар'}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{row.author ?? 'Покупець'}</span>
                  {row.mark != null && row.mark > 0 && <Stars mark={row.mark} />}
                  {row.vote === 'like' && <ThumbsUp size={13} color="#15803D" />}
                  {row.vote === 'dislike' && <ThumbsDown size={13} color="#DC2626" />}
                  {row.unread && (
                    <button onClick={() => markRead(row)} title="Позначити прочитаним"
                      style={{ fontSize: '10px', fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '5px', padding: '1px 6px', cursor: 'pointer' }}>
                      нове · прочитано?
                    </button>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {row.createdAt ? new Date(row.createdAt.replace(' ', 'T')).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>

                {(row.itemTitle || row.orderNumber || row.mpOrderId) && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {row.itemTitle && <span>{row.itemTitle}</span>}
                    {row.orderNumber && row.ourOrderId ? (
                      <Link href={`/admin?expand=${row.ourOrderId}`} target="_blank" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#6366F1', textDecoration: 'none', fontWeight: 600 }}>
                        <ExternalLink size={10} /> Замовлення №{row.orderNumber}
                      </Link>
                    ) : row.mpOrderId ? <span>Замовлення rz {row.mpOrderId}</span> : null}
                  </div>
                )}

                {row.text && <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '7px', whiteSpace: 'pre-wrap' }}>{row.text}</div>}
                {row.dignity && <div style={{ fontSize: '12px', marginTop: '5px' }}><span style={{ color: '#15803D', fontWeight: 700 }}>+ </span><span style={{ color: 'var(--text-secondary)' }}>{row.dignity}</span></div>}
                {row.shortcomings && <div style={{ fontSize: '12px', marginTop: '2px' }}><span style={{ color: '#DC2626', fontWeight: 700 }}>− </span><span style={{ color: 'var(--text-secondary)' }}>{row.shortcomings}</span></div>}

                {(row.replies.length > 0 || row.ourReply) && (
                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {row.ourReply && row.replies.length === 0 && (
                      <div style={{ fontSize: '12px', background: 'var(--bg-soft)', borderRadius: '8px', padding: '7px 10px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 700, color: '#1E3A5F' }}>Наша відповідь: </span>{row.ourReply}
                      </div>
                    )}
                    {row.replies.map((rep, i) => (
                      <div key={i} style={{ fontSize: '12px', background: 'var(--bg-soft)', borderRadius: '8px', padding: '7px 10px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 700, color: '#1E3A5F' }}>{rep.author ?? 'Відповідь'}: </span>{rep.text}
                      </div>
                    ))}
                  </div>
                )}

                {replyFor === key ? (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '9px', alignItems: 'flex-end' }}>
                    <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={2} autoFocus
                      placeholder="Відповідь покупцю…"
                      style={{ flex: 1, resize: 'none', padding: '8px 11px', border: '1.5px solid var(--border)', borderRadius: '9px', fontSize: '13px', outline: 'none', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
                    <button onClick={() => sendReply(row)} disabled={sending || !replyText.trim()}
                      style={{ height: '36px', width: '40px', borderRadius: '9px', border: 'none', background: '#6366F1', color: '#fff', cursor: 'pointer', opacity: sending || !replyText.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Send size={14} />
                    </button>
                  </div>
                ) : (
                  (row.kind === 'item' || row.mpOrderId) && (
                    <button onClick={() => { setReplyFor(key); setReplyText(''); }}
                      style={{ marginTop: '8px', height: '28px', padding: '0 12px', borderRadius: '7px', border: '1px solid #6366F1', background: 'var(--bg-card)', color: '#6366F1', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Відповісти
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
