import { Suspense } from 'react';
import SuccessContent from './SuccessContent';
import Footer from '../components/Footer';

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
