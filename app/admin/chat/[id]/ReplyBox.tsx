'use client';

import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ReplyBox({ sessionId }: { sessionId: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const send = async () => {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      await fetch(`/api/admin/chat/${sessionId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      });
      setText('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{
      maxWidth: '720px', marginTop: '16px',
      background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)',
      padding: '12px', display: 'flex', gap: '10px', alignItems: 'flex-end',
    }}>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Напишіть відповідь клієнту… (Enter — надіслати, Shift+Enter — новий рядок)"
        rows={2}
        style={{
          flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '8px 12px', fontSize: '13.5px', outline: 'none',
          fontFamily: 'inherit', lineHeight: '1.4', maxHeight: '120px', overflowY: 'auto',
        }}
      />
      <button
        onClick={send}
        disabled={!text.trim() || loading}
        style={{
          width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0,
          background: text.trim() && !loading ? '#1E3A5F' : '#CBD5E1',
          border: 'none', cursor: text.trim() && !loading ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}
      >
        {loading
          ? <Loader2 size={16} color="#fff" style={{ animation: 'spin 1s linear infinite' }} />
          : <Send size={16} color="#fff" />
        }
      </button>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
