'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountType,   setAccountType]   = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [done,        setDone]        = useState(false);

  const nextUrl = searchParams.get('next') ?? '';
  const { theme } = useTheme();
  const hasType  = accountType !== '';
  const isRetail = ACCOUNT_TYPES.find(t => t.value === accountType)?.group === 'retail';
  const card2Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'dropship') setAccountType('dropship');
  }, [searchParams]);

  // Bring step 2 into view every time the account type is (re)picked — keyed on
  // accountType rather than hasType, since switching between two already-selected
  // types keeps hasType true the whole time and wouldn't otherwise re-trigger this.
  // Waits for the reveal animation (350ms) to finish so the target is the card's
  // final expanded spot, not a mid-animation guess (firing early undershoots).
  useEffect(() => {
    if (!accountType) return;
    const t = setTimeout(() => {
      card2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 380);
    return () => clearTimeout(t);
  }, [accountType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Пароль має бути не менше 6 символів.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Паролі не збігаються.');
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
      // Кажемо людині, ЩО саме не так: інцидент 01.09.2026 — клієнт 8 разів
      // ловив відмову «слабкий пароль» від Supabase, а бачив «спробуйте пізніше».
      const code = (error as { code?: string }).code ?? '';
      if (code === 'weak_password' || /weak|easy to guess/i.test(error.message)) {
        setError('Цей пароль надто простий або зустрічається в базах витоків. Придумайте складніший — довший, з літерами та цифрами.');
      } else if (error.message === 'User already registered' || code === 'user_already_exists') {
        setError('Цей email вже зареєстровано. Спробуйте увійти.');
      } else if (code === 'over_email_send_rate_limit' || /rate limit/i.test(error.message)) {
        setError('Забагато спроб поспіль. Зачекайте хвилину і спробуйте ще раз.');
      } else if (/invalid.*email|email.*invalid/i.test(error.message)) {
        setError('Перевірте email — адреса виглядає некоректною.');
      } else {
        setError('Помилка реєстрації. Спробуйте пізніше або напишіть нам — допоможемо.');
      }
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
      <div style={{ width: '100%', maxWidth: '520px' }}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Card 1 — logo/title + step 1 (account type), a fully separate card from step 2 */}
          <div className="auth-card" style={{ maxWidth: 'none' }}>
          <Image src={theme === 'dark' ? '/fixline-logo-white.svg' : '/fixline-logo.svg'} alt="fixline" width={178} height={42} className="auth-logo" />
          <h1 className="auth-title">Реєстрація</h1>
          <p className="auth-sub">Оберіть тип акаунту та заповніть форму</p>

          {error && <div className="auth-error-box">{error}</div>}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                background: '#4880B8', color: '#fff', fontSize: '12px', fontWeight: 700,
              }}>1</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Тип акаунту
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                    background: accountType === t.value ? '#EFF6FF' : 'var(--bg-card)',
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
          </div>

          {/* Card 2 — hidden until a type is picked, then slides/fades in below card 1 */}
          <div style={{ display: 'grid', gridTemplateRows: hasType ? '1fr' : '0fr', transition: 'grid-template-rows 0.35s ease' }}>
          <div style={{ minHeight: 0, overflow: 'hidden', opacity: hasType ? 1 : 0, transform: hasType ? 'translateY(0)' : 'translateY(-8px)', transition: 'opacity 0.3s ease 0.05s, transform 0.3s ease 0.05s' }}>
          <div className="auth-card" ref={card2Ref} style={{ maxWidth: 'none', padding: '24px 28px', scrollMarginTop: '68px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
              background: '#4880B8', color: '#fff', fontSize: '12px', fontWeight: 700,
            }}>2</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Контактні дані
            </span>
          </div>

          {/* Paired up 2-per-row (auto-fit collapses to 1 column on narrow screens) instead
              of one field per row — cuts the section's height roughly in half so it fits
              on screen after the auto-scroll above, without extra scrolling. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="auth-field" style={{ marginBottom: 0 }}>
              <label className="auth-label" htmlFor="contactPerson">{isRetail ? 'ПІБ' : 'Контактна особа (ПІБ)'}</label>
              <input
                id="contactPerson" type="text" className="auth-input" required
                placeholder="Іваненко Іван"
                value={contactPerson} onChange={e => setContactPerson(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isRetail ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              {/* Collapses shut (grid-template-rows 0fr) + fades instead of unmounting, so
                  switching account type animates these in/out smoothly. */}
              <div style={{ display: 'grid', gridTemplateRows: isRetail ? '0fr' : '1fr', transition: 'grid-template-rows 0.3s ease' }}>
                <div style={{ minHeight: 0, overflow: 'hidden', opacity: isRetail ? 0 : 1, transition: 'opacity 0.2s ease' }}>
                  <div className="auth-field" style={{ marginBottom: 0 }}>
                    <label className="auth-label" htmlFor="companyName">Назва компанії</label>
                    <input
                      id="companyName" type="text" className="auth-input" required={!isRetail}
                      placeholder="ТОВ «Будмайстер»"
                      value={companyName} onChange={e => setCompanyName(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="auth-field" style={{ marginBottom: 0 }}>
                <label className="auth-label" htmlFor="phone">Телефон</label>
                <input
                  id="phone" type="tel" className="auth-input" required={!isRetail}
                  placeholder="+380 XX XXX XX XX"
                  value={phone} onChange={e => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* City + tax number collapse as a single row (not per-field) so retail mode
                doesn't leave a stray row-gap where two independently-collapsed fields met. */}
            <div style={{ display: 'grid', gridTemplateRows: isRetail ? '0fr' : '1fr', transition: 'grid-template-rows 0.3s ease' }}>
              <div style={{ minHeight: 0, overflow: 'hidden', opacity: isRetail ? 0 : 1, transition: 'opacity 0.2s ease' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                  <div className="auth-field" style={{ marginBottom: 0 }}>
                    <label className="auth-label" htmlFor="city">Місто</label>
                    <input
                      id="city" type="text" className="auth-input" required={!isRetail}
                      placeholder="Харків"
                      value={city} onChange={e => setCity(e.target.value)}
                    />
                  </div>
                  <div className="auth-field" style={{ marginBottom: 0 }}>
                    <label className="auth-label" htmlFor="taxNumber">ЄДРПОУ / ІПН</label>
                    <input
                      id="taxNumber" type="text" className="auth-input" required={!isRetail}
                      placeholder="12345678"
                      value={taxNumber} onChange={e => setTaxNumber(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="auth-field" style={{ marginBottom: 0 }}>
              <label className="auth-label" htmlFor="email">Email</label>
              <input
                id="email" type="email" className="auth-input" required
                placeholder="company@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              <div className="auth-field" style={{ marginBottom: 0 }}>
                <label className="auth-label" htmlFor="password">Пароль</label>
                <input
                  id="password" type="password" className="auth-input" required
                  placeholder="Мінімум 6 символів"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>
              <div className="auth-field" style={{ marginBottom: 0 }}>
                <label className="auth-label" htmlFor="confirmPassword">Підтвердіть пароль</label>
                <input
                  id="confirmPassword" type="password" className="auth-input" required
                  placeholder="Повторіть пароль"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          <button type="submit" className="auth-btn" disabled={loading} style={{ marginTop: '18px' }}>
            {loading ? 'Реєстрація...' : 'Зареєструватися →'}
          </button>
          </div>
          </div>
          </div>
      </form>

      <div className="auth-card" style={{ maxWidth: 'none', marginTop: '20px', padding: '20px 32px', textAlign: 'center' }}>
        <p className="auth-footer" style={{ margin: 0 }}>
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
