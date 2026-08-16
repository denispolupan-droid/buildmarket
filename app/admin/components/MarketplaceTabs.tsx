'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/* ── SVG logos ─────────────────────────────────────────────────────────────── */

function PromLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="16" height="16" rx="3.5" stroke="#7C3AED" strokeWidth="2.2"/>
      </svg>
      <span style={{ fontSize: 15, fontWeight: 800, color: '#7C3AED', letterSpacing: '-0.3px', fontFamily: 'inherit' }}>
        prom
      </span>
    </span>
  );
}

function RozetkaLogo() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9.5" fill="#00A046"/>
        <ellipse cx="7"  cy="8.2" rx="1.4" ry="1.6" fill="white"/>
        <ellipse cx="13" cy="8.2" rx="1.4" ry="1.6" fill="white"/>
        <path d="M6.2 12.5 Q10 16.2 13.8 12.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
      </svg>
      <span style={{ fontSize: 13, fontWeight: 900, color: '#111', letterSpacing: '0.8px', fontFamily: 'inherit' }}>
        ROZETKA
      </span>
    </span>
  );
}

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface Tab   { href: string; label: string }
interface Props {
  /** на якій площадці ми зараз — вона підсвічена в перемикачі */
  active:      'prom' | 'rozetka';
  activeBg:    string;   // soft rgba for active tab background
  activeText:  string;   // darker solid color for active tab text
  tabs:        Tab[];
}

// Обидві площадки живуть під одним пунктом сайдбара «Маркетплейси», тож
// перемикач між ними — тут, зліва від вкладок самої площадки. Адреси
// лишились ті самі (/admin/prom, /admin/rozetka): закладки, посилання з
// картки товару і з телеграм-алерта модерації працюють як працювали.
const MARKETS = [
  { key: 'prom'    as const, href: '/admin/prom',    logo: <PromLogo /> },
  { key: 'rozetka' as const, href: '/admin/rozetka', logo: <RozetkaLogo /> },
];

/* ── Component ──────────────────────────────────────────────────────────────── */

export default function MarketplaceTabs({ active, activeBg, activeText, tabs }: Props) {
  const pathname = usePathname();

  const activeHref =
    tabs
      .slice()
      .sort((a, b) => b.href.length - a.href.length)
      .find(t => pathname === t.href || pathname.startsWith(t.href + '/'))?.href ?? '';

  return (
    <>
      <style>{`
        .mktab {
          display: inline-flex;
          align-items: center;
          height: 30px;
          padding: 0 15px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 500;
          color: #64748B;
          text-decoration: none;
          transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
          white-space: nowrap;
        }
        .mktab:hover:not(.mktab--active) {
          background: rgba(0,0,0,0.06);
          color: #1E293B;
          transform: translateY(-1px);
        }
        .mktab--active {
          font-weight: 600;
          transform: translateY(-1px);
        }
        /* Перемикач площадок: неактивна приглушена, але клікабельна */
        .mkswitch {
          display: inline-flex; align-items: center;
          padding: 3px 9px; border-radius: 9px;
          text-decoration: none;
          transition: opacity 0.18s ease, background 0.18s ease;
        }
        .mkswitch--off { opacity: 0.42; filter: grayscale(1); }
        .mkswitch--off:hover { opacity: 0.85; filter: grayscale(0); background: rgba(0,0,0,0.05); }
        .mkswitch--on { background: rgba(0,0,0,0.05); }
      `}</style>

      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        4,
        padding:    '12px 24px 0',
        flexShrink: 0,
      }}>

        {/* Перемикач площадок */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          2,
          paddingRight: 14,
          marginRight:  4,
          borderRight:  '1px solid rgba(0,0,0,0.1)',
        }}>
          {MARKETS.map(m => (
            <Link
              key={m.key}
              href={m.href}
              title={m.key === 'prom' ? 'Prom.ua' : 'Rozetka'}
              className={`mkswitch mkswitch--${m.key === active ? 'on' : 'off'}`}
            >
              {m.logo}
            </Link>
          ))}
        </div>

        {/* Tabs */}
        {tabs.map(t => {
          const isActive = t.href === activeHref;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`mktab${isActive ? ' mktab--active' : ''}`}
              style={isActive ? { background: activeBg, color: activeText } : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </>
  );
}
