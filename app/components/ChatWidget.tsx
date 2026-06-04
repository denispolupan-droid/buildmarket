'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, X, Send, Bot, Loader2 } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };

function renderContent(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer"
           style={{ color: '#3DBFB8', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      : <span key={i}>{part}</span>
  );
}

const WELCOME: Message = {
  role: 'assistant',
  content: 'Привіт! 👋 Я AI-помічник FIXLINE. Запитайте про товари, умови оптової співпраці або доставку — відповім одразу.',
};

const SESSION_KEY = 'fixline_chat_session';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadSession(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { id, ts } = JSON.parse(raw) as { id: string; ts: number };
    if (Date.now() - ts > TTL_MS) { localStorage.removeItem(SESSION_KEY); return null; }
    return id;
  } catch { return null; }
}

function saveSession(id: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id, ts: Date.now() }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'ai' | 'manager'>('ai');
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastMsgCount = useRef(0);

  const scrollToBottom = (force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (force || nearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setSessionId(saved);
      fetch(`/api/chat?sessionId=${saved}`)
        .then(r => r.json())
        .then(({ messages: hist }) => {
          if (hist?.length) setMessages([WELCOME, ...hist]);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (open) { scrollToBottom(true); return; }
  }, [open]);

  useEffect(() => {
    const isNew = messages.length > lastMsgCount.current;
    lastMsgCount.current = messages.length;
    if (isNew) scrollToBottom(true);
  }, [messages]);

  // Poll for new messages (manager replies) every 5s when chat is open
  useEffect(() => {
    if (!open || !sessionId) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/chat?sessionId=${sessionId}`);
        const { messages: hist } = await r.json();
        if (hist?.length) setMessages([WELCOME, ...hist]);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [open, sessionId]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Помилка: ${data.error ?? res.status}` }]);
        return;
      }
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
        saveSession(data.sessionId);
      }
      if (data.mode === 'manager') setMode('manager');
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Помилка: ${err instanceof Error ? err.message : 'невідома'}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, sessionId]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (pathname.startsWith('/admin')) return null;

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '88px', right: '24px', zIndex: 9999,
          width: '360px', height: '520px',
          background: '#fff', borderRadius: '16px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: '#1E3A5F', padding: '14px 16px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <div style={{
              width: '32px', height: '32px', borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Bot size={18} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Підтримка FIXLINE</div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', marginTop: '1px' }}>
                {mode === 'manager' ? 'Менеджер • відповість найближчим часом' : 'AI-помічник • відповідає одразу'}
              </div>
            </div>
            <button
              onClick={() => {
                clearSession();
                setSessionId(null);
                setMessages([WELCOME]);
                setMode('ai');
              }}
              title="Нова розмова"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', opacity: 0.6, color: '#fff', fontSize: '11px' }}
            >
              ↺
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'rgba(255,255,255,0.7)' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%',
                  padding: '10px 13px',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? '#1E3A5F' : '#F1F5F9',
                  color: m.role === 'user' ? '#fff' : '#0F172A',
                  fontSize: '13.5px', lineHeight: '1.5',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.role === 'assistant' ? renderContent(m.content) : m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
                  background: '#F1F5F9', display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <Loader2 size={14} color="#64748B" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '13px', color: '#64748B' }}>
                    {mode === 'manager' ? 'Передаємо менеджеру…' : 'Відповідаю…'}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: '12px 12px',
            borderTop: '1px solid #E2E8F0',
            display: 'flex', gap: '8px', alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ваше питання…"
              rows={1}
              style={{
                flex: 1, resize: 'none', border: '1px solid #E2E8F0', borderRadius: '10px',
                padding: '8px 12px', fontSize: '13.5px', outline: 'none',
                fontFamily: 'inherit', lineHeight: '1.4', maxHeight: '96px',
                overflowY: 'auto',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: input.trim() && !loading ? '#1E3A5F' : '#CBD5E1',
                border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s', flexShrink: 0,
              }}
            >
              <Send size={16} color="#fff" />
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
          width: '56px', height: '56px', borderRadius: '50%',
          background: '#1E3A5F', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(30,58,95,0.4)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        aria-label="Відкрити чат підтримки"
      >
        {open ? <X size={22} color="#fff" /> : <MessageSquare size={22} color="#fff" />}
      </button>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </>
  );
}
