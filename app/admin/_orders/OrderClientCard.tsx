'use client';

import { CreditCard, Phone, Building2, Pencil, Plus, X, TrendingUp, ChevronDown, ChevronUp, ShoppingCart, Copy, Wallet, Zap, AlertTriangle, ExternalLink, PhoneOff } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { marketplacePaymentMethod } from '../../../lib/payment-method';
import { CHANNEL_LABEL, STATUSES } from './constants';
import { formatPhone } from './helpers';
import { ClampedComment } from './ClampedComment';
import { CounterpartyPicker } from './CounterpartyPicker';
import { CompanyHint } from './CompanyHint';
import { DropshipPaymentInfo } from './DropshipPaymentInfo';
import type { Order } from './types';
import { useOrdersCtx } from './OrdersContext';

export function OrderClientCard({ order, isDropship, noCallback, callbackDone, isCod, paymentConfirmed }: {
  order: Order;
  isDropship: boolean;
  noCallback: boolean;
  callbackDone: boolean;
  isCod: boolean;
  paymentConfirmed: boolean;
}) {
  const {
    isAdmin, setOrders, custStats, histOpenId, setHistOpenId, copyPhone,
    toggleFlag, toggleOrderFlag, editPaymentTypeId, editPaymentTypeValue, setEditPaymentTypeValue, savePaymentType,
    savingPaymentType, setEditPaymentTypeId, orderPayments, payFormOpen, payFormSaving, setPayFormOpen,
    setPayFormMode, setPayFormAmount, setPayFormDate, payFormAmount, payFormMode, payFormDate,
    payFormNote, setPayFormNote, addPayment, reversePayment, payRemoving,
  } = useOrdersCtx();
  return (
    <>
      {/* Клієнт card */}
      <div className="order-col-card oc-split oc-acc oc-acc-client" style={{ padding: '16px' }}>
        <div className="oc-card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div className="oc-lbl">Клієнт</div>
          {isAdmin && (
            <CounterpartyPicker
              orderId={order.id}
              customerId={order.customer_id}
              onPicked={patch => setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...patch } : o))}
            />
          )}
        </div>
        {/* Contact info */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {order.company && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
              <Building2 size={12} color="#64748B" />{order.company}
            </div>
          )}
          <div className="oc-name-main" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.contact}</span>
            {order.customer_id && (
              <a href={`/admin/partners?open=${order.customer_id}`} target="_blank" rel="noopener noreferrer"
                title="Відкрити картку контрагента"
                style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)', lineHeight: 1 }}>
                <ExternalLink size={13} />
              </a>
            )}
            {/* Скільки клієнт у нас купував — у рядку з ПІБ і коротко:
                значок, кількість і сума. Слово «замовлень» з'їдало рядок,
                а сам факт постійного клієнта важливо бачити біля імені. */}
            {custStats[order.id] && custStats[order.id].count > 1 && (() => {
              const open = histOpenId === order.id;
              return (
                <button onClick={() => setHistOpenId(open ? null : order.id)} aria-expanded={open}
                  title={`${custStats[order.id].count} замовлень цього клієнта на ${custStats[order.id].total.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴ (разом із цим) — ${open ? 'сховати' : 'показати попередні'}`}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0, fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
                    padding: '2px 6px', borderRadius: '6px', border: '1px solid transparent',
                    color: open ? 'var(--brand-blue)' : 'var(--text-secondary)', background: open ? 'var(--blue-bg)' : 'none' }}>
                  <ShoppingCart size={13} color={open ? 'var(--brand-blue)' : 'var(--text-soft)'} />
                  {custStats[order.id].count} · {custStats[order.id].total.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴
                  {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              );
            })()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <a href={`tel:${order.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13.5px', color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>
              <Phone size={13} />{formatPhone(order.phone)}
            </a>
            <button
              onClick={() => { copyPhone(order.phone); showToast('Телефон скопійовано'); }}
              title="Копіювати номер"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
              <Copy size={13} />
            </button>
            {/* Стан замовлення — трьома іконками одразу після номера:
                дзвінок, «терміново», «проблемний». Колір каже все, повна
                назва лишається в підказці. Кнопки чату кабінету тут немає
                навмисно: маркетплейс не дає писати першими, тож вона лише
                обіцяла б дію, якої не буде. */}
            <span style={{ display: 'inline-flex', gap: '6px', flexShrink: 0, marginLeft: '2px' }}>
            {!isDropship && (noCallback ? (
              <span title="Клієнт просив не дзвонити"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '999px', flexShrink: 0, background: 'var(--ok-bg)', color: 'var(--color-success)', border: '1px solid var(--border-success)' }}>
                <PhoneOff size={12} />
              </span>
            ) : (
              <button onClick={() => toggleFlag(order.id, 'callback_done', !callbackDone)}
                className="oc-flag-btn" aria-pressed={callbackDone}
                title={callbackDone ? 'Зателефонували — натисніть, щоб зняти позначку' : 'Потрібен дзвінок — натисніть, коли зателефонували клієнту'}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '999px', cursor: 'pointer', flexShrink: 0,
                  background: callbackDone ? 'var(--ok-bg)' : 'var(--amber-bg)', color: callbackDone ? 'var(--color-success)' : 'var(--color-warn)', border: `1px solid ${callbackDone ? 'var(--border-success)' : 'var(--border-warn)'}` }}>
                <Phone size={12} />
              </button>
            ))}
            {([
              { key: 'urgent',  label: 'Терміново',  onBg: 'var(--danger-bg)', onC: 'var(--danger-dark)', onB: '#FCA5A5', Icon: Zap },
              { key: 'problem', label: 'Проблемний', onBg: 'var(--amber-bg)', onC: 'var(--color-warn)', onB: '#FCD34D', Icon: AlertTriangle },
            ] as const).map(f => {
              const active = (order.flags ?? []).includes(f.key);
              return (
                <button key={f.key} onClick={() => toggleOrderFlag(order.id, f.key)}
                  className="oc-flag-btn" aria-pressed={active}
                  title={active ? `Зняти прапорець «${f.label}»` : `Позначити «${f.label}»`}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '999px', cursor: 'pointer', flexShrink: 0,
                    background: active ? f.onBg : 'transparent', color: active ? f.onC : 'var(--text-muted)', border: `1px solid ${active ? f.onB : 'var(--border-light)'}` }}>
                  <f.Icon size={12} />
                </button>
              );
            })}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{order.email}</div>
          {(() => {
            if (!order.utm_source && !order.referrer_url) return null;
            const host = (() => {
              if (!order.referrer_url) return null;
              try { return new URL(order.referrer_url).hostname.replace(/^www\./, ''); }
              catch { return order.referrer_url!.slice(0, 30); }
            })();
            const label = order.utm_source
              ? [order.utm_source, order.utm_medium, order.utm_campaign].filter(Boolean).join(' · ')
              : host!;
            return (
              <div title={order.utm_source
                ? `Прийшов за рекламною міткою${order.referrer_url ? `; реферер: ${host}` : ''}`
                : `Перейшов із ${host}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                <TrendingUp size={11} /> {label}
              </div>
            );
          })()}
          </div>
        </div>
        {/* Попередні замовлення клієнта — розкриваються з бейджа біля імені.
            Свіжі зверху; номер відкриває замовлення в новій вкладці, щоб
            не загубити поточне. Скасовані показуємо приглушено: це теж
            історія (клієнт, що часто скасовує, — сигнал). */}
        {histOpenId === order.id && custStats[order.id] && (() => {
          const h = custStats[order.id];
          return (
            <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-light)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '260px', overflowY: 'auto' }}>
              {h.orders.length === 0 && (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Інших замовлень не знайдено</div>
              )}
              {h.orders.map(o => {
                const st = STATUSES.find(s => s.value === o.status);
                const ch = CHANNEL_LABEL[o.channel_code ?? 'website'] ?? CHANNEL_LABEL.website;
                const cancelled = o.status === 'cancelled';
                const goods = o.items.map(i => `${i.name} ×${i.qty}`).join(', ');
                return (
                  <div key={o.id} style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto', alignItems: 'baseline', columnGap: '8px', padding: '4px 0', fontSize: '12px', opacity: cancelled ? 0.55 : 1 }}>
                    <a href={`/admin?q=${o.order_number}&expand=${o.id}`} target="_blank" rel="noopener noreferrer"
                      title="Відкрити замовлення в новій вкладці"
                      style={{ fontWeight: 700, color: 'var(--brand-blue)', textDecoration: 'none', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      #{o.order_number}
                    </a>
                    <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {new Date(o.created_at).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </span>
                    <span title={goods} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                      <span style={{ color: ch.color, fontWeight: 600 }}>{ch.label}</span>
                      {' · '}
                      <span style={{ color: st?.color ?? 'var(--text-muted)', fontWeight: 600 }}>{st?.label ?? o.status}</span>
                      {goods && <> · {goods}</>}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textDecoration: cancelled ? 'line-through' : 'none' }}>
                      {o.total_price.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴
                    </span>
                  </div>
                );
              })}
              {h.more && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', paddingTop: '2px' }}>Показано {h.orders.length} останніх</div>
              )}
            </div>
          );
        })()}
        </div>{/* /oc-card-body */}
        {/* Оплата — притиснута до низу картки; спільна висота з блоком ТТН (.oc-card-footer) тримає розділювачі обох карток на одній лінії */}
        <div className="oc-card-footer">
        {/* Код ЄДРПОУ/ІПН у коментарі, а рахунок ще на фізособу — одним кліком на підприємство */}
        <CompanyHint order={order} onApplied={patch => setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...patch } : o))} />
        {/* Два стовпці: оплата ліворуч, коментар покупця праворуч
            (рішення власника). Заголовки «Оплата» і «Коментар» — на одній
            лінії: кожен усередині свого стовпця. На вузькому екрані
            стовпці переносяться. */}
        <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Оплата — за шириною вмісту, без розтягування: порожнє місце
            праворуч від чіпа заповнює коментар */}
        <div className="oc-pay-col" style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div className="oc-sub-lbl">Оплата</div>
        {/* Чим саме платив покупець на площадці. Наш payment_type знає лише
            грубий тип (cod / prepaid), а «Пром-оплата» чи «Оплата під час
            отримання» лежать у сирому payload маркетплейсу. */}
        {(() => {
          const method = marketplacePaymentMethod(order);
          if (!method) return null;
          return (
            <div title={[method.label, method.detail].filter(Boolean).join(' · ')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '-4px', fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              <Wallet size={12} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
              <span>
                <span style={{ fontWeight: 600 }}>{method.label}</span>
                {method.detail && <span style={{ color: 'var(--text-muted)' }}> · {method.detail}</span>}
                {method.paidAt && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' · '}
                    {new Date(method.paidAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </span>
            </div>
          );
        })()}
        {editPaymentTypeId === order.id ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <select
              value={editPaymentTypeValue}
              onChange={e => setEditPaymentTypeValue(e.target.value)}
              style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 6px' }}
            >
              <option value="cash">Готівка</option>
              <option value="invoice">Безготівковий (рахунок)</option>
              {/* Наложки в списку не було — з рахунку на неї перемкнути
                  було неможливо, лише навпаки */}
              <option value="cod">Накладений платіж</option>
              <option value="deferred">Відстрочка</option>
            </select>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => savePaymentType(order.id, editPaymentTypeValue)}
                disabled={savingPaymentType}
                style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: 'var(--surface)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                {savingPaymentType ? '...' : 'Зберегти'}
              </button>
              <button
                onClick={() => setEditPaymentTypeId(null)}
                style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                Скасувати
              </button>
            </div>
          </div>
        ) : isDropship ? (
          // Дропшип: закупку партнер уже заплатив з балансу при оформленні.
          // Ні зміни способу оплати, ні ручного внесення оплати тут бути не може —
          // це задвоїло б гроші (борг продажу закриває залік балансу партнера).
          <DropshipPaymentInfo order={order} />
        ) : isCod ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: 'var(--ok-bg)', color: 'var(--color-success)', border: '1px solid var(--border-success)' }}>
              <CreditCard size={12} /> Накладений платіж
            </div>
            <button onClick={() => { setEditPaymentTypeId(order.id); setEditPaymentTypeValue(['cash','invoice','deferred','cod'].includes(order.payment_type) ? order.payment_type : 'cash'); }} title="Змінити спосіб оплати" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1 }}>
              <Pencil size={11} />
            </button>
          </div>
        ) : order.payment_type === 'card' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: order.status === 'confirmed' ? 'var(--ok-bg)' : 'var(--brand-blue-light)', color: order.status === 'confirmed' ? 'var(--color-success)' : 'var(--brand-blue)', border: `1px solid ${order.status === 'confirmed' ? 'var(--border-success)' : 'var(--blue-border)'}` }}>
              <CreditCard size={12} />{order.status === 'confirmed' ? 'Оплата карткою — підтверджено' : 'Картка онлайн'}
            </div>
            <button onClick={() => { setEditPaymentTypeId(order.id); setEditPaymentTypeValue(['cash','invoice','deferred','cod'].includes(order.payment_type) ? order.payment_type : 'cash'); }} title="Змінити спосіб оплати" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1 }}>
              <Pencil size={11} />
            </button>
          </div>
        ) : (() => {
          const amountPaid  = Number(order.amount_paid ?? 0);
          const total       = Number(order.total_price);
          const remaining   = Math.max(0, total - amountPaid);
          const isPartial   = amountPaid > 0 && !paymentConfirmed;
          const payments    = orderPayments[order.id] ?? [];
          const isFormOpen  = payFormOpen[order.id] ?? false;
          const isSaving    = payFormSaving[order.id] ?? false;
          const modeLabel: Record<string, string> = { cash: 'Готівка', transfer: 'Безготівк.', card: 'Карта', acquiring: 'Еквайринг', adjustment: 'Коригування' };
          const defaultMode = order.payment_type === 'cash' ? 'cash' : 'transfer';
          const defaultRemaining = remaining > 0 ? remaining.toFixed(2) : total.toFixed(2);

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '32px', padding: '0 10px', borderRadius: '7px', fontSize: '11.5px', fontWeight: 600, boxSizing: 'border-box',
                  background: paymentConfirmed ? 'var(--ok-bg)' : isPartial ? 'var(--orange-bg)' : order.payment_type === 'cash' ? 'var(--bg-success)' : 'var(--amber-bg)',
                  color:      paymentConfirmed ? 'var(--color-success)'  : isPartial ? 'var(--orange)' : order.payment_type === 'cash' ? '#166534' : 'var(--color-warn)',
                  border: `1px solid ${paymentConfirmed ? 'var(--border-success)' : isPartial ? 'var(--orange-border)' : order.payment_type === 'cash' ? 'var(--border-success)' : 'var(--border-warn)'}`,
                }}>
                  <CreditCard size={12} />
                  {paymentConfirmed
                    ? `✓ Оплачено ${amountPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴`
                    : isPartial
                      ? `${amountPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} / ${total.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴`
                      : order.payment_type === 'cash' ? 'Оплата готівкою'
                      : order.payment_type === 'invoice' ? 'Безготівковий'
                      : order.payment_type === 'deferred'
                        ? `Відстрочка${order.payment_due_date ? ` · до ${new Date(order.payment_due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}` : ''}`
                      : 'Очікуємо оплату'}
                </div>
                <button onClick={() => { setEditPaymentTypeId(order.id); setEditPaymentTypeValue(['cash','invoice','deferred','cod'].includes(order.payment_type) ? order.payment_type : 'cash'); }} title="Змінити спосіб оплати" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1 }}>
                  <Pencil size={11} />
                </button>
                {!paymentConfirmed && !isFormOpen && (
                  <button
                    onClick={() => {
                      setPayFormOpen(prev  => ({ ...prev,  [order.id]: true }));
                      setPayFormMode(prev  => ({ ...prev,  [order.id]: defaultMode }));
                      setPayFormAmount(prev => ({ ...prev, [order.id]: defaultRemaining }));
                      setPayFormDate(prev  => ({ ...prev,  [order.id]: new Date().toISOString().slice(0, 10) }));
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: '1.5px solid #D6E3F0', background: '#EAF1F8', color: 'var(--brand-blue)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Plus size={11} /> Додати оплату
                  </button>
                )}
              </div>

              {/* Залишок */}
              {isPartial && (
                <div style={{ fontSize: '11px', color: '#9A3412' }}>
                  Залишок: {remaining.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴
                </div>
              )}

              {/* Форма додавання оплати */}

              {isFormOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', borderRadius: '8px', border: '1.5px solid var(--blue-border)', background: '#F0F9FF' }}>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <input
                      type="number" min="0.01" step="0.01"
                      placeholder="Сума"
                      value={payFormAmount[order.id] ?? ''}
                      onChange={e => setPayFormAmount(prev => ({ ...prev, [order.id]: e.target.value }))}
                      style={{ width: '90px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--line-slate)', fontSize: '12px' }}
                    />
                    <select
                      value={payFormMode[order.id] ?? defaultMode}
                      onChange={e => setPayFormMode(prev => ({ ...prev, [order.id]: e.target.value }))}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--line-slate)', fontSize: '12px', cursor: 'pointer' }}
                    >
                      <option value="cash">Готівка</option>
                      <option value="transfer">Безготівк.</option>
                      <option value="card">Карта</option>
                      <option value="acquiring">Еквайринг</option>
                    </select>
                    <input
                      type="date"
                      value={payFormDate[order.id] ?? new Date().toISOString().slice(0, 10)}
                      onChange={e => setPayFormDate(prev => ({ ...prev, [order.id]: e.target.value }))}
                      style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--line-slate)', fontSize: '12px' }}
                    />
                  </div>
                  <input
                    type="text" placeholder="Примітка (необов'язково)"
                    value={payFormNote[order.id] ?? ''}
                    onChange={e => setPayFormNote(prev => ({ ...prev, [order.id]: e.target.value }))}
                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--line-slate)', fontSize: '12px' }}
                  />
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => addPayment(order)}
                      disabled={isSaving}
                      style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: 'var(--surface)', fontSize: '12px', fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1 }}
                    >
                      {isSaving ? 'Збереження...' : 'Зберегти'}
                    </button>
                    <button
                      onClick={() => setPayFormOpen(prev => ({ ...prev, [order.id]: false }))}
                      style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--line-slate)', background: 'transparent', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              )}

              {/* Історія платежів */}
              {payments.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                  {payments.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: p.reversed ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: p.reversed ? 'line-through' : 'none' }}>
                      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{new Date(p.payment_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}</span>
                      <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 700, color: p.reversed ? 'var(--text-muted)' : 'var(--color-success)' }}>
                        {Number(p.amount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴
                      </span>
                      <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{modeLabel[p.payment_mode] ?? p.payment_mode}</span>
                      {p.note && <span title={p.note} style={{ flex: '1 1 auto', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word', color: 'var(--text-muted)' }}>· {p.note}</span>}
                      {!p.reversed && isAdmin && (
                        <button
                          onClick={() => reversePayment(order, p.id)}
                          disabled={payRemoving === p.id}
                          title="Скасувати платіж"
                          style={{ marginLeft: 'auto', display: 'flex', padding: '1px 4px', borderRadius: '4px', border: '1px solid var(--border-danger)', background: 'var(--bg-danger)', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '10px' }}
                        >
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        </div>
        {/* Коментар покупця — правий стовпець блоку «Оплата»; кламп на
            4 рядки, щоб довгий текст не розтягував картки (висота спільна
            з «Доставкою»); повний текст дає делегований hover-тултіп */}
        {(() => {
          const displayComment = order.comment?.split('\n').filter(line => !line.includes('Не передзвонювати')).join('\n').trim();
          return displayComment ? (
            <div style={{ flex: '1 1 160px', minWidth: '140px', borderLeft: '1px solid var(--border-light)', paddingLeft: '14px' }}>
              <div className="oc-sub-lbl" style={{ marginBottom: '2px' }}>Коментар</div>
              <ClampedComment text={displayComment} />
            </div>
          ) : null;
        })()}
        </div>
        </div>
      </div>
    </>
  );
}
