import { redirect } from 'next/navigation';
import { requireStaffPage } from '../../../../../lib/auth-guard';

// Акт звірки з покупцем тепер у «Взаєморозрахунках» (перемикач «Акт звірки»).
export default async function CustomerActRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireStaffPage('admin');
  const { customerId } = await params;
  const { from, to } = await searchParams;
  const qs = new URLSearchParams({ cp: `c:${decodeURIComponent(customerId)}`, view: 'act' });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  redirect(`/admin/finance/mutual?${qs}`);
}
