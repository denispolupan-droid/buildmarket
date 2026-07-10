'use client';

import { useState } from 'react';
import { Mail, Check } from 'lucide-react';

export default function CopyEmailButton({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(email).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Скопійовано!' : email}
      className="btn-social"
      style={{
        width: '36px', height: '36px', borderRadius: '8px',
        background: copied ? 'rgba(61,191,184,0.15)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${copied ? 'rgba(61,191,184,0.4)' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: copied ? '#3DBFB8' : '#94A3B8',
        cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      {copied ? <Check size={18} strokeWidth={2.5} /> : <Mail size={20} strokeWidth={2} />}
    </button>
  );
}
