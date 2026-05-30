'use client';

import { useState, useEffect } from 'react';
import { Trash2, Send, Loader2, UserPlus, ShieldCheck, User } from 'lucide-react';
import { showToast } from '../../../lib/toast';

type UserEntry = {
  id: string;
  email: string;
  role: 'admin' | 'manager';
  name: string;
  created_at: string;
  last_sign_in_at: string | null;
  invited_at: string | null;
};

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px', borderRadius: '8px',
  border: '1.5px solid var(--border)', fontSize: '13px',
  color: 'var(--text-primary)', background: 'var(--bg-soft)', outline: 'none',
};

export default function UsersSettings() {
  const [users,   setUsers]   = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [email,   setEmail]   = useState('');
  const [name,    setName]    = useState('');
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users ?? []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function invite() {
    if (!email.includes('@')) { showToast('Введіть коректний email', 'error'); return; }
    setSending(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка', 'error'); return; }
      showToast(`Запрошення надіслано на ${email}`, 'success');
      setEmail(''); setName('');
      await load();
    } finally { setSending(false); }
  }

  async function remove(id: string) {
    if (!confirm('Видалити менеджера?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка видалення', 'error'); return; }
      setUsers(prev => prev.filter(u => u.id !== id));
    } finally { setDeleting(null); }
  }

  function fmtDate(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <ShieldCheck size={16} color="var(--brand-blue)" />
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Користувачі</span>
      </div>

      {/* User list */}
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '13px', padding: '8px 0' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження…
          </div>
        ) : users.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Немає користувачів</div>
        ) : users.map(u => (
          <div key={u.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '9px 12px', borderRadius: '8px',
            background: 'var(--bg-soft)', border: '1px solid var(--border)',
          }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
              background: u.role === 'admin' ? '#DBEAFE' : '#F0FDF4',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {u.role === 'admin'
                ? <ShieldCheck size={13} color="#1D4ED8" />
                : <User size={13} color="#15803D" />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.name || u.email}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px',
                  color: u.role === 'admin' ? '#1D4ED8' : '#15803D',
                  background: u.role === 'admin' ? '#DBEAFE' : '#DCFCE7',
                  flexShrink: 0,
                }}>
                  {u.role === 'admin' ? 'Адмін' : 'Менеджер'}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', display: 'flex', gap: '10px' }}>
                <span>{u.email}</span>
                {u.last_sign_in_at
                  ? <span>Останній вхід: {fmtDate(u.last_sign_in_at)}</span>
                  : u.invited_at
                  ? <span style={{ color: '#F59E0B' }}>⏳ Запрошення не прийнято</span>
                  : null}
              </div>
            </div>

            {u.role === 'manager' && (
              <button
                onClick={() => remove(u.id)}
                disabled={deleting === u.id}
                title="Видалити менеджера"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '30px', height: '30px', borderRadius: '7px',
                  border: '1px solid #FCA5A5', background: 'none',
                  color: '#EF4444', cursor: deleting === u.id ? 'default' : 'pointer',
                  opacity: deleting === u.id ? 0.5 : 1, flexShrink: 0,
                }}
              >
                {deleting === u.id
                  ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                  : <Trash2 size={13} />}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Invite form */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <UserPlus size={12} /> Запросити менеджера
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ім'я"
            style={{ ...inp, width: '150px' }}
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && invite()}
            placeholder="email@example.com"
            type="email"
            style={{ ...inp, flex: 1, minWidth: '200px' }}
          />
          <button
            onClick={invite}
            disabled={sending || !email.includes('@')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              height: '36px', padding: '0 16px', borderRadius: '8px',
              border: 'none', fontSize: '13px', fontWeight: 700,
              background: email.includes('@') ? '#1E3A5F' : '#94A3B8',
              color: '#fff', cursor: sending || !email.includes('@') ? 'default' : 'pointer',
            }}
          >
            {sending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
            Надіслати запрошення
          </button>
        </div>

      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
