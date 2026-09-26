import { Suspense } from 'react';
import { requireStaffPage } from '../../../../lib/auth-guard';
import FinanceTabs from '../FinanceTabs';
import AdjustmentsClient from './AdjustmentsClient';

export const dynamic = 'force-dynamic';

// «Коригування боргу» (КБ) — аналог однойменного документа 1С: перенесення
// боргу/оплати між клієнтами й замовленнями, взаємозалік із постачальником,
// списання. Дані — лише через API документа; сторінка тримає лише каркас.
export default async function AdjustmentsPage() {
  await requireStaffPage('admin');
  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Коригування боргу</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Перенесення оплати чи боргу між клієнтами й замовленнями, взаємозалік із постачальником, списання залишків — одним документом із проводками
        </p>
      </div>
      <FinanceTabs />
      <div style={{ marginTop: '20px' }}>
        <Suspense fallback={null}>
          <AdjustmentsClient />
        </Suspense>
      </div>
    </div>
  );
}
