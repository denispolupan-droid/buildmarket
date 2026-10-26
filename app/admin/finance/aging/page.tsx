import { redirect } from 'next/navigation';
import { requireStaffPage } from '../../../../lib/auth-guard';

// «Старіння» прибрано з «Фінансів» (26.10.2026) — розрахунки з покупцями дивляться
// у «Взаєморозрахунках». Адреса лишається переадресацією для старих закладок.
export default async function AgingRedirect() {
  await requireStaffPage('admin');
  redirect('/admin/finance/mutual?group=customers');
}
