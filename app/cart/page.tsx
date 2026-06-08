import type { Metadata } from 'next';
import { Suspense } from 'react';
import CartPageContent from './CartPageContent';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Кошик',
  robots: { index: false, follow: false },
};

function LoadingSpinner() {
  return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#1E3A5F', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function CartPage() {
  return (
    <>
      <Suspense fallback={<LoadingSpinner />}>
        <CartPageContent />
      </Suspense>
      <Footer />
    </>
  );
}
