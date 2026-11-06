'use client';

import { Truck, Check, ChevronDown, ChevronUp, Copy, Tag, MessageSquare, Mail, MailCheck } from 'lucide-react';
import { phoneLocal } from '../../../lib/notify/phone';
import { deliveryPlace } from '../../../lib/delivery-label';
import { rowBadge, PAYMENT_LABEL } from './constants';
import { fmtMoney, itemTitle } from './helpers';
import { ItemThumbs } from './ItemThumbs';
import type { Order } from './types';
import type { OrderSettlement } from '../../../lib/accounting/order-settlement';
import { useOrdersCtx } from './OrdersContext';
import { PAYMENT_METHOD_HINT, type PaymentMethodCode } from '../../../lib/payment-method';
import { fmtInt } from '../../../lib/format';

// Короткі підписи для колонки «Опл.» (58px). Повна назва — у title.
const PAY_SHORT: Partial<Record<PaymentMethodCode | '', string>> = {
  cod:      'НП',
  prom:     'Пром',
  wallet:   'A/G Pay',
  card:     'Card',
  installments: 'Частини',
  partner:  'Партн.',
  invoice:  'Рах.',
  cash:     'Гот.',
  deferred: 'Відст.',
};

export function OrderCompactRow({ isExpanded, order, isPicked, pickedBg, rowTone, date, dateShort, mergedBadge, buyerBadge, channel, mpNumber, deliveryBadges, isCod, paymentConfirmed, settlement, isCancelled, orderBadges, carrierLabel, delivery, inRegistry, isRozetkaPoint, carrierNote, status, isDropship, noCallback, callbackDone }: {
  isExpanded: boolean;
  order: Order;
  isPicked: boolean;
  pickedBg: string;
  rowTone: { bg: string; bgOpen: string; bar: string; edge: string; } | null;
  date: string;
  dateShort: string;
  mergedBadge: React.JSX.Element | null;
  buyerBadge: React.JSX.Element | null;
  channel: { label: string; color: string; bg: string; };
  mpNumber: string | number | null;
  deliveryBadges: React.JSX.Element;
  isCod: boolean;
  paymentConfirmed: boolean;
  settlement: OrderSettlement;
  isCancelled: boolean;
  orderBadges: React.JSX.Element;
  carrierLabel: string;
  delivery: string;
  inRegistry: boolean;
  isRozetkaPoint: boolean;
  carrierNote: React.JSX.Element | null;
  status: { value: string; label: string; color: string; bg: string; };
  isDropship: boolean;
  noCallback: boolean;
  callbackDone: boolean;
}) {
  const {
    setExpandedId, loadFulfillment, loadLinkedPOs, loadPayments, toggleSelect, selectedIds,
    productThumbs, copyPhone, copiedPhone, copyTtn, copiedTtn,
  } = useOrdersCtx();
  return (
    <>
      {/* ── Compact row ── */}
      <div
        className={`order-compact-row${isExpanded ? ' is-open' : ''}`}
        onClick={() => { const next = isExpanded ? null : order.id; setExpandedId(next); if (next) { loadFulfillment(next); loadLinkedPOs(next); loadPayments(next); } }}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          // Нижня межа висоти: без неї рядок без телефону/товару/ТТН виходив
          // нижчим за сусідів і список «дихав». Стелю тримає те, що жодна
          // комірка не переносить текст — усюди nowrap + ellipsis, максимум
          // три рядки (ПІБ / телефон / товар).
          padding: '9px 16px', minHeight: '70px', boxSizing: 'border-box', cursor: 'pointer',
          background: isPicked
            ? pickedBg
            : isExpanded
              ? (rowTone?.bgOpen ?? 'var(--bg-soft)')
              : (rowTone?.bg ?? 'var(--bg-card)'),
        }}
      >
        <div
          onClick={e => { e.stopPropagation(); toggleSelect(order.id); }}
          style={{
            width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer',
            border: `2px solid ${selectedIds.has(order.id) ? '#3DBFB8' : 'var(--border)'}`,
            background: selectedIds.has(order.id) ? '#3DBFB8' : 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {selectedIds.has(order.id) && <Check size={9} color="#fff" strokeWidth={3} />}
        </div>

        {/* № і дата одним стовпчиком: удвох вони займали 160px по горизонталі,
            хоча під номером був порожній другий рядок. Звільнене місце пішло
            клієнту й доставці. Розмір шрифту — на внутрішніх блоках, щоб
            мобільне правило .oc-num { font-size: 15px } не роздувало дату. */}
        <div className="oc-num" style={{ width: '92px', flexShrink: 0, minWidth: 0, fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>
          <div className="oc-numval">#{order.order_number}</div>
          {/* Дата і мітка спільної ТТН — одним підблоком: на телефоні .oc-num
              стає display:contents, і його діти лягають у власні комірки
              сітки. Без обгортки дата й мітка розповзлися б по різних рядках. */}
          <div className="oc-numsub">
            <div className="oc-date" title={date} style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'nowrap', marginTop: '1px' }}>
              <span className="oc-hide-m">{date}</span>
              <span className="oc-only-m oc-date-short" style={{ display: 'none' }}>{dateShort}</span>
            </div>
            <span className="oc-hide-m">{mergedBadge}</span>
            <span className="oc-hide-m">{buyerBadge}</span>
          </div>
        </div>

        {/* Другий рядок картки на телефоні — «звідки і на яких умовах»:
            джерело, номер замовлення в кабінеті МП, умови доставки
            (SMART, дешева доставка) і стан оплати. На десктопі під це
            є окремі колонки, а на телефоні воно тіснилось у шапку і
            з'їдало ширину номера, дати й статусу. */}
        <span className="oc-only-m oc-meta-m" style={{ display: 'none', gap: '5px' }}>
          <span title={`Джерело замовлення: ${channel.label}`}
            style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', color: channel.color, background: channel.bg, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
            {channel.label}
          </span>
          {mpNumber != null && (
            <span title={`Номер замовлення в кабінеті ${channel.label} — за ним шукають замовлення в кабінеті й у листуванні`}
              style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              №{mpNumber}
            </span>
          )}
          {deliveryBadges}
          {/* Оплата: «Наложка» — гроші беремо при врученні, «Оплачено» —
              гроші вже в нас, решта — рахунок ще не закритий. */}
          <span
            title={isCod
              ? 'Накладений платіж — покупець платить при отриманні'
              : paymentConfirmed ? `Оплату підтверджено (${PAYMENT_LABEL[order.payment_type] ?? order.payment_type})`
              : `Оплату ще не підтверджено (${PAYMENT_LABEL[order.payment_type] ?? order.payment_type})`}
            style={{
              ...rowBadge,
              color: isCod ? 'var(--text-warn-dark)' : paymentConfirmed ? 'var(--color-success)' : '#B91C1C',
              background: isCod ? '#FEF3C7' : paymentConfirmed ? '#DCFCE7' : 'var(--bg-danger)',
              borderColor: isCod ? 'var(--border-warn)' : paymentConfirmed ? 'var(--border-success)' : 'var(--border-danger)',
            }}>
            {isCod ? 'НАЛОЖКА' : paymentConfirmed ? 'ОПЛАЧЕНО' : 'НЕ ОПЛАЧЕНО'}
          </span>
          {/* «Виплачено» — гроші вже на НАШОМУ рахунку (з леджера). Окремо від
              «Оплачено»: покупець міг заплатити площадці, а нам виплата ще не дійшла. */}
          {settlement && settlement.state !== 'none' && !isCancelled && (
            <span
              title={settlement.state === 'received'
                ? `Виплачено: гроші за замовлення дійшли до нас (${fmtMoney(settlement.received)} ₴ за обліком)`
                : `Чекаємо виплату: вручено, але ${fmtMoney(settlement.open)} ₴ ще не дійшли до нас (НоваПей / RozetkaPay / покупець)`}
              style={{
                ...rowBadge,
                color: settlement.state === 'received' ? '#166534' : 'var(--color-warn)',
                background: settlement.state === 'received' ? '#BBF7D0' : '#FEF3C7',
                borderColor: settlement.state === 'received' ? '#4ADE80' : 'var(--border-warn)',
              }}>
              {settlement.state === 'received' ? '₴ ВИПЛАЧЕНО' : '₴ ЧЕКАЄМО'}
            </span>
          )}
        </span>

        <ItemThumbs className="oc-hide-m oc-thumbs-d" items={order.items} thumbs={productThumbs}
          size={44} max={2} pad style={{ marginLeft: '8px' }} />

        {/* Клієнт: ПІБ із мітками замовлення, під ним телефон із кнопкою
            копіювання, далі товар. Телефон окремим рядком, бо в парі з ПІБ
            вони билися за ширину, а копіювати номер треба часто — і на
            телефоні теж, тому кнопка не ховається під .oc-hide-m. */}
        <div className="oc-cust" style={{ flex: '0 1 calc(50% - 266px)', minWidth: 0, overflow: 'hidden' }}>
          <div className="oc-nameline" style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
            <span className="oc-name" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.company
                ? <><span style={{ fontWeight: 600 }}>{order.company}</span><span style={{ color: 'var(--text-muted)' }}> · {order.contact}</span></>
                : <span style={{ fontWeight: 600 }}>{order.contact}</span>}
            </span>
            {/* flex-wrap потрібен лише телефону: там мітки стоять власним
                рядком під ПІБ і при кількох штуках не влазять у ширину
                екрана. На десктопі span не стискається, тож переносу немає. */}
            <span className="oc-badges" style={{ display: 'flex', gap: '3px', flexShrink: 0, flexWrap: 'wrap' }}>
              {orderBadges}
            </span>
            {/* Сигнал «покупець лишив коментар» у згорнутому рядку;
                сам текст — у тултіпі і в блоці «Оплата» картки */}
            {(() => {
              const c = order.comment?.split('\n').filter(l => !l.includes('Не передзвонювати')).join(' ').trim();
              // Контурна іконка в ряду тексту губилась — коментар покупця
              // пропускали. Заливка тим самим бурштином, що й решта
              // «прочитай мене» в журналі, плюс сам текст поруч.
              return c ? (
                // flexShrink набагато більший за ПІБ: обидва мали 1, і при
                // довгому коментарі вони ділили ширину пропорційно — від
                // «Дмитро Петренко» лишалось «Дм…». Тепер місце віддає чіп.
                <span title={c} aria-label="Коментар покупця" className="oc-note"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 100, minWidth: 0,
                    padding: '1px 7px 1px 5px', borderRadius: '20px', maxWidth: '220px',
                    background: '#FEF3C7', border: '1px solid var(--border-warn)', color: 'var(--text-warn-dark)',
                    fontSize: '11px', fontWeight: 600, lineHeight: 1.5 }}>
                  <MessageSquare size={12} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c}</span>
                </span>
              ) : null;
            })()}
          </div>

          <div className="oc-phone" style={{ display: 'flex', alignItems: 'center', gap: '5px', minHeight: '16px' }}>
            {order.phone && (<>
              <span title={order.phone} style={{ fontSize: '11.5px', fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: '.01em', whiteSpace: 'nowrap' }}>{phoneLocal(order.phone)}</span>
              {/* Без рамки й фону: кнопка стоїть у кожному рядку, і обведення
                  перетворювало список на решето. Достатньо самої іконки. */}
              <button
                onClick={e => { e.stopPropagation(); copyPhone(order.phone); }}
                title={copiedPhone === order.phone ? 'Скопійовано' : 'Скопіювати номер'}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  width: '16px', height: '16px', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                  color: copiedPhone === order.phone ? 'var(--color-success)' : 'var(--text-muted)',
                }}>
                {copiedPhone === order.phone ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}
              </button>
            </>)}
          </div>

          {order.items[0] && (
            <div className="oc-itemline" style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
              {/* Мініатюри на телефоні: колонка з фото там схована (.oc-hide-m),
                  і замовлення доводилось упізнавати з обрізаної назви. Тут під
                  них є вільна ширина, тому плитки менші, але їх більше. */}
              <ItemThumbs className="oc-only-m oc-thumbs-m" items={order.items} thumbs={productThumbs}
                size={34} max={3} style={{ display: 'none' }} />
              <div className="oc-item" style={{ flex: 1, fontSize: '11px', color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.items[0].is_bonus && <span style={{ marginRight: '4px' }}>🎁</span>}
              {itemTitle(order.items[0])}
              <span style={{ marginLeft: '4px' }}>×{order.items[0].qty}</span>
              {order.items.length > 1 && <span style={{ marginLeft: '4px' }}>+{order.items.length - 1}</span>}
              {order.items.some(i => i.is_bonus) && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--color-success)', fontWeight: 600, background: 'var(--bg-success)', padding: '0 5px', borderRadius: '4px' }}>🎁 бонус</span>}
              </div>
            </div>
          )}
        </div>

        {/* Сума (+ маркер промокоду) — між клієнтом і доставкою */}
        <span style={{ width: '84px', flexShrink: 0, fontSize: '13px', fontWeight: 800, color: 'var(--brand-blue)', textAlign: 'right', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', paddingRight: '24px', boxSizing: 'border-box' }}>
          {order.promo_code && (
            <Tag size={12} style={{ color: 'var(--color-warn)', flexShrink: 0 }}
              aria-label={`Промокод ${order.promo_code}`} />
          )}
          <span title={order.promo_code ? `Промокод ${order.promo_code} · знижка −${fmtMoney(Number(order.promo_discount ?? 0))} ₴ (сума вже з урахуванням)` : undefined}>
            {fmtInt(order.total_price)} ₴
          </span>
        </span>

        {/* Доставка — ТІЛЬКИ на телефоні, двома рядками: «перевізник · адреса»
            і нижче «ТТН · де зараз посилка». На широкому екрані для цього є
            власні колонки, а на телефоні вони сховані через .oc-hide-m, і
            номер посилки не було видно взагалі — доводилось розгортати картку
            заради одного рядка. Тап по номеру копіює його: у списку ТТН
            потрібна саме для того, щоб вставити в пошук перевізника. */}
        <div className="oc-only-m oc-ship" style={{ display: 'none', minWidth: 0, alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {/* Перевізник словом: на телефоні колонка «Доставка» схована, і
              зрозуміти, НП це чи Rozetka Доставка, до створення ТТН було ніяк. */}
          <span className="oc-carrier" style={{ fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {carrierLabel}{order.delivery_subtype === 'courier' ? ' · кур.' : ''}
          </span>
          {(order.delivery_type === 'pickup' || order.delivery_city_name || order.delivery_address) && (
            <span style={{ minWidth: 0 }}>
              {deliveryPlace(order, delivery)}
            </span>
          )}
        </div>

        {/* ТТН і де зараз посилка — окремим рядком під адресою: це вже не
            «куди везти», а «як їде», і разом з адресою вони не влазили. */}
        <div className="oc-only-m oc-track" style={{ display: 'none', minWidth: 0, alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
          {order.tracking_number && (
            <span
              className="oc-ttn"
              onClick={e => { e.stopPropagation(); copyTtn(order.tracking_number!); }}
              title={`${carrierLabel} · ${order.tracking_number}${inRegistry ? ' · вже в реєстрі НП' : ''} — натисніть, щоб скопіювати`}
              style={{
                flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '1px 7px', borderRadius: '20px', fontWeight: 700, letterSpacing: '.02em',
                color: isRozetkaPoint ? '#065F46' : '#7C2D12',
                background: isRozetkaPoint ? '#ECFDF5' : '#FFF7ED',
                border: `1px solid ${isRozetkaPoint ? '#6EE7B7' : '#FDBA74'}`,
              }}>
              <Truck size={10} style={{ flexShrink: 0 }} />
              {isRozetkaPoint ? 'Rozetka' : 'НП'} {order.tracking_number}
              {inRegistry && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--status-instock)', flexShrink: 0 }} />}
              {copiedTtn === order.tracking_number && <Check size={10} strokeWidth={3} />}
            </span>
          )}
          {carrierNote}
          {mergedBadge && <span className="oc-only-m" style={{ display: 'none', flexShrink: 0 }}>{mergedBadge}</span>}
          {buyerBadge && <span className="oc-only-m" style={{ display: 'none', flexShrink: 0 }}>{buyerBadge}</span>}
        </div>

        {/* Доставка трьома рядками: перевізник (+ умови акції), потім місто
            з відділенням без вулиці, потім ТТН. Раніше все тіснилось у два
            рядки, перевізник читався лише з кольору плашки, а повна адреса
            з'їдала колонку, хоча для впізнавання досить номера відділення.
            На телефоні цю інформацію показує блок oc-ship вище. */}
        <div className="oc-hide-m oc-deliv" style={{ flex: 1, minWidth: '200px', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {carrierLabel}{order.delivery_subtype === 'courier' ? ' · кур.' : ''}
            </span>
            <span style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>{deliveryBadges}</span>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deliveryPlace(order, delivery)}
          </div>

          <div style={{ minHeight: '16px' }}>
            {order.tracking_number && (
              <span
                onClick={e => { e.stopPropagation(); copyTtn(order.tracking_number!); }}
                title={`${carrierLabel} · ${order.tracking_number}${inRegistry ? ' · вже в реєстрі НП' : ''} — натисніть, щоб скопіювати`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer',
                  padding: '0 6px', borderRadius: '20px', fontSize: '10.5px', fontWeight: 700, letterSpacing: '.02em',
                  color: isRozetkaPoint ? '#065F46' : '#7C2D12',
                  background: isRozetkaPoint ? '#ECFDF5' : '#FFF7ED',
                  border: `1px solid ${isRozetkaPoint ? '#6EE7B7' : '#FDBA74'}`,
                }}>
                <Truck size={9} style={{ flexShrink: 0 }} />
                <span style={{ whiteSpace: 'nowrap' }}>{order.tracking_number}</span>
                {inRegistry && <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--status-instock)', flexShrink: 0 }} />}
                {copiedTtn === order.tracking_number && <Check size={9} strokeWidth={3} />}
              </span>
            )}
          </div>
        </div>

        {/* Статус */}
        <div className="oc-status" style={{ width: '118px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%' }}>
          <span
            className={order.status === 'awaiting_stock' ? 'status-awaiting-pulse' : undefined}
            style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', color: status.color, background: status.bg, display: 'inline-flex', alignItems: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status.label}
          </span>
          {/* Постачальник — лише телефон (на десктопі є колонка «Відпр.»): іконка
              листа біля статусу, бо надсилання постачальнику — це й є «стан» замовлення
              до відправки. Зелений лист із ✓ — надіслано, жовтий — ще ні. Лише для замовлень
              через постачальника і лише до «Відправлено»: у старих замовлень мітки
              надсилання немає, жовта іконка на доставленому вводила б в оману.
              Раніше це була мітка «ПОСТ.» у рядку джерела — там вона переносила
              рядок на вузьких екранах (06.11.2026). */}
          {(order.fulfillment_mode === 'supplier' || order.fulfillment_mode === 'mixed')
            && ['new', 'confirmed', 'awaiting_stock', 'picking'].includes(order.status) && (
            <span
              className={`oc-only-m oc-supl-m${order.supplier_sent_at ? ' is-sent' : ''}`}
              style={{ display: 'none' }}
              title={(order.fulfillment_mode === 'mixed' ? 'Частково через постачальника. ' : '') + (order.supplier_sent_at
                ? `Надіслано постачальнику ${new Date(order.supplier_sent_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : 'Замовлення ще не надіслано постачальнику')}
              aria-label={order.supplier_sent_at ? 'Надіслано постачальнику' : 'Не надіслано постачальнику'}>
              {order.supplier_sent_at ? <MailCheck size={13} strokeWidth={2.2} /> : <Mail size={13} strokeWidth={2.2} />}
            </span>
          )}
          {order.status === 'shipped' && order.tracking_number && !order.carrier_status_text && (
            <span
              title={`${order.carrier_accepted_at ? 'Прийнято' : 'Очікує приймання'} ${isRozetkaPoint ? 'Rozetka Доставкою' : 'Новою Поштою'}`}
              style={{ fontSize: '12px', flexShrink: 0, color: order.carrier_accepted_at ? 'var(--color-success)' : 'var(--color-warn)' }}>
              {order.carrier_accepted_at ? '✓' : '⏳'}
            </span>
          )}
          {order.status === 'shipped' && order.shipped_at && (() => {
            const days = Math.floor((Date.now() - new Date(order.shipped_at).getTime()) / 86400000);
            if (days < 7) return null;
            return (
              <span title={`Відправлено ${days} дн тому — довго висить. Перевірте доставку та завершіть замовлення («Доставлено»), інакше продаж не проведеться.`}
                style={{ fontSize: '10px', fontWeight: 700, flexShrink: 0, padding: '1px 5px', borderRadius: '10px', color: '#B91C1C', background: 'var(--bg-danger)', border: '1px solid var(--border-danger)', whiteSpace: 'nowrap' }}>
                ⚠ {days}д
              </span>
            );
          })()}
          </div>
          {carrierNote}
        </div>

        {/* Канал (76px — як заголовок із лійкою в шапці) */}
        <div className="oc-hide-m" style={{ width: '76px', flexShrink: 0, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', color: channel.color, background: channel.bg, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
            {channel.label}
          </span>
        </div>

        {/* Відправка (112px — як заголовок; ширше, ніж було, щоб «Постачальник» писати
            повністю разом з іконкою листа, 06.11.2026) */}
        <div className="oc-hide-m" style={{ width: '112px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
          {order.fulfillment_mode && (() => {
            // Лист постачальнику — іконкою ВСЕРЕДИНІ мітки «Пост.»/«Mix» (06.11.2026; та сама
            // іконка, що на телефоні біля статусу): зелений лист із ✓ — надіслано, жовтий —
            // ще ні (лише поки замовлення в роботі: у старих мітки надсилання немає).
            // Окремою плашкою поруч ряд виглядав строкатим. Раніше тут була зелена пташка.
            const viaSupplier = order.fulfillment_mode === 'supplier' || order.fulfillment_mode === 'mixed';
            const showMail = viaSupplier && (!!order.supplier_sent_at || ['new', 'confirmed', 'awaiting_stock', 'picking'].includes(order.status));
            const modeTitle = order.fulfillment_mode === 'own' ? 'Відправка зі складу' : order.fulfillment_mode === 'supplier' ? 'Відправка через постачальника' : 'Змішана відправка';
            const mailTitle = !showMail ? '' : order.supplier_sent_at
              ? ` · надіслано постачальнику ${new Date(order.supplier_sent_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
              : ' · ще не надіслано постачальнику';
            return (
              <span
                title={modeTitle + mailTitle}
                // marginLeft −8px = лівий padding плашки: текст мітки стоїть точно під
                // літерою заголовка «Відправка», а не на 8px правіше (06.11.2026)
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '-8px',
                  fontSize: '11px', fontWeight: 600, padding: showMail ? '2px 6px 2px 8px' : '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
                  color:      order.fulfillment_mode === 'own' ? 'var(--color-success)' : order.fulfillment_mode === 'supplier' ? 'var(--brand-blue)' : '#7C3AED',
                  background: order.fulfillment_mode === 'own' ? '#DCFCE7' : order.fulfillment_mode === 'supplier' ? '#EAF1F8' : '#EDE9FE' }}>
                {order.fulfillment_mode === 'own' ? 'Склад' : order.fulfillment_mode === 'mixed' ? 'Змішана' : 'Постачальник'}
                {showMail && (
                  <span aria-label={order.supplier_sent_at ? 'надіслано постачальнику' : 'не надіслано постачальнику'}
                    style={{ display: 'inline-flex', color: order.supplier_sent_at ? 'var(--color-success)' : 'var(--color-warn)' }}>
                    {order.supplier_sent_at ? <MailCheck size={13} strokeWidth={2.2} /> : <Mail size={13} strokeWidth={2.2} />}
                  </span>
                )}
              </span>
            );
          })()}
        </div>

        {/* Оплата (58px — як заголовок із лійкою в шапці) */}
        <div className="oc-hide-m" style={{ width: '58px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {(() => {
            // Підпис — з payment_method_code (той самий код, що й фільтр «оплата» в шапці):
            // payment_type у неоплаченої Пром-оплати / Apple Pay Rozetka — 'invoice', і рядок
            // показував «Рах.» замість способу, яким покупець платить.
            const code = (order.payment_method_code ?? '') as PaymentMethodCode | '';
            // Гаманець Rozetka: Apple Pay / Google Pay — з payload (payment_type_title)
            const walletTitle = code === 'wallet'
              ? String((order.rozetka_data as { payment?: { payment_type_title?: unknown } } | null)?.payment?.payment_type_title ?? '')
              : '';
            const label = walletTitle === 'Apple Pay' ? 'A Pay'
              : walletTitle === 'Google Pay' ? 'G Pay'
              : PAY_SHORT[code] ?? (order.payment_type === 'prepaid' ? 'Пре.' : '—');
            // Зелений = оплата підтверджена (передоплата/безнал/картка). НП платить при отриманні.
            const paid = order.payment_confirmed && order.payment_type !== 'cod';
            // Онлайн-оплата площадки, яка ще не пройшла: сірий + підказка «в процесі»
            const inProgress = !paid && !isCancelled && (code === 'prom' || code === 'wallet' || code === 'card' || code === 'installments');
            // Rozetka не віддає тип картки (Visa/Mastercard) — лише назву способу,
            // напр. «Оплата карткою Visa/MasterCard»; показуємо її в підказці.
            const rzMethod = order.channel_code === 'rozetka'
              ? String((order.rozetka_data as { payment?: { payment_method_name?: unknown } } | null)?.payment?.payment_method_name ?? '')
              : '';
            const hint = (walletTitle ? `${walletTitle} через Rozetka`
              : (code === 'card' || code === 'installments') && rzMethod ? `Rozetka: ${rzMethod}`
              : code === 'card' && order.channel_code === 'website' ? 'Картка онлайн через Monobank на сайті'
              : code && code in PAYMENT_METHOD_HINT ? PAYMENT_METHOD_HINT[code as PaymentMethodCode] : '')
              + (inProgress ? ' — оплата ще в процесі' : '');
            // Насичено-зелений з «✓» = гроші вже на нашому рахунку; помаранчевий = вручено, виплата не дійшла
            const received = settlement?.state === 'received' && !isCancelled;
            const waiting = settlement?.state === 'pending' && !isCancelled;
            return (
              <span title={received ? `Виплачено — гроші дійшли до нас (${fmtMoney(settlement!.received)} ₴)` : waiting ? `Чекаємо виплату: ${fmtMoney(settlement!.open)} ₴ ще не дійшли до нас` : paid ? `Оплачено${hint ? ' · ' + hint : ''}` : hint || undefined}
                style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '20px', whiteSpace: 'nowrap',
                  background: received ? '#BBF7D0' : waiting ? '#FEF3C7' : paid ? '#DCFCE7' : 'var(--border-light)',
                  color: received ? '#166534' : waiting ? 'var(--color-warn)' : paid ? 'var(--color-success)' : 'var(--text-secondary)',
                  fontWeight: received || waiting ? 700 : undefined, display: 'inline-flex', alignItems: 'center' }}>
                {received ? '✓' : waiting ? '…' : ''}{label}
              </span>
            );
          })()}
        </div>

        {/* Дзвінок */}
        <div className="oc-hide-m" style={{ width: '34px', flexShrink: 0, textAlign: 'center' }}>
          {!isDropship && (
            <span style={{ fontSize: '11px', padding: '2px 5px', borderRadius: '20px', display: 'inline-block',
              background: noCallback || callbackDone ? '#DCFCE7' : '#FEF3C7',
              color: noCallback || callbackDone ? 'var(--color-success)' : 'var(--color-warn)' }}>
              {noCallback ? '✓' : callbackDone ? '✓📞' : '📞'}
            </span>
          )}
        </div>

        {isExpanded
          ? <ChevronUp size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
          : <ChevronDown size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
        }
      </div>
    </>
  );
}
