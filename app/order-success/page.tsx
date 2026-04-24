'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, ShoppingBag, Phone } from 'lucide-react';
import { Suspense } from 'react';
import Footer from '../components/Footer';

function SuccessContent() {
  const params = useSearchParams();
  const orderNum = params.get('num');
  const short = orderNum ? `#${orderNum}` : '—';
  const continuePath = params.get('from') === 'shop' ? '/shop' : '/catalog';

  return (
    <>
      <div style={{
        background: '#F8FAFC', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 16px',
      }}>
        <div style={{
          background: '#fff', borderRadius: '20px', border: '1px solid #E2E8F0',
          padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center',
        }}>
          <div style={{
            width: '72px', height: '72px', borderRadius: '50%',
            background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <CheckCircle size={36} color="#16A34A" strokeWidth={1.5} />
          </div>

          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>
            Замовлення прийнято!
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px', lineHeight: 1.6 }}>
            Дякуємо за замовлення. Наш менеджер зв&apos;яжеться з вами найближчим часом для підтвердження.
          </p>

          <div style={{
            background: '#F8FAFC', borderRadius: '12px', padding: '16px 20px',
            marginBottom: '32px', border: '1px solid #E2E8F0',
          }}>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>Номер замовлення</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#1E3A5F', letterSpacing: '0.05em' }}>
              {short}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Link href={continuePath} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              height: '46px', borderRadius: '10px', background: '#1E3A5F', color: '#fff',
              fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            }}>
              <ShoppingBag size={16} />Продовжити покупки
            </Link>
            <a href="tel:+380" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              height: '46px', borderRadius: '10px', border: '1.5px solid #E2E8F0',
              background: '#fff', color: '#475569', fontSize: '14px', fontWeight: 600,
              textDecoration: 'none',
            }}>
              <Phone size={15} />Зателефонувати менеджеру
            </a>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  );
}
