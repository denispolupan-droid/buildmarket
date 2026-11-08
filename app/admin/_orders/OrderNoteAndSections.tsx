'use client';

import { Plus, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { estimateMarketplaceDeliveryFee, splitFeeByRevenue } from '../../../lib/marketplace-delivery-fee';
import type { Order } from './types';
import { useOrdersCtx } from './OrdersContext';
import { fmtInt, fmtMoney } from '../../../lib/format';

export function OrderNoteAndSections({ order }: {
  order: Order;
}) {
  const {
    noteEditing, setNoteEditing, saveInternalNote, noteSaving, setActionsOpen, isNarrow,
    actionsOpen, setFinLogOpen, finLogOpen, setHistoryOpen, historyOpen, fulfillmentData,
    rozetkaCommissionPct, promCommissionPct, feeTariffs, receiptLines, priceBlockOpen, setPriceBlockOpen,
    PRICE_TYPE_LABELS, changePriceType, discMode, setDiscMode, discInput, setDiscInput,
    applyDiscount, selectedMode, setSelectedMode, suppliersList, setShippingSupplier,
  } = useOrdersCtx();
  return (
    <>
      {/* Внутрішня нотатка — одним рядком під товарами. Це коментар до
          самого замовлення, тож поруч із його складом він доречніший, ніж
          окремою карткою в колонці дій, де з'їдав її висоту. */}
      <div className="order-col-card oc-acc oc-acc-note" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        {(() => {
          const note = order.internal_note ?? '';
          const editing = noteEditing[order.id] ?? false;
          // Немає нотатки і ніхто її не пише — тиха кнопка замість поля
          if (!editing && !note) {
            return (
              <button type="button" onClick={() => setNoteEditing(p => ({ ...p, [order.id]: true }))}
                title="Додати внутрішню нотатку до замовлення"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)' }}>
                <Plus size={12} /> Нотатка
              </button>
            );
          }
          // Нотатка є — показуємо текст; клік відкриває редагування
          if (!editing) {
            return (
              <>
                <span className="oc-sub-lbl" style={{ flexShrink: 0 }}>Нотатка</span>
                <button type="button" onClick={() => setNoteEditing(p => ({ ...p, [order.id]: true }))}
                  title="Змінити нотатку"
                  style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'text', fontSize: '12.5px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {note}
                </button>
              </>
            );
          }
          return (
            <>
              <span className="oc-sub-lbl" style={{ flexShrink: 0 }}>Нотатка</span>
              <input
                autoFocus
                key={`note-${order.id}-${note}`}
                defaultValue={note}
                onBlur={e => {
                  const v = e.target.value.trim();
                  if (v !== note) saveInternalNote(order.id, v);
                  setNoteEditing(p => ({ ...p, [order.id]: false }));
                }}
                onKeyDown={e => { if (e.key === 'Escape') { e.currentTarget.value = note; e.currentTarget.blur(); } }}
                placeholder="Напр. клієнт думає, чекаємо оплату…"
                style={{ flex: 1, minWidth: 0, height: '30px', padding: '0 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--bg-card)', outline: 'none' }} />
            </>
          );
        })()}
        {noteSaving === order.id && <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', flexShrink: 0 }}>Збереження…</span>}
        {/* На телефоні «Дії» — четвертий перемикач цього ряду: окрема
            кнопка над карткою з'їдала верх екрана, де й так тісно. */}
        <button type="button" className="oc-only-m"
          onClick={() => setActionsOpen(p => ({ ...p, [order.id]: !(p[order.id] ?? !isNarrow) }))}
          title="Дії із замовленням"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600, flexShrink: 0, marginLeft: 'auto',
            color: (actionsOpen[order.id] ?? !isNarrow) ? 'var(--brand-blue)' : 'var(--text-muted)' }}>
          {(actionsOpen[order.id] ?? !isNarrow) ? <ChevronUp size={12} /> : <Plus size={12} />}&nbsp;Дії
        </button>
        {/* Другорядні розділи — три однакові «плюси» в один ряд:
            нотатка, економіка і історія. Кожен із них потрібен зрідка,
            тож за замовчуванням вони згорнуті й важать один рядок. */}
        <span style={{ width: '1px', height: '14px', background: 'var(--border-light)', flexShrink: 0 }} />
        <button type="button" onClick={() => setFinLogOpen(p => ({ ...p, [order.id]: !(p[order.id] ?? false) }))}
          title="Собівартість, прибуток, тип цін і відвантаження постачальником"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600, flexShrink: 0,
            color: (finLogOpen[order.id] ?? false) ? 'var(--brand-blue)' : 'var(--text-muted)' }}>
          {(finLogOpen[order.id] ?? false) ? <ChevronUp size={12} /> : <Plus size={12} />}&nbsp;Фінанси<span className="oc-hide-m">&nbsp;та логістика</span>
        </button>
        <button type="button" onClick={() => setHistoryOpen(p => ({ ...p, [order.id]: !(p[order.id] ?? false) }))}
          title="Хронологія замовлення: статуси, накладна, повернення"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: 600, flexShrink: 0,
            color: (historyOpen[order.id] ?? false) ? 'var(--brand-blue)' : 'var(--text-muted)' }}>
          {(historyOpen[order.id] ?? false) ? <ChevronUp size={12} /> : <Plus size={12} />}&nbsp;Історія<span className="oc-hide-m">&nbsp;замовлення</span>
        </button>
      </div>
          <div className="oc-fin-side">
              {(finLogOpen[order.id] ?? false) && (<>
              <div className="oc-finlog-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px', alignItems: 'stretch' }}>
              <div className="order-col-card" style={{ minWidth: 0, padding: '14px', display: 'flex', flexDirection: 'column' }}>
              <div className="oc-lbl">Фінанси</div>
              {/* Економіка замовлення. Після проведення РН показуємо ФАКТ із проводок
                  (FIFO-собівартість, комісія з усіма зборами, сторно повернень); до того —
                  попередню оцінку (собівартість = поточна закупівля, комісія = збережена
                  при синку або серверний розрахунок брекетами/ставками категорій). */}
              {(() => {
                const fi = fulfillmentData[order.id];
                const fact = fi?.fact ?? null;
                const isFact = !!fact;
                const revenue = isFact ? fact.revenue : order.total_price;
                let commission: number | undefined;
                if (isFact) {
                  commission = fact.commission;
                } else if (order.channel_code === 'prom' || order.channel_code === 'rozetka' || order.channel_code === 'epicentr') {
                  const cd = order.channel_code === 'prom' ? order.prom_data?._commission
                    : order.channel_code === 'epicentr' ? order.epicentr_data?._commission
                    : order.rozetka_data?._commission;
                  commission = cd?.total_commission
                    ?? fi?.commission_estimate
                    ?? Math.round(order.total_price * (order.channel_code === 'rozetka' ? rozetkaCommissionPct : promCommissionPct)) / 100;
                } else {
                  commission = 0;
                }
                const cost = isFact ? fact.cogs : fi?.total_cost;
                const deliveryExp = isFact ? fact.delivery : 0;
                // Збір маркетплейсу за доставку (Smart / точка видачі / «дешева доставка»).
                // ТІЛЬКИ в оцінці: у факті він уже сидить усередині fact.commission,
                // і окремий рядок задвоїв би витрату.
                const mpDelivery = isFact ? null : estimateMarketplaceDeliveryFee(order, feeTariffs);
                const mpDeliveryFee = mpDelivery?.amount ?? 0;
                // Еквайринг і збори НП (лише факт) + винагорода RozetkaPay (факт з
                // реєстру або оцінка) — ті самі витрати угоди, що в «Огляді» й «Звітах»
                const extraExp = isFact ? (fact.extra ?? 0) : 0;
                const payFee = fi?.payment_fee ?? null;
                const payFeeAmt = payFee?.amount ?? 0;
                const gross = isFact ? fact.revenue - fact.cogs : fi?.total_margin;
                const grossPct = gross != null && revenue > 0 ? Math.round((gross / revenue) * 1000) / 10 : undefined;
                const net = gross != null && commission != null ? gross - commission - deliveryExp - mpDeliveryFee - extraExp - payFeeAmt : undefined;
                const netPct = net != null && revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : undefined;
                const finalColor = (v: number | undefined) => (v ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
                const row = (label: string, value: string, opts: { color?: string; strong?: boolean; total?: boolean; sub?: string; title?: string } = {}) => (
                  <div title={opts.title} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
                    ...(opts.total ? { marginTop: '3px', paddingTop: '9px', borderTop: '1px solid var(--border-light)' } : {}) }}>
                    <span style={{ fontSize: '12.5px', color: opts.total ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: opts.total ? 700 : 400 }}>{label}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: (opts.strong || opts.total) ? 700 : 600, color: opts.color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
                      {opts.sub && <span style={{ fontSize: '11px', fontWeight: 600, color: opts.color ?? 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginTop: '1px' }}>{opts.sub}</span>}
                    </span>
                  </div>
                );
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '-2px' }}>
                      <span title={isFact
                          ? `Цифри з бухгалтерських проводок (проведено РН: ${fact.posted_docs}). Враховано FIFO-собівартість, усі збори маркетплейсу та повернення.`
                          : 'Попередня оцінка до проведення продажу: собівартість за поточними цінами закупівлі, комісія — розрахунок за ставками маркетплейсу.'}
                        style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', letterSpacing: '0.03em', textTransform: 'uppercase',
                          color: isFact ? 'var(--color-success)' : 'var(--color-warn)', background: isFact ? 'var(--ok-bg)' : 'var(--amber-bg)' }}>
                        {isFact ? 'Факт' : 'Оцінка'}
                      </span>
                    </div>
                    {row('Виручка', `${fmtInt(revenue)} ₴`)}
                    {row('Собівартість', cost != null ? `${fmtInt(cost)} ₴` : '…', { color: 'var(--text-secondary)' })}
                    {(commission ?? 0) > 0 && row('Комісія маркетплейсу', `−${fmtInt(commission!)} ₴`, { color: 'var(--orange)' })}
                    {deliveryExp > 0 && row('Доставка НП (наш рахунок)', `−${fmtInt(deliveryExp)} ₴`, { color: 'var(--orange)' })}
                    {mpDelivery && row(mpDelivery.label, `−${fmtInt(mpDeliveryFee)} ₴`, { color: 'var(--orange)', title: mpDelivery.hint })}
                    {extraExp !== 0 && row('Еквайринг і збори НП', `−${fmtInt(extraExp)} ₴`, { color: 'var(--orange)', title: 'Еквайринг і збори Нової Пошти / Rozetka Доставки за це замовлення з бухгалтерських проводок (переказ наложки, утримання).' })}
                    {payFeeAmt > 0 && row(payFee!.source === 'fact' ? 'Комісія за оплату (RozetkaPay, еквайринг)' : 'Комісія за оплату ≈', `−${fmtInt(payFeeAmt)} ₴`, { color: 'var(--orange)',
                      title: payFee!.source === 'fact'
                        ? 'Комісія платіжного сервісу за оплату цього замовлення — точна: винагорода RozetkaPay з реєстру виплати або комісія банку за еквайринг (оплата карткою на сайті) з виписки Monobank.'
                        : 'RozetkaPay ще не виплатила гроші за це замовлення — оцінка за середньою ставкою винагороди за 90 днів.' })}
                    {row('Валовий прибуток', gross != null ? `${fmtInt(gross)} ₴` : '…', { color: finalColor(gross), strong: true, sub: grossPct != null ? `${grossPct}%` : undefined })}
                    {((commission ?? 0) > 0 || deliveryExp > 0 || mpDeliveryFee > 0 || extraExp !== 0 || payFeeAmt > 0) && row('Чистий прибуток', net != null ? `${fmtInt(net)} ₴` : '…', { color: finalColor(net), total: true, sub: netPct != null ? `${netPct}%` : undefined })}
                  </div>
                );
              })()}

              {/* Прогрес отримання — показується якщо є хоча б один прихід */}
              {(() => {
                const lines = receiptLines[order.id] ?? [];
                if (!lines.length) return null;
                // Агрегуємо отриману кількість по SKU
                const received: Record<string, number> = {};
                for (const l of lines) {
                  received[l.sku] = (received[l.sku] ?? 0) + (l.qty_actual ?? l.qty ?? 0);
                }
                const hasAny = order.items.some(i => (received[i.sku] ?? 0) > 0);
                if (!hasAny) return null;
                return (
                  <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--bg-success)', border: '1px solid var(--ok-border)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      📥 Отримано на склад
                    </div>
                    {order.items.map(item => {
                      const rcv = received[item.sku] ?? 0;
                      if (rcv === 0) return null;
                      const pct = Math.min(100, Math.round((rcv / item.qty) * 100));
                      const full = rcv >= item.qty;
                      return (
                        <div key={item.sku} style={{ marginBottom: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                            <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                              {item.name}
                            </span>
                            <span style={{ fontWeight: 700, color: full ? 'var(--color-success)' : 'var(--color-warn)', flexShrink: 0 }}>
                              {rcv} / {item.qty} шт {full ? '✓' : ''}
                            </span>
                          </div>
                          <div style={{ height: '4px', background: '#D1FAE5', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: full ? 'var(--color-success)' : 'var(--amber)', borderRadius: '2px', transition: 'width 0.3s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              </div>
              <div className="order-col-card" style={{ minWidth: 0, padding: '14px', display: 'flex', flexDirection: 'column' }}>
              <div className="oc-lbl">Логістика</div>
              {/* Тип цін + ручна знижка */}
              {(() => {
                const editable = ['new', 'confirmed', 'awaiting_stock', 'picking'].includes(order.status)
                  && order.channel_code !== 'dropship';
                const pt = order.price_type ?? 'retail';
                const activePct = Number(order.discount_pct ?? 0);
                const open = priceBlockOpen[order.id] ?? false;
                return (
                  <div style={{ marginBottom: '10px' }}>
                    <button type="button"
                      onClick={() => setPriceBlockOpen(p => ({ ...p, [order.id]: !open }))}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '32px', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg-soft)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>Тип цін: <strong>{PRICE_TYPE_LABELS[pt] ?? pt}</strong></span>
                        {activePct > 0
                          ? <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-warn)', background: 'var(--amber-bg)', borderRadius: '5px', padding: '1px 7px' }}>−{activePct}%</span>
                          : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+ знижка</span>}
                      </span>
                      <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                        {open ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                      </span>
                    </button>
                    {open && (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}
                        title="Тариф, за яким пораховані позиції. Зміна перерахує всі ціни за відповідним прайсом.">
                        Тип цін
                      </div>
                      {editable ? (
                        <select
                          value={pt}
                          onChange={e => { if (e.target.value !== pt) changePriceType(order.id, e.target.value); }}
                          style={{ width: '100%', height: '30px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
                          <option value="retail">Роздріб</option>
                          <option value="wholesale">Опт</option>
                          <option value="drop">Дроп</option>
                        </select>
                      ) : (
                        <div style={{ height: '30px', display: 'flex', alignItems: 'center', padding: '0 8px', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}
                          title={order.channel_code === 'dropship' ? 'Дропшип — ціна за собівартістю' : 'Ціни зафіксовані у проведеній накладній (відвантажено)'}>
                          {PRICE_TYPE_LABELS[pt] ?? pt}
                        </div>
                      )}
                    </div>
                    {(() => {
                      if (!editable) {
                        if (activePct > 0) {
                          return (
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Знижка</div>
                              <div style={{ height: '30px', display: 'flex', alignItems: 'center', padding: '0 8px', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--color-warn)', background: 'var(--bg-warn)' }}>
                                −{activePct}% (−{fmtMoney(Number(order.discount_amount ?? 0))} ₴)
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }
                      const mode = discMode[order.id] ?? 'pct';
                      return (
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}
                            title="Ручна знижка. Знижує ціни всіх позицій; сума замовлення перераховується.">
                            Знижка{activePct > 0 ? ` · зараз −${activePct}%` : ''}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <select
                              value={mode}
                              onChange={e => setDiscMode(p => ({ ...p, [order.id]: e.target.value as 'pct' | 'amount' }))}
                              style={{ height: '30px', padding: '0 4px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer' }}>
                              <option value="pct">%</option>
                              <option value="amount">₴</option>
                            </select>
                            <input
                              type="number" min="0" step="any"
                              value={discInput[order.id] ?? ''}
                              placeholder={mode === 'pct' ? 'напр. 10' : 'напр. 200'}
                              onChange={e => setDiscInput(p => ({ ...p, [order.id]: e.target.value }))}
                              style={{ width: '100%', height: '30px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)' }}
                            />
                            <button
                              onClick={() => applyDiscount(order.id, mode, parseFloat(discInput[order.id] ?? ''))}
                              style={{ height: '30px', padding: '0 10px', border: '1px solid #93C5FD', background: 'var(--brand-blue-light)', color: 'var(--navy)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >OK</button>
                          </div>
                          {activePct > 0 && (
                            <button
                              onClick={() => applyDiscount(order.id, 'pct', 0)}
                              style={{ marginTop: '4px', fontSize: '11px', color: 'var(--danger-dark)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            >Прибрати знижку −{activePct}%</button>
                          )}
                        </div>
                      );
                    })()}
                    </div>
                    )}
                  </div>
                );
              })()}
              {/* Спосіб виконання + Відвантажує пост. — в один рядок, однакова висота */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'stretch' }}>
              {order.status === 'new' && (() => {
                const plan = fulfillmentData[order.id]?.plan;
                const hasOwn = plan ? plan.has_own : true;
                return (
                  <div style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Спосіб виконання</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {(['supplier', 'own', 'mixed'] as const).map(mode => {
                        const label = mode === 'supplier' ? 'Постачальник' : mode === 'own' ? 'Наш склад' : 'Змішаний';
                        const active = (selectedMode[order.id] ?? 'supplier') === mode;
                        const disabled = !hasOwn && (mode === 'own' || mode === 'mixed');
                        return (
                          <button key={mode}
                            onClick={() => !disabled && setSelectedMode(prev => ({ ...prev, [order.id]: mode }))}
                            title={disabled ? 'Немає товару на власному складі' : undefined}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center',
                              cursor: disabled ? 'not-allowed' : 'pointer',
                              border: `1.5px solid ${active ? 'var(--navy)' : 'var(--border)'}`,
                              background: disabled ? 'var(--bg-soft)' : active ? 'var(--navy)' : 'var(--bg-card)',
                              color: disabled ? 'var(--text-muted)' : active ? 'var(--surface)' : 'var(--text-secondary)',
                              opacity: disabled ? 0.5 : 1 }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              {/* Хто фактично відвантажив — поряд зі способом виконання */}
              {(order.fulfillment_mode ?? 'supplier') !== 'own' && suppliersList.length > 0 && (
                <div style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                    title="Хто фактично відвантажив товар. Борг перед постачальником при відправці буде віднесено саме на нього.">
                    Відвантажує пост.
                  </div>
                  <select
                    value={order.shipping_supplier_id ?? ''}
                    onChange={e => { const v = e.target.value === '' ? null : parseInt(e.target.value); if (v !== (order.shipping_supplier_id ?? null)) setShippingSupplier(order.id, v); }}
                    style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', color: order.shipping_supplier_id ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: order.shipping_supplier_id ? 600 : 400 }}>
                    <option value="">— за мапінгом SKU —</option>
                    {suppliersList.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                  {order.status === 'shipped' && !order.shipping_supplier_id && (
                    <div style={{ fontSize: '10px', color: 'var(--color-warn)', marginTop: '4px', lineHeight: 1.3 }}>⚠ Постачальника не підтверджено — борг віднесено за мапінгом</div>
                  )}
                </div>
              )}
              </div>
              {/* Власний склад недоступний — під блоками, на всю ширину */}
              {order.status === 'new' && fulfillmentData[order.id]?.plan?.has_own === false && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  ℹ️ Власний склад недоступний — всі товари у постачальника
                </div>
              )}
              </div>
              </div>
              {/* Прибуток по постачальниках — усередині згортання Фінанси+Логістика */}
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <TrendingUp size={12} /> Прибуток по постачальниках
              </div>
              {fulfillmentData[order.id] && (() => {
                const fi = fulfillmentData[order.id];
                // Per-SKU marketplace commission (Prom/Rozetka) для показу в розбивці по позиціях
                const commItems = order.channel_code === 'prom' ? order.prom_data?._commission?.items
                                : order.channel_code === 'rozetka' ? order.rozetka_data?._commission?.items
                                : order.channel_code === 'epicentr' ? order.epicentr_data?._commission?.items
                                : undefined;
                const commBySku = new Map<string, { amt: number; pct: number }>();
                (commItems ?? []).forEach(c => commBySku.set(c.sku, { amt: c.commission_amt, pct: c.commission_pct }));
                const hasComm = commBySku.size > 0;
                // Збір за доставку — на ЗАМОВЛЕННЯ, а не на позицію: у рядок товару його не
                // покласти. Розкидаємо між постачальниками пропорційно їхній виручці (у
                // звичайному замовленні постачальник один, тож уся сума йде йому) і показуємо
                // окремим рядком — інакше підсумок групи мовчки не сходився б із «Економікою».
                const mpFee = estimateMarketplaceDeliveryFee(order, feeTariffs);
                const feeShares = splitFeeByRevenue(
                  mpFee?.amount ?? 0,
                  fi.by_supplier.map(g => g.items.reduce((s, it) => s + it.sale_price * it.qty, 0)),
                );
                const activeReservations = (fi.reservations ?? []).filter(r => r.reservation_status === 'active');
                return (
                  <div style={{ marginTop: '8px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', fontSize: '12px' }}>
                    {/* Підсумки (виручка/собів/маржа/комісія) — у блоці «Економіка» вище, тут лише
                        деталізація по поставщику. Показуємо тільки резерв (його немає вгорі). */}
                    {activeReservations.length > 0 && (
                      <div style={{ display: 'flex', padding: '7px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
                        <span style={{ background: 'var(--ok-bg)', color: 'var(--color-success)', padding: '1px 8px', borderRadius: '20px', fontWeight: 700 }}>
                          ✓ Зарезервовано: {activeReservations.length} поз.
                        </span>
                      </div>
                    )}

                    {/* Per-supplier breakdown. При маркетплейс-комісії показуємо ЧИСТУ маржу
                        (маржа − комісія), щоб математика сходилась із блоком «Економіка». */}
                    {fi.by_supplier.map((group, gi) => {
                      const groupComm = group.items.reduce((s, it) => s + (commBySku.get(it.sku)?.amt ?? 0), 0);
                      const groupFee = feeShares[gi] ?? 0;
                      const groupNet = group.total_margin - groupComm - groupFee;
                      return (
                      <div key={gi} style={{ borderBottom: gi < fi.by_supplier.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                        <div title={`Валовий прибуток ${fmtInt(group.total_margin)}${groupComm > 0 ? ` − комісія ${fmtInt(groupComm)}` : ''}${groupFee > 0 ? ` − ${mpFee!.label.toLowerCase()} ${fmtInt(groupFee)}` : ''} = ${fmtInt(groupNet)} ₴`}
                          style={{ padding: '7px 12px', background: 'var(--bg-soft)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                          <span>📦 {group.supplier_name ?? 'Невідомий поставщик'}</span>
                          <span style={{ color: groupNet >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {groupNet >= 0 ? '+' : ''}{fmtInt(groupNet)} грн{(hasComm || groupFee > 0) ? ' чистими' : ''}
                          </span>
                        </div>
                        {group.items.map((item, ii) => {
                          const c = commBySku.get(item.sku);
                          const net = item.margin - (c?.amt ?? 0);
                          return (
                            <div key={ii} style={{ display: 'grid', gridTemplateColumns: hasComm ? 'auto 1fr auto auto auto' : 'auto 1fr auto auto auto', gap: '8px', padding: '6px 12px', alignItems: 'center', borderTop: '1px solid var(--border-light)', fontSize: '12px' }}>
                              <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>{item.supplier_sku ?? item.sku}</span>
                              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.qty} шт</span>
                              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '11px' }}
                                title={hasComm && c ? `Валовий прибуток ${fmtInt(item.margin)} − комісія ${fmtInt(c.amt)}${c.pct ? ` (${c.pct}%)` : ''}` : 'Собівартість → продаж'}>
                                {fmtInt(item.cost_price)}→{fmtInt(item.sale_price)}{hasComm && c ? ` −${fmtInt(c.amt)}к` : ''}
                              </span>
                              <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                {net >= 0 ? '+' : ''}{fmtInt(net)} грн
                              </span>
                            </div>
                          );
                        })}
                        {groupFee > 0 && (
                          <div title={mpFee!.hint}
                            style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '6px 12px', alignItems: 'center', borderTop: '1px solid var(--border-light)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <span>🚚 {mpFee!.label}{fi.by_supplier.length > 1 ? ' · частка' : ''}</span>
                            <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--orange)' }}>−{fmtInt(groupFee)} грн</span>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                );
              })()}
              </>)}
          </div>
    </>
  );
}
