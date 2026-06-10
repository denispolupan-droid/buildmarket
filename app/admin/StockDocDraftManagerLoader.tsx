'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const StockDocDraftManager = dynamic(() => import('./StockDocDraftManager'), { ssr: false });

export default function StockDocDraftManagerLoader() {
  return (
    <Suspense fallback={null}>
      <StockDocDraftManager />
    </Suspense>
  );
}
