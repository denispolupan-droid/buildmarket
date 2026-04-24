'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import './login.css';

export default function LoginPage() {
  const router = useRouter();
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
      router.push('/catalog');
      router.refresh();
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Image src="/fixline-logo.png" alt="FIXLINE" width={144} height={36} className="auth-logo" />
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
          <Link href="/register">Зареєструватися</Link>
        </p>
      </div>
    </div>
  );
}
