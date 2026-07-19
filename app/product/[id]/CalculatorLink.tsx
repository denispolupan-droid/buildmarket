import Link from 'next/link';
import { Calculator } from 'lucide-react';

// Лінк-віджет «порахувати витрату» для товарів, де CoverageCalculator безсилий:
// герметики (витрата від шва), монтажна піна (від зазору), монтажний клей
// (від джгута) — рахуються не «на м²», а в /calculators.

type Kind = { anchor: string; uk: string; ru: string };

function resolveKind(categorySlug: string | null): Kind | null {
  if (!categorySlug) return null;
  const s = categorySlug.toLowerCase();
  if (s.includes('strichka')) return null; // стрічки — не рахуються калькулятором
  if (s.includes('hermetyk') || s.includes('germetyk')) {
    return { anchor: 'sealant', uk: 'Скільки герметика потрібно на ваш шов?', ru: 'Сколько герметика нужно на ваш шов?' };
  }
  if (s.includes('pina')) {
    return { anchor: 'foam', uk: 'Скільки балонів піни на ваші вікна чи двері?', ru: 'Сколько баллонов пены на ваши окна или двери?' };
  }
  if (s === 'montazhnyi-klei') {
    return { anchor: 'glue', uk: 'На скільки метрів вистачить картриджа?', ru: 'На сколько метров хватит картриджа?' };
  }
  return null;
}

export default function CalculatorLink({ categorySlug, locale = 'uk' }: {
  categorySlug: string | null;
  locale?: 'uk' | 'ru';
}) {
  const kind = resolveKind(categorySlug);
  if (!kind) return null;

  const href = `${locale === 'ru' ? '/ru' : ''}/calculators#${kind.anchor}`;
  const question = locale === 'ru' ? kind.ru : kind.uk;
  const cta = locale === 'ru' ? 'Посчитать расход' : 'Порахувати витрату';

  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      background: 'rgba(72,128,184,0.06)', border: '1px solid rgba(72,128,184,0.22)',
      borderRadius: '12px', padding: '12px 16px', marginTop: '12px',
      textDecoration: 'none',
    }}>
      <span style={{
        width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
        background: 'linear-gradient(135deg, rgba(72,128,184,0.14) 0%, rgba(20,184,166,0.14) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Calculator size={17} color="#4880B8" />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {question}
        </span>
        <span style={{ display: 'block', fontSize: '12px', color: '#4880B8', fontWeight: 600, marginTop: '1px' }}>
          {cta} →
        </span>
      </span>
    </Link>
  );
}
