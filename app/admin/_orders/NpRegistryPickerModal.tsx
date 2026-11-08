'use client';

import { Truck } from 'lucide-react';
import { itemTitle } from './helpers';
import { Modal } from '../../components/admin/ui/Modal';
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
        // Світлий фон як і раніше: кольори тексту всередині задані під білу картку.
        <Modal open onClose={() => setRegistryPick(null)} width={420} padding={24} style={{ background: 'var(--surface)' }} aria-label="Реєстр НП">
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: 'var(--navy)' }}>
              Реєстр НП · {registryPick.items.length} ТТН
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--text-gray)', marginBottom: '16px', lineHeight: 1.5 }}>
              За сьогодні вже є {registryPick.sheets.length === 1 ? 'відкритий реєстр' : 'відкриті реєстри'} — додати туди чи створити новий?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
              {registryPick.sheets.map(s => (
                <button key={s.Ref}
                  onClick={() => runRegistryAdd(registryPick.items, s.Ref)}
                  style={{ minHeight: '38px', padding: '8px 14px', textAlign: 'left', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.background = '#EFF6FF'; }}
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
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--navy)'; e.currentTarget.style.color = 'var(--navy)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                + Створити новий реєстр
              </button>
            </div>
            <button onClick={() => setRegistryPick(null)}
              style={{ width: '100%', height: '36px', borderRadius: '9px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              Скасувати
            </button>
          </div>
        </Modal>
      )}

      {shipModal && (() => {
        const updateQty = (sku: string, val: number) =>
          setShipModal(prev => prev ? {
            ...prev,
            items: prev.items.map(i => i.sku === sku ? { ...i, shipQty: Math.max(0, Math.min(val, i.orderQty - i.shippedQty)) } : i),
          } : null);
        const hasAny = shipModal.items.some(i => i.shipQty > 0);
        const isPartial = shipModal.items.some(i => i.shipQty < (i.orderQty - i.shippedQty));
        // Довгий список товарів скролиться всередині модалки (max-height у .ui-modal),
        // тож заголовок і перші позиції не виїжджають вище екрана.
        // dismissible={false}: як і раніше, повз картку не закривається — щоб не
        // загубити введені кількості; закриває «Скасувати».
        return (
          <Modal open onClose={() => setShipModal(null)} dismissible={false} width={480} padding="28px 28px 24px" style={{ background: 'var(--surface)' }} aria-label="Відвантаження">
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: 'var(--navy)' }}>Відвантаження</div>
              <div style={{ fontSize: '12px', color: 'var(--text-gray)', marginBottom: '20px' }}>
                Вкажіть кількість для відвантаження (можна змінити для часткового відвантаження)
              </div>
              {/* TTN field for Prom orders */}
              {shipModal.isProm && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    ТТН (буде надіслано на Prom)
                  </label>
                  <input
                    type="text"
                    placeholder="Номер відправлення..."
                    value={shipModal.ttn}
                    onChange={e => setShipModal(prev => prev ? { ...prev, ttn: e.target.value } : null)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1.5px solid #FED7AA', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none', color: 'var(--text-warn-dark)', background: 'var(--bg-warn)' }}
                  />
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--line)' }}>
                    <th scope="col" style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600, color: 'var(--text-gray)', fontSize: '11px' }}>Товар</th>
                    <th scope="col" style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: 'var(--text-gray)', fontSize: '11px', whiteSpace: 'nowrap' }}>Замовл.</th>
                    <th scope="col" style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: 'var(--text-gray)', fontSize: '11px', whiteSpace: 'nowrap' }}>Відвант.</th>
                    <th scope="col" style={{ textAlign: 'center', padding: '4px 0', fontWeight: 600, color: '#166534', fontSize: '11px', whiteSpace: 'nowrap' }}>Зараз</th>
                  </tr>
                </thead>
                <tbody>
                  {shipModal.items.map(item => (
                    <tr key={item.sku} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                      <td style={{ padding: '8px 0' }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{itemTitle(item)}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-gray-light)', fontFamily: 'monospace' }}>{item.sku}</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', color: 'var(--ink-2)' }}>{item.orderQty}</td>
                      <td style={{ textAlign: 'center', padding: '8px', color: item.shippedQty > 0 ? 'var(--emerald)' : 'var(--text-gray-light)' }}>
                        {item.shippedQty > 0 ? item.shippedQty : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 0' }}>
                        <input
                          type="number" min={0} max={item.orderQty - item.shippedQty}
                          value={item.shipQty}
                          onChange={e => updateQty(item.sku, parseInt(e.target.value) || 0)}
                          style={{ width: '60px', textAlign: 'center', border: '1.5px solid var(--border-success)', borderRadius: '6px', padding: '4px 6px', fontSize: '13px', fontWeight: 700, color: '#166534' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isPartial && (
                <div style={{ fontSize: '11px', color: 'var(--text-warn-dark)', background: 'var(--orange-bg)', border: '1px solid #FED7AA', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
                  ⚠ Часткове відвантаження — буде створена окрема ВН. Залишок можна відвантажити пізніше.
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShipModal(null)}
                  style={{ height: '38px', padding: '0 20px', borderRadius: '9px', border: '1.5px solid var(--line)', background: 'var(--surface)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--ink-2)' }}>
                  Скасувати
                </button>
                <button
                  onClick={() => executeShip(
                    shipModal.orderId,
                    shipModal.items.filter(i => i.shipQty > 0).map(i => ({ sku: i.sku, shipQty: i.shipQty })),
                    shipModal.isProm && shipModal.ttn ? shipModal.ttn : undefined,
                  )}
                  disabled={!hasAny || shipping === shipModal.orderId}
                  style={{ height: '38px', padding: '0 24px', borderRadius: '9px', border: 'none', background: hasAny ? '#166534' : 'var(--text-gray-light)', color: 'var(--surface)', fontSize: '13px', fontWeight: 700, cursor: hasAny ? 'pointer' : 'not-allowed' }}>
                  <Truck size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  {isPartial ? 'Відвантажити частково' : 'Відвантажити'}
                </button>
              </div>
            </div>
          </Modal>
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
