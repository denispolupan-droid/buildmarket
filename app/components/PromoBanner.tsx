'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '../../lib/supabase-browser';

const WHOLESALE_TYPES = ['dealer', 'contractor', 'shop_owner'];

export default function PromoBanner() {
  const [href, setHref] = useState('/shop?sale=1');

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: { user_metadata?: { account_type?: string } } | null } }) => {
      const type = data.user?.user_metadata?.account_type;
      if (WHOLESALE_TYPES.includes(type ?? '')) {
        setHref('/catalog?sale=1');
      }
    });
  }, []);

  return (
    <div style={{ background: '#243F63', padding: '4px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>
        ⚡ 🎁 ВЕСНЯНА{' '}
        <Link href={href} style={{
          color: '#FCD34D', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 800,
        }}>
          АКЦІЯ
        </Link>
        ! Знижки до{' '}
        <span style={{ color: '#FCD34D', fontWeight: 800 }}>25%</span>{' '}
        на герметики та монтажні піни до кінця квітня ⚡
      </span>
    </div>
  );
}
