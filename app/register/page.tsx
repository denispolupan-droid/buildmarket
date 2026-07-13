'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '../../lib/theme';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import '../login/login.css';

const ACCOUNT_TYPES = [
  {
    value: 'retail',
    label: 'Приватний покупець',
    sub: 'Купівля для особистих потреб від 1 шт.',
    emoji: '🛒',
    group: 'retail',
  },
  {
    value: 'dealer',
    label: 'Дилер / Дистриб\'ютор',
    sub: 'Перепродаж та дистрибуція будматеріалів.',
    emoji: '🤝',
    group: 'wholesale',
  },
  {
    value: 'contractor',
    label: 'Підрядник / Будівельна компанія',
    sub: 'Закупівля матеріалів для будівельних об\'єктів.',
    emoji: '🔨',
    group: 'wholesale',
  },
  {
    value: 'shop_owner',
    label: 'Магазин / Рітейлер',
    sub: 'Закупівля товарів для роздрібного магазину.',
    emoji: '🏪',
    group: 'wholesale',
  },
  {
    value: 'dropship',
    label: 'Дропшипер',
    sub: 'Продаж без складу — ми відправляємо Вашим клієнтам.',
    emoji: '📦',
    group: 'dropship',
  },
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email,         setEmail]         = useState('');
  const [password,      setPassword]      = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [companyName,   setCompanyName]   = useState('');
  const [phone,         setPhone]         = useState('');
  const [city,          setCity]          = useState('');
  const [taxNumber,     setTaxNumber]     = useState('');
  const [accountType,   setAccountType]   = useState('dealer');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);

  const nextUrl = searchParams.get('next') ?? '';
  const { theme } = useTheme();
  const isRetail = ACCOUNT_TYPES.find(t => t.value === accountType)?.group === 'retail';

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'dropship') setAccountType('dropship');
  }, [searchParams]);

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
        data: {
          company_name: isRetail ? '' : companyName,
          contact_person: contactPerson,
          account_type: accountType,
          phone,
          city: isRetail ? '' : city,
          tax_number: isRetail ? '' : taxNumber,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
    const isDropship = accountType === 'dropship';
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <Image src={theme === 'dark' ? '/fixline-logo-white.svg' : '/fixline-logo.svg'} alt="fixline" width={178} height={42} className="auth-logo" />
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📧</div>
          <h1 className="auth-title">Підтвердіть email</h1>
          <p className="auth-sub" style={{ marginBottom: '12px' }}>
            На адресу <strong>{email}</strong> надіслано листа з посиланням для підтвердження.
          </p>
          <div style={{
            background: '#EFF6FF', border: '1px solid #BFDBFE',
            borderRadius: '10px', padding: '14px 18px',
            fontSize: '14px', color: '#1E40AF',
            marginBottom: '24px', textAlign: 'left', lineHeight: 1.6,
          }}>
            <strong>Що робити:</strong><br />
            1. Відкрийте листа від <strong>noreply@fixline.com.ua</strong><br />
            2. Натисніть кнопку <strong>{'"'}Підтвердити email{'"'}</strong><br />
            3. {isDropship
              ? 'Після підтвердження Ви потрапите до особистого кабінету'
              : 'Після підтвердження Ви зможете увійти в акаунт'}
          </div>
          <p style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '20px' }}>
            Не знайшли листа? Перевірте папку <strong>Спам</strong>.
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
      <div className="auth-card" style={{ maxWidth: '520px' }}>
        <Image src={theme === 'dark' ? '/fixline-logo-white.svg' : '/fixline-logo.svg'} alt="fixline" width={178} height={42} className="auth-logo" />
        <h1 className="auth-title">Реєстрація</h1>
        <p className="auth-sub">Оберіть тип акаунту та заповніть форму</p>

        {error && <div className="auth-error-box">{error}</div>}

        <form onSubmit={handleSubmit}>

          {/* Account type cards */}
          <div className="auth-field">
            <label className="auth-label">Тип акаунту</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {ACCOUNT_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setAccountType(t.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                    border: accountType === t.value
                      ? '2px solid #4880B8'
                      : '1px solid var(--border)',
                    background: accountType === t.value ? '#EFF6FF' : 'var(--bg-soft)',
                    transition: 'all 0.15s', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>{t.emoji}</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: accountType === t.value ? '#1E3A5F' : 'var(--text-primary)' }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {t.sub}
                    </div>
                  </div>
                  <div style={{
                    marginLeft: 'auto', width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                    border: accountType === t.value ? 'none' : '2px solid var(--border)',
                    background: accountType === t.value ? '#4880B8' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {accountType === t.value && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="contactPerson">{isRetail ? 'ПІБ' : 'Контактна особа (ПІБ)'}</label>
            <input
              id="contactPerson" type="text" className="auth-input" required
              placeholder="Іваненко Іван"
              value={contactPerson} onChange={e => setContactPerson(e.target.value)}
            />
          </div>
          {!isRetail && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="companyName">Назва компанії</label>
              <input
                id="companyName" type="text" className="auth-input" required
                placeholder="ТОВ «Будмайстер»"
                value={companyName} onChange={e => setCompanyName(e.target.value)}
              />
            </div>
          )}
          <div className="auth-field">
            <label className="auth-label" htmlFor="phone">Телефон</label>
            <input
              id="phone" type="tel" className="auth-input" required={!isRetail}
              placeholder="+380 XX XXX XX XX"
              value={phone} onChange={e => setPhone(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">Email</label>
            <input
              id="email" type="email" className="auth-input" required
              placeholder="company@email.com"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          {!isRetail && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="city">Місто</label>
              <input
                id="city" type="text" className="auth-input" required
                placeholder="Харків"
                value={city} onChange={e => setCity(e.target.value)}
              />
            </div>
          )}
          {!isRetail && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="taxNumber">ЄДРПОУ / ІПН</label>
              <input
                id="taxNumber" type="text" className="auth-input" required
                placeholder="12345678"
                value={taxNumber} onChange={e => setTaxNumber(e.target.value)}
              />
            </div>
          )}
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
          <Link href={`/login${nextUrl ? `?next=${nextUrl}` : ''}`}>Увійти</Link>
        </p>
        <form action={nextUrl || '/cart'} method="get" style={{ margin: '10px 0 0' }}>
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

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
