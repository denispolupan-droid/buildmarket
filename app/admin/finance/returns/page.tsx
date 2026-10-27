import { Suspense } from 'react';
import { requireStaffPage } from '../../../../lib/auth-guard';
import FinanceTabs from '../FinanceTabs';
import ReturnsClient from './ReturnsClient';

export const dynamic = 'force-dynamic';

// Журнал повернень: ПВ (від покупця: заявка → товар отримано) і ПП
// (постачальнику: відправлено → прийнято) з ланцюжком РН → ПВ → ПП,
// проводками й друкованими формами. Дані — лише через API документа.
export default async function ReturnsPage() {
  await requireStaffPage('admin', 'manager');
  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Повернення</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Від покупців (заявка → товар отримано → проводки) і постачальникам (відправлено → прийнято) — одним журналом, з ланцюжком документів і друкованими формами
        </p>
      </div>
      <FinanceTabs />
      <div style={{ marginTop: '20px' }}>
        <Suspense fallback={null}>
          <ReturnsClient />
        </Suspense>
      </div>
    </div>
  );
}
