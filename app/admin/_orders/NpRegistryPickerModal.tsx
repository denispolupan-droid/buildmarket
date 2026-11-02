'use client';

import { Truck } from 'lucide-react';
import { itemTitle } from './helpers';
import { useOrdersCtx } from './OrdersContext';

export function NpRegistryPickerModal() {
  const {
    registryPick, runRegistryAdd, setRegistryPick, shipModal, setShipModal, executeShip,
    shipping,
  } = useOrdersCtx();
  return (
    <>
      {/* Вибір реєстру НП: сьогодні вже є відкриті — в який додати чи створити новий */}
      {registryPick && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div className="adm-modal-box" style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '96vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: '#1E3A5F' }}>
              Реєстр НП · {registryPick.items.length} ТТН
            </div>
            <div style={{ fontSize: '12.5px', color: '#6B7280', marginBottom: '16px', lineHeight: 1.5 }}>
              За сьогодні вже є {registryPick.sheets.length === 1 ? 'відкритий реєстр' : 'відкриті реєстри'} — додати туди чи створити новий?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {registryPick.sheets.map(s => (
                <button key={s.Ref}
                  onClick={() => runRegistryAdd(registryPick.items, s.Ref)}
                  style={{ minHeight: '38px', padding: '8px 14px', textAlign: 'left', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1E3A5F'; e.currentTarget.style.background = '#EFF6FF'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
                  Реєстр №{s.Number}
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                    {' · '}{s.DateTime?.slice(11, 16) ?? ''}{s.Count != null && ` · ${s.Count} відпр.`}
                  </span>
                </button>
              ))}
              <button
                onClick={() => runRegistryAdd(registryPick.items, null)}
                style={{ minHeight: '38px', padding: '8px 14px', textAlign: 'left', borderRadius: '9px', border: '1.5px dashed var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1E3A5F'; e.currentTarget.style.color = '#1E3A5F'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                + Створити новий реєстр
              </button>
            </div>
            <button onClick={() => setRegistryPick(null)}
              style={{ width: '100%', height: '36px', borderRadius: '9px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              Скасувати
            </button>
          </div>
        </div>
      )}

      {shipModal && (() => {
        const updateQty = (sku: string, val: number) =>
          setShipModal(prev => prev ? {
            ...prev,
            items: prev.items.map(i => i.sku === sku ? { ...i, shipQty: Math.max(0, Math.min(val, i.orderQty - i.shippedQty)) } : i),
          } : null);
        const hasAny = shipModal.items.some(i => i.shipQty > 0);
        const isPartial = shipModal.items.some(i => i.shipQty < (i.orderQty - i.shippedQty));
        // padding + overflow на підкладці: замовлення з довгим списком товарів
        // інакше не влізе, і верх вікна — заголовок і перші позиції — опиниться
        // вище екрана, куди не доскролити.
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
            <div className="adm-modal-box" style={{ background: '#fff', borderRadius: '16px', padding: '28px 28px 24px', width: '480px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: '#1E3A5F' }}>Відвантаження</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '20px' }}>
                Вкажіть кількість для відвантаження (можна змінити для часткового відвантаження)
              </div>
              {/* TTN field for Prom orders */}
              {shipModal.isProm && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    ТТН (буде надіслано на Prom)
                  </label>
                  <input
                    type="text"
                    placeholder="Номер відправлення..."
                    value={shipModal.ttn}
                    onChange={e => setShipModal(prev => prev ? { ...prev, ttn: e.target.value } : null)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1.5px solid #FED7AA', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none', color: '#92400E', background: '#FFFBEB' }}
                  />
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600, color: '#6B7280', fontSize: '11px' }}>Товар</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: '#6B7280', fontSize: '11px', whiteSpace: 'nowrap' }}>Замовл.</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: '#6B7280', fontSize: '11px', whiteSpace: 'nowrap' }}>Відвант.</th>
                    <th style={{ textAlign: 'center', padding: '4px 0', fontWeight: 600, color: '#166534', fontSize: '11px', whiteSpace: 'nowrap' }}>Зараз</th>
                  </tr>
                </thead>
                <tbody>
                  {shipModal.items.map(item => (
                    <tr key={item.sku} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '8px 0' }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{itemTitle(item)}</div>
                        <div style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace' }}>{item.sku}</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', color: '#374151' }}>{item.orderQty}</td>
                      <td style={{ textAlign: 'center', padding: '8px', color: item.shippedQty > 0 ? '#059669' : '#9CA3AF' }}>
                        {item.shippedQty > 0 ? item.shippedQty : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 0' }}>
                        <input
                          type="number" min={0} max={item.orderQty - item.shippedQty}
                          value={item.shipQty}
                          onChange={e => updateQty(item.sku, parseInt(e.target.value) || 0)}
                          style={{ width: '60px', textAlign: 'center', border: '1.5px solid #86EFAC', borderRadius: '6px', padding: '4px 6px', fontSize: '13px', fontWeight: 700, color: '#166534' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isPartial && (
                <div style={{ fontSize: '11px', color: '#92400E', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
                  ⚠ Часткове відвантаження — буде створена окрема ВН. Залишок можна відвантажити пізніше.
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShipModal(null)}
                  style={{ height: '38px', padding: '0 20px', borderRadius: '9px', border: '1.5px solid #E5E7EB', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                  Скасувати
                </button>
                <button
                  onClick={() => executeShip(
                    shipModal.orderId,
                    shipModal.items.filter(i => i.shipQty > 0).map(i => ({ sku: i.sku, shipQty: i.shipQty })),
                    shipModal.isProm && shipModal.ttn ? shipModal.ttn : undefined,
                  )}
                  disabled={!hasAny || shipping === shipModal.orderId}
                  style={{ height: '38px', padding: '0 24px', borderRadius: '9px', border: 'none', background: hasAny ? '#166534' : '#9CA3AF', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: hasAny ? 'pointer' : 'not-allowed' }}>
                  <Truck size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  {isPartial ? 'Відвантажити частково' : 'Відвантажити'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes awaiting-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
          50% { opacity: 0.85; box-shadow: 0 0 0 4px rgba(124,58,237,0); }
        }
        .status-awaiting-pulse {
          animation: awaiting-pulse 2s ease-in-out infinite;
        }
        @keyframes awaiting-banner-pulse {
          0%, 100% { border-color: #DDD6FE; }
          50% { border-color: #8B5CF6; }
        }
      `}</style>
    </>
  );
}
