'use client';

import dynamic from 'next/dynamic';

const BankDrawerButton = dynamic(() => import('./BankDrawerButton'), { ssr: false });

type Contract = { id: string; contract_number: string; customer_id: string; customer_name: string | null; balance?: number };

export default function FinanceActions({ contracts }: { contracts: Contract[] }) {
  return <BankDrawerButton contracts={contracts} />;
}
