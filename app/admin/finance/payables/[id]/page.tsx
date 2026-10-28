import { redirect, notFound } from 'next/navigation';
import { requireStaffPage } from '../../../../../lib/auth-guard';

// Акт звірки з постачальником тепер у «Взаєморозрахунках» (перемикач «Акт звірки»).
export default async function SupplierActRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await requireStaffPage('admin');
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const { from, to } = await searchParams;
  const qs = new URLSearchParams({ cp: `s:${id}`, view: 'act' });
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  redirect(`/admin/finance/mutual?${qs}`);
}
