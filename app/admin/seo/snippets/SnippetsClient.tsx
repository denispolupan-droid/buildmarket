'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { badge, card, chip, hint, num, path as pathStyle, pct, td, tdNum, th, TONE } from '../ui';
import HelpBox from '../HelpBox';
import { HELP_SNIPPETS } from '../help-content';

// Найдорожча проблема сайту зараз не позиції, а сніпети: сторінки на 5–8 місці
// з нулем кліків. Розділ цього класу роботи не показував узагалі — цей екран
// саме про нього.

const TITLE_MAX = 65;
const DESC_MAX = 160;
const DESC_MIN = 70;

type Row = {
  path: string;
  impressions: number; clicks: number; ctr: number; position: number;
  lostClicks: number;
  title: string | null; description: string | null;
  canonical: string | null; robots: string | null; h1: string | null;
  fetchError: string | null;
};

type Duplicate = { field: 'title' | 'description'; value: string; paths: string[] };

export default function SnippetsClient() {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [data, setData] = useState<{ rows: Row[]; duplicates: Duplicate[] } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    fetch(`/api/admin/seo/snippets?days=${days}&limit=40`)
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setData(d);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, [days]);

  const lostTotal = data?.rows.reduce((s, r) => s + r.lostClicks, 0) ?? 0;

  return (
    <div>
      <HelpBox content={HELP_SNIPPETS} />
      <p style={{ ...hint, margin: '0 0 14px' }}>
        Мета читається з живої сторінки, тому нижче видно факт, а не те, що ми думаємо, що
        генеруємо — разом із <code>canonical</code> і <code>robots</code>.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        {([7, 28, 90] as const).map(p => (
          <button key={p} onClick={() => setDays(p)} style={chip(days === p)}>{p} днів</button>
        ))}
        {data && (
          <span style={{ ...hint, marginLeft: 8 }}>
            Потенціал: <b style={{ color: 'var(--color-success)' }}>≈{Math.round(lostTotal)}</b> кліків
            на {data.rows.length} сторінках за {days} днів
          </span>
        )}
      </div>

      {error && <p style={{ color: TONE.danger }}>Не вдалося порахувати: {error.slice(0, 300)}</p>}
      {!data && !error && <p style={hint}>Читаємо GSC і мета-теги сторінок (до хвилини)…</p>}

      {data && data.duplicates.length > 0 && (
        <div style={{ ...card, marginBottom: 16, borderColor: TONE.warn }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: TONE.warn, marginBottom: 6 }}>
            Дублі мета-тегів ({data.duplicates.length})
          </div>
          {data.duplicates.slice(0, 10).map((d, i) => (
            <div key={i} style={{ fontSize: 12, marginBottom: 6, color: 'var(--text-secondary)' }}>
              <span style={badge('warn')}>{d.field}</span>{' '}
              «{d.value.slice(0, 90)}{d.value.length > 90 ? '…' : ''}» —{' '}
              {d.paths.map(p => <code key={p} style={{ marginRight: 6 }}>{p}</code>)}
            </div>
          ))}
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.rows.map(r => (
            <div key={r.path} style={card}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
                <Link href={r.path} target="_blank" style={{ ...pathStyle, maxWidth: 460, color: 'var(--brand-blue)', fontWeight: 600 }}>
                  {r.path}
                </Link>
                <span style={{ ...hint }}>
                  поз. <b style={{ color: 'var(--text-primary)' }}>{r.position.toFixed(1)}</b> ·
                  {' '}{num(r.impressions)} показів · {num(r.clicks)} кліків · CTR {pct(r.ctr)}
                </span>
                <span style={{ marginLeft: 'auto', ...badge(r.lostClicks >= 5 ? 'danger' : 'warn') }}>
                  недобір ≈{r.lostClicks.toFixed(1)} кліків
                </span>
              </div>

              {r.fetchError ? (
                <p style={{ fontSize: 12, color: TONE.danger, margin: 0 }}>
                  Сторінку не вдалося прочитати: {r.fetchError}
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    <MetaRow label="title" value={r.title} max={TITLE_MAX} />
                    <MetaRow label="description" value={r.description} max={DESC_MAX} min={DESC_MIN} />
                    <tr>
                      <td style={{ ...th, width: 110 }}>h1</td>
                      <td style={{ ...td, borderTop: 'none' }}>{r.h1 ?? <span style={{ color: TONE.danger }}>немає</span>}</td>
                      <td style={tdNum} />
                    </tr>
                    <tr>
                      <td style={{ ...th, width: 110 }}>canonical</td>
                      <td style={{ ...td, borderTop: 'none' }}>
                        {r.canonical
                          ? <code style={{ fontSize: 12, color: canonicalMismatch(r) ? TONE.warn : 'var(--text-secondary)' }}>{r.canonical}</code>
                          : <span style={{ color: TONE.warn }}>немає</span>}
                        {canonicalMismatch(r) && <span style={{ ...badge('warn'), marginLeft: 8 }}>вказує на іншу адресу</span>}
                      </td>
                      <td style={tdNum} />
                    </tr>
                    {r.robots && (
                      <tr>
                        <td style={{ ...th, width: 110 }}>robots</td>
                        <td style={{ ...td, borderTop: 'none' }}>
                          <code style={{ fontSize: 12, color: /noindex/i.test(r.robots) ? TONE.danger : 'var(--text-secondary)' }}>{r.robots}</code>
                          {/noindex/i.test(r.robots) && <span style={{ ...badge('danger'), marginLeft: 8 }}>noindex, а покази йдуть</span>}
                        </td>
                        <td style={tdNum} />
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          {data.rows.length === 0 && (
            <div style={{ ...card, textAlign: 'center', padding: '30px 16px', color: 'var(--color-success)' }}>
              Помітних втрат CTR немає.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** canonical, що веде не на цю ж адресу, — сторінка віддає сигнали кудись інде. */
function canonicalMismatch(r: Row): boolean {
  if (!r.canonical) return false;
  const c = r.canonical.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '') || '/';
  return c !== (r.path.replace(/\/+$/, '') || '/');
}

function MetaRow({ label, value, max, min }: { label: string; value: string | null; max: number; min?: number }) {
  const len = value?.length ?? 0;
  const tooLong = len > max;
  const tooShort = min != null && len > 0 && len < min;
  const color = !value ? TONE.danger : tooLong || tooShort ? TONE.warn : 'var(--color-success)';
  return (
    <tr>
      <td style={{ ...th, width: 110 }}>{label}</td>
      <td style={{ ...td, borderTop: 'none' }}>
        {value ?? <span style={{ color: TONE.danger }}>немає</span>}
      </td>
      <td style={{ ...tdNum, borderTop: 'none', color, width: 90 }}>
        {value ? `${len} / ${max}` : ''}
      </td>
    </tr>
  );
}
