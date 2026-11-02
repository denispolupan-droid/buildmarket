'use client';

import { X, Mail } from 'lucide-react';
import { useOrdersCtx } from './OrdersContext';
import { Modal } from '../../components/admin/ui/Modal';

export function SupplierSendQueueModal() {
  const {
    supplierQueueLoading, supplierQueue, supplierQueueIdx, supplierQueueSending, supplierQueueDone, setSupplierQueue,
    senders, chosenSender, setChosenSender, advanceSupplierQueue, sendCurrentSupplier,
  } = useOrdersCtx();
  return (
    <>
      {/* Supplier send queue modal */}
      {(supplierQueueLoading || supplierQueue !== null) && (() => {
        const item = supplierQueue?.[supplierQueueIdx];
        const total = supplierQueue?.length ?? 0;
        const idx = supplierQueueIdx;
        return (
          <Modal open onClose={() => { if (!supplierQueueSending && !supplierQueueDone) setSupplierQueue(null); }} width={460} padding={0} dismissible={!supplierQueueSending && !supplierQueueDone} aria-label="Черга листів постачальникам">
            <div style={{ background: 'var(--bg-card)', overflow: 'hidden', width: '100%' }}>

              {/* Header */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    📧 Надіслати постачальнику {total > 1 && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>({idx + 1} / {total})</span>}
                  </div>
                  {item && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Замовлення #{item.orderNumber}</div>}
                </div>
                {!supplierQueueSending && !supplierQueueDone && (
                  <button onClick={() => setSupplierQueue(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                )}
              </div>

              {supplierQueueLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  ⏳ Завантаження даних постачальника...
                </div>
              ) : supplierQueueDone ? (
                <div style={{ padding: '28px 22px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '28px' }}>✅</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803D' }}>Відправлено!</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      #{item?.orderNumber} → {item?.supplierName} ({item?.email || 'email постачальника'})
                    </div>
                  </div>
                </div>
              ) : item ? (
                <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Змішане замовлення: частина позицій — з нашого складу. Без цього
                      блоку постачальник отримував і їх, тобто чуже завдання. */}
                  {(() => {
                    const own = item.lines.filter(l => l.source === 'own');
                    const fromSupplier = item.lines.filter(l => l.source !== 'own');
                    if (!own.length || !fromSupplier.length) return null;
                    const chip = (active: boolean): React.CSSProperties => ({
                      padding: '5px 11px', borderRadius: '999px', fontSize: '12px', cursor: 'pointer',
                      fontWeight: active ? 700 : 600,
                      border: `1.5px solid ${active ? '#B45309' : 'var(--border)'}`,
                      background: active ? '#FEF3C7' : 'var(--bg-card)',
                      color: active ? '#92400E' : 'var(--text-secondary)',
                    });
                    return (
                      <div style={{ border: '1.5px solid #FCD34D', background: '#FFFBEB', borderRadius: '9px', padding: '11px 13px' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#B45309', marginBottom: '3px' }}>
                          Замовлення відвантажується з двох складів
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                          {fromSupplier.length} поз. — від постачальника, {own.length} — з нашого складу.
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '9px' }}>
                          {item.lines.map(l => {
                            const skip = l.source === 'own' && item.scope === 'supplier';
                            return (
                              <div key={l.sku} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', opacity: skip ? 0.45 : 1 }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px', whiteSpace: 'nowrap',
                                  color: l.source === 'own' ? '#15803D' : 'var(--brand-blue)',
                                  background: l.source === 'own' ? '#DCFCE7' : '#EAF1F8' }}>
                                  {l.source === 'own' ? 'наш склад' : 'постачальник'}
                                </span>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: skip ? 'line-through' : 'none' }}>
                                  {l.name}
                                </span>
                                <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{l.qty} шт</span>
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button type="button" style={chip(item.scope === 'supplier')}
                            onClick={() => setSupplierQueue(prev => prev
                              ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, scope: 'supplier' as const } : it)
                              : prev)}>
                            Тільки його позиції ({fromSupplier.length})
                          </button>
                          <button type="button" style={chip(item.scope === 'all')}
                            onClick={() => setSupplierQueue(prev => prev
                              ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, scope: 'all' as const } : it)
                              : prev)}>
                            Усе замовлення ({item.lines.length})
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Відправник — від кого слати постачальнику */}
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

                  {/* Contacts — radio buttons like ProcurementDetail */}
                  {item.contacts.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Контакти постачальника
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {item.contacts.map((c, ci) => {
                          const isSelected = item.email === c.email;
                          return (
                            <button key={ci} type="button"
                              onClick={() => setSupplierQueue(prev => prev
                                ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, email: c.email } : it)
                                : prev)}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${isSelected ? '#1E3A5F' : 'var(--border)'}`, background: isSelected ? '#EFF4FF' : 'var(--bg-soft)' }}>
                              <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? '#1E3A5F' : '#CBD5E1'}`, background: isSelected ? '#1E3A5F' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isSelected && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff' }} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || c.email}</div>
                                {c.name && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}{c.note ? ` · ${c.note}` : ''}</div>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Mail size={11} /> {item.contacts.length > 0 ? 'Або інший email' : 'Email отримувача'}
                    </div>
                    <input

                      autoFocus={item.contacts.length === 0}
                      type="email"
                      value={item.email}
                      onChange={e => setSupplierQueue(prev => prev
                        ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, email: e.target.value } : it)
                        : prev)}
                      placeholder="email@supplier.com"
                      style={{ width: '100%', height: '38px', padding: '0 12px', border: `1.5px solid ${item.email.includes('@') ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)' }}
                    />
                    {item.contacts.length === 0 && !item.email && (
                      <div style={{ fontSize: '11px', color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: '6px', marginTop: '4px' }}>
                        ⚠ Контакти не знайдено — додайте їх у картці постачальника або введіть email вручну
                      </div>
                    )}
                  </div>

                  {/* Comment */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Коментар (необов&apos;язково)</label>
                    <textarea
                      value={item.comment}
                      onChange={e => setSupplierQueue(prev => prev
                        ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, comment: e.target.value } : it)
                        : prev)}
                      placeholder="Термінове замовлення, потрібна доставка до п'ятниці..."
                      style={{ width: '100%', height: '68px', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              ) : null}

              {/* Footer */}
              {!supplierQueueLoading && !supplierQueueDone && item && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--border-light)' }}>
                  <button
                    onClick={advanceSupplierQueue}
                    disabled={supplierQueueSending}
                    style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    Пропустити
                  </button>
                  <button
                    onClick={sendCurrentSupplier}
                    disabled={supplierQueueSending || !item.email.includes('@')}
                    style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: item.email.includes('@') ? 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)' : '#94A3B8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: (!item.email.includes('@') || supplierQueueSending) ? 'default' : 'pointer', opacity: supplierQueueSending ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {supplierQueueSending ? '⏳ Відправлення...' : `📧 Відправити${total > 1 ? ` (${idx + 1}/${total})` : ''}`}
                  </button>
                </div>
              )}
            </div>
          </Modal>
        );
      })()}
    </>
  );
}
