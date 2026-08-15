'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { badge, card, hint, num, path as pathStyle, td, tdNum, th, TONE } from '../ui';
import { KIND_LABEL } from '../use-seo-actions';
import HelpBox from '../HelpBox';
import { HELP_LOG } from '../help-content';

// Головне питання розділу — «чи спрацювало». Ефект рахується ретроспективно з
// gsc_daily (28 днів до дати дії проти 28 після), тому окремі знімки «до/після»
// в момент дії не потрібні, і навіть старі записи журналу отримують замір,
// щойно набрана історія.

type WindowStats = { clicks: number; impressions: number; position: number | null; days: number };

type LogRow = {
  page_path: string;
  action: keyof typeof KIND_LABEL;
  query: string | null;
  created_at: string;
  created_by: string | null;
  cost_usd: number | null;
  meta: Record<string, unknown>;
  effect: { before: WindowStats; after: WindowStats; maturity: number } | null;
};

type Summary = {
  total: number; measured: number; improved: number;
  clicksBefore: number; clicksAfter: number; cost: number;
};

/** Скільки днів даних після дії треба, щоб взагалі про щось говорити. */
const MATURE_DAYS = 7;

export default function LogClient() {
  const [data, setData] = useState<{ rows: LogRow[]; summary: Summary } | null>(null);
  const [error, setError] = useState('');
  const [onlyMeasured, setOnlyMeasured] = useState(false);

  useEffect(() => {
    fetch('/api/admin/seo/actions?view=log&limit=300')
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setData(d);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, []);

  // Довідку показуємо і поки дані вантажаться: вона пояснює, що саме зараз
  // рахується, і чому «ще рано» — не помилка
  if (error) {
    return (
      <div>
        <HelpBox content={HELP_LOG} />
        <p style={{ color: TONE.danger }}>Журнал недоступний: {error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <HelpBox content={HELP_LOG} />
        <p style={hint}>Завантажуємо журнал…</p>
      </div>
    );
  }

  const { rows, summary } = data;
  const visible = onlyMeasured ? rows.filter(r => (r.effect?.maturity ?? 0) >= MATURE_DAYS) : rows;

  return (
    <div>
      <HelpBox content={HELP_LOG} />
      <div className="fin-kpi-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
        <Kpi label="Дій у журналі" value={num(summary.total)} sub={`витрачено $${summary.cost.toFixed(2)}`} />
        <Kpi
          label="Заміряно"
          value={num(summary.measured)}
          sub={`потрібно ${MATURE_DAYS}+ днів даних після дії`}
        />
        <Kpi
          label="Виросли в позиції"
          value={summary.measured ? `${summary.improved} з ${summary.measured}` : '—'}
          sub="позиція покращилась більш ніж на 0.5"
          tone={summary.improved > summary.measured / 2 ? 'ok' : undefined}
        />
        <Kpi
          label="Кліки до → після"
          value={`${num(summary.clicksBefore)} → ${num(summary.clicksAfter)}`}
          sub="сума по заміряних сторінках"
          tone={summary.clicksAfter > summary.clicksBefore ? 'ok' : summary.clicksAfter < summary.clicksBefore ? 'danger' : undefined}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ ...hint, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyMeasured} onChange={e => setOnlyMeasured(e.target.checked)} />
          Тільки заміряні
        </label>
        <span style={hint}>
          · Ефект рахується з історії gsc_daily: 28 днів до дати дії проти 28 після, обидві мови разом.
        </span>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-soft)' }}>
              <th style={th}>Дата</th>
              <th style={th}>Сторінка</th>
              <th style={th}>Дія</th>
              <th style={th}>Запит</th>
              <th style={{ ...th, textAlign: 'right' }}>Позиція до → після</th>
              <th style={{ ...th, textAlign: 'right' }}>Кліки до → після</th>
              <th style={{ ...th, textAlign: 'right' }}>Вартість</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const eff = r.effect;
              const mature = (eff?.maturity ?? 0) >= MATURE_DAYS;
              const pb = eff?.before.position ?? null;
              const pa = eff?.after.position ?? null;
              const gained = pb != null && pa != null ? pb - pa : null;
              return (
                <tr key={`${r.page_path}-${r.created_at}-${i}`}>
                  <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                    {new Date(r.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                  </td>
                  <td style={td}>
                    <Link href={r.page_path} target="_blank" style={{ ...pathStyle, color: 'var(--brand-blue)' }}>
                      {r.page_path}
                    </Link>
                  </td>
                  <td style={td}><span style={badge('info')}>{KIND_LABEL[r.action] ?? r.action}</span></td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.query ?? '—'}</td>
                  <td style={tdNum}>
                    {!mature ? (
                      <span style={{ color: 'var(--text-muted)' }} title={`даних після дії: ${eff?.maturity ?? 0} дн.`}>
                        ще рано
                      </span>
                    ) : (
                      <span style={{ color: gained == null ? 'var(--text-muted)' : gained > 0.5 ? 'var(--color-success)' : gained < -0.5 ? TONE.danger : 'var(--text-secondary)' }}>
                        {pb?.toFixed(1) ?? '—'} → {pa?.toFixed(1) ?? '—'}
                      </span>
                    )}
                  </td>
                  <td style={tdNum}>
                    {mature ? `${num(eff!.before.clicks)} → ${num(eff!.after.clicks)}` : '—'}
                  </td>
                  <td style={tdNum}>{r.cost_usd != null ? `$${Number(r.cost_usd).toFixed(2)}` : '—'}</td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                Записів немає
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="fin-card fin-kpi">
      <div className="fin-kpi-label">{label}</div>
      <div
        className="fin-kpi-value"
        style={tone ? { color: tone === 'ok' ? 'var(--color-success)' : TONE.danger } : undefined}
      >
        {value}
      </div>
      <div className="fin-kpi-foot"><span className="fin-kpi-cmp">{sub}</span></div>
    </div>
  );
}
