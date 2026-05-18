'use client';

import dynamic from 'next/dynamic';

const PoDraftManager = dynamic(() => import('./PoDraftManager'), { ssr: false });

export default function PoDraftManagerLoader() {
  return <PoDraftManager />;
}
