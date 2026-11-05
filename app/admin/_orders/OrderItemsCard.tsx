'use client';

import { Package, Pencil, Trash2, Plus, X, Check, Copy, RotateCcw } from 'lucide-react';
import { STATUSES, SOURCE_EDITABLE_STATUSES } from './constants';
import type { Order } from './types';
import { useOrdersCtx } from './OrdersContext';
import { fmtInt, fmtMoney } from '../../../lib/format';

export function OrderItemsCard({ order, isCod, paymentConfirmed, isDropship }: {
  order: Order;
  isCod: boolean;
  paymentConfirmed: boolean;
  isDropship: boolean;
}) {
  const {
    editingId, setEditingId, startEdit, editWarnings, setEditWarnings, editItems,
    setCopiedSku, copiedSku, setEditItems, prodRef, prodSearch, setProdSearch,
    prodResults, setProdOpen, prodOpen, setAddSku, setAddName, setAddPrice,
    addName, addQty, setAddQty, addPrice, addItem, saveEdit,
    editSaving, fulfillmentData, sourceOverrides, itemProducts, custStats, fulfillmentLoading,
    copiedSupplierSku, setCopiedSupplierSku, savingSource, setSourceOverrides, applySourceChange,
  } = useOrdersCtx();
  return (
    <>
      {/* Картка «Товари» тягнеться по вмісту, а не по висоті сусідньої
          колонки. Було flex:1 + justify-content:center — замовлення з
          однією позицією розтягувалось на всю висоту правого сайдбара
          і рядок висів посеред порожнечі. */}
      <div className="order-col-card oc-acc oc-acc-items" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="oc-lbl">Товари</span>
            <button
              onClick={() => editingId === order.id ? setEditingId(null) : startEdit(order)}
              title={editingId === order.id ? 'Скасувати редагування складу' : 'Змінити склад замовлення'}
              style={{
                flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', lineHeight: 1,
                display: 'inline-flex', color: editingId === order.id ? '#EF4444' : 'var(--text-muted)',
              }}
            >
              {editingId === order.id ? <X size={13} /> : <Pencil size={12} />}
            </button>
          </div>

          {/* Зауваження обліку після правки складу: правку збережено,
              але менеджер має побачити наслідки до друку документів. */}
          {editWarnings[order.id]?.length > 0 && (
            <div style={{ margin: '0 0 8px', fontSize: '12px', color: 'var(--text-warn-dark)', background: 'var(--bg-warn)', border: '1px solid #FDE68A', borderRadius: '8px', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, marginBottom: '3px' }}>
                Збережено, але зверніть увагу:
                <button onClick={() => setEditWarnings(prev => { const n = { ...prev }; delete n[order.id]; return n; })}
                  title="Приховати" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-warn-dark)', lineHeight: 1 }}>
                  <X size={12} />
                </button>
              </div>
              {editWarnings[order.id].map((w, i) => <div key={i} style={{ marginTop: i ? '3px' : 0 }}>• {w}</div>)}
            </div>
          )}

          {editingId === order.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {editItems.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '2px' }}>{item.sku}</span>
                    <button onClick={() => { navigator.clipboard.writeText(item.sku); setCopiedSku(item.sku); setTimeout(() => setCopiedSku(null), 1500); }} title="Копіювати артикул"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px 0 0', color: copiedSku === item.sku ? 'var(--color-success)' : 'var(--text-muted)', lineHeight: 1, fontSize: '11px' }}>
                      {copiedSku === item.sku ? '✓' : '⎘'}
                    </button>{item.name}
                  </span>
                  <input type="number" min={1} value={item.qty}
                    onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(1, parseInt(e.target.value) || 1) } : it))}
                    style={{ width: '46px', height: '26px', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center', fontSize: '12px', outline: 'none' }} />
                  <span style={{ color: item.is_bonus ? 'var(--color-success)' : 'var(--text-secondary)', width: '70px', textAlign: 'right', flexShrink: 0, fontWeight: item.is_bonus ? 600 : 400 }}>
                    {item.is_bonus ? '🎁 0 ₴' : `${fmtInt(item.price * item.qty)} грн`}
                  </span>
                  <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px', flexShrink: 0, display: 'flex' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '8px', marginTop: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Додати товар</div>
                <div ref={prodRef} style={{ position: 'relative', marginBottom: '6px' }}>
                  <input placeholder="Пошук за назвою або SKU..." value={prodSearch}
                    onChange={e => setProdSearch(e.target.value)}
                    onFocus={() => prodResults.length > 0 && setProdOpen(true)}
                    style={{ width: '100%', height: '28px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                  {prodOpen && prodResults.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: '160px', overflowY: 'auto' }}>
                      {prodResults.map(p => (
                        <button key={p.sku} onMouseDown={() => {
                          setAddSku(p.sku); setAddName(`${p.brand} ${p.name}`); setAddPrice(String(p.price));
                          setProdSearch(`${p.brand} ${p.name}`); setProdOpen(false);
                        }} style={{ width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>
                          <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{p.sku}</span>{p.brand} {p.name}
                          {p.price > 0 && <span style={{ color: 'var(--brand-blue)', marginLeft: '6px', fontWeight: 600 }}>{p.price} грн</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px auto', gap: '4px', alignItems: 'center' }}>
                  <input placeholder="Назва товару" value={addName} onChange={e => setAddName(e.target.value)}
                    style={{ height: '28px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                  <input placeholder="К-сть" type="number" min={1} value={addQty} onChange={e => setAddQty(parseInt(e.target.value) || 1)}
                    style={{ height: '28px', padding: '0 6px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', textAlign: 'center', outline: 'none' }} />
                  <input placeholder="Ціна" type="number" min={0} value={addPrice} onChange={e => setAddPrice(e.target.value)}
                    style={{ height: '28px', padding: '0 6px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                  <button onClick={addItem} style={{ height: '28px', width: '28px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={13} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)' }}>
                  Разом: {fmtMoney(editItems.reduce((s, i) => s + i.price * i.qty, 0))} грн
                </span>
                <button onClick={() => saveEdit(order.id)} disabled={editSaving}
                  style={{ height: '30px', padding: '0 14px', borderRadius: '7px', border: 'none', background: 'var(--navy)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', opacity: editSaving ? 0.6 : 1 }}>
                  {editSaving ? '...' : <><Check size={12} /> Зберегти</>}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Items table */}
              <div className="oc-items-scroll" style={{ padding: '2px 0 0' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <colgroup>
                  <col />
                  <col className="oc-col-sku" style={{ width: '104px' }} />
                  <col style={{ width: '44px' }} />
                  <col style={{ width: '62px' }} />
                  <col style={{ width: '70px' }} />
                  <col className="oc-col-src" style={{ width: '90px' }} />
                </colgroup>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '2px 0 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Назва</th>
                    <th className="oc-col-sku" style={{ textAlign: 'left', padding: '2px 6px 8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '104px', whiteSpace: 'nowrap' }}>Артикул</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '44px', whiteSpace: 'nowrap' }}>К-сть</th>
                    <th style={{ textAlign: 'right', padding: '2px 6px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '62px', whiteSpace: 'nowrap' }}>Ціна</th>
                    <th style={{ textAlign: 'right', padding: '2px 0 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '70px' }}>Сума</th>
                    <th className="oc-col-src" style={{ textAlign: 'right', padding: '2px 0 8px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '90px' }}>Джерело</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const planItems = fulfillmentData[order.id]?.plan?.items ?? [];
                    const sources = order.items.map(item => {
                      const planSrc = planItems.find(s => s.sku === item.sku);
                      return sourceOverrides[order.id]?.[item.sku] ?? planSrc?.fulfillment_type;
                    }).filter(Boolean);
                    const isMixed = new Set(sources).size > 1;
                    // Весь список одразу: приховані позиції змушували
                    // клікати, щоб побачити, що саме в замовленні — а це
                    // перше питання до розгорнутої картки.
                    const shown = order.items;

                    const rows = shown.map(item => {
                      const planSrc = planItems.find(s => s.sku === item.sku);
                      const effectiveSrc = sourceOverrides[order.id]?.[item.sku] ?? planSrc?.fulfillment_type;
                      const supplierName = fulfillmentData[order.id]?.by_supplier?.flatMap(g => g.items).find(i => i.sku === item.sku)?.supplier_name;
                      const srcBg = isMixed
                        ? effectiveSrc === 'own' ? '#F0FDF4' : '#EFF4FF'
                        : undefined;
                      const srcBorder = isMixed
                        ? effectiveSrc === 'own' ? '2px solid #86EFAC' : '2px solid #BFDBFE'
                        : undefined;
                      // Сторінка товару в магазині: слаг, якщо він уже підвантажився,
                      // інакше SKU — /product/<sku> сам 308-редіректить на ЧПУ.
                      const slug = itemProducts[order.id]?.[item.sku]?.slug;
                      const shopUrl = `/product/${encodeURIComponent(slug || item.sku)}`;
                      return (
                        <tr key={item.sku} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          {/* Назва — мініатюра + назва зверху жирнішим, код нижче */}
                          <td className="oc-col-name" style={{ padding: '10px 0', maxWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              {(() => {
                                const img = itemProducts[order.id]?.[item.sku]?.image;
                                // Фото — в адмінку (редагувати), назва — у магазин (як бачить покупець)
                                return (
                                  <a href={`/admin/products/${encodeURIComponent(item.sku)}`} target="_blank" rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()} title="Відкрити картку товару в адмінці"
                                    style={{ width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0, border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: img ? `#fff url("${img}") center/cover no-repeat` : '#fff' }}>
                                    {!img && <Package size={16} color="var(--text-muted)" />}
                                  </a>
                                );
                              })()}
                              <div style={{ minWidth: 0 }}>
                                <a href={shopUrl} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  title="Відкрити товар у магазині"
                                  style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.006em', textDecoration: 'none' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand-blue)'; e.currentTarget.style.textDecoration = 'underline'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.textDecoration = 'none'; }}>{item.name}</a>
                                {(() => {
                                  // Клієнт уже купував цей артикул — для «як минулого разу»
                                  const b = custStats[order.id]?.bought?.[item.sku];
                                  if (!b) return null;
                                  const last = new Date(b.last).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: '2-digit' });
                                  return (
                                    <div title={`Клієнт уже купував цей товар: ${b.qty} шт у ${b.orders} замовл., востаннє ${last}`}
                                      style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '11px', fontWeight: 600, color: '#0E7490' }}>
                                      <RotateCcw size={10} /> брав {b.qty} шт · {last}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </td>
                          {/* Артикул — окремий стовпець */}
                          <td className="oc-col-sku" style={{ padding: '10px 6px 10px 12px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{item.sku}</span>
                              <button onClick={() => { navigator.clipboard.writeText(item.sku); setCopiedSku(item.sku); setTimeout(() => setCopiedSku(null), 1500); }} title="Копіювати артикул"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedSku === item.sku ? 'var(--color-success)' : 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
                                {copiedSku === item.sku ? <Check size={12} /> : <Copy size={12} />}
                              </button>
                            </div>
                            {(() => {
                              // Код постачальника — другим рядком і приглушено. Він потрібен
                              // рівно в один момент (замовити в постачальника), тож не має
                              // конкурувати з нашим артикулом за увагу: 9–9,5 px — найдрібніший
                              // текст у таблиці. Мітка «sup» обов'язкова: коди того самого
                              // формату (1509-023 проти 2105-023), без неї їх плутають. Малими
                              // й латиницею: великі літери читаються як наголос, а підпис має
                              // бути тихішим за сам код, який він підписує.
                              // Поки джерело вантажиться — тримаємо місце під рядок, інакше
                              // таблиця смикається на кожному відкритті картки.
                              if (fulfillmentLoading.has(order.id) && !fulfillmentData[order.id]) {
                                return (
                                  <div style={{ marginTop: '2px', color: 'var(--text-muted)', fontSize: '9px', letterSpacing: '0.04em', opacity: 0.5 }}>sup …</div>
                                );
                              }
                              const supSku = fulfillmentData[order.id]?.by_supplier
                                ?.flatMap(g => g.items).find(i => i.sku === item.sku)?.supplier_sku;
                              if (!supSku || supSku === item.sku) return null;
                              const copied = copiedSupplierSku === `${order.id}:${item.sku}`;
                              return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '9px', letterSpacing: '0.02em' }}>sup</span>
                                  <span title={`Код постачальника: ${supSku}`}
                                    style={{ color: 'var(--text-muted)', fontSize: '9.5px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{supSku}</span>
                                  <button onClick={() => {
                                    navigator.clipboard.writeText(supSku);
                                    setCopiedSupplierSku(`${order.id}:${item.sku}`);
                                    setTimeout(() => setCopiedSupplierSku(null), 1500);
                                  }} title="Копіювати код постачальника"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copied ? 'var(--color-success)' : 'var(--text-muted)', opacity: copied ? 1 : 0.6, lineHeight: 1, display: 'inline-flex' }}>
                                    {copied ? <Check size={10} /> : <Copy size={10} />}
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="oc-col-qty" style={{ padding: '10px 6px', color: 'var(--text-primary)', textAlign: 'right', fontSize: '12.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>{item.qty}</td>
                          <td className="oc-col-price" style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                            {item.is_bonus ? '' : `${fmtInt(item.price)} ₴`}
                          </td>
                          <td className="oc-col-sum" style={{ padding: '10px 0', textAlign: 'right', verticalAlign: 'middle' }}>
                            {item.is_bonus
                              ? <span style={{ color: 'var(--color-success)', fontSize: '11px', fontWeight: 700, background: 'var(--bg-success)', padding: '1px 6px', borderRadius: '4px' }}>🎁 Бонус</span>
                              : <span style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtInt(item.price * item.qty)} ₴</span>
                            }
                          </td>
                          <td className="oc-col-src" style={{ padding: '10px 0 10px 8px', textAlign: 'right', verticalAlign: 'middle', background: srcBg, borderLeft: srcBorder, borderRadius: isMixed ? '6px' : undefined }}>
                            {fulfillmentLoading.has(order.id) ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>…</span>
                            ) : planSrc ? (
                              (() => {
                              // Джерело міняється, доки замовлення не пішло в збирання:
                              // після проведення ще лишається час вирішити, чим відвантажувати
                              // (з'явився нюанс у постачальника, приїхав товар на свій склад).
                              const srcEditable = SOURCE_EDITABLE_STATUSES.includes(order.status);
                              const busy = savingSource === `${order.id}:${item.sku}`;
                              // Джерело вже зафіксоване документами і міняти його пізно —
                              // показуємо як факт. Замкнений select виглядав так, ніби
                              // вибір ще триває, а насправді рішення давно записане в РН.
                              if (!srcEditable && fulfillmentData[order.id]?.source_fixed) {
                                const own = effectiveSrc === 'own';
                                return (
                                  <span
                                    title="Зафіксовано при відвантаженні — за цим рядком видаткової поїхав товар"
                                    style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
                                      color: own ? 'var(--color-success)' : 'var(--brand-blue)' }}>
                                    {own ? 'Наш склад' : (supplierName ?? 'Постач.')}
                                  </span>
                                );
                              }
                              return (
                              <select
                                value={effectiveSrc ?? planSrc.fulfillment_type}
                                disabled={!srcEditable || busy}
                                // Замкнений селект без пояснення читається як поломка —
                                // кажемо, чому саме він замкнений.
                                title={
                                  !srcEditable
                                    ? `Джерело міняється до збирання замовлення (зараз — «${STATUSES.find(s => s.value === order.status)?.label ?? order.status}»)`
                                    : (planSrc.available_own ?? 0) >= item.qty
                                      ? 'Звідки відвантажуємо цю позицію'
                                      : `На власному складі немає потрібної кількості (є ${planSrc.available_own ?? 0}, треба ${item.qty}) — лишається постачальник`
                                }
                                onChange={e => {
                                  const value = e.target.value as 'own' | 'dropship';
                                  setSourceOverrides(prev => ({
                                    ...prev,
                                    [order.id]: { ...(prev[order.id] ?? {}), [item.sku]: value },
                                  }));
                                  // Поки замовлення «Нове», вибір застосується при проведенні.
                                  // Проведене — треба одразу переставити резерви й ЗП.
                                  if (order.fulfillment_mode !== null) {
                                    void applySourceChange(order, item.sku, value);
                                  }
                                }}
                                style={{ fontSize: '11px', fontWeight: 600, border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 6px', background: 'var(--bg-soft)',
                                  cursor: srcEditable && !busy ? 'pointer' : 'default',
                                  maxWidth: '90px', opacity: srcEditable && !busy ? 1 : 0.7,
                                  color: effectiveSrc === 'own' ? 'var(--color-success)' : 'var(--brand-blue)' }}
                              >
                                <option value="dropship">{supplierName ?? 'Постач.'}</option>
                                {/* Варіант «наш» показуємо і тоді, коли залишку вже
                                    немає, але позиція саме звідти й поїхала: інакше
                                    select не має що показати під своїм значенням і
                                    малює перший варіант — тобто постачальника. */}
                                {((planSrc.available_own ?? 0) >= item.qty || (effectiveSrc ?? planSrc.fulfillment_type) === 'own') && (
                                  <option value="own">
                                    {(planSrc.available_own ?? 0) >= item.qty ? `Наш (${planSrc.available_own})` : 'Наш склад'}
                                  </option>
                                )}
                              </select>
                              );
                              })()
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    });
                    // Підсумок — у самій таблиці, під позиціями: сума в шапці
                    // відповідає на «скільки це коштує загалом», а тут вона
                    // закриває стовпчик «Сума» й показує, що рядки зійшлися.
                    rows.push(
                      <tr className="oc-total-row" key="__total">
                        <td colSpan={4} style={{ padding: '10px 0 0', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>Разом</td>
                        <td style={{ padding: '10px 0 0', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmtInt(Number(order.total_price))} ₴
                        </td>
                        <td style={{ padding: '10px 0 0' }} />
                      </tr>
                    );
                    // Гроші: скільки вже прийшло і скільки ще винні. Показуємо
                    // тільки коли є розрив — часткова оплата або виставлений
                    // рахунок без грошей. Накладений платіж сюди не потрапляє:
                    // там уся сума за визначенням прийде при врученні, і рядок
                    // «До сплати» на кожному COD-замовленні був би шумом.
                    (() => {
                      const totalSum = Number(order.total_price);
                      const paid = Number(order.amount_paid ?? 0);
                      const left = Math.max(0, totalSum - paid);
                      const partial = paid > 0 && left > 0;
                      const unpaidInvoice = !isCod && !paymentConfirmed && paid === 0 && left > 0;
                      // Дропшип: total — сума клієнта партнера, а нам він платить закупку
                      // з балансу; «До сплати» тут був би неправдою (див. DropshipPaymentInfo)
                      if (isDropship || (!partial && !unpaidInvoice)) return;
                      const line = (key: string, label: string, value: number, color: string) => rows.push(
                        <tr className="oc-total-row" key={key}>
                          <td colSpan={4} style={{ padding: '2px 0 0', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>{label}</td>
                          <td style={{ padding: '2px 0 0', textAlign: 'right', fontSize: '12.5px', fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                            {fmtInt(value)} ₴
                          </td>
                          <td style={{ padding: '2px 0 0' }} />
                        </tr>
                      );
                      if (partial) line('__paid', 'Оплачено', paid, '#15803D');
                      line('__left', 'До сплати', left, '#B45309');
                    })();
                    return rows;
                  })()}
                </tbody>
              </table>
              </div>

              {/* «Тип цін + знижка» перенесено в картку «Логістика» нижче */}


            </div>
          )}
        </div>
      </div>
    </>
  );
}
