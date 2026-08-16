import { requireStaffPage } from '../../../lib/auth-guard';
import ProcurementTabs from './ProcurementTabs';

// Спільна оболонка розділу: один гейт на всі екрани замість перевірки ролі
// вручну в кожній сторінці (сторінки залишків прийшли сюди саме з таким
// ad-hoc `getUser()` + `role !== 'admin'`).
export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage('admin');

  return (
    <div style={{ padding: '28px 32px 64px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Закупівля</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 14px' }}>
        Що замовити, що прийшло і скільки лишилось на складі
      </p>
      <ProcurementTabs />
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}
