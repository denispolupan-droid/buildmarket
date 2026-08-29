import Link from 'next/link';
import { buildSearchReport } from '../../../../lib/seo/report';
import ReportView from './ReportView';

// Звіт відкривається окремою вкладкою і рахується при кожному відкритті: історія
// лежить у gsc_daily, тож перемикач періоду дає те саме, що дали б збережені
// знімки, але без ризику дивитись на застарілі цифри як на свіжі.
//
// force-dynamic обов'язковий: інакше Next закешував би звіт і «свіжий» показував
// би вчорашній стан.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PERIODS = [28, 90] as const;

export default async function SeoReportPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const sp = await searchParams;
  const days: 28 | 90 = sp.days === '90' ? 90 : 28;

  let report = null;
  let error = '';
  try {
    report = await buildSearchReport(days);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <div>
      <div
        className="report-toolbar"
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, maxWidth: 1060 }}
      >
        {PERIODS.map(p => (
          <Link
            key={p}
            href={`/admin/seo/report?days=${p}`}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: days === p ? 700 : 600,
              textDecoration: 'none',
              border: `1px solid ${days === p ? 'var(--brand-blue)' : 'var(--border)'}`,
              background: days === p ? '#EAF1F8' : 'var(--bg-card)',
              color: days === p ? '#1E3A5F' : 'var(--text-secondary)',
            }}
          >
            {p} днів
          </Link>
        ))}
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          порівняння з попереднім таким самим періодом
        </span>
      </div>

      {error && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, color: 'var(--color-danger)', maxWidth: 1060 }}>
          Звіт не сформувався: {error}
        </div>
      )}

      {report && <ReportView report={report} days={days} />}

      {/* Друк: навігація на папері не потрібна, а темний фон з'їдає тонер */}
      <style>{`
        @media print {
          .report-toolbar, .fin-tabs, .admin-sidebar, nav { display: none !important; }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
