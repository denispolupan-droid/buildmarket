'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote } from 'lucide-react';
import { showToast } from '../../../../lib/toast';
import { parseMoney } from '../../../../lib/parse-money';

/** Непогашений борг: одна проводка (прихід або РН дропшипу) із залишком */
type OpenCharge = {
  id: string;
  date: string;
  total: number;
  allocated: number;
  remaining: number;
  docNumber: string | null;
  orderNumber: number | null;
  description: string;
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px',
  border: '1.5px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};
const thStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
};

/**
 * Оплата постачальнику з рознесенням по накладних (перенесено з «Кредиторки»,
 * 28.10.2026). Кнопка «Оплатити» відкриває форму під шапкою контрагента;
 * сервер — POST /api/admin/finance/supplier-payments, тим самим правилом
 * рознесення (lib/accounting/allocation), що й попередній перегляд тут.
 */
export default function SupplierPayForm({ supplierId, owed }: { supplierId: number; owed: number }) {
  const today  = new Date().toISOString().slice(0, 10);
  const router = useRouter();

  const [open,      setOpen]      = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode,   setPayMode]   = useState<'transfer' | 'cash'>('transfer');
  const [payDate,   setPayDate]   = useState(today);
  const [payNote,   setPayNote]   = useState('');
  const [paySaving, setPaySaving] = useState(false);
  // Як рознести суму по боргах. За замовчуванням — найстаріші: так закривається
  // те, що висить найдовше, і старіння боргу не росте на порожньому місці.
  const [payFill,   setPayFill]   = useState<'oldest' | 'newest' | 'manual'>('oldest');
  const [charges,   setCharges]   = useState<OpenCharge[] | null>(null);
  const [manual,    setManual]    = useState<Record<string, string>>({});

  // Список боргів тягнемо при відкритті: він потрібен і для попереднього
  // перегляду («що саме закриється»), і для ручного рознесення.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(`/api/admin/finance/supplier-payments?supplier_id=${supplierId}`)
      .then(r => r.ok ? r.json() : { charges: [] })
      .then(d => { if (alive) setCharges(d.charges ?? []); })
      .catch(() => { if (alive) setCharges([]); });
    return () => { alive = false; };
  }, [open, supplierId]);

  function toggle() {
    if (open) { setOpen(false); return; }
    setPayAmount(owed > 0.005 ? owed.toFixed(2) : '');
    setPayMode('transfer');
    setPayDate(today);
    setPayNote('');
    setPayFill('oldest');
    setManual({});
    setCharges(null);
    setOpen(true);
  }

  /** Що закриє введена сума — рахуємо на льоту, тим самим правилом, що й сервер */
  function previewLines(): { id: string; amount: number }[] {
    const amount = parseMoney(payAmount);
    if (!charges || !Number.isFinite(amount) || amount <= 0) return [];
    if (payFill === 'manual') {
      return Object.entries(manual)
        .map(([id, v]) => ({ id, amount: parseMoney(v) }))
        .filter(l => Number.isFinite(l.amount) && l.amount > 0);
    }
    const sorted = [...charges].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    if (payFill === 'newest') sorted.reverse();
    let left = Math.round(amount * 100);
    const out: { id: string; amount: number }[] = [];
    for (const c of sorted) {
      if (left <= 0) break;
      const take = Math.min(left, Math.round(c.remaining * 100));
      if (take <= 0) continue;
      out.push({ id: c.id, amount: take / 100 });
      left -= take;
    }
    return out;
  }

  async function submitPay() {
    const amount = parseMoney(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Вкажіть коректну суму', 'error');
      return;
    }
    setPaySaving(true);
    try {
      const res = await fetch('/api/admin/finance/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId, amount, payment_mode: payMode, payment_date: payDate, note: payNote,
          allocation_mode: payFill,
          allocations: payFill === 'manual'
            ? previewLines().map(l => ({ charge_id: l.id, amount: l.amount }))
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const left = Number(data.unallocated ?? 0);
        showToast(
          data.warning
            ? data.warning
            : `Оплату зафіксовано (${data.doc_number ?? ''}) · закрито документів: ${data.allocated ?? 0}`
              + (left > 0.005 ? ` · аванс ${left.toFixed(2)} ₴` : ''),
          data.warning ? 'error' : 'success',
        );
        setOpen(false);
        router.refresh();
      } else {
        showToast(data.error ?? 'Помилка збереження оплати', 'error');
      }
    } catch {
      showToast('Помилка збереження оплати', 'error');
    }
    setPaySaving(false);
  }

  return (
    <>
      <button type="button" onClick={toggle} className={'fin-pill' + (open ? ' active' : '')}
        style={{ cursor: 'pointer', gap: '6px' }}>
        <Banknote size={13} /> Оплатити
      </button>

      {open && (
        // Форма займає всю ширину рядка шапки — flex-basis 100% переносить її під кнопки
        <div className="fin-card" style={{ flexBasis: '100%', marginTop: '4px', padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Сума, ₴</label>
            <input value={payAmount} onChange={e => setPayAmount(e.target.value)} inputMode="decimal" placeholder="0.00"
              style={{ ...inp, width: '120px', fontWeight: 700 }} />
          </div>
          <div>
            <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Спосіб</label>
            <select value={payMode} onChange={e => setPayMode(e.target.value as 'transfer' | 'cash')} style={{ ...inp, cursor: 'pointer' }}>
              <option value="transfer">🏦 Безготівковий</option>
              <option value="cash">💵 Готівка</option>
            </select>
          </div>
          <div>
            <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Дата</label>
            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Коментар</label>
            <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="напр., оплата за тиждень"
              style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
          </div>
          <button onClick={submitPay} disabled={paySaving}
            style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: paySaving ? 'wait' : 'pointer', opacity: paySaving ? 0.6 : 1 }}>
            {paySaving ? 'Зберігаємо…' : 'Зафіксувати оплату'}
          </button>
          <button onClick={() => setOpen(false)}
            style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
            Скасувати
          </button>

          {/* Рознесення оплати по боргах. Без нього оплата зменшувала
              загальне сальдо, і питання «за які накладні ми ще винні»
              лишалось без відповіді. */}
          <div style={{ flexBasis: '100%', borderTop: '1px dashed var(--border)', paddingTop: '12px', marginTop: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span style={thStyle}>Рознести на</span>
              {([
                { key: 'oldest', label: 'найстаріші накладні' },
                { key: 'newest', label: 'найновіші' },
                { key: 'manual', label: 'вибрати вручну' },
              ] as const).map(o => (
                <button key={o.key} type="button" onClick={() => setPayFill(o.key)}
                  style={{
                    height: '28px', padding: '0 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px',
                    fontWeight: payFill === o.key ? 700 : 600,
                    border: `1.5px solid ${payFill === o.key ? '#1E3A5F' : 'var(--border)'}`,
                    background: payFill === o.key ? '#EAF1F8' : 'var(--bg-card)',
                    color: payFill === o.key ? '#1E3A5F' : 'var(--text-secondary)',
                  }}>
                  {o.label}
                </button>
              ))}
            </div>

            {charges === null ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Завантажуємо борги…</div>
            ) : charges.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Непогашених накладних немає — оплата ляже авансом.
              </div>
            ) : (() => {
              const lines = previewLines();
              const picked = new Map(lines.map(l => [l.id, l.amount]));
              const sum = lines.reduce((t, l) => t + l.amount, 0);
              const amount = parseMoney(payAmount) || 0;
              const rest = Math.round((amount - sum) * 100) / 100;
              // «Вибрати всі»: розкладає суму по відкритих накладних
              // згори вниз (список іде від найстаріших), доки вистачає
              // грошей. Останню закриває частково — так само, як це
              // зробив би автоматичний режим.
              const fillAll = () => setManual(() => {
                let left = Math.round((parseMoney(payAmount) || 0) * 100);
                const next: Record<string, string> = {};
                for (const c of charges) {
                  if (left <= 0) break;
                  const take = Math.min(left, Math.round(c.remaining * 100));
                  if (take <= 0) continue;
                  next[c.id] = (take / 100).toFixed(2);
                  left -= take;
                }
                return next;
              });
              const allPicked = lines.length > 0 && (rest <= 0.005 || lines.length === charges.length);

              return (
                <div>
                  {payFill === 'manual' && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', marginBottom: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      <input type="checkbox" checked={allPicked}
                        onChange={e => (e.target.checked ? fillAll() : setManual({}))}
                        style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                      Вибрати всі неоплачені
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                        — {charges.length} на {fmt(charges.reduce((t, c) => t + c.remaining, 0))} ₴
                      </span>
                    </label>
                  )}
                  <div style={{ height: '260px', minHeight: '120px', maxHeight: '70vh', overflowY: 'auto', resize: 'vertical', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                    {charges.map((c, i) => {
                      const take = picked.get(c.id) ?? 0;
                      return (
                        <div key={c.id} style={{
                          display: 'grid', gridTemplateColumns: '80px 120px 1fr 110px 120px', gap: '8px', alignItems: 'center',
                          padding: '6px 10px', fontSize: '12px',
                          background: take > 0 ? '#F0FDF4' : 'transparent',
                          borderBottom: i < charges.length - 1 ? '1px solid var(--border-light)' : 'none',
                        }}>
                          <span style={{ color: 'var(--text-muted)' }}>{c.date.slice(8, 10)}.{c.date.slice(5, 7)}.{c.date.slice(2, 4)}</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B45309' }}>{c.docNumber ?? '—'}</span>
                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.orderNumber != null ? (
                              <Link href={`/admin?status=&q=${c.orderNumber}`} target="_blank" style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none' }}>
                                #{c.orderNumber}
                              </Link>
                            ) : c.description}
                          </span>
                          <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {fmt(c.remaining)} ₴
                            {c.allocated > 0.005 && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}> із {fmt(c.total)}</span>
                            )}
                          </span>
                          {payFill === 'manual' ? (() => {
                            const entered = parseMoney(manual[c.id]) || 0;
                            const full = Math.abs(entered - c.remaining) < 0.005;
                            // Скільки з оплати ще вільно (без цього рядка)
                            const usedElsewhere = Object.entries(manual)
                              .filter(([id]) => id !== c.id)
                              .reduce((t, [, v]) => t + (parseMoney(v) || 0), 0);
                            const free = Math.max(0, (parseMoney(payAmount) || 0) - usedElsewhere);
                            const fill = Math.round(Math.min(c.remaining, free) * 100) / 100;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input type="checkbox" checked={full}
                                  disabled={!full && fill <= 0}
                                  title={full ? 'Зняти рознесення на цю накладну'
                                    : fill < c.remaining ? `Закрити частково: вільно лише ${fmt(fill)} ₴`
                                    : 'Закрити накладну повністю'}
                                  onChange={e => setManual(m => {
                                    const next = { ...m };
                                    if (e.target.checked) next[c.id] = fill.toFixed(2);
                                    else delete next[c.id];
                                    return next;
                                  })}
                                  style={{ width: '15px', height: '15px', flexShrink: 0, cursor: (!full && fill <= 0) ? 'not-allowed' : 'pointer' }} />
                                <input
                                  value={manual[c.id] ?? ''}
                                  onChange={e => setManual(m => ({ ...m, [c.id]: e.target.value }))}
                                  inputMode="decimal" placeholder="0.00"
                                  style={{ ...inp, height: '26px', width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'right' }} />
                              </div>
                            );
                          })() : (
                            <span style={{ textAlign: 'right', fontWeight: 700, color: take > 0 ? '#15803D' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {take > 0 ? `−${fmt(take)} ₴` : '—'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Закриється документів: <b>{lines.length}</b> на <b>{fmt(sum)} ₴</b>
                    {rest > 0.005 && <span style={{ color: '#B45309' }}> · аванс {fmt(rest)} ₴</span>}
                    {rest < -0.005 && <span style={{ color: '#DC2626' }}> · рознесено більше за оплату на {fmt(-rest)} ₴</span>}
                    {Math.abs(rest) > 0.005 && sum > 0 && (
                      // Найчастіший намір — заплатити рівно за вибране.
                      // Без цього суму переписують руками, а скопійована
                      // з цього ж рядка вона приїздить із пробілами.
                      <button type="button" onClick={() => setPayAmount(sum.toFixed(2))}
                        style={{
                          marginLeft: '8px', padding: '2px 8px', borderRadius: '999px',
                          border: '1px solid var(--border)', background: 'var(--bg-card)',
                          color: 'var(--text-secondary)', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer',
                        }}>
                        платити рівно {fmt(sum)} ₴
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
