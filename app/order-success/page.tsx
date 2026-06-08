import type { Metadata } from 'next';
import { Suspense } from 'react';
import SuccessContent from './SuccessContent';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Замовлення оформлено | FIXLINE',
  robots: { index: false, follow: false },
};

export default function OrderSuccessPage() {
  return (
    <>
      <Suspense>
        <SuccessContent />
      </Suspense>
      <Footer />
    </>
  );
}
