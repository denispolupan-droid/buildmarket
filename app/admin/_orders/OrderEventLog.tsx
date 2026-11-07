'use client';

import { useEffect, useState } from 'react';
import { Package, Truck, X, Check, ShoppingCart, Mail, ClipboardList, Clock, FileText, House, RefreshCw } from 'lucide-react';
import type { Order } from './types';
import { useOrdersCtx } from './OrdersContext';

type OutboxEv = {
  id: number; event: string; handler: string; status: 'pending' | 'done' | 'failed' | 'skipped';
  attempts: number; next_at: string; last_error: string | null; created_at: string; done_at: string | null;
  channel: string | null; ttn: string | null; target_status: string | null;
};

const HANDLER_LABEL: Record<string, string> = {
  'mp.push_ttn': 'ЕН на площадку',
  'mp.push_status': 'статус на площадку',
  'customer.notify_status': 'сповіщення покупцю',
};
const CHANNEL_LABEL: Record<string, string> = {
  prom: 'Prom', rozetka: 'Rozetka', epicentr: 'Епіцентр', telegram: 'Telegram', email: 'email', sms: 'SMS/Viber',
};
const STATUS_LABEL: Record<OutboxEv['status'], { text: string; color: string }> = {
  pending: { text: 'в черзі',   color: '#B45309' },
  done:    { text: 'доставлено', color: '#15803D' },
  failed:  { text: 'не доставлено', color: '#DC2626' },
  skipped: { text: 'пропущено', color: 'var(--text-muted)' },
};
const fmtAt = (s: string) => new Date(s).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * «Доставка подій» (outbox, фаза 2): що з цього замовлення пішло на площадки й
 * покупцю, коли, скільки спроб, яка помилка. failed/skipped можна повторити.
 */
function OutboxDelivery({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<OutboxEv[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [tick, setTick] = useState(0);   // перезавантаження після «Повторити»
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/orders/${orderId}/outbox`).then(r => r.json())
      .then(d => { if (alive) setRows(d.events ?? []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [orderId, tick]);
  if (!rows || rows.length === 0) return null;
  async function retry(id: number) {
    setBusy(id);
    try {
      await fetch(`/api/admin/orders/${orderId}/outbox`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: id }) });
      setTick(t => t + 1);
    } finally { setBusy(null); }
  }
  return (
    <div style={{ marginTop: '10px', padding: '8px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
        Доставка подій
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {rows.map(ev => {
          const st = STATUS_LABEL[ev.status];
          return (
            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtAt(ev.created_at)}</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {HANDLER_LABEL[ev.handler] ?? ev.handler}
                {ev.channel ? ` · ${CHANNEL_LABEL[ev.channel] ?? ev.channel}` : ''}
                {ev.target_status ? ` · ${ev.target_status}` : ''}
                {ev.ttn && ev.handler === 'mp.push_ttn' ? ` · ${ev.ttn}` : ''}
              </span>
              <span style={{ fontWeight: 700, color: st.color }}>{st.text}</span>
              {ev.status === 'done' && ev.done_at && <span style={{ color: 'var(--text-muted)' }}>{fmtAt(ev.done_at)}</span>}
              {ev.status === 'pending' && ev.attempts > 0 && <span style={{ color: 'var(--text-muted)' }}>спроба {ev.attempts}, наступна {fmtAt(ev.next_at)}</span>}
              {ev.last_error && ev.status !== 'done' && (
                <span style={{ color: 'var(--text-muted)' }} title={ev.last_error}>
                  — {ev.last_error.length > 90 ? ev.last_error.slice(0, 90) + '…' : ev.last_error}
                </span>
              )}
              {(ev.status === 'failed' || ev.status === 'skipped') && (
                <button type="button" onClick={e => { e.stopPropagation(); retry(ev.id); }} disabled={busy === ev.id}
                  style={{ height: '22px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                  {busy === ev.id ? '…' : 'Повторити'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OrderEventLog({ order, isRozetkaPoint }: {
  order: Order;
  isRozetkaPoint: boolean;
}) {
  const {
    linkedPOs, linkedReceipts, historyOpen,
  } = useOrdersCtx();
  return (
    <>
      {/* ── Журнал подій ── */}
      {(() => {
        const STATUS_CFG: Record<string, { icon: string; label: string }> = {
          new:            { icon: '🛒', label: 'Нове' },
          confirmed:      { icon: '✅', label: 'Підтверджено' },
          awaiting_stock: { icon: '⏳', label: 'Очікуємо товар' },
          picking:        { icon: '📋', label: 'Збирається' },
          // Статус shipped ставить відвантаження (найчастіше — разом зі
          // створенням накладної), а не перевізник. «Відправлено» в
          // таймлайні — окрема подія carrier_accepted_at нижче.
          shipped:        { icon: '🧾', label: 'Створено ТТН' },
          delivered:      { icon: '🏠', label: 'Доставлено' },
          cancelled:      { icon: '❌', label: 'Скасовано' },
          // Не статус замовлення, а подія в його житті: накладну
          // перевиписали. У таймлайні вона важлива — інакше зміна
          // номера й дати відправки виглядає як загадка.
          ttn_replaced:   { icon: '🔁', label: 'ТТН замінено' },
        };
        const RANK: Record<string, number> = {
          new: 0, confirmed: 1, awaiting_stock: 2, picking: 3, shipped: 4, delivered: 5,
        };

        // Build event list: always start with "Оформлено", then status_history entries
        type Ev = { icon: string; label: string; at: string; by?: string; backward?: boolean; href?: string; sub?: string };
        const evs: Ev[] = [{ icon: '🛒', label: 'Оформлено', at: order.created_at }];

        const history = order.status_history ?? [];
        if (history.length > 0) {
          history.forEach((h, i) => {
            const cfg = STATUS_CFG[h.status] ?? { icon: '•', label: h.status };
            const prevStatus = i === 0 ? 'new' : history[i - 1].status;
            const backward = (RANK[h.status] ?? 99) < (RANK[prevStatus] ?? 0);
            evs.push({ icon: cfg.icon, label: cfg.label, at: h.at, by: h.by, backward });
          });
        } else {
          // Fallback for very old orders without status_history
          if (order.confirmed_at) evs.push({ ...STATUS_CFG.confirmed, at: order.confirmed_at });
          if (order.shipped_at)   evs.push({ ...STATUS_CFG.shipped,   at: order.shipped_at });
          if (order.delivered_at) evs.push({ ...STATUS_CFG.delivered, at: order.delivered_at });
          if (order.cancelled_at) evs.push({ ...STATUS_CFG.cancelled, at: order.cancelled_at });
        }

        // Insert supplier_sent_at pseudo-event at correct position
        if (order.supplier_sent_at) {
          const sentAt = order.supplier_sent_at;
          const insertAt = evs.findIndex(e => e.at > sentAt);
          const sentEv: Ev = { icon: '📧', label: 'Надіслано постачальнику', at: sentAt, by: order.supplier_sent_by ?? undefined };
          if (insertAt === -1) evs.push(sentEv);
          else evs.splice(insertAt, 0, sentEv);
        }

        // Справжнє «Відправлено» — перевізник прийняв посилку
        // (carrier_accepted_at ставить синк НП / Rozetka)
        if (order.carrier_accepted_at) {
          const accAt = order.carrier_accepted_at;
          const accEv: Ev = {
            icon: '🚚', label: 'Відправлено', at: accAt,
            sub: `передано ${isRozetkaPoint ? 'Rozetka Доставці' : 'Новій Пошті'}`,
          };
          const insertAt = evs.findIndex(e => e.at > accAt);
          if (insertAt === -1) evs.push(accEv);
          else evs.splice(insertAt, 0, accEv);
        }

        // Insert linked PO events
        for (const po of (linkedPOs[order.id] ?? [])) {
          const poAt = po.created_at;
          const poEv: Ev = {
            icon: '📋',
            label: po.doc_number,
            at: poAt,
            href: `/admin/procurement/${po.id}`,
            sub: po.supplier?.name ?? undefined,
          };
          const insertAt = evs.findIndex(e => e.at > poAt);
          if (insertAt === -1) evs.push(poEv);
          else evs.splice(insertAt, 0, poEv);
        }

        // Insert receipt events
        for (const r of (linkedReceipts[order.id] ?? [])) {
          const rAt = r.created_at;
          const rEv: Ev = {
            icon: '📦',
            label: r.doc_number,
            at: rAt,
            href: `/admin/procurement/receipts/${r.id}`,
            sub: r.total_cost ? `${Number(r.total_cost).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴` : undefined,
          };
          const insertAt = evs.findIndex(e => e.at > rAt);
          if (insertAt === -1) evs.push(rEv);
          else evs.splice(insertAt, 0, rEv);
        }

        if (evs.length <= 1) return null;
        if (!(historyOpen[order.id] ?? false)) return null;
        return (
          <div style={{ background: 'var(--bg-soft)', padding: '0 14px 14px' }}>
            <div className="order-col-card oc-acc oc-acc-history" style={{ padding: '0' }}>
              {(historyOpen[order.id] ?? false) && (
              <div className="oc-tl-rail">
                {evs.map((ev, i) => {
                  const isLast = i === evs.length - 1;
                  const tone = ev.backward ? 'back' : isLast ? 'now' : 'done';
                  const content = (
                    <div className={`oc-tl-step ${tone}`}>
                      {/* Рейка малюється смугами ліворуч і праворуч від крапки,
                          а не однією лінією під усім рядом: інакше вона стирчала
                          за крайні кроки. */}
                      <span className="oc-tl-line left" aria-hidden="true" />
                      <span className="oc-tl-line right" aria-hidden="true" />
                      {/* Лінійна іконка кроку замість однакової точки: шість-сім
                          кроків інакше розрізнялись лише підписом */}
                      {(() => {
                        const TL_ICON: Record<string, typeof Check> = {
                          '🛒': ShoppingCart, '✅': Check, '⏳': Clock, '📋': ClipboardList,
                          '🧾': FileText, '🏠': House, '❌': X, '🔁': RefreshCw,
                          '📧': Mail, '🚚': Truck, '📦': Package,
                        };
                        const Icon = TL_ICON[ev.icon];
                        return (
                          <span className="oc-tl-dot" aria-hidden="true">
                            {Icon && <Icon size={13} strokeWidth={2.2} />}
                          </span>
                        );
                      })()}
                      <span className="oc-tl-label">{ev.label}</span>
                      <span className="oc-tl-at">
                        {new Date(ev.at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {ev.sub && <span className="oc-tl-sub">{ev.sub}</span>}
                      {ev.by && ev.by !== 'system' && <span className="oc-tl-sub">{ev.by.split('@')[0]}</span>}
                    </div>
                  );
                  return ev.href
                    ? <a key={i} href={ev.href} className="oc-tl-cell" onClick={e => e.stopPropagation()}>{content}</a>
                    : <div key={i} className="oc-tl-cell">{content}</div>;
                })}
              </div>
              )}
            </div>
            <OutboxDelivery orderId={order.id} />
          </div>
        );
      })()}
    </>
  );
}
