'use client';

import { Hash, Truck, Pencil, Trash2, Check, Printer, Copy, ClipboardList, Save, ExternalLink, RotateCcw, Info } from 'lucide-react';
import { stripCityPrefix } from '../../../lib/orders/delivery-line';
import { RZ_DELIVERY_TYPE } from '../../../lib/rz-delivery';
import { trackHref } from '../../../lib/delivery-label';
import { isManualPostalCarrier, MANUAL_CARRIER_LABEL, looksLikeManualTtn } from '../../../lib/carriers';
import { DELIVERY_NEEDS_CITY } from './constants';
import type { Order } from './types';
import { useOrdersCtx } from './OrdersContext';

export function OrderDeliveryCard({ order, delivery, deliveryBadges, subtype, isRzPickup, isRozetkaPoint }: {
  order: Order;
  delivery: string;
  deliveryBadges: React.JSX.Element;
  subtype: "" | " — кур'єр" | " — відділення";
  isRzPickup: boolean;
  isRozetkaPoint: boolean;
}) {
  const {
    editDeliveryId, openEditDelivery, editDeliveryForm, setEditDeliveryForm, saveDelivery, savingDelivery,
    setEditDeliveryId, ttnValues, setTtnValues, setTtnDetailsFor, copyTtn, copiedTtn,
    ttnSaving, replaceTTN, saveTTN, setTtnModalOrder, registryAdded, registryAdding,
    addToRegistry, printLabel, rzLabelBusy, isAdmin, setNpReturnFor, deleteTTN,
    ttnDeleting, setRzTtnModal, addRzToReception, rzRegBusy, rzReception, printRzReception,
    deleteRzTtn, returnRzTrack, setRzOwnTtnModal,
  } = useOrdersCtx();
  return (
    <>
      {/* Доставка / ТТН card */}
      <div className="order-col-card oc-split oc-acc oc-acc-delivery" style={{ padding: '16px' }}>
        <div className="oc-card-body">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div className="oc-lbl">Доставка</div>
          {editDeliveryId !== order.id && (
            <button onClick={() => openEditDelivery(order)} title="Змінити доставку" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
              <Pencil size={12} />
            </button>
          )}
        </div>
        {editDeliveryId === order.id ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
            <select
              value={editDeliveryForm.type}
              onChange={e => setEditDeliveryForm(p => ({ ...p, type: e.target.value, cityName: '', address: '' }))}
              style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 6px' }}>
              <option value="nova">Нова Пошта</option>
              {/* Наш власний договір із rz-delivery — накладна через їхнє
                  API, не через НП. Маркетплейсну 'rozetka_delivery'
                  показуємо лише замовленням, що прийшли з Rozetka: на
                  сайтовому замовленні її накладну оформити нічим, там
                  потрібен rozetka_order_id. */}
              <option value="rz_delivery">ROZETKA Доставка</option>
              {order.channel_code === 'rozetka' && (
                <option value="rozetka_delivery">Rozetka Доставка (МП)</option>
              )}
              <option value="pickup">Самовивіз</option>
              <option value="kharkiv">Харків і область</option>
              {/* Накладну Укрпошти/Meest поки виписують у кабінеті перевізника
                  чи площадки — тут лише тип і адреса, номер вписується руками */}
              <option value="ukrposhta">Укрпошта</option>
              <option value="meest">Meest</option>
            </select>
            {DELIVERY_NEEDS_CITY.includes(editDeliveryForm.type) && (
              <>
                {/* Кур'єр є лише в НП: у ROZETKA Доставці двері поки не ввімкнені */}
                {editDeliveryForm.type === 'nova' && (
                  <select
                    value={editDeliveryForm.subtype}
                    onChange={e => setEditDeliveryForm(p => ({ ...p, subtype: e.target.value }))}
                    style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 6px' }}>
                    <option value="warehouse">Відділення</option>
                    <option value="courier">Кур'єр</option>
                  </select>
                )}
                <input
                  value={editDeliveryForm.cityName}
                  onChange={e => setEditDeliveryForm(p => ({ ...p, cityName: e.target.value }))}
                  placeholder="Місто"
                  style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 8px' }} />
                <input
                  value={editDeliveryForm.address}
                  onChange={e => setEditDeliveryForm(p => ({ ...p, address: e.target.value }))}
                  placeholder="Відділення або адреса"
                  style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 8px' }} />
              </>
            )}
            {editDeliveryForm.type === 'kharkiv' && (
              <input
                value={editDeliveryForm.address}
                onChange={e => setEditDeliveryForm(p => ({ ...p, address: e.target.value }))}
                placeholder="Адреса доставки"
                style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 8px' }} />
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => saveDelivery(order.id)}
                disabled={savingDelivery}
                style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: 'none', background: 'var(--navy)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                {savingDelivery ? '...' : 'Зберегти'}
              </button>
              <button
                onClick={() => setEditDeliveryId(null)}
                style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Скасувати
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-primary)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Truck size={13} color="#64748B" /> {delivery}
            </span>
            {/* SMART / «дешева доставка» — умови саме цієї доставки, тож
                стоять біля перевізника, а не десь у мітках замовлення. */}
            {deliveryBadges}
            {/* Коли посилку забрали. Показуємо час перевізника, а якщо його
                немає (Rozetka його не віддає) — свій, і чесно кажемо про це
                в підказці: різниця між ними — інтервал крона. */}
            {order.status === 'delivered' && (order.carrier_delivered_at || order.delivered_at) && (() => {
              const byCarrier = !!order.carrier_delivered_at;
              const at = new Date((order.carrier_delivered_at ?? order.delivered_at) as string);
              return (
                <span title={byCarrier
                  ? `Час видачі за даними перевізника: ${at.toLocaleString('uk-UA')}`
                  : `Перевізник часу видачі не дав — це наш час, коли доставку зафіксовано: ${at.toLocaleString('uk-UA')}`}
                  style={{ flexBasis: '100%', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: 'var(--color-success)' }}>
                  <Check size={12} />
                  Отримано {at.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  {!byCarrier && <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>· за нашими даними</span>}
                </span>
              );
            })()}
            {/* Адреса — завжди з нового рядка: у Нової Пошти вона довга й
                переносилась сама, у Rozetka коротка й лишалась в одному рядку з
                перевізником. Два різні вигляди для однієї й тієї ж думки. */}
            <span style={{ color: 'var(--text-secondary)', marginTop: '1px', flexBasis: '100%' }}>{subtype.replace(/^ — /, '')}{order.delivery_city_name && <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{subtype ? ' · ' : ''}{order.delivery_city_name}</strong>}{(() => { const rest = stripCityPrefix(order.delivery_address, order.delivery_city_name); return rest ? ` · ${rest}` : ''; })()}</span>
          </div>
        )}

        </div>{/* /oc-card-body */}
        {/* Накладна — притиснута до низу картки; висоту задає .oc-card-footer, спільна з блоком «Оплата» сусідньої картки */}
        <div className="oc-card-footer">
        {/* Для точок видачі Rozetka накладну виписує Rozetka («RMP-…»),
            Нова Пошта до неї стосунку не має — заголовок мусить це знати */}
        <div className="oc-sub-lbl">
          {isRzPickup ? 'Накладна Rozetka'
            : order.delivery_type === RZ_DELIVERY_TYPE ? 'ЕН ROZETKA Доставки'
            : isManualPostalCarrier(order.delivery_type) ? `Накладна ${MANUAL_CARRIER_LABEL[order.delivery_type]}`
            : 'ТТН Нової Пошти'}
        </div>
        {(order.delivery_type === 'nova' || order.delivery_type === 'nova_poshta') ? (
          <div className="oc-ttn-row" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 0 }}>
              <Hash size={12} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
              <input type="text" value={ttnValues[order.id] ?? ''} onChange={e => setTtnValues(prev => ({ ...prev, [order.id]: e.target.value }))}
                placeholder="59000000000000"
                style={{ width: '100%', height: '32px', paddingLeft: '26px', paddingRight: order.tracking_number ? '52px' : '8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
              {/* Усередині поля, біля самого номера: «Деталі ЕН» (що вписано в
                  накладну) і швидке копіювання (прохання власника 02.09). Деталі
                  раніше стояли окремою кнопкою в ряду дій і губились серед них —
                  це довідка про номер, а не дія з ним (29.10). */}
              {order.tracking_number && (
                <div style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '2px' }}>
                  <button onClick={() => setTtnDetailsFor({ id: order.id, number: order.order_number })}
                    title="Деталі ЕН: післяплата, отримувач, відділення, вага, статус"
                    style={{ width: '22px', height: '22px', border: 'none', background: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, color: 'var(--brand-blue)' }}>
                    <Info size={14} />
                  </button>
                  <button onClick={() => copyTtn(order.tracking_number!)} title="Копіювати ТТН"
                    style={{ width: '22px', height: '22px', border: 'none', background: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      color: copiedTtn === order.tracking_number ? 'var(--color-success)' : 'var(--text-muted)' }}>
                    {copiedTtn === order.tracking_number ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </div>
              )}
            </div>
            {(() => {
              // Кнопка одна, робіт дві: поки ТТН немає — «Зберегти»,
              // коли номер уже виписаний і в полі стоїть інший —
              // «Замінити» (постачальник не передав посилку, накладну
              // перевиписали). Раніше при наявній ТТН кнопка була
              // мертва, і замінити номер було нічим.
              const typed = (ttnValues[order.id] ?? '').trim();
              const isReplace = !!order.tracking_number && !!typed && typed !== order.tracking_number;
              const busy = ttnSaving === order.id;
              const disabled = busy || !typed || (!!order.tracking_number && !isReplace);
              return (
                <button onClick={() => (isReplace ? replaceTTN(order.id) : saveTTN(order.id))} disabled={disabled}
                  title={isReplace ? 'Замінити ТТН на нову' : 'Зберегти ТТН'} className="oc-ttn-save"
                  style={{ height: '32px', width: '32px', borderRadius: '7px', background: isReplace ? 'var(--color-warn)' : 'var(--navy)', color: '#fff', border: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {busy ? '…' : <Save size={14} />}
                </button>
              );
            })()}
            {(() => {
              const hasTtn = !!order.tracking_number;
              return (
                <button
                  onClick={() => !hasTtn && setTtnModalOrder(order)}
                  disabled={hasTtn}
                  title={hasTtn ? 'ТТН вже створена' : 'Створити ТТН через API Нової Пошти'}
                  style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                    background: hasTtn ? 'var(--border-light)' : 'var(--brand-blue-light)',
                    color: hasTtn ? 'var(--text-muted)' : 'var(--brand-blue)',
                    border: `1.5px solid ${hasTtn ? 'var(--border)' : '#C7D7F5'}`,
                    cursor: hasTtn ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Truck size={14} />
                </button>
              );
            })()}
            {order.tracking_number && (() => {
              const inReg = registryAdded.has(order.tracking_number);
              const isAddingReg = registryAdding === order.id;
              return (
                <button
                  onClick={() => !inReg && addToRegistry(order.id, order.tracking_number!)}
                  disabled={inReg || isAddingReg}
                  className="oc-ttn-reg"
                  title={inReg ? 'Вже в реєстрі НП' : 'Додати в реєстр НП'}
                  style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                    background: inReg ? '#DCFCE7' : 'var(--bg-success)', color: 'var(--color-success)',
                    border: '1.5px solid var(--border-success)', cursor: inReg ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isAddingReg ? '…' : inReg ? <Check size={14} /> : <ClipboardList size={14} />}
                </button>
              );
            })()}
            {order.tracking_number && (
              <button onClick={() => printLabel(order.id, 'ttn')} disabled={rzLabelBusy === order.id}
                className="oc-ttn-label"
                title="Друк етикетки НП 100×100 (PDF)"
                style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                  background: 'var(--brand-blue-light)', color: 'var(--brand-blue)',
                  border: '1.5px solid #C7D7F5', cursor: rzLabelBusy === order.id ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {rzLabelBusy === order.id ? '…' : <Printer size={14} />}
              </button>
            )}
            {/* Відкликати посилку: клієнт не забирає, і її треба завернути,
                поки НП не почала рахувати зберігання. Зелена — заявку вже
                створено, у підказці її номер. */}
            {isAdmin && order.tracking_number && !isRozetkaPoint && ['shipped', 'cancelled'].includes(order.status) && (
              <button onClick={() => setNpReturnFor({ id: order.id, number: order.order_number })}
                title={order.np_return_ref
                  ? `Заявка на повернення НП ${order.np_return_number ?? ''} — відкрити`.replace('  ', ' ')
                  : 'Повернути посилку: заявка в кабінеті НП, посилка поїде назад на наше відділення'}
                style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                  background: order.np_return_ref ? 'var(--bg-success)' : 'var(--bg-warn)',
                  color: order.np_return_ref ? 'var(--color-success)' : 'var(--color-warn)',
                  border: `1.5px solid ${order.np_return_ref ? 'var(--border-success)' : '#FDE68A'}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={14} />
              </button>
            )}
            {order.tracking_number && (
              <button onClick={() => deleteTTN(order.id)} disabled={ttnDeleting === order.id}
                title="Видалити ТТН з бази та з НП"
                style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0, background: 'var(--bg-danger)', color: 'var(--color-danger)', border: '1.5px solid #FECACA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ttnDeleting === order.id ? 0.5 : 1 }}>
                {ttnDeleting === order.id ? '…' : <Trash2 size={14} />}
              </button>
            )}
          </div>
        ) : order.delivery_type === 'rozetka_delivery' ? (
          // Накладну для точки видачі виписує сама Rozetka своїм API
          // (розділ Octopus), номер має вигляд «RMP-…». ТТН Нової Пошти
          // тут не підходить — точка видачі таку посилку не прийме.
          // Без заливки: пояснення не має важити більше за єдину дію
          // в блоці — кнопку створення накладної.
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            {order.tracking_number ? (
              // Номер і кнопка — одним рядком: місце дозволяє
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flexShrink: 0 }}>ТТН: <strong>{order.tracking_number}</strong></div>
                {/* Деталі ЕН — значком одразу біля номера, як і в блоці НП */}
                <button onClick={() => setTtnDetailsFor({ id: order.id, number: order.order_number })}
                  title="Деталі ЕН: післяплата, отримувач, точка, вага, статус"
                  style={{ width: '22px', height: '22px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-blue)', flexShrink: 0 }}>
                  <Info size={14} />
                </button>
                <button onClick={() => printLabel(order.id, 'rozetka-delivery-ttn')} disabled={rzLabelBusy === order.id}
                  style={{ marginLeft: 'auto', height: '32px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid #BBF7D0', background: 'var(--bg-card)', color: 'var(--color-success)', fontSize: '12px', fontWeight: 700, cursor: rzLabelBusy === order.id ? 'wait' : 'pointer' }}>
                  {rzLabelBusy === order.id ? '…' : 'Етикетка PDF'}
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: '11px' }}>Точка видачі Rozetka</div>
                <div style={{ marginTop: '3px' }}>Адресу отримувача Rozetka візьме із замовлення — потрібні лише габарити.</div>
                {/* Спільна посилка: Seller API виписує накладну рівно з ОДНОГО
                    замовлення Rozetka і не дає стягнути більше за його вартість
                    (два наложних не об'єднати — «Вказана вартість більша ніж
                    вартість замовлення»). Тому другий шлях: виписати ЕН у
                    сусідньому замовленні й прописати той самий «RMP-…» сюди.
                    Далі все працює саме собою: крон статусів закриває всіх
                    «сусідів» по спільному номеру (lib/delivery-sync), а номер
                    доїжджає в кабінет Rozetka — про ручну ЕН він не знає. */}
                {(() => {
                  const typed = (ttnValues[order.id] ?? '').trim();
                  // Номер точки видачі — лише «RMP-…». Голі цифри свідомо не
                  // приймаємо: 14-значна ТТН Нової Пошти виглядала б так само,
                  // а точка видачі таку посилку не прийме.
                  const looksLikeRmp = /^RMP-\d{6,14}$/.test(typed);
                  const busy = ttnSaving === order.id;
                  const canSave = looksLikeRmp && !busy;
                  return (
                    <>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setRzTtnModal(order)}
                          style={{ height: '34px', padding: '0 14px', borderRadius: '9px', border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                          Створити накладну Rozetka
                        </button>
                        <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 0 }}>
                          <Hash size={12} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                          <input type="text" value={ttnValues[order.id] ?? ''}
                            onChange={e => setTtnValues(prev => ({ ...prev, [order.id]: e.target.value.toUpperCase().replace(/^RMP-?/, 'RMP-') }))}
                            onKeyDown={e => { if (e.key === 'Enter' && canSave) saveTTN(order.id); }}
                            placeholder="або вставте готову ЕН"
                            title="«RMP-…» накладної, виписаної в сусідньому замовленні — коли обидва їдуть однією коробкою"
                            style={{ width: '100%', height: '34px', paddingLeft: '26px', paddingRight: '8px', border: `1px solid ${typed && !looksLikeRmp ? 'var(--border-danger)' : 'var(--border)'}`, borderRadius: '9px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <button onClick={() => saveTTN(order.id)} disabled={!canSave}
                          title={!typed ? 'Вставте номер ЕН' : !looksLikeRmp ? 'Номер точки видачі Rozetka — RMP-…' : 'Прив\'язати ЕН до замовлення'}
                          style={{ height: '34px', width: '34px', borderRadius: '9px', background: 'var(--navy)', color: '#fff', border: 'none', cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {busy ? '…' : <Save size={14} />}
                        </button>
                      </div>
                      {typed && !looksLikeRmp && (
                        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>Номер точки видачі Rozetka має вигляд RMP-161376878</div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        ) : order.delivery_type === RZ_DELIVERY_TYPE ? (
          // Власний договір із rz-delivery: точку видачі покупець обрав
          // у чекауті, від нас — лише габарити. Етикетку друкує сама
          // Rozetka (PDF), ТТН Нової Пошти тут не існує в принципі.
          // Без заливки й рамки: зелений прямокутник кричав гучніше за
          // саму дію — а це лише довідка про номер, не заклик до дії.
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            {order.tracking_number ? (
              <>
                {/* ЕН і кнопки — одним рядком: кнопки праворуч, місце дозволяє */}
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ flexShrink: 0 }}>ЕН: <strong>{order.tracking_number}</strong></div>
                {/* Деталі ЕН — значком одразу біля номера, як і в блоці НП */}
                <button onClick={() => setTtnDetailsFor({ id: order.id, number: order.order_number })}
                  title="Деталі ЕН: післяплата, отримувач, точка, вага, статус"
                  style={{ width: '22px', height: '22px', border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-blue)', flexShrink: 0 }}>
                  <Info size={14} />
                </button>
                <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                  <button onClick={() => printLabel(order.id, 'rz-ttn')} disabled={rzLabelBusy === order.id}
                    style={{ height: '32px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: rzLabelBusy === order.id ? 'wait' : 'pointer' }}>
                    {rzLabelBusy === order.id ? '…' : 'Етикетка PDF'}
                  </button>
                  {!order.carrier_accepted_at && (
                    <button onClick={() => addRzToReception(order.id)} disabled={rzRegBusy === order.id}
                      title="Додати ЕН у сьогоднішній реєстр здачі"
                      style={{ height: '32px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: rzRegBusy === order.id ? 'wait' : 'pointer' }}>
                      {rzRegBusy === order.id ? '…' : 'У реєстр'}
                    </button>
                  )}
                  {rzReception != null && (
                    <button onClick={() => printRzReception(rzReception)}
                      title="Друкована форма реєстру"
                      style={{ height: '32px', padding: '0 10px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      Реєстр №{rzReception}
                    </button>
                  )}
                  {/* Поки перевізник не прийняв — накладну ще можна прибрати;
                      після приймання роут відмовить і запропонує повернення */}
                  {!order.carrier_accepted_at && (
                    <button onClick={() => deleteRzTtn(order.id)} disabled={ttnDeleting === order.id}
                      title="Видалити ЕН у Rozetka і прибрати номер із замовлення"
                      style={{ height: '28px', width: '28px', borderRadius: '7px', flexShrink: 0, background: 'transparent', color: 'var(--color-danger)', border: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ttnDeleting === order.id ? 0.5 : 1 }}>
                      {ttnDeleting === order.id ? '…' : <Trash2 size={14} />}
                    </button>
                  )}
                  {/* Після приймання видалити ЕН уже не можна — лишається
                      заборонити видачу, інакше посилка лежатиме в точці
                      до кінця безкоштовного зберігання і почне коштувати */}
                  {order.carrier_accepted_at && order.status !== 'delivered' && (
                    <button onClick={() => returnRzTrack(order.id)} disabled={rzRegBusy === order.id}
                      title="Заборонити видачу і повернути посилку"
                      style={{ height: '32px', padding: '0 12px', borderRadius: '9px', border: '1.5px solid #FDE68A', background: 'var(--bg-warn)', color: 'var(--color-warn)', fontSize: '12px', fontWeight: 700, cursor: rzRegBusy === order.id ? 'wait' : 'pointer' }}>
                      {rzRegBusy === order.id ? '…' : 'Повернення'}
                    </button>
                  )}
                </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginTop: '3px' }}>Точку видачі покупець обрав сам — потрібні лише габарити.</div>
                {/* Накладну не завжди виписують звідси: для Prom-замовлень її
                    часто створюють у кабінеті Prom, а буває — одразу на
                    відділенні. Тоді номер треба лише прив'язати. Той самий
                    шлях, що й ручна ТТН НП: PATCH замовлення + звичайний
                    хвіст (відгрузка дропшипу, номер у маркетплейс).
                    Чужу для нашого договору ЕН крон статусів не бачить
                    (404 по номеру) — доставку тоді підтверджують кнопкою.
                    Кнопка і поле — одним рядком: блок доставки має спільну
                    висоту з «Оплатою» сусідньої картки, зайвий рядок
                    розтягував обидві. */}
                {(() => {
                  const typed = (ttnValues[order.id] ?? '').trim();
                  // Номери бувають двох видів: власний договір rz-delivery дає
                  // 12 цифр (101268729178), кабінет Prom для «Магазинів Rozetka» —
                  // з літерним префіксом (PRM-376729644, у маркетплейсних RMP-…).
                  // Перша версія приймала лише цифри — накладну з Prom вставити
                  // було неможливо (17.09.2026, #26091137).
                  const looksLikeRz = /^(\d{10,14}|[A-Z]{2,4}-?\d{6,14})$/.test(typed);
                  const busy = ttnSaving === order.id;
                  const canSave = looksLikeRz && !busy;
                  return (
                    <>
                      <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setRzOwnTtnModal(order)}
                          style={{ height: '34px', padding: '0 14px', borderRadius: '9px', border: 'none', background: 'var(--color-success)', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                          Створити ЕН ROZETKA
                        </button>
                        <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 0 }}>
                          <Hash size={12} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                          <input type="text" inputMode="numeric" value={ttnValues[order.id] ?? ''}
                            onChange={e => setTtnValues(prev => ({ ...prev, [order.id]: e.target.value.toUpperCase() }))}
                            onKeyDown={e => { if (e.key === 'Enter' && canSave) saveTTN(order.id); }}
                            placeholder="або вставте готову ЕН"
                            title="ЕН, створена в кабінеті Prom (PRM-…) чи на відділенні (12 цифр)"
                            style={{ width: '100%', height: '34px', paddingLeft: '26px', paddingRight: '8px', border: `1px solid ${typed && !looksLikeRz ? 'var(--border-danger)' : 'var(--border)'}`, borderRadius: '9px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <button onClick={() => saveTTN(order.id)} disabled={!canSave}
                          title={!typed ? 'Вставте номер ЕН' : !looksLikeRz ? 'Номер ЕН ROZETKA — 12 цифр або PRM-…' : 'Прив\'язати ЕН до замовлення'}
                          style={{ height: '34px', width: '34px', borderRadius: '9px', background: 'var(--navy)', color: '#fff', border: 'none', cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {busy ? '…' : <Save size={14} />}
                        </button>
                      </div>
                      {typed && !looksLikeRz && (
                        <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>Номер ЕН ROZETKA — 12 цифр або з префіксом, як PRM-376729644</div>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        ) : isManualPostalCarrier(order.delivery_type) ? (() => {
          // Укрпошта / Meest: API перевізника в нас ще немає — накладну
          // виписують у кабінеті перевізника чи маркетплейсу, а сюди
          // вписують номер. Далі звичайний хвіст saveTTN (відгрузка,
          // номер у маркетплейс). Вручення підтверджує Prom (для його
          // замовлень) або менеджер — крон НП такі номери не питає.
          const carrier = order.delivery_type;
          const label = MANUAL_CARRIER_LABEL[carrier];
          const typed = (ttnValues[order.id] ?? '').trim();
          const changed = typed !== (order.tracking_number ?? '');
          const valid = looksLikeManualTtn(carrier, typed);
          const busy = ttnSaving === order.id;
          const canSave = valid && changed && !busy && !order.tracking_number;
          const href = order.tracking_number ? trackHref(carrier, order.tracking_number) : null;
          return (
            <>
              <div className="oc-ttn-row" style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 0 }}>
                  <Hash size={12} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input type="text" value={ttnValues[order.id] ?? ''}
                    readOnly={!!order.tracking_number}
                    onChange={e => setTtnValues(prev => ({ ...prev, [order.id]: e.target.value.toUpperCase() }))}
                    onKeyDown={e => { if (e.key === 'Enter' && canSave) saveTTN(order.id); }}
                    placeholder={`Номер накладної ${label}`}
                    title={`Накладну ${label} створіть у кабінеті перевізника або маркетплейсу і вставте номер`}
                    style={{ width: '100%', height: '32px', paddingLeft: '26px', paddingRight: order.tracking_number ? '30px' : '8px', border: `1px solid ${typed && !valid && !order.tracking_number ? 'var(--border-danger)' : 'var(--border)'}`, borderRadius: '7px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                  {order.tracking_number && (
                    <button onClick={() => copyTtn(order.tracking_number!)} title="Копіювати номер"
                      style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '22px', height: '22px', border: 'none', background: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                        color: copiedTtn === order.tracking_number ? 'var(--color-success)' : 'var(--text-muted)' }}>
                      {copiedTtn === order.tracking_number ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  )}
                </div>
                {!order.tracking_number ? (
                  <button onClick={() => saveTTN(order.id)} disabled={!canSave}
                    title={!typed ? 'Вставте номер накладної' : !valid ? 'Номер не схожий на накладну ' + label : 'Прив\'язати накладну до замовлення'}
                    style={{ height: '32px', width: '32px', borderRadius: '7px', background: 'var(--navy)', color: '#fff', border: 'none', cursor: canSave ? 'pointer' : 'default', opacity: canSave ? 1 : 0.4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {busy ? '…' : <Save size={14} />}
                  </button>
                ) : (
                  <>
                    {href && (
                      <a href={href} target="_blank" rel="noopener noreferrer" title={`Відстеження ${label}`}
                        style={{ height: '32px', width: '32px', borderRadius: '7px', border: '1px solid var(--border)', color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ExternalLink size={14} />
                      </a>
                    )}
                    {!order.carrier_accepted_at && order.status !== 'delivered' && (
                      <button onClick={() => deleteTTN(order.id)} disabled={ttnDeleting === order.id}
                        title={`Відв'язати номер від замовлення (саму накладну видаліть у кабінеті ${label})`}
                        style={{ height: '32px', width: '32px', borderRadius: '7px', border: '1px solid #FECACA', background: 'var(--bg-danger)', color: 'var(--color-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {ttnDeleting === order.id ? '…' : <Trash2 size={14} />}
                      </button>
                    )}
                  </>
                )}
              </div>
              {typed && !valid && !order.tracking_number && (
                <div style={{ fontSize: '11px', color: 'var(--color-danger)', marginTop: '4px' }}>
                  {carrier === 'ukrposhta' ? 'Штрихкод Укрпошти — 13 цифр (або RR123456789UA)' : 'Номер Meest — латиниця, цифри й дефіс'}
                </div>
              )}
              {!order.tracking_number && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Накладну створіть у кабінеті {order.channel_code === 'epicentr' ? 'Епіцентру' : order.channel_code === 'rozetka' ? 'Rozetka' : order.channel_code === 'prom' ? 'Prom' : label} і вставте номер.
                </div>
              )}
            </>
          );
        })() : (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Доставка не Нова Пошта</div>
        )}
        </div>

        {/* Коментар покупця перенесено в блок «Оплата» лівої картки */}
        {/* ТТН і «Надіслати постачальнику» перенесено під таблицю товарів (колонка ТТН) */}

      </div>
    </>
  );
}
