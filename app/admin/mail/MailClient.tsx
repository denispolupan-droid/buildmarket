'use client';

import { useState, useEffect, useCallback } from 'react';
import { Mail, Send, Inbox, Trash2, FileText, RefreshCw, Pencil, X, Reply, ChevronLeft } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Folder = { folderId: string; folderName: string; unreadCount: number; messageCount: number };
type Message = {
  messageId: string;
  subject: string;
  fromAddress: string;
  toAddress: string;
  sentDateInGMT: string;
  summary: string;
  status: '0' | '1' | string;
  hasAttachment: string;
  folderId?: string;
};
type MessageContent = Message & { content: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

const FOLDER_ICONS: Record<string, React.ReactNode> = {
  inbox:        <Inbox size={15} />,
  sent:         <Send size={15} />,
  drafts:       <FileText size={15} />,
  trash:        <Trash2 size={15} />,
  spam:         <Trash2 size={15} />,
  outbox:       <Send size={15} />,
  templates:    <FileText size={15} />,
  archive:      <FileText size={15} />,
  notification: <Mail size={15} />,
  newsletter:   <Mail size={15} />,
  snoozed:      <Mail size={15} />,
};

const FOLDER_NAMES_UK: Record<string, string> = {
  inbox:        'Вхідні',
  sent:         'Надіслані',
  drafts:       'Чернетки',
  trash:        'Кошик',
  spam:         'Спам',
  outbox:       'Відправлення',
  templates:    'Шаблони',
  archive:      'Архів',
  notification: 'Сповіщення',
  newsletter:   'Розсилки',
  snoozed:      'Відкладені',
};

function folderIcon(name: string) {
  return FOLDER_ICONS[name.toLowerCase()] ?? <Mail size={15} />;
}

function folderName(name: string) {
  return FOLDER_NAMES_UK[name.toLowerCase()] ?? name;
}

function decodeHtml(str: string) {
  return str
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function formatAddress(raw: string) {
  const decoded = decodeHtml(raw ?? '');
  const match = decoded.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
  if (match) {
    const name = match[1].trim();
    const email = match[2].trim();
    return name || email;
  }
  return decoded;
}

function formatDate(ts: string) {
  if (!ts) return '';
  const d = new Date(Number(ts));
  if (isNaN(d.getTime())) return ts;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: 'short' });
}

// ── Compose modal ─────────────────────────────────────────────────────────────

function ComposeModal({ onClose, replyTo }: { onClose: () => void; replyTo?: { to: string; subject: string; replyToMsgId?: string } }) {
  const [to,      setTo]      = useState(replyTo?.to ?? '');
  const [subject, setSubject] = useState(replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : '');
  const [body,    setBody]    = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState('');

  async function send() {
    if (!to || !subject || !body) { setError('Заповніть усі поля'); return; }
    setSending(true); setError('');
    const res = await fetch('/api/admin/mail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, content: body.replace(/\n/g, '<br>') }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Помилка відправки'); setSending(false); return; }
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '14px', border: '1px solid var(--border)', width: '560px', maxWidth: '95vw', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
            {replyTo ? 'Відповісти' : 'Новий лист'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            placeholder="Кому"
            value={to}
            onChange={e => setTo(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', outline: 'none' }}
          />
          <input
            placeholder="Тема"
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', outline: 'none' }}
          />
          <textarea
            placeholder="Текст листа..."
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={10}
            style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
          />
          {error && <div style={{ color: '#EF4444', fontSize: '13px' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-secondary)' }}>
            Скасувати
          </button>
          <button onClick={send} disabled={sending} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', cursor: sending ? 'default' : 'pointer', fontSize: '14px', fontWeight: 600, opacity: sending ? 0.7 : 1 }}>
            {sending ? 'Відправка...' : 'Відправити'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MailClient() {
  const [connected,   setConnected]   = useState<boolean | null>(null);
  const [folders,     setFolders]     = useState<Folder[]>([]);
  const [selFolder,   setSelFolder]   = useState<Folder | null>(null);
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [selMessage,  setSelMessage]  = useState<Message | null>(null);
  const [msgContent,  setMsgContent]  = useState<MessageContent | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [msgLoading,  setMsgLoading]  = useState(false);
  const [compose,     setCompose]     = useState(false);
  const [replyData,   setReplyData]   = useState<{ to: string; subject: string } | undefined>();
  const [error,       setError]       = useState('');

  // Check connection status
  useEffect(() => {
    fetch('/api/admin/mail/status')
      .then(r => r.json())
      .then(d => setConnected(d.connected));
  }, []);

  // Load folders when connected
  useEffect(() => {
    if (!connected) return;
    fetch('/api/admin/mail/folders')
      .then(r => r.json())
      .then(d => {
        const list: Folder[] = d?.data ?? [];
        setFolders(list);
        const inbox = list.find(f => f.folderName.toLowerCase() === 'inbox') ?? list[0];
        if (inbox) setSelFolder(inbox);
      });
  }, [connected]);

  // Load messages when folder selected
  const loadMessages = useCallback(async () => {
    if (!selFolder) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/admin/mail/messages?folderId=${selFolder.folderId}&limit=30`);
      const data = await res.json();
      if (data.error) { setError(data.error); setMessages([]); }
      else setMessages(data?.data ?? []);
    } catch { setError('Помилка завантаження листів'); }
    finally { setLoading(false); }
  }, [selFolder]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Load message content
  async function openMessage(msg: Message) {
    setSelMessage(msg);
    setMsgContent(null);
    setMsgLoading(true);
    const folderId = msg.folderId ?? selFolder?.folderId ?? '';
    const res = await fetch(`/api/admin/mail/messages/${msg.messageId}?folderId=${folderId}`);
    const data = await res.json();
    setMsgContent(data?.data ?? null);
    setMsgLoading(false);

    // Mark as read
    if (msg.status === '0') {
      await fetch(`/api/admin/mail/messages/${msg.messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      });
      setMessages(prev => prev.map(m => m.messageId === msg.messageId ? { ...m, status: '1' } : m));
    }
  }

  // ── Not connected screen ───────────────────────────────────────────────────

  if (connected === null) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Завантаження...</div>
    </div>
  );

  if (!connected) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '20px' }}>
      <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Mail size={28} color="#1E3A5F" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>Пошта не підключена</div>
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Підключіть Zoho Mail для роботи з поштою</div>
      </div>
      <a href="/api/admin/mail/oauth/authorize" style={{ padding: '10px 24px', borderRadius: '10px', background: '#1E3A5F', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '14px' }}>
        Підключити Zoho Mail
      </a>
    </div>
  );

  // ── Main mail UI ───────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 0px)', overflow: 'hidden', background: 'var(--bg-soft)' }}>

      {/* Folders sidebar */}
      <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', padding: '16px 0' }}>
        <button
          onClick={() => { setCompose(true); setReplyData(undefined); }}
          style={{ margin: '0 12px 16px', padding: '9px 14px', borderRadius: '10px', background: '#1E3A5F', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Pencil size={14} /> Написати
        </button>

        {folders.map(f => (
          <button
            key={f.folderId}
            onClick={() => { setSelFolder(f); setSelMessage(null); setMsgContent(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '8px 16px', background: selFolder?.folderId === f.folderId ? 'var(--bg-soft)' : 'none',
              border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%',
              color: selFolder?.folderId === f.folderId ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: selFolder?.folderId === f.folderId ? 600 : 400, fontSize: '14px',
            }}
          >
            <span style={{ opacity: 0.6 }}>{folderIcon(f.folderName)}</span>
            <span style={{ flex: 1 }}>{folderName(f.folderName)}</span>
            {f.unreadCount > 0 && (
              <span style={{ background: '#EF4444', color: '#fff', fontSize: '11px', fontWeight: 700, borderRadius: '20px', padding: '1px 7px', minWidth: '18px', textAlign: 'center' }}>
                {f.unreadCount}
              </span>
            )}
          </button>
        ))}

        <div style={{ marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <button onClick={loadMessages} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <RefreshCw size={13} /> Оновити
          </button>
        </div>
      </div>

      {/* Message list */}
      <div style={{ width: '420px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-card)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
          {selFolder ? folderName(selFolder.folderName) : 'Пошта'}
        </div>

        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Завантаження...</div>
        )}
        {error && (
          <div style={{ padding: '16px', color: '#EF4444', fontSize: '13px' }}>{error}</div>
        )}
        {!loading && messages.length === 0 && !error && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>Листів немає</div>
        )}

        {messages.map(msg => {
          const isRead = msg.status !== '0';
          const isSelected = selMessage?.messageId === msg.messageId;
          const isSentFolder = ['sent', 'outbox', 'drafts'].includes(selFolder?.folderName.toLowerCase() ?? '');
          const rawAddress = isSentFolder ? (msg.toAddress || msg.fromAddress) : msg.fromAddress;
          const displayAddress = formatAddress(rawAddress);
          return (
            <button
              key={msg.messageId}
              onClick={() => openMessage(msg)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '12px 16px', border: 'none', cursor: 'pointer',
                background: isSelected ? 'var(--bg-soft)' : !isRead ? 'rgba(72,128,184,0.06)' : 'transparent',
                borderBottom: '1px solid var(--border-light)',
                borderLeft: isSelected ? '3px solid var(--brand-blue)' : !isRead ? '3px solid var(--brand-blue)' : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                <span style={{ fontSize: '13px', fontWeight: isRead ? 400 : 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>
                  {displayAddress}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {formatDate(msg.sentDateInGMT)}
                </span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: isRead ? 400 : 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>
                {msg.subject || '(без теми)'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {msg.summary}
              </div>
            </button>
          );
        })}
      </div>

      {/* Message content */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-soft)' }}>
        {!selMessage && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '12px' }}>
            <Mail size={40} strokeWidth={1.5} />
            <span style={{ fontSize: '14px' }}>Оберіть лист</span>
          </div>
        )}

        {selMessage && (
          <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px' }}>
            <button
              onClick={() => { setSelMessage(null); setMsgContent(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}
            >
              <ChevronLeft size={14} /> Назад
            </button>

            <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', padding: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                {selMessage.subject || '(без теми)'}
              </h2>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  <div><b>Від:</b> {decodeHtml(selMessage.fromAddress)}</div>
                  <div><b>Кому:</b> {decodeHtml(selMessage.toAddress)}</div>
                  <div><b>Дата:</b> {new Date(Number(selMessage.sentDateInGMT)).toLocaleString('uk-UA')}</div>
                </div>
                <button
                  onClick={() => { setReplyData({ to: selMessage.fromAddress, subject: selMessage.subject }); setCompose(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-soft)', cursor: 'pointer', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}
                >
                  <Reply size={14} /> Відповісти
                </button>
              </div>

              {msgLoading && <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Завантаження...</div>}
              {msgContent && (() => {
                const mc = msgContent as Record<string, unknown>;
                const html = (mc.htmlBody || mc.content || mc.body || mc.html || '') as string;
                const text = (mc.textBody || mc.text || mc.plainBody || '') as string;
                if (html) return (
                  <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: html }} />
                );
                if (text) return (
                  <pre style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                    {text}
                  </pre>
                );
                return <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Порожній лист</div>;
              })()}
            </div>
          </div>
        )}
      </div>

      {compose && (
        <ComposeModal
          replyTo={replyData}
          onClose={() => { setCompose(false); setReplyData(undefined); }}
        />
      )}
    </div>
  );
}
