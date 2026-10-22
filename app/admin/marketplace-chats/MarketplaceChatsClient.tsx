'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Send, ExternalLink, Sparkles, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { htmlToText } from '../../../lib/html-to-text';
import { CATEGORY_LABELS, type DraftCategory } from '../../../lib/marketplace-chat-draft-types';
import {
  InboxShell, InboxToolbar, InboxRow, ThreadHead, Bubble, EmptyThread, EmptyList, timeAgo, initials, ReplyTextarea,
} from '../chat/inbox-ui';

export type ChatItem = {
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
  attachments?: { kind: 'image' | 'file' | 'product'; name: string; url: string }[];
};

/** Чернетка відповіді від ШІ-помічника (/api/admin/marketplace-chats/draft). */
type Draft = {
  id: string | null;
  cached: boolean;
  category: DraftCategory;
  summary: string;
  reply: string;
  needsHuman: boolean;
  reason: string | null;
  costUsd: number;
};

type Filter = 'all' | 'waiting' | 'rozetka' | 'prom';

// Чи чекає покупець на відповідь: останнє змістовне повідомлення — його
// (дзеркало awaitingOurReply на сервері; сервер перевіряє ще раз).
function buyerWaits(messages: ChatMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const media = (m.attachments ?? []).some(a => a.kind !== 'product');
    if ((!htmlToText(m.body) && !media) || m.author === 'Система') continue;
    return !m.fromUs;
  }
  return false;
}

/**
 * Вкладка «Маркетплейси» розділу «Чати»: живі діалоги Rozetka/Prom. Список
 * вантажить батько (ChatInbox) — йому потрібні лічильники для вкладок ще до
 * того, як сюди зайшли; тут — фільтри, тред, чернетка ШІ і відповідь.
 */
export default function MarketplaceChatsClient({ items, setItems, listLoading, listErrors, reload, autoOpenOrderId, autoOpenChatKey }: {
  items: ChatItem[];
  setItems: (fn: (prev: ChatItem[]) => ChatItem[]) => void;
  listLoading: boolean;
  listErrors: string[];
  reload: () => void;
  /** Наш id замовлення: прийшли з картки замовлення — одразу відкриваємо його чат. */
  autoOpenOrderId?: string | null;
  /** «mp:id» з Telegram-алерту про чернетку — відкрити саме цей діалог. */
  autoOpenChatKey?: string | null;
}) {
  // Відкриваємо лише раз: інакше кожне оновлення списку перекидало б менеджера
  // назад у цей чат, навіть якби він уже читав інший.
  const autoOpened = useRef(false);
  const [autoOpenMiss, setAutoOpenMiss] = useState(false);
  const [selected, setSelected] = useState<ChatItem | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [threadContact, setThreadContact] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<number | null>(null);

  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Чернетка ШІ: просимо автоматично, щойно відкрили тред, де останнє слово за
  // покупцем. Повторне відкриття того самого треда сервер віддає з кешу — без
  // нового виклику моделі. Ключ треда захищає від гонки: відповідь на старий
  // запит не має лягти в інший чат.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const draftFor = useRef<string>('');
  // «Направити» відповідь: вказівка менеджера → агент переписує ПОТОЧНУ чернетку
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [revisedBy, setRevisedBy] = useState<string[]>([]);
  // Згорнута чернетка лишає лише рядок-заголовок, щоб було видно листування.
  // Вибір менеджера памʼятаємо між чатами й перезавантаженнями.
  const [draftCollapsed, setDraftCollapsed] = useState(false);
  useEffect(() => {
    try { setDraftCollapsed(localStorage.getItem('mp-chat-draft-collapsed') === '1'); } catch { /* приватне вікно */ }
  }, []);
  function toggleDraftCollapsed() {
    setDraftCollapsed(prev => {
      try { localStorage.setItem('mp-chat-draft-collapsed', prev ? '0' : '1'); } catch { /* приватне вікно */ }
      return !prev;
    });
  }

  const chatKey = (item: ChatItem) => `${item.mp}:${item.id}`;

  async function reviseCurrentDraft(text: string) {
    if (!draft?.id || !selected || revising || !text.trim()) return;
    const key = chatKey(selected);
    setRevising(true); setDraftError('');
    try {
      const res = await fetch('/api/admin/marketplace-chats/draft/revise', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: draft.id, instruction: text.trim() }),
      });
      const d = await res.json();
      if (draftFor.current !== key) return;
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося переписати');
      setDraft(d.draft);
      setRevisedBy(prev => [...prev, text.trim()]);
      setInstruction('');
    } catch (e) {
      if (draftFor.current === key) setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      if (draftFor.current === key) setRevising(false);
    }
  }

  async function requestDraft(item: ChatItem, force = false) {
    const key = chatKey(item);
    draftFor.current = key;
    setDraftLoading(true); setDraftError('');
    if (force) { setDraft(null); setRevisedBy([]); }
    try {
      const res = await fetch('/api/admin/marketplace-chats/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mp: item.mp, id: item.id, orderNumber: item.orderNumber, ourOrderId: item.ourOrderId, subject: item.subject, force }),
      });
      const d = await res.json();
      if (draftFor.current !== key) return;
      if (!res.ok) throw new Error(d.error ?? 'Помічник не відповів');
      setDraft(d.draft ?? null);
    } catch (e) {
      if (draftFor.current === key) setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      if (draftFor.current === key) setDraftLoading(false);
    }
  }

  // Перехід із картки замовлення. Шукаємо по нашому id, а не по номеру МП:
  // номер у чата може бути порожній, а id — точний збіг без здогадок.
  useEffect(() => {
    if ((!autoOpenOrderId && !autoOpenChatKey) || autoOpened.current || listLoading) return;
    const chat = autoOpenChatKey
      ? items.find(i => `${i.mp}:${i.id}` === autoOpenChatKey)
      : items.find(i => i.ourOrderId === autoOpenOrderId);
    autoOpened.current = true;
    if (chat) void openChat(chat);
    else setAutoOpenMiss(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenOrderId, autoOpenChatKey, items, listLoading]);

  async function openChat(item: ChatItem) {
    setSelected(item);
    setMessages([]); setThreadError(''); setThreadContact(item.contact); setReceiverId(item.receiverId);
    setDraft(null); setDraftError(''); setDraftLoading(false); draftFor.current = chatKey(item);
    setInstruction(''); setRevising(false); setRevisedBy([]);
    setThreadLoading(true);
    try {
      // updatedAt передаємо навмисно: сервер запамʼятає САМЕ цю мітку як
      // «переглянуто». Порівняння в списку йде по тому самому полю чату, тож
      // мітка останнього повідомлення тут не підійшла б — вони можуть різнитись,
      // і чат залишався б підсвіченим назавжди.
      const res = await fetch(`/api/admin/marketplace-chats/thread?mp=${item.mp}&id=${encodeURIComponent(item.id)}`
        + (item.updatedAt ? `&updatedAt=${encodeURIComponent(item.updatedAt)}` : ''));
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Помилка');
      const loaded: ChatMessage[] = d.messages ?? [];
      setMessages(loaded);
      if (d.contact) setThreadContact(d.contact);
      if (d.receiverId) setReceiverId(d.receiverId);
      // Локально гасимо лічильник непрочитаних; сайдбар перепитує бейдж одразу
      setItems(prev => prev.map(i => i.mp === item.mp && i.id === item.id ? { ...i, unread: 0, contact: d.contact ?? i.contact } : i));
      window.dispatchEvent(new Event('admin-unread-refresh'));
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 50);
      if (buyerWaits(loaded)) void requestDraft(item);
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
        body: JSON.stringify({ mp: selected.mp, id: selected.id, receiverId, text: reply.trim(), draftId: draft?.id ?? null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Не вдалося надіслати');
      setMessages(prev => [...prev, { body: reply.trim(), at: new Date().toISOString(), fromUs: true, author: 'Ми' }]);
      setReply('');
      setDraft(null); setDraftError('');
      window.dispatchEvent(new Event('admin-unread-refresh'));
      setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'end' }), 50);
    } catch (e) {
      setThreadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (filter === 'waiting' && i.unread === 0) return false;
      if ((filter === 'rozetka' || filter === 'prom') && i.mp !== filter) return false;
      if (q) {
        const hay = `${i.contact ?? ''} ${i.subject} ${i.orderNumber ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, search]);

  const waitingCount = items.filter(i => i.unread > 0).length;

  const list = (
    <>
      <InboxToolbar<Filter>
        pills={[
          { key: 'all', label: 'Усі' },
          { key: 'waiting', label: 'Чекають', count: waitingCount },
          { key: 'rozetka', label: 'Rozetka' },
          { key: 'prom', label: 'Prom' },
        ]}
        active={filter} onPill={setFilter} search={search} onSearch={setSearch}
        right={
          <button type="button" className="inbox-btn" onClick={reload} disabled={listLoading} title="Перечитати діалоги з площадок">
            <RefreshCw size={12} style={listLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
        }
      />
      <div className="inbox-rows">
        {listLoading && items.length === 0 && <EmptyList text="Завантаження…" />}
        {!listLoading && visible.length === 0 && <EmptyList text={items.length ? 'Нічого не знайдено' : 'Діалогів немає'} />}
        {visible.map(item => (
          <InboxRow key={`${item.mp}-${item.id}`}
            active={!!selected && selected.mp === item.mp && selected.id === item.id}
            unread={item.unread > 0} source={item.mp}
            avatar={initials(item.contact)}
            title={item.contact ?? item.subject}
            preview={item.contact ? item.subject : ''}
            time={timeAgo(item.updatedAt)}
            state={item.unread > 0 ? 'waiting' : 'answered'}
            extra={item.orderNumber ? `№${item.orderNumber}` : null}
            onClick={() => openChat(item)}
          />
        ))}
      </div>
      {/* Прийшли з картки, а листування по цьому замовленню ще немає — кажемо
          прямо, інакше екран виглядав би так, ніби кнопка не спрацювала. */}
      {autoOpenMiss && (
        <div className="inbox-note warn">
          По цьому замовленню листування ще немає. Написати першим не можна:
          Rozetka не дає створити чат через API — діалог заводить лише покупець
          або менеджер у кабінеті маркетплейсу.
        </div>
      )}
      {listErrors.length > 0 && <div className="inbox-note error">{listErrors.join(' · ')}</div>}
    </>
  );

  const thread = !selected ? <EmptyThread /> : (
    <>
      <ThreadHead
        onBack={() => setSelected(null)}
        title={threadContact ?? selected.subject}
        subtitle={`${selected.mp === 'rozetka' ? 'Rozetka' : 'Prom'}${selected.orderNumber ? ` · Замовлення №${selected.orderNumber}` : ''} · ${selected.subject}`}
        actions={selected.ourOrderId ? (
          <Link href={`/admin?expand=${selected.ourOrderId}`} target="_blank" className="inbox-btn">
            <ExternalLink size={12} /> №{selected.orderNumber}
          </Link>
        ) : null}
      />

      <div className="inbox-msgs">
        {threadLoading && <div className="inbox-empty">Завантаження…</div>}
        {threadError && <div className="inbox-note error" style={{ borderTop: 'none' }}>{threadError}</div>}
        {messages.map((m, i) => {
          const text = htmlToText(m.body);
          // Повідомлення «лише фото» без тексту раніше зникали з треда цілком
          if (!text && !m.attachments?.length) return null;
          const system = !m.fromUs && m.author === 'Система';
          return <Bubble key={i} ours={m.fromUs} kind={system ? 'system' : 'default'} author={m.author} text={text} at={m.at} attachments={m.attachments} />;
        })}
        <div ref={bottomRef} />
      </div>

      {/* Чернетка ШІ-помічника: зʼявляється, коли останнє слово за покупцем.
          Нічого не відправляє сама — лише пропонує текст у поле відповіді. */}
      {(draft || draftLoading || draftError) && (
        <div className={'inbox-draft' + (draft?.needsHuman ? ' needs-human' : '')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-primary)' }}>
              <Sparkles size={13} /> Чернетка ШІ
            </span>
            {draft && <span className="inbox-src rozetka">{CATEGORY_LABELS[draft.category] ?? draft.category}</span>}
            {draft?.needsHuman && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#92400E' }}>
                <AlertTriangle size={12} /> Потрібна людина
              </span>
            )}
            {draftLoading && <span style={{ color: 'var(--text-muted)' }}>Готую…</span>}
            {draft && !draftLoading && (
              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{draft.cached ? 'з кешу' : `$${draft.costUsd.toFixed(3)}`}</span>
            )}
            <span style={{ flex: 1 }} />
            {draft && !draftLoading && (
              <>
                <button type="button" className="inbox-btn primary" onClick={() => setReply(draft.reply)} disabled={revising}>Вставити у відповідь</button>
                {!draftCollapsed && (
                  <button type="button" className="inbox-btn" onClick={() => selected && requestDraft(selected, true)} disabled={revising} title="Нова чернетка з нуля">Ще раз</button>
                )}
              </>
            )}
            <button type="button" className="inbox-btn" onClick={toggleDraftCollapsed}
              title={draftCollapsed ? 'Показати чернетку повністю' : 'Згорнути чернетку, щоб бачити листування'}
              aria-expanded={!draftCollapsed}>
              {draftCollapsed ? <><ChevronUp size={13} /> Розгорнути</> : <><ChevronDown size={13} /> Згорнути</>}
            </button>
          </div>
          {!draftCollapsed && draftError && <div style={{ color: '#DC2626', marginTop: '6px' }}>{draftError}</div>}
          {!draftCollapsed && draft && (
            <>
              <div style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>{draft.summary}</div>
              {draft.reason && <div style={{ color: '#92400E', marginTop: '4px' }}>{draft.reason}</div>}
              {revisedBy.length > 0 && (
                <div style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '11px' }}>
                  ✏️ Переписано: {revisedBy.map(r => `«${r}»`).join(' → ')}
                </div>
              )}
              <div className="inbox-draft-text" style={revising ? { opacity: 0.5 } : undefined}>{draft.reply}</div>
              {/* Направити відповідь: вказівка менеджера до ПОТОЧНОЇ чернетки */}
              {draft.id && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      value={instruction}
                      onChange={e => setInstruction(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void reviseCurrentDraft(instruction); } }}
                      placeholder="Що змінити? Напр.: допиши, що повернемо за наш рахунок"
                      maxLength={500}
                      disabled={revising}
                      style={{ flex: 1, minWidth: 0, height: '30px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '12px', outline: 'none' }}
                    />
                    <button type="button" className="inbox-btn" onClick={() => reviseCurrentDraft(instruction)} disabled={revising || !instruction.trim()}>
                      {revising ? 'Переписую…' : 'Переписати'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {['Коротше', 'Тепліше, з вибаченням', 'Повернення за наш рахунок', 'Запропонуй обмін'].map(q => (
                      <button key={q} type="button" className="inbox-btn" onClick={() => reviseCurrentDraft(q)} disabled={revising}
                        style={{ fontSize: '11px', height: '24px', padding: '0 8px' }}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="inbox-reply">
        <ReplyTextarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendReply(); } }}
          placeholder="Відповідь покупцю… (Enter — надіслати)"
          rows={2}
        />
        <button type="button" className="inbox-send" onClick={() => sendReply()} disabled={sending || !reply.trim()} aria-label="Надіслати">
          <Send size={16} />
        </button>
      </div>
    </>
  );

  return <InboxShell hasSelected={!!selected} list={list} thread={thread} />;
}
