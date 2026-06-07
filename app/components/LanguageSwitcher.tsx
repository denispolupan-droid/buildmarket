'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getLang, switchLangUrl } from '../../lib/lang';

export default function LanguageSwitcher() {
  const pathname = usePathname();
  const lang     = getLang(pathname);
  const altUrl   = switchLangUrl(pathname);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
      {lang === 'uk' ? (
        <span style={{ color: '#94A3B8', fontWeight: 600 }}>UA</span>
      ) : (
        <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}>UA</Link>
      )}
      <span style={{ color: '#3D5070' }}>·</span>
      {lang === 'ru' ? (
        <span style={{ color: '#94A3B8', fontWeight: 600 }}>RU</span>
      ) : (
        <Link href={altUrl} style={{ color: '#64748B', textDecoration: 'none' }}>RU</Link>
      )}
    </div>
  );
}
