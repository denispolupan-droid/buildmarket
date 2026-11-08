'use client';

import { useState } from 'react';
import { useAdminQuery } from '../../../lib/admin/api';

type Sender = { name: string; email: string };

/** Відправники листів постачальникам. Вибір менеджера має пріоритет над типовим. */
export function useSenders() {
  const { data } = useAdminQuery<{ senders?: Sender[]; defaultSender?: string }>('/api/admin/procurement/senders');
  const senders = data?.senders ?? [];
  const [picked, setChosenSender] = useState<string | null>(null);
  const chosenSender = picked ?? (data?.defaultSender || senders[0]?.email || '');
  return { senders, chosenSender, setChosenSender };
}
