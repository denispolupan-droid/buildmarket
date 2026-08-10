'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Wand2, Image as ImageIcon, AlertTriangle, Clock, ExternalLink } from 'lucide-react';
import { classifyReason, type FixKind } from '../../../../lib/rozetka-content-reasons';
import type { ContentSummary } from '../../../../lib/rozetka-content';

const KIND_LABEL: Record<FixKind, string> = {
  text:  'текст — лікується кнопкою',
  chars: 'характеристики',
  photo: 'фото — потрібне інше зображення',
  other: 'інше',
};
const KIND_COLOR: Record<FixKind, { c: string; bg: string; b: string }> = {
  text:  { c: '#15803D', bg: '#F0FDF4', b: '#BBF7D0' },
  chars: { c: '#B45309', bg: '#FFFBEB', b: '#FDE68A' },
  photo: { c: '#B91C1C', bg: '#FEF2F2', b: '#FECACA' },
  other: { c: '#475569', bg: '#F8FAFC', b: '#E2E8F0' },
};

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border-light)',
  borderRadius: '12px', padding: '14px 16px', minWidth: 0,
};

export default function ModerationClient() {
  const [data, setData] = useState<ContentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [kind, setKind] = useState<FixKind | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/rozetka/content');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setData(j as ContentSummary);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(
    () => (data?.problems ?? []).filter(p => kind === 'all' || p.kinds.includes(kind)),
    [data, kind],
  );
  const fixable = useMemo(() => rows.filter(p => p.autoFixable).map(p => p.sku), [rows]);

  async function regen(skus: string[]) {
    if (!skus.length) return;
    setFixing(skus);
    setLog(l => [`Перегенерація ${skus.length} шт…`, ...l]);
    try {
      // Роут бере не більше 20 за виклик — ріжемо тут, щоб кнопка «полагодити всі»
      // працювала на будь-якій кількості без окремої черги.
      for (let i = 0; i < skus.length; i += 20) {
        const chunk = skus.slice(i, i + 20);
        const res = await fetch('/api/admin/rozetka/regen-description', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: chunk }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setLog(l => [
          `${chunk.length} шт: ok ${j.ok}, помилок ${j.failed}` +
          (j.failed ? ` — ${j.results.filter((r: { ok: boolean }) => !r.ok).map((r: { sku: string; error: string }) => `${r.sku}: ${r.error}`).join('; ')}` : ''),
          ...l,
        ]);
      }
      setLog(l => ['Готово. Нові заявки Rozetka заведе сама, коли прочитає фід (кілька годин).', ...l]);
    } catch (e) {
      setLog(l => [`Помилка: ${(e as Error).message}`, ...l]);
    } finally {
      setFixing([]);
    }
  }

  return (
    <div style={{ padding: '18px 20px 40px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Модерація контенту Rozetka</h1>
        <button onClick={load} disabled={loading}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} /> Оновити
        </button>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 16px', maxWidth: '860px' }}>
        Контент карток після заведення позиції редагується лише через модерацію: зміна в нашому фіді
        не застосовується одразу, а створює заявку, яку підтверджує Rozetka. Окремої кнопки «подати
        заявку» немає ні тут, ні в них — заявка з&apos;являється сама. Наша частина — щоб текст був
        чистий; для відмов через текст нижче є кнопка перегенерації.
      </p>

      {err && (
        <div style={{ ...card, borderColor: '#FECACA', background: '#FEF2F2', color: '#B91C1C', marginBottom: '16px' }}>
          Не вдалося отримати дані з Rozetka: {err}
        </div>
      )}

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', marginBottom: '16px' }}>
            <div style={card}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}><Clock size={12} /> Заявок на модерації</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand-blue)' }}>{data.pending}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}><AlertTriangle size={12} /> Відхилено</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: data.rejected ? '#B91C1C' : 'var(--text-primary)' }}>{data.rejected}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Позицій із проблемами</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: data.problems.length ? '#B45309' : '#15803D' }}>{data.problems.length}</div>
            </div>
            <div style={card}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Що поїхало на модерацію</div>
              <div style={{ fontSize: '12.5px', lineHeight: 1.7, marginTop: '2px' }}>
                {Object.entries(data.byField).sort((a, b) => b[1] - a[1]).slice(0, 4)
                  .map(([f, n]) => `${f} — ${n}`).join(', ') || '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {(['all', 'text', 'photo', 'chars', 'other'] as const).map(k => {
              const n = k === 'all' ? data.problems.length : data.problems.filter(p => p.kinds.includes(k)).length;
              const active = kind === k;
              return (
                <button key={k} onClick={() => setKind(k)}
                  style={{ height: '30px', padding: '0 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${active ? 'var(--brand-blue)' : 'var(--border)'}`,
                    background: active ? '#EFF4FF' : 'var(--bg-card)',
                    color: active ? 'var(--brand-blue)' : 'var(--text-secondary)' }}>
                  {k === 'all' ? 'Усі' : KIND_LABEL[k]}
                  <span style={{ marginLeft: '5px', fontSize: '10px', opacity: 0.7 }}>{n}</span>
                </button>
              );
            })}
            {fixable.length > 0 && (
              <button onClick={() => regen(fixable)} disabled={fixing.length > 0}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: fixing.length ? 'default' : 'pointer', opacity: fixing.length ? 0.6 : 1 }}>
                <Wand2 size={14} /> Перегенерувати описи ({fixable.length})
              </button>
            )}
          </div>

          {log.length > 0 && (
            <div style={{ ...card, marginBottom: '14px', fontSize: '12.5px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}

          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {rows.length === 0 && (
              <div style={{ padding: '22px 16px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {data.problems.length ? 'У цьому зрізі порожньо.' : 'Жодна позиція не має зауважень модерації.'}
              </div>
            )}
            {rows.map(p => (
              <div key={p.sku} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '11px 14px', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '92px', fontSize: '13px', fontWeight: 700 }}>{p.sku}</div>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ fontSize: '13px', marginBottom: '3px' }}>
                    {p.name}
                    {p.url && (
                      <a href={p.url} target="_blank" rel="noopener noreferrer" title="Картка на Rozetka"
                        style={{ marginLeft: '6px', color: 'var(--text-muted)', display: 'inline-flex', verticalAlign: 'middle' }}>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {p.reasons.map(r => {
                      // Колір — по САМІЙ причині, а не по типу позиції: у рядка їх
                      // буває кілька різних, і фарбувати їх однаково — брехати оку.
                      const col = KIND_COLOR[classifyReason(r)];
                      return (
                        <span key={r} style={{ fontSize: '11px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', color: col.c, background: col.bg, border: `1px solid ${col.b}` }}>
                          {r}
                        </span>
                      );
                    })}
                  </div>
                  {p.changeStatus && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      заявка: {p.changeStatus}{p.changeDate ? ` · ${p.changeDate}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {p.pending ? (
                    <span title="Нова версія тексту вже подана — чекає модератора. Генерувати ще раз немає сенсу."
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#B45309' }}>
                      <Clock size={12} /> виправлення в черзі
                    </span>
                  ) : p.autoFixable ? (
                    <button onClick={() => regen([p.sku])} disabled={fixing.length > 0}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 10px', borderRadius: '7px', border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontSize: '12px', fontWeight: 700, cursor: fixing.length ? 'default' : 'pointer' }}>
                      <Wand2 size={12} /> {fixing.includes(p.sku) ? 'Генерую…' : 'Перегенерувати опис'}
                    </button>
                  ) : (
                    <span title="Потрібне інше зображення — кодом не вирішується"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <ImageIcon size={12} /> вручну
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px' }}>
            дані з кабінету Rozetka на {new Date(data.checkedAt).toLocaleString('uk-UA')}
          </div>
        </>
      )}

      {loading && !data && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Читаю кабінет Rozetka…</div>}
    </div>
  );
}
