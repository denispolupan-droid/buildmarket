import { redirect } from 'next/navigation';
import { requireStaffPage } from '../../../../lib/auth-guard';

// «Дебіторку» замінили «Взаєморозрахунки» (26.10.2026). Адреса лишається
// переадресацією, щоб не ламались закладки й старі посилання з ?customerId=.
export default async function SettlementsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  await requireStaffPage('admin');
  const { customerId } = await searchParams;
  redirect(customerId
    ? `/admin/finance/mutual?cp=${encodeURIComponent(`c:${customerId}`)}`
    : '/admin/finance/mutual?group=customers');
}
