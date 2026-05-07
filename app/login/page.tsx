'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import './login.css';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || '/catalog';
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Невірний email або пароль. Перевірте дані та спробуйте знову.');
      setLoading(false);
    } else {
      router.push(nextUrl);
      router.refresh();
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Image src="/fixline-logo.svg" alt="FIXLINE" width={182} height={34} className="auth-logo" />
        <h1 className="auth-title">Вхід в особистий кабінет</h1>
        <p className="auth-sub">B2B платформа будівельної хімії</p>

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
            {loading ? 'Вхід...' : 'Увійти →'}
          </button>
        </form>

        <hr className="auth-divider" />
        <p className="auth-footer">
          Ще немає акаунту?{' '}
          <Link href={`/register${nextUrl !== '/catalog' ? `?next=${nextUrl}` : ''}`}>Зареєструватися</Link>
        </p>
        <form action={nextUrl !== '/catalog' ? nextUrl : '/cart'} method="get" style={{ margin: '10px 0 0' }}>
          <button type="submit" style={{
            width: '100%', padding: '12px', borderRadius: '10px',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            border: '1.5px solid #E2E8F0', background: 'transparent', color: '#64748B',
          }}>
            Продовжити без реєстрації →
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
