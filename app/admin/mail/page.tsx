import type { Metadata } from 'next';
import MailClient from './MailClient';
import { requireStaffPage } from '../../../lib/auth-guard';

export const metadata: Metadata = { title: 'Пошта — BuildMarket Admin' };

export default async function MailPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  return <MailClient />;
}
