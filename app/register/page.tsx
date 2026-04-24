'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import '../login/login.css';

const ACCOUNT_TYPES = [
  { value: 'dealer',      label: 'Дилер' },
  { value: 'wholesale',   label: 'Оптовик' },
  { value: 'contractor',  label: 'Підрядник' },
  { value: 'retail',      label: 'Роздріб' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [company,     setCompany]     = useState('');
  const [accountType, setAccountType] = useState('dealer');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Пароль має бути не менше 6 символів.');
      return;
    }

    setLoading(true);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { company_name: company, account_type: accountType },
      },
    });

    if (error) {
      setError(error.message === 'User already registered'
        ? 'Цей email вже зареєстровано. Спробуйте увійти.'
        : 'Помилка реєстрації. Спробуйте пізніше.');
      setLoading(false);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <Image src="/fixline-logo.png" alt="FIXLINE" width={144} height={36} className="auth-logo" />
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h1 className="auth-title">Акаунт створено!</h1>
          <p className="auth-sub" style={{ marginBottom: '24px' }}>
            Перевірте пошту <strong>{email}</strong> та підтвердіть реєстрацію.
          </p>
          <Link href="/login" className="auth-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            Перейти до входу
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Image src="/fixline-logo.png" alt="FIXLINE" width={144} height={36} className="auth-logo" />
        <h1 className="auth-title">Реєстрація для бізнесу</h1>
        <p className="auth-sub">Отримайте доступ до оптових цін</p>

        {error && <div className="auth-error-box">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="company">Назва компанії</label>
            <input
              id="company" type="text" className="auth-input" required
              placeholder="ТОВ «Будмайстер»"
              value={company} onChange={e => setCompany(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="account_type">Тип акаунту</label>
            <select
              id="account_type" className="auth-select"
              value={accountType} onChange={e => setAccountType(e.target.value)}
            >
              {ACCOUNT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
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
              placeholder="Мінімум 6 символів"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? 'Реєстрація...' : 'Зареєструватися →'}
          </button>
        </form>

        <hr className="auth-divider" />
        <p className="auth-footer">
          Вже є акаунт?{' '}
          <Link href="/login">Увійти</Link>
        </p>
      </div>
    </div>
  );
}
