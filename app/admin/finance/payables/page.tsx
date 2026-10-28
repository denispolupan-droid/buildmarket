import { redirect } from 'next/navigation';
import { requireStaffPage } from '../../../../lib/auth-guard';

// «Кредиторку» замінили «Взаєморозрахунки» (28.10.2026): оплата з рознесенням
// по накладних, строки боргу, посилки в дорозі й повернені посилки — там.
// Адреса лишається переадресацією для закладок.
export default async function PayablesRedirect() {
  await requireStaffPage('admin');
  redirect('/admin/finance/mutual?group=suppliers');
}
