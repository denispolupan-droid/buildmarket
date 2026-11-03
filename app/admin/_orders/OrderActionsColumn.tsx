'use client';

import { MapPin, Package, Truck, Check, ChevronUp, Printer, ShoppingCart, Mail, Copy, MoreHorizontal, Settings, RotateCcw, Clock } from 'lucide-react';
import InvoiceMessengerButtons from '../../components/InvoiceMessengerButtons';
import type { OrderItem } from './types';
import { TransitDecisionBox } from './TransitDecisionBox';
import type { Order } from './types';
import { useOrdersCtx } from './OrdersContext';

export function OrderActionsColumn({ order }: {
  order: Order;
}) {
  const {
    actionsOpen, isNarrow, setActionsOpen, startSupplierSend, supplierQueueLoading, copyOrder,
    copying, openSupplierPO, creatingPo, shippedQtyMap, saleDocMap, shipOrder,
    shipping, loading, linkedPOs, changeStatus, setInvoiceCfg, initialReturnDocs,
    isAdmin, setReturnFor,
  } = useOrdersCtx();
  return (
    <>
      {/* Col 3: Status dropdown + context actions */}
      {(() => {
        const actOpen = actionsOpen[order.id] ?? !isNarrow;
        return (
          <div className="oc-actions-col" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
          {/* Дії card — згортається у вузьку кнопку; «Фінанси» під нею
              лишаються видимими в обох станах */}
          {!actOpen ? (
            <div className="oc-actions-collapsed">
              <button type="button" title="Показати дії із замовленням"
                aria-expanded={false}
                onClick={() => setActionsOpen(prev => ({ ...prev, [order.id]: true }))}>
                <MoreHorizontal size={15} />
                <span>Дії</span>
              </button>
            </div>
          ) : (
          <div className="order-col-card oc-acc oc-acc-actions" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Статус замовлення + ручна зміна винесені у правий верхній кут шапки */}
            {/* «Відвантажує пост.» перенесено до блоку способу виконання (ліва колонка) */}

            {/* Context action buttons */}
            <button type="button" className="oc-lbl oc-lbl-btn" title="Згорнути дії"
              aria-expanded onClick={() => setActionsOpen(prev => ({ ...prev, [order.id]: false }))}>
              Дії <ChevronUp size={12} />
            </button>
            {(() => {
              // Unified button styles
              // Дії — рядки, а не плитки. П'ять обведених прямокутників
              // підряд читались як п'ять однаково важливих кнопок; насправді
              // головна одна, решта — інструменти. Рамку лишили тільки їй.
              const btn = {
                display: 'flex' as const, alignItems: 'center' as const, gap: '8px',
                height: '30px', padding: '0 8px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 500,
                cursor: 'pointer', textDecoration: 'none', border: '1px solid transparent',
                background: 'transparent', color: 'var(--text-primary)', width: '100%',
                boxSizing: 'border-box' as const, justifyContent: 'flex-start' as const,
              };
              const btnPrimary = { ...btn, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E3A5F', fontWeight: 600 };
              const btnMuted   = { ...btn, fontWeight: 500, color: 'var(--text-secondary)' };
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                  {/* Копія замовлення — повтор того самого складу для того самого
                      клієнта (постійні клієнти замовляють однакове, а частину
                      скасованих замовлень МП доводиться заводити наново вручну).
                      Ціни підставляються поточні, тому кнопка не «дублює рахунок»,
                      а готує нову чернетку, яку ще можна виправити перед збереженням. */}
                  {/* Робота з постачальником — лист і ЗП — стоїть тут, поруч із
                      рештою дій над замовленням; у блоці доставки їй було місце,
                      поки там жила ТТН, але це не про накладну. */}
                  {['new', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered'].includes(order.status)
                    && (['supplier', 'mixed'].includes(order.fulfillment_mode ?? 'supplier') || !!order.supplier_sent_at) && (
                    <button onClick={() => startSupplierSend([order.id])} disabled={supplierQueueLoading}
                      title={order.supplier_sent_at ? `Надіслано ${new Date(order.supplier_sent_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · натисніть щоб надіслати ще раз` : 'Надіслати замовлення постачальнику'}
                      style={{ ...btn, color: order.supplier_sent_at ? 'var(--color-success)' : 'var(--text-primary)', cursor: supplierQueueLoading ? 'wait' : 'pointer', opacity: supplierQueueLoading ? 0.6 : 1 }}>
                      <Mail size={13} /> {order.supplier_sent_at ? 'Надіслано постачальнику' : 'Надіслати постачальнику'}
                    </button>
                  )}
                  <button
                    onClick={() => copyOrder(order)}
                    disabled={copying === order.id}
                    title="Створити нове замовлення з тим самим клієнтом, доставкою і складом. Ціни підставляться поточні; ТТН, оплати й дані кабінету МП не копіюються."
                    style={{ ...btn, opacity: copying === order.id ? 0.6 : 1 }}>
                    <Copy size={13} /> {copying === order.id ? 'Копіювання...' : 'Копіювати замовлення'}
                  </button>
                  <button onClick={() => openSupplierPO(order)} disabled={creatingPo === order.id}
                    title="Створити замовлення постачальнику (ЗП)"
                    style={{ ...btn, cursor: creatingPo === order.id ? 'wait' : 'pointer', opacity: creatingPo === order.id ? 0.6 : 1 }}>
                    <ShoppingCart size={13} /> {creatingPo === order.id ? '...' : 'Створити ЗП'}
                  </button>
                  {/* Primary CTA for new orders — confirm + optional send-to-supplier */}
                  {/* «Підтвердити» → блок способу виконання; «Надіслати постачальнику» → під ТТН */}
                  {(order.status === 'confirmed' || order.status === 'awaiting_stock' || order.status === 'picking') && (() => {
                    const shippedQty = shippedQtyMap[order.id] ?? {};
                    const hasRemaining = (order.items as OrderItem[]).some(i => (shippedQty[i.sku] ?? 0) < i.qty);
                    const docs = saleDocMap[order.id] ?? [];
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <button
                          onClick={() => shipOrder(order.id)}
                          disabled={shipping === order.id || !!loading || !hasRemaining}
                          style={{ ...btn, background: hasRemaining ? '#DCFCE7' : '#F3F4F6', color: hasRemaining ? '#166534' : 'var(--text-gray-light)', border: `1.5px solid ${hasRemaining ? 'var(--border-success)' : '#E5E7EB'}`, opacity: (shipping === order.id || !!loading) ? 0.6 : 1 }}>
                          <Truck size={13} /> {shipping === order.id ? 'Створення...' : hasRemaining ? 'Відвантажити' : 'Відвантажено'}
                        </button>
                        {order.fulfillment_mode === 'supplier' && !order.tracking_number && hasRemaining && (
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            або авто при створенні ТТН
                          </div>
                        )}
                        {docs.map(doc => (
                          <a key={doc.id} href={`/vidatkova/${doc.id}`} target="_blank"
                            style={{ fontSize: '11px', color: 'var(--navy)', fontWeight: 600, textDecoration: 'none', textAlign: 'center', padding: '2px 0' }}>
                            📄 {doc.number}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                  {order.status === 'awaiting_stock' && (() => {
                    const pos = linkedPOs[order.id] ?? [];
                    const hasReceipt = pos.some(p => ['received','closed','partially_received'].includes(p.procurement_status ?? ''));
                    const linkedPO   = pos.find(p => p.id);
                    const expectedDate = pos
                      .map(p => p.expected_date)
                      .filter(Boolean)
                      .sort()[0];
                    return (
                      <>
                        {expectedDate && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '7px', background: '#FFF7ED', border: '1px solid #FED7AA', fontSize: '12px', color: 'var(--text-warn-dark)', fontWeight: 600 }}>
                            📅 Очікується: {new Date(expectedDate).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                        {hasReceipt ? (
                          <button onClick={() => changeStatus(order.id, 'picking')} disabled={!!loading}
                            style={{ ...btnPrimary, background: '#0E7490', opacity: loading ? 0.6 : 1 }}>
                            <Package size={13} /> Товар надійшов — збираємо
                          </button>
                        ) : (
                          <a href={linkedPO ? `/admin/procurement/${linkedPO.id}` : '/admin/procurement'} style={{ ...btnPrimary }}>
                            <Package size={13} /> Оформити прихід
                          </a>
                        )}
                      </>
                    );
                  })()}
                  {/* Другорядні інструменти — друк, месенджери, ЗП; відділені від дій зі статусом */}
                  <div className="oc-sub-lbl" style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-light)' }}>
                    Інструменти
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <a href={`/invoice/${order.id}`} target="_blank" rel="noopener noreferrer"
                      style={{ ...btnMuted, flex: 1 }}>
                      <Printer size={13} /> Друк / Рахунок
                    </a>
                    <button onClick={() => setInvoiceCfg(order)} title="Налаштування рахунку — що показувати у рахунку"
                      style={{ ...btnMuted, width: 'auto', flexShrink: 0, justifyContent: 'center', padding: '0 11px' }}>
                      <Settings size={14} />
                    </button>
                  </div>
                  {/* Кнопка чату МП живе в блоці «Клієнт», поруч із телефоном —
                      це контакт, а не інструмент друку. */}
                  {/* Без підпису чотири іконки читались як випадковий ряд:
                      незрозуміло, що вони надсилають і кому. */}
                  <div className="oc-sub-lbl" style={{ marginTop: '2px' }}>Надіслати рахунок:</div>
                  <InvoiceMessengerButtons
                    phone={order.phone} contact={order.contact}
                    orderNumber={order.order_number} orderId={order.id}
                    total={order.total_price} channel={order.channel_code}
                    promOrderId={order.prom_order_id} rozetkaOrderId={order.rozetka_order_id} />

                  {/* «Створити ЗП» перенесено під ТТН, у рядок із «Надіслати постачальнику» */}

                  {/* Документи замовлення: РН (друкована видаткова) + повернення.
                      Видимі в будь-якому статусі — РН є кінцевим документом замовлення. */}
                  {(() => {
                    const rnDocs  = saleDocMap[order.id] ?? [];
                    const retDocs = initialReturnDocs[order.id] ?? [];
                    if (!rnDocs.length && !retDocs.length) return null;
                    return (
                      <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                        <div className="oc-sub-lbl">
                          Документи
                        </div>
                        {/* Рядки документів — у тій самій формі, що й інструменти вище
                            (btnMuted): дрібний жирний напис іншого розміру вибивався з
                            панелі (зауваження власника 30.10.2026). Стан документа —
                            значком праворуч: галочка «проведена», годинник «чернетка»;
                            пояснення — у підказці. */}
                        {rnDocs.map(doc => (
                          <a key={doc.id} href={`/vidatkova/${doc.id}`} target="_blank" rel="noopener noreferrer"
                            title={doc.status === 'draft'
                              ? `Видаткова накладна ${doc.number} — чернетка. Номер і дата вже фінальні, можна друкувати; виручка, собівартість і комісія проведуться при підтвердженні доставки.`
                              : `Видаткова накладна ${doc.number} — проведена: виручка, собівартість і комісія враховані в обліку.`}
                            style={{ ...btnMuted, color: 'var(--text-primary)' }}>
                            <Printer size={13} /> {doc.number}
                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                              {doc.status === 'draft'
                                ? <Clock size={13} color="#B45309" aria-label="Чернетка" />
                                : <Check size={13} color="#15803D" aria-label="Проведена" />}
                            </span>
                          </a>
                        ))}
                        {retDocs.map(doc => (
                          <a key={doc.id} href={`/admin/accounting/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"
                            title="Документ повернення від покупця"
                            style={{ ...btnMuted, color: 'var(--color-warn)' }}>
                            <RotateCcw size={13} /> {doc.number}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Доставлено / повернення — дії, що закривають замовлення
                      документами, тож стоять під самими документами, але окремим
                      блоком: документи — це посилання для перегляду, а тут — дії,
                      що міняють облік; без розділювача вони зливались в один список. */}
                  {(order.status === 'shipped' || (isAdmin && ['shipped', 'delivered'].includes(order.status))) && (
                  <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed var(--border)', paddingTop: '8px' }}>
                  {order.status === 'shipped' && (
                    <button
                      onClick={() => {
                        // Проведення РН — незворотна дія: виручка, собівартість,
                        // комісія і зняття резерву лягають в облік. Скасувати це
                        // можна тільки окремим поверненням, тож питаємо.
                        const ok = confirm(
                          `Підтвердити доставку замовлення №${order.order_number}?\n\n`
                          + `Буде проведено видаткову накладну: виручка ${Number(order.total_price).toFixed(0)} ₴, `
                          + 'собівартість, комісія маркетплейсу і зняття резерву потраплять в облік.\n\n'
                          + 'Скасувати проведення можна буде тільки оформленням повернення.'
                        );
                        if (ok) changeStatus(order.id, 'delivered');
                      }}
                      disabled={!!loading}
                      title="Позначити, що клієнт отримав товар — проведе продаж і комісію, замовлення стане «Доставлено»"
                      style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
                      <MapPin size={13} /> Підтвердити доставку
                    </button>
                  )}
                  {/* Повернення від покупця — така сама дія зі станом замовлення,
                      як підтвердження доставки, тільки у зворотний бік. Тому стоїть
                      поруч і в такій самій рамці, лише бурштиновій. */}
                  {isAdmin && ['shipped', 'delivered'].includes(order.status) && (
                    <button onClick={() => setReturnFor({ id: order.id, number: order.order_number })}
                      title="Фінансове повернення: сторнує виручку, COGS і комісію, оприбутковує товар"
                      style={{ ...btn, border: '1px solid #FDE68A', background: 'var(--bg-warn)', color: 'var(--color-warn)', fontWeight: 600 }}>
                      <RotateCcw size={13} /> Повернення
                    </button>
                  )}
                  </div>
                  )}
                  {/* Скасували вже відвантажене — товар десь їде або вже в нас.
                      Компонент сам зникає, якщо в дорозі нічого не висить. */}
                  {isAdmin && order.status === 'cancelled' && (
                    <TransitDecisionBox orderId={order.id} orderNumber={order.order_number} />
                  )}
                </div>
              );
            })()}
          </div>
          )}
          </div>
        );
      })()}
    </>
  );
}
