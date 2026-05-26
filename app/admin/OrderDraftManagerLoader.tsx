'use client';

import dynamic from 'next/dynamic';

const OrderDraftManager = dynamic(() => import('./OrderDraftManager'), { ssr: false });

export default function OrderDraftManagerLoader() {
  return <OrderDraftManager />;
}
