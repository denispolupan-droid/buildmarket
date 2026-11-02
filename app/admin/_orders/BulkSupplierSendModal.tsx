'use client';

import { X, Mail } from 'lucide-react';
import CreateTTNModal from '../../components/admin/CreateTTNModal';
import { showToast } from '../../../lib/toast';
import InvoiceOptionsModal from '../../components/admin/InvoiceOptionsModal';
import ReturnOrderModal from '../../components/admin/ReturnOrderModal';
import NpReturnModal from '../../components/admin/NpReturnModal';
import RozetkaDeliveryTtnModal from '../../components/admin/RozetkaDeliveryTtnModal';
import TtnDetailsModal from '../../components/admin/TtnDetailsModal';
import RzDeliveryTtnModal from '../../components/admin/RzDeliveryTtnModal';
import { useOrdersCtx } from './OrdersContext';

export function BulkSupplierSendModal() {
  const {
    bulkGroups, bulkOrderIds, bulkSending, setBulkGroups, bulkResults, senders,
    chosenSender, setChosenSender, bulkComment, setBulkComment, setSelectedIds, sendBulkSuppliers,
    returnFor, setReturnFor, router, npReturnFor, setNpReturnFor, invoiceCfg,
    setInvoiceCfg, setOrders, ttnModalOrder, setTtnModalOrder, setTtnValues, finishTtnFlow,
    ttnDetailsFor, setTtnDetailsFor, rzOwnTtnModal, rzMergeGroup, setRzOwnTtnModal, setRzMergeGroup,
    rzTtnModal, setRzTtnModal, mergeModal, setMergeModal,
  } = useOrdersCtx();
  return (
    <>
      {/* Consolidated bulk supplier send — one email per supplier */}
      {bulkGroups !== null && (() => {
        const sendable = bulkGroups.filter(g => g.supplierId != null && g.email.includes('@'));
        const totalOrders = bulkOrderIds.length;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (!bulkSending && e.target === e.currentTarget) setBulkGroups(null); }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '90vh', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

              {/* Header */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    📧 Надіслати постачальникам {bulkResults === null && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>({bulkGroups.length} {bulkGroups.length === 1 ? 'лист' : 'листів'})</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{totalOrders} замовлень · один лист на постачальника</div>
                </div>
                {!bulkSending && (
                  <button onClick={() => setBulkGroups(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                )}
              </div>

              {bulkResults !== null ? (
                <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {bulkResults.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '9px', background: r.emailed ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${r.emailed ? '#BBF7D0' : '#FECACA'}` }}>
                      <span style={{ fontSize: '18px' }}>{r.emailed ? '✅' : '⚠️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: r.emailed ? '#15803D' : '#B91C1C' }}>{r.supplierName}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {r.emailed ? 'Відправлено' : (r.error ? `Не відправлено: ${r.error}` : 'Не відправлено (немає email)')}{r.orderNumbers.length > 0 && ` · ${r.orderNumbers.map(n => `#${n}`).join(', ')}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Sender */}
                  {senders.length > 1 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Mail size={11} /> Відправник
                      </div>
                      <select value={chosenSender} onChange={e => setChosenSender(e.target.value)}
                        style={{ width: '100%', height: '38px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        {senders.map(s => (
                          <option key={s.email} value={s.email}>{s.name ? `${s.name} <${s.email}>` : s.email}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Supplier groups */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {bulkGroups.map((g, gi) => {
                      const hasSupplier = g.supplierId != null;
                      const validEmail = g.email.includes('@');
                      return (
                        <div key={gi} style={{ border: `1.5px solid ${hasSupplier && validEmail ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '10px', padding: '12px', background: 'var(--bg-soft)' }}>
                          {/* Назва постачальника й лічильник — одним рядком, номери
                              замовлень — під ними з переносом. Поки номери стояли
                              в тому ж рядку з flexShrink: 0, десяток замовлень
                              розпирав модалку вшир (20.10.2026). */}
                          <div style={{ marginBottom: '8px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.supplierName}</div>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{g.orderNumbers.length} зам.</div>
                            </div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                              {g.orderNumbers.map(n => `#${n}`).join(', ')}
                            </div>
                          </div>

                          {g.contacts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                              {g.contacts.map((c, ci) => {
                                const isSel = g.email === c.email;
                                return (
                                  <button key={ci} type="button"
                                    onClick={() => setBulkGroups(prev => prev ? prev.map((x, i) => i === gi ? { ...x, email: c.email } : x) : prev)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 9px', borderRadius: '7px', cursor: 'pointer', border: `1.5px solid ${isSel ? '#1E3A5F' : 'var(--border)'}`, background: isSel ? '#EFF4FF' : 'var(--bg-card)', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSel ? '#1E3A5F' : '#CBD5E1'}`, background: isSel ? '#1E3A5F' : 'transparent' }} />
                                    {c.name || c.email}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <input
                            type="email"
                            value={g.email}
                            onChange={e => setBulkGroups(prev => prev ? prev.map((x, i) => i === gi ? { ...x, email: e.target.value } : x) : prev)}
                            placeholder="email@supplier.com"
                            style={{ width: '100%', height: '34px', padding: '0 10px', border: `1.5px solid ${validEmail ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '7px', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                          />
                          {!hasSupplier && (
                            <div style={{ fontSize: '11px', color: '#B45309', marginTop: '5px' }}>⚠ Постачальника не визначено — це замовлення пропустимо, надішліть окремо</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Comment */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Коментар для всіх (необов&apos;язково)</label>
                    <textarea
                      value={bulkComment}
                      onChange={e => setBulkComment(e.target.value)}
                      placeholder="Термінове замовлення, потрібна доставка до п'ятниці..."
                      style={{ width: '100%', height: '60px', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--border-light)' }}>
                {bulkResults !== null ? (
                  <button onClick={() => {
                      setBulkGroups(null);
                      const sent = bulkResults.filter(r => r.emailed).length;
                      const failed = bulkResults.length - sent;
                      if (failed) showToast(`Листи постачальникам: надіслано ${sent}, не вдалося ${failed}`, 'error', 6000);
                      else showToast(`Листи постачальникам надіслано (${sent})`, 'success');
                      if (sent) setSelectedIds(new Set());
                    }}
                    style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Готово
                  </button>
                ) : (
                  <>
                    <button onClick={() => setBulkGroups(null)} disabled={bulkSending}
                      style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      Скасувати
                    </button>
                    <button onClick={sendBulkSuppliers} disabled={bulkSending || sendable.length === 0}
                      style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: sendable.length > 0 ? 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)' : '#94A3B8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: (bulkSending || sendable.length === 0) ? 'default' : 'pointer', opacity: bulkSending ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {bulkSending ? '⏳ Відправлення...' : `📧 Відправити всі (${sendable.length})`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {returnFor && (
        <ReturnOrderModal
          orderId={returnFor.id}
          orderNumber={returnFor.number}
          onClose={() => setReturnFor(null)}
          onDone={() => router.refresh()}
        />
      )}

      {npReturnFor && (
        <NpReturnModal
          orderId={npReturnFor.id}
          orderNumber={npReturnFor.number}
          onClose={() => setNpReturnFor(null)}
          onDone={() => router.refresh()}
        />
      )}

      {invoiceCfg && (
        <InvoiceOptionsModal
          order={{ id: invoiceCfg.id, invoice_as_company: invoiceCfg.invoice_as_company, invoice_options: invoiceCfg.invoice_options, customer_id: invoiceCfg.customer_id }}
          onClose={() => setInvoiceCfg(null)}
          onSaved={(v) => setOrders(prev => prev.map(o => o.id === invoiceCfg.id ? { ...o, ...v } : o))}
        />
      )}

      {ttnModalOrder && (
        <CreateTTNModal
          order={{
            id: ttnModalOrder.id,
            contact: ttnModalOrder.contact,
            phone: ttnModalOrder.phone,
            total_price: ttnModalOrder.total_price,
            payment_type: ttnModalOrder.payment_type,
            total_qty: ttnModalOrder.items.reduce((s, i) => s + i.qty, 0),
            items: ttnModalOrder.items.map(i => ({ sku: i.sku, qty: i.qty, name: i.name })),
            delivery_city_ref: ttnModalOrder.delivery_city_ref,
            delivery_city_name: ttnModalOrder.delivery_city_name,
            delivery_warehouse_ref: ttnModalOrder.delivery_warehouse_ref,
            delivery_subtype: ttnModalOrder.delivery_subtype,
            delivery_address: ttnModalOrder.delivery_address,
            customer_id: ttnModalOrder.customer_id,
            invoice_as_company: ttnModalOrder.invoice_as_company,
          }}
          onClose={() => setTtnModalOrder(null)}
          onCreated={async (ttn) => {
            const orderId = ttnModalOrder.id;
            setTtnValues(prev => ({ ...prev, [orderId]: ttn }));
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: ttn } : o));
            setTtnModalOrder(null);
            await finishTtnFlow([orderId]);
          }}
        />
      )}

      {ttnDetailsFor && (
        <TtnDetailsModal orderId={ttnDetailsFor.id} orderNumber={ttnDetailsFor.number} onClose={() => setTtnDetailsFor(null)} />
      )}
      {rzOwnTtnModal && (() => {
        const group = rzMergeGroup ?? [rzOwnTtnModal];
        const ids = group.map(o => o.id);
        return (
          <RzDeliveryTtnModal
            order={{
              id: rzOwnTtnModal.id, order_number: rzOwnTtnModal.order_number,
              items: group.flatMap(o => o.items).map(i => ({ sku: i.sku, qty: i.qty, name: i.name })),
              ...(ids.length > 1 ? { mergedIds: ids, mergedNumbers: group.map(o => o.order_number) } : {}),
            }}
            onClose={() => { setRzOwnTtnModal(null); setRzMergeGroup(null); }}
            onCreated={ttn => {
              setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, tracking_number: ttn } : o));
              ids.forEach(id => setTtnValues(prev => ({ ...prev, [id]: ttn })));
              setRzOwnTtnModal(null); setRzMergeGroup(null);
              if (ids.length > 1) setSelectedIds(new Set());
              showToast(`ЕН ROZETKA створена: ${ttn}${ids.length > 1 ? ` (${ids.length} замовлення)` : ''}`, 'success', 5000);
              void finishTtnFlow(ids);
            }}
          />
        );
      })()}

      {rzTtnModal && (() => {
        const group = rzMergeGroup ?? [rzTtnModal];
        const ids = group.map(o => o.id);
        return (
          <RozetkaDeliveryTtnModal
            order={{
              id: rzTtnModal.id, order_number: rzTtnModal.order_number,
              items: group.flatMap(o => o.items).map(i => ({ sku: i.sku, qty: i.qty, name: i.name })),
              ...(ids.length > 1 ? { mergedIds: ids, mergedNumbers: group.map(o => o.order_number) } : {}),
            }}
            onClose={() => { setRzTtnModal(null); setRzMergeGroup(null); }}
            onCreated={(ttn, warnings) => {
              setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, tracking_number: ttn } : o));
              ids.forEach(id => setTtnValues(prev => ({ ...prev, [id]: ttn })));
              setRzTtnModal(null); setRzMergeGroup(null);
              if (ids.length > 1) setSelectedIds(new Set());
              showToast(`Накладна Rozetka створена: ${ttn}${ids.length > 1 ? ` (${ids.length} замовлення)` : ''}`, 'success', 5000);
              // Об'єднана посилка: кабінет Rozetka знає номер лише по основному
              // замовленню; якщо решті його донести не вдалося — сказати зараз.
              if (warnings?.length) showToast(warnings.join('; '), 'error', 8000);
              // Далі — той самий хвіст, що й після накладної НП: у режимі
              // «постачальник» замовлення відвантажується саме.
              void finishTtnFlow(ids);
            }}
          />
        );
      })()}

      {mergeModal && (
        <CreateTTNModal
          order={mergeModal}
          onClose={() => setMergeModal(null)}
          onCreated={ttn => {
            const ids = mergeModal.mergedIds ?? [mergeModal.id];
            setOrders(prev => prev.map(o =>
              ids.includes(o.id) ? { ...o, tracking_number: ttn } : o
            ));
            ids.forEach(id => setTtnValues(prev => ({ ...prev, [id]: ttn })));
            setSelectedIds(new Set());
            setMergeModal(null);
            showToast(`ЕН НП створена: ${ttn} (${ids.length} замовлення)`, 'success', 5000);
            void finishTtnFlow(ids);
          }}
        />
      )}
    </>
  );
}
