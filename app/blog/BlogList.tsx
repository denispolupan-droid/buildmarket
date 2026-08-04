'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, ArrowRight, Search, X } from 'lucide-react';
import Reveal from '../components/Reveal';

// Список статей із пошуком. Компонент клієнтський, але Next рендерить його і на
// сервері, тож усі картки є в початковому HTML — пошук нічого не ховає від
// індексації. Фільтруємо вже завантажений масив: запитів на сервер немає.

export type BlogItem = {
  slug: string;
  href: string;
  title: string;
  description: string;
  category: string;
  readTime: number;
  image: string | null;
};

const T = {
  uk: {
    placeholder: 'Пошук статті за назвою або темою…',
    found: (n: number) => `Знайдено ${n} ${plural(n, 'стаття', 'статті', 'статей')}`,
    empty: 'Нічого не знайшли за цим запитом',
    emptyHint: 'Спробуйте коротший запит — наприклад, «піна» або «ґрунтовка».',
    reset: 'Скинути пошук',
    minLong: 'хв читання',
    min: 'хв',
    readLong: 'Читати статтю',
    read: 'Читати',
  },
  ru: {
    placeholder: 'Поиск статьи по названию или теме…',
    found: (n: number) => `Найдено ${n} ${plural(n, 'статья', 'статьи', 'статей')}`,
    empty: 'Ничего не нашли по этому запросу',
    emptyHint: 'Попробуйте запрос короче — например, «пена» или «грунтовка».',
    reset: 'Сбросить поиск',
    minLong: 'мин чтения',
    min: 'мин',
    readLong: 'Читать статью',
    read: 'Читать',
  },
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/**
 * Пошук підрядком ламається на відмінках: «піна» не входить у «монтажної піни»,
 * «ґрунтовка» — у «ґрунтовки». Тому кожне слово запиту від 4 літер обрізаємо до
 * основи (мінус два останні символи, але не коротше трьох) і шукаємо за
 * префіксом слова. Усі слова запиту мають збігтися — інакше довгий запит
 * повертав би все підряд.
 */
function matches(haystack: string, query: string): boolean {
  const hay = haystack.toLowerCase();
  const words = hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return query.split(/\s+/).filter(Boolean).every(term => {
    if (hay.includes(term)) return true;
    if (term.length < 4) return false;
    const stem = term.slice(0, Math.max(3, term.length - 2));
    return words.some(w => w.startsWith(stem));
  });
}

function Card({ a, t, lead }: { a: BlogItem; t: typeof T['uk']; lead?: boolean }) {
  if (lead) {
    return (
      <Link href={a.href} className="blog-card blog-lead" style={{
        display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '0',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: '20px', overflow: 'hidden', textDecoration: 'none', marginBottom: '32px',
      }}>
        {a.image && (
          <div style={{ position: 'relative', minHeight: '260px' }}>
            <Image src={a.image} alt={a.title} fill sizes="(max-width: 900px) 100vw, 55vw" priority style={{ objectFit: 'cover' }} />
          </div>
        )}
        <div style={{ padding: '32px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'var(--brand-blue-light)', color: 'var(--brand-blue)' }}>{a.category}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} /> {a.readTime} {t.minLong}
            </span>
          </div>
          <h2 style={{ fontSize: 'clamp(20px, 2.2vw, 26px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 12px', lineHeight: 1.3, letterSpacing: '-0.3px' }}>{a.title}</h2>
          <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 18px' }}>{a.description}</p>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            {t.readLong} <ArrowRight size={15} />
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link href={a.href} className="blog-card" style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: '16px', overflow: 'hidden', textDecoration: 'none',
    }}>
      {a.image && (
        <div style={{ position: 'relative', aspectRatio: '1200 / 630' }}>
          <Image src={a.image} alt={a.title} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" style={{ objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: 'var(--brand-blue-light)', color: 'var(--brand-blue)' }}>{a.category}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={11} /> {a.readTime} {t.min}
          </span>
        </div>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.4 }}>{a.title}</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>{a.description}</p>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto' }}>
          {t.read} <ArrowRight size={14} />
        </span>
      </div>
    </Link>
  );
}

export default function BlogList({ items, lang }: { items: BlogItem[]; lang: 'uk' | 'ru' }) {
  const [query, setQuery] = useState('');
  const t = T[lang];
  const q = query.trim().toLowerCase();

  const found = useMemo(() => {
    if (!q) return items;
    return items.filter(a => matches(`${a.title} ${a.description} ${a.category}`, q));
  }, [items, q]);

  const searching = q.length > 0;
  const [lead, ...rest] = found;

  return (
    <>
      {/* Пошук */}
      <div style={{ position: 'relative', maxWidth: '520px', marginBottom: searching ? '20px' : '32px' }}>
        <Search size={17} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          style={{
            width: '100%', height: '48px', padding: '0 44px 0 44px',
            borderRadius: '12px', border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            fontSize: '14px', outline: 'none',
          }}
        />
        {searching && (
          <button
            onClick={() => setQuery('')}
            aria-label={t.reset}
            style={{
              position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
              width: '28px', height: '28px', borderRadius: '8px', border: 'none',
              background: 'var(--bg-soft)', color: 'var(--text-muted)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {searching && (
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px' }}>
          {found.length > 0 ? t.found(found.length) : ''}
        </p>
      )}

      {found.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px' }}>
          <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>{t.empty}</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 18px' }}>{t.emptyHint}</p>
          <button
            onClick={() => setQuery('')}
            style={{
              height: '40px', padding: '0 20px', borderRadius: '10px', border: 'none',
              background: 'var(--brand-blue)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {t.reset}
          </button>
        </div>
      ) : searching ? (
        // Під час пошуку — рівна сітка без ліда й без анімації появи:
        // Reveal на кожне натискання клавіші давав би блимання.
        <div className="blog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          {found.map(a => <Card key={a.slug} a={a} t={t} />)}
        </div>
      ) : (
        <>
          {lead && <Reveal><Card a={lead} t={t} lead /></Reveal>}
          <div className="blog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {rest.map((a, i) => (
              <Reveal key={a.slug} delay={(i % 3) * 70}>
                <Card a={a} t={t} />
              </Reveal>
            ))}
          </div>
        </>
      )}
    </>
  );
}
