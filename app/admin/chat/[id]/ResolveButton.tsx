'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle } from 'lucide-react';

export default function ResolveButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const resolve = async () => {
    setLoading(true);
    await fetch(`/api/admin/chat/${sessionId}/resolve`, { method: 'POST' });
    router.refresh();
    setLoading(false);
  };

  return (
    <button
      onClick={resolve}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        height: '36px', padding: '0 16px', borderRadius: '9px',
        background: loading ? '#F1F5F9' : '#F0FDF4',
        color: loading ? '#94A3B8' : '#16A34A',
        border: `1px solid ${loading ? '#E2E8F0' : '#BBF7D0'}`,
        fontSize: '13px', fontWeight: 600, cursor: loading ? 'default' : 'pointer',
      }}
    >
      <CheckCircle size={15} />
      {loading ? 'Збереження…' : 'Позначити вирішеним'}
    </button>
  );
}
