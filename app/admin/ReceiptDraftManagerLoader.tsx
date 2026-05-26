'use client';

import dynamic from 'next/dynamic';

const ReceiptDraftManager = dynamic(() => import('./ReceiptDraftManager'), { ssr: false });

export default function ReceiptDraftManagerLoader() {
  return <ReceiptDraftManager />;
}
