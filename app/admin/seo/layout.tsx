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
      {/* Звіт — окрема вкладка браузера, а не сьома закладка розділу: його
          відкривають, щоб подивитись цілісну картину або відправити, а не щоб
          працювати всередині. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SeoTabs />
        <span style={{ flex: 1 }} />
        <a
          href="/admin/seo/report"
          target="_blank"
          rel="noopener"
          className="seo-report-btn"
          style={{
            height: 32, padding: '0 14px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 7,
            border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
            fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
          }}
          title="Динаміка, джерела трафіку, запити без кліків і висновки — однією сторінкою"
        >
          Сформувати зведений звіт ↗
        </a>
      </div>
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}
