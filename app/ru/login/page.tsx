'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';
import { useTheme } from '../../../lib/theme';
import { getRole } from '../../../lib/user-role';
import '../../login/login.css';

function RuLoginForm() {
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const nextUrl = searchParams.get('next') || '/ru/catalog';
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Неверный email или пароль. Проверьте данные и попробуйте снова.');
      setLoading(false);
      return;
    }

    const role = getRole(data.user);

    if (role === 'dropship' || role === 'wholesale') {
      await fetch('/api/auth/sync-partner', { method: 'POST' });
    }
    if (role === 'wholesale') {
      localStorage.removeItem('fixline_cart');
    }

    if (role === 'dropship') {
      window.location.href = '/cabinet';
    } else if (data.user?.app_metadata?.role === 'admin') {
      window.location.href = '/admin';
    } else {
      window.location.href = nextUrl;
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Image src={theme === 'dark' ? '/fixline-logo-white.svg' : '/fixline-logo.svg'} alt="fixline" width={178} height={42} className="auth-logo" />
        <h1 className="auth-title">Вход в личный кабинет</h1>
        <p className="auth-sub">B2B платформа строительной химии</p>

        {error && <div className="auth-error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">Email</label>
            <input
              id="email" type="email" className="auth-input" required
              placeholder="company@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="password">Пароль</label>
            <input
              id="password" type="password" className="auth-input" required
              placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Вход...' : 'Войти →'}
          </button>
        </form>

        <hr className="auth-divider" />
        <p className="auth-footer">
          Нет аккаунта?{' '}
          <Link href={`/register${nextUrl !== '/ru/catalog' ? `?next=${nextUrl}` : ''}`}>Зарегистрироваться</Link>
        </p>
        {!nextUrl.startsWith('/ru/catalog') && !nextUrl.startsWith('/catalog') && (
          <form action={nextUrl} method="get" style={{ margin: '10px 0 0' }}>
            <button type="submit" style={{
              width: '100%', padding: '12px', borderRadius: '10px',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              border: '1.5px solid #E2E8F0', background: 'transparent', color: '#64748B',
            }}>
              Продолжить без регистрации →
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RuLoginPage() {
  return (
    <Suspense>
      <RuLoginForm />
    </Suspense>
  );
}
