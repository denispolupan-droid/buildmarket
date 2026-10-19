'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, UserCheck, CheckCircle, Send } from 'lucide-react';
import { siteChatState, siteChatPreview } from '../../../lib/site-chat-rules';
import {
  InboxShell, InboxToolbar, InboxRow, ThreadHead, Bubble, EmptyThread, EmptyList,
  timeAgo, formatClock, ReplyTextarea, type InboxState,
} from './inbox-ui';

/** Рядок списку: сервер уже порахував заголовок, прев'ю і стан (lib/site-chat-rules). */
export type SiteChatRow = {
  id: string;
  status: string;
  ai_enabled: boolean | null;
  created_at: string;
  last_message_at: string | null;
  unread_count: number;
  title: string;
  preview: string;
  state: InboxState;
};

type Msg = { id: string; role: string; content: string; created_at: string };

type Filter = 'all' | 'waiting' | 'open' | 'resolved';

const refreshBadge = () => window.dispatchEvent(new Event('admin-unread-refresh'));

export default function SiteChatsPane({ rows: initialRows, autoOpenId }: { rows: SiteChatRow[]; autoOpenId?: string | null }) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => { setRows(initialRows); }, [initialRows]);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [session, setSession] = useState<{ status: string; ai_enabled: boolean | null; created_at: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const autoOpened = useRef(false);

  const selected = rows.find(r => r.id === selectedId) ?? null;

  const patchRow = (id: string, patch: Partial<SiteChatRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  async function openChat(id: string) {
    setSelectedId(id); setMessages([]); setSession(null); setError(''); setReply('');
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/chat/${id}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося відкрити чат');
      setMessages(d.messages ?? []);
      setSession(d.session);
      patchRow(id, { unread_count: 0 });
      refreshBadge();
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoOpenId || autoOpened.current) return;
    autoOpened.current = true;
    if (rows.some(r => r.id === autoOpenId)) void openChat(autoOpenId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenId]);

  /** Перерахувати стан рядка після локальної зміни (відповідь, перехоплення) */
  function syncRowState(id: string, nextSession: { status: string; ai_enabled: boolean | null }, msgs: Msg[]) {
    patchRow(id, {
      status: nextSession.status, ai_enabled: nextSession.ai_enabled,
      state: siteChatState(nextSession, msgs), preview: siteChatPreview(msgs),
      last_message_at: msgs[msgs.length - 1]?.created_at ?? null,
    });
  }

  async function sendReply() {
    if (!selectedId || !session || !reply.trim() || sending) return;
    setSending(true); setError('');
    try {
      const res = await fetch(`/api/admin/chat/${selectedId}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося надіслати');
      const next = [...messages, { id: `local-${Date.now()}`, role: 'assistant', content: reply.trim(), created_at: new Date().toISOString() }];
      setMessages(next); setReply('');
      syncRowState(selectedId, session, next);
      refreshBadge();
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function toggleAi() {
    if (!selectedId || !session || busy) return;
    setBusy(true);
    try {
      const ai = !(session.ai_enabled ?? true);
      const res = await fetch(`/api/admin/chat/${selectedId}/takeover`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ai_enabled: ai }),
      });
      if (!res.ok) throw new Error('Не вдалося змінити режим');
      const next = { ...session, ai_enabled: ai };
      setSession(next); syncRowState(selectedId, next, messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!selectedId || !session || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/chat/${selectedId}/resolve`, { method: 'POST' });
      if (!res.ok) throw new Error('Не вдалося закрити чат');
      const next = { ...session, status: 'resolved' };
      setSession(next); syncRowState(selectedId, next, messages);
      patchRow(selectedId, { unread_count: 0 });
      refreshBadge();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'waiting'  && r.state !== 'waiting' && r.unread_count === 0) return false;
      if (filter === 'open'     && r.status === 'resolved') return false;
      if (filter === 'resolved' && r.status !== 'resolved') return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.preview.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const waitingCount = rows.filter(r => r.state === 'waiting' || r.unread_count > 0).length;

  const list = (
    <>
      <InboxToolbar<Filter>
        pills={[
          { key: 'all', label: 'Усі' },
          { key: 'waiting', label: 'Чекають', count: waitingCount },
          { key: 'open', label: 'Відкриті' },
          { key: 'resolved', label: 'Вирішені' },
        ]}
        active={filter} onPill={setFilter} search={search} onSearch={setSearch}
      />
      <div className="inbox-rows">
        {visible.length === 0 && <EmptyList text={rows.length ? 'Нічого не знайдено' : 'Повідомлень поки немає'} />}
        {visible.map(r => (
          <InboxRow key={r.id}
            active={r.id === selectedId} unread={r.unread_count > 0} source="site"
            avatar={r.state === 'ai' ? 'ШІ' : 'В'}
            title={r.title} preview={r.preview} time={timeAgo(r.last_message_at ?? r.created_at)}
            state={r.state} onClick={() => openChat(r.id)}
          />
        ))}
      </div>
    </>
  );

  const aiOn = session?.ai_enabled ?? true;
  const thread = !selected ? <EmptyThread /> : (
    <>
      <ThreadHead
        onBack={() => setSelectedId(null)}
        title={selected.title}
        subtitle={`Сайт · розпочато ${formatClock(selected.created_at)}${session?.status === 'resolved' ? ' · вирішено' : aiOn ? ' · відповідає ШІ' : ' · веде менеджер'}`}
        actions={session?.status === 'open' ? (
          <>
            <button type="button" className={'inbox-btn ' + (aiOn ? 'warn' : '')} onClick={toggleAi} disabled={busy}
              title={aiOn ? 'Вимкнути ШІ і відповідати самому' : 'Повернути чат ШІ-помічнику'}>
              {aiOn ? <><UserCheck size={13} /> Взяти на себе</> : <><Bot size={13} /> Повернути ШІ</>}
            </button>
            <button type="button" className="inbox-btn good" onClick={resolve} disabled={busy}>
              <CheckCircle size={13} /> Вирішено
            </button>
          </>
        ) : null}
      />
      <div className="inbox-msgs">
        {loading && <div className="inbox-empty">Завантаження…</div>}
        {error && <div className="inbox-note error" style={{ borderTop: 'none' }}>{error}</div>}
        {messages.map(m => {
          const isUser = m.role === 'user';
          const isStub = !isUser && /^(Менеджер вже підключився|Зараз AI-помічник недоступний)/.test(m.content.trim());
          return (
            <Bubble key={m.id} ours={!isUser} kind={isStub ? 'system' : 'default'}
              author={isUser ? 'Відвідувач' : null} text={m.content} at={m.created_at} />
          );
        })}
        <div ref={bottomRef} />
      </div>
      {session?.status === 'open' && (
        <div className="inbox-reply">
          <ReplyTextarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
            placeholder={aiOn ? 'Відповісти від імені менеджера… (ШІ лишиться увімкненим)' : 'Відповідь відвідувачу… (Enter — надіслати)'} />
          <button type="button" className="inbox-send" onClick={() => sendReply()} disabled={sending || !reply.trim()} aria-label="Надіслати">
            <Send size={16} />
          </button>
        </div>
      )}
    </>
  );

  return <InboxShell hasSelected={!!selected} list={list} thread={thread} />;
}
