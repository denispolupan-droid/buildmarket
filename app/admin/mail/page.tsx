import type { Metadata } from 'next';
import MailClient from './MailClient';

export const metadata: Metadata = { title: 'Пошта — BuildMarket Admin' };

export default function MailPage() {
  return <MailClient />;
}
