import { requireStaffPage } from '../../../lib/auth-guard';
import SeoTabs from './SeoTabs';

// Спільна оболонка розділу: один гейт на всі екрани (раніше сторінка робила
// getUser() + перевірку ролі вручну, а API-роути поруч — кожен по-своєму).
export default async function SeoLayout({ children }: { children: React.ReactNode }) {
  await requireStaffPage('admin');

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1400 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>SEO</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 14px' }}>
        Пошуковий трафік: що вже ранжується і що з цим робити
      </p>
      <SeoTabs />
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}
