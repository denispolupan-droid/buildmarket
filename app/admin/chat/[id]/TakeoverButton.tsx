'use client';

import { useState } from 'react';
import { Bot, UserCheck } from 'lucide-react';

export default function TakeoverButton({ sessionId, initialAiEnabled }: { sessionId: string; initialAiEnabled: boolean }) {
  const [aiEnabled, setAiEnabled] = useState(initialAiEnabled);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/chat/${sessionId}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_enabled: !aiEnabled }),
      });
      if (res.ok) setAiEnabled(v => !v);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        padding: '8px 16px', borderRadius: '8px', border: 'none',
        cursor: loading ? 'wait' : 'pointer', fontWeight: 600, fontSize: '13px',
        background: aiEnabled ? '#FEF3C7' : '#DCFCE7',
        color:      aiEnabled ? '#92400E' : '#166534',
        transition: 'all 0.15s',
      }}
    >
      {aiEnabled
        ? <><UserCheck size={15} /> Перехопити чат</>
        : <><Bot size={15} /> Повернути AI</>
      }
    </button>
  );
}
