import FinanceTabs from '../FinanceTabs';
import { requireStaffPage } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase';
import { kyivMonthStart, kyivYmd } from '../../../../lib/kyiv-date';
import { buildIncomeBook, INCOME_METHODS, METHOD_LABEL, SOURCE_LABEL, type IncomeRow } from '../../../../lib/accounting/income-book';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Книга доходів — Фінанси' };

// Книга обліку доходів ФОП (єдиний податок): гроші, що надійшли, на дату
// надходження — касовий метод. Визначення й звірка — міграція 142. До аудиту
// 31.10.2026 цього звіту не було взагалі, хоча дані в леджері є.

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dayLabel = (ymd: string) => `${ymd.slice(8, 10)}.${ymd.slice(5, 7)}.${ymd.slice(0, 4)}`;
const inp = {
  height: '34px', padding: '0 10px', borderRadius: '8px', width: '138px',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
} as const;
const isYmd = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function IncomeBookPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaffPage('admin');
  const sp = await searchParams;
  const now = new Date();
  const from = isYmd(sp.from) ? sp.from! : kyivMonthStart(now);
  const to   = isYmd(sp.to)   ? sp.to!   : kyivYmd(now);

  const db = createServiceClient();
  const { data, error } = await db.rpc('fop_income_book', { p_from: from, p_to: to });
  const book = buildIncomeBook((data ?? []) as IncomeRow[]);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Книга обліку доходів</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          ФОП, єдиний податок — гроші, що надійшли від покупців, маркетплейсів і за наложку, на дату надходження
        </p>
      </div>

      <FinanceTabs />
      <div style={{ height: '20px' }} />

      <form method="get" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        <input type="date" name="from" defaultValue={from} style={inp} />
        <span style={{ color: 'var(--text-muted)' }}>—</span>
        <input type="date" name="to" defaultValue={to} style={inp} />
        <button type="submit" className="fin-pill active" style={{ cursor: 'pointer' }}>Показати</button>
        <a href={`/api/admin/finance/income-book/export?from=${from}&to=${to}`} className="fin-pill" style={{ marginLeft: 'auto' }}>
          Експорт XLSX
        </a>
      </form>

      {error && <div className="fin-card" style={{ color: '#DC2626', fontSize: 13, marginBottom: 16 }}>Помилка: {error.message}</div>}

      <div className="fin-kpi-row" style={{ marginBottom: 20 }}>
        <div className="fin-card">
          <div className="fin-kpi-label">Дохід за період</div>
          <div className="fin-money-val" style={{ color: '#15803D' }}>{fmt(book.total)} ₴</div>
          <div className="fin-money-sub">{book.txns} надходжень</div>
        </div>
        {INCOME_METHODS.map(m => (
          <div key={m} className="fin-card">
            <div className="fin-kpi-label">{METHOD_LABEL[m]}</div>
            <div className="fin-money-val">{fmt(book.byMethod[m])} ₴</div>
          </div>
        ))}
      </div>

      <div className="fin-card" style={{ marginBottom: 20 }}>
        <div className="fin-card-title">Склад надходжень</div>
        <table className="fin-table">
          <tbody>
            {Object.entries(book.bySource).sort((a, b) => b[1] - a[1]).map(([src, amt]) => (
              <tr key={src}><td>{SOURCE_LABEL[src] ?? src}</td><td className="num">{fmt(amt)} ₴</td></tr>
            ))}
            {!Object.keys(book.bySource).length && <tr><td className="muted">Надходжень за період немає</td></tr>}
          </tbody>
        </table>
        <div className="fin-hint">
          Касовий метод: виплата RozetkaPay приходить до вручення, наложка — реєстрами НоваПей, тож сума
          відрізняється від виручки за відвантаженнями у «Звітах». Комісія, яку маркетплейс утримав із
          виплати, тут не додається — її видно у «Звітах» окремим рядком.
        </div>
      </div>

      {book.months.map(mo => (
        <div key={mo.month} className="fin-card" style={{ marginBottom: 16, overflowX: 'auto' }}>
          <div className="fin-card-title">{monthLabel(mo.month)} · {fmt(mo.total)} ₴</div>
          <table className="fin-table">
            <thead>
              <tr style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <td>Дата</td>
                {INCOME_METHODS.map(m => <td key={m} className="num">{METHOD_LABEL[m]}</td>)}
                <td className="num">Разом</td>
                <td className="num">Операцій</td>
              </tr>
            </thead>
            <tbody>
              {mo.days.map(d => (
                <tr key={d.day}>
                  <td>{dayLabel(d.day)}</td>
                  {INCOME_METHODS.map(m => <td key={m} className={'num' + (d.byMethod[m] ? '' : ' muted')}>{d.byMethod[m] ? fmt(d.byMethod[m]) : '—'}</td>)}
                  <td className="num">{fmt(d.total)}</td>
                  <td className="num muted">{d.txns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
