'use client';

import { CreditCard, Package, Truck, Check, ShoppingCart, Copy, MoreHorizontal, Tag } from 'lucide-react';

import { storageDaysLeft, returnTrackingLabel } from '../../lib/np-return-tracking';
import { showToast } from '../../lib/toast';

import { ROZETKA_DELIVERY_TYPE } from '../../lib/rozetka-delivery';
import { RZ_DELIVERY_TYPE } from '../../lib/rz-delivery';

import { isManualPostalCarrier, MANUAL_CARRIER_LABEL } from '../../lib/carriers';

import { isPromCheapDelivery, computePromDeliveryFee } from '../../lib/prom-delivery-fee';

import type { AdminOrdersProps } from './_orders/types';
import { CHANNEL_LABEL, SAME_BUYER_TONES, STATUSES, DELIVERY_LABEL, rowBadge, STATUS_RANK } from './_orders/constants';
import { rozetkaCabinet } from './_orders/helpers';

import { useAdminOrders } from './_orders/useAdminOrders';
import { OrdersToolbar } from './_orders/OrdersToolbar';
import { OrdersTableHeader } from './_orders/OrdersTableHeader';
import { OrderCompactRow } from './_orders/OrderCompactRow';
import { OrderItemsCard } from './_orders/OrderItemsCard';
import { OrderNoteAndSections } from './_orders/OrderNoteAndSections';
import { OrderClientCard } from './_orders/OrderClientCard';
import { OrderDeliveryCard } from './_orders/OrderDeliveryCard';
import { OrderActionsColumn } from './_orders/OrderActionsColumn';
import { OrderEventLog } from './_orders/OrderEventLog';
import { OrdersBulkBar } from './_orders/OrdersBulkBar';
import { SupplierSendQueueModal } from './_orders/SupplierSendQueueModal';
import { BulkSupplierSendModal } from './_orders/BulkSupplierSendModal';
import { NpRegistryPickerModal } from './_orders/NpRegistryPickerModal';
import { OrdersCtx } from './_orders/OrdersContext';
import { Modal } from '../components/admin/ui/Modal';

export default function AdminOrders(props: AdminOrdersProps) {
  const ctx = useAdminOrders(props);
  const {
    currentPage, totalPages, hasRecentReceipts, statusCounts, currentStatus, initialSearch,
    channelFilter, carrierFilter, payFilter, retFilter, feeTariffs, initialSettlement,
    isAdmin, searchParams, pageHref, orders, setSearchInput, pushFilters,
    registryAdded, expandedId, flashId, confirming, confirmErrors, actionsOpen,
    statusEditOpen, setStatusEditOpen, cardSwipe, setCardSwipe, confirmOrder, selectedIds,
    setSelectedIds, rozCancelFor, setRozCancelFor, changeStatus, isReturnPending, returnState,
    setReturnState, mergedByTtn, sameBuyer, todayKey, filtered,
  } = ctx;

  return (
    <OrdersCtx.Provider value={ctx}>
    <>
      {/* Панель масових дій тепер унизу, під списком (липне до нижнього краю,
          див. .oc-merge-bar у globals.css): рядок, який щойно виділили, лишається
          перед очима, а не ховається за панеллю зверху. */}
      {/* Register panel */}

      <OrdersToolbar />

      {/* Awaiting stock alert — показується тільки якщо сьогодні провели прихід */}
      {(() => {
        const awaitingCount = orders.filter(o => o.status === 'awaiting_stock').length;
        if (!awaitingCount || !hasRecentReceipts) return null;
        const isFiltered = channelFilter === '' && carrierFilter === '' && payFilter === '' && !initialSearch;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 14px', marginBottom: '10px', borderRadius: '10px',
            background: '#F5F3FF', border: '1.5px solid #DDD6FE',
            animation: 'awaiting-banner-pulse 3s ease-in-out infinite',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>⏳</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#6D28D9' }}>
                {awaitingCount} {awaitingCount === 1 ? 'замовлення очікує товар' : 'замовлень очікують товар'}
              </span>
              <span style={{ fontSize: '12px', color: '#7C3AED' }}>— перевірте надходження товару</span>
            </div>
            {isFiltered ? (
              <button
                onClick={() => pushFilters({ status: 'awaiting_stock' })}
                style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid #A78BFA', background: '#EDE9FE', color: '#6D28D9', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Показати →
              </button>
            ) : (
              <button
                onClick={() => { setSearchInput(''); pushFilters({ q: '', channel: '', carrier: '' }); }}
                style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid #A78BFA', background: '#EDE9FE', color: '#6D28D9', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Скинути фільтри →
              </button>
            )}
          </div>
        );
      })()}

      {/* Аркуш: на десктопі шапка і всі рядки лежать в одній білій картці з
          тонкими роздільниками (.oc-sheet у globals.css), а не окремими
          плитками з тінями. На телефоні картки лишаються як були. */}
      <div className={filtered.length > 0 ? 'oc-sheet' : undefined}>
      <OrdersTableHeader />

      {/* «Вибрати всі» на телефоні: шапка таблиці там схована (.oc-hide-m), а
          разом з нею і чекбокс вибору — групові дії (друк етикеток, реєстр НП,
          об'єднання) з телефона були недоступні взагалі. */}
      {filtered.length > 0 && (() => {
        const allIds = filtered.map(o => o.id);
        const allSelected = allIds.every(id => selectedIds.has(id));
        const picked = allIds.filter(id => selectedIds.has(id)).length;
        return (
          <button
            className="oc-only-m oc-selectall-m"
            onClick={() => setSelectedIds(allSelected ? new Set() : new Set(allIds))}
            style={{
              display: 'none', alignItems: 'center', gap: '8px', width: '100%',
              marginBottom: '8px', padding: '9px 12px', borderRadius: '10px',
              border: `1.5px solid ${picked > 0 ? 'var(--brand-teal)' : 'var(--border)'}`,
              background: picked > 0 ? 'var(--brand-teal-light)' : 'var(--bg-card)',
              color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>
            <span style={{
              width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
              border: `2px solid ${allSelected ? '#3DBFB8' : 'var(--border)'}`,
              background: allSelected ? '#3DBFB8' : 'var(--bg-card)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {allSelected && <Check size={9} color="#fff" strokeWidth={3} />}
            </span>
            {allSelected ? 'Зняти вибір' : 'Вибрати всі'}
            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)' }}>
              {picked > 0 ? `вибрано ${picked} з ${filtered.length}` : `${filtered.length} у списку`}
            </span>
          </button>
        );
      })()}

      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
          padding: '40px 32px', textAlign: 'center', color: 'var(--text-muted)',
        }}>
          <Package size={36} strokeWidth={1} style={{ marginBottom: '10px', opacity: 0.4 }} />
          <p style={{ marginBottom: '16px', fontSize: '14px' }}>
            {retFilter === 'pending'
              ? 'Повернень без рішення немає — по всіх посилках, що їхали назад, рішення прийнято'
              : currentStatus
              ? `Немає замовлень зі статусом «${currentStatus === 'ready_to_ship' ? 'До відправки' : (STATUSES.find(s => s.value === currentStatus)?.label ?? currentStatus)}»`
              : 'Замовлень немає'}
          </p>
          {/* Банер з підказкою про інші статуси. Посилання зберігає ВЕСЬ чинний зріз
              (пошук, канал, перевізник, оплата, дати), а не лише дати: раніше при
              пошуку за номером клік вів у повний журнал статусу, і знайдене
              замовлення доводилось шукати заново (30.10.2026). Якщо в результаті
              лишається одне замовлення, page.tsx сам його розкриває. */}
          {currentStatus && Object.keys(statusCounts).length > 0 && (() => {
            const others = STATUSES.filter(s => s.value && s.value !== currentStatus && (statusCounts[s.value] ?? 0) > 0);
            if (!others.length) return null;
            const hrefFor = (status: string) => {
              const p = new URLSearchParams(searchParams.toString());
              p.set('status', status);
              p.delete('page');
              p.delete('expand');
              return `/admin?${p.toString()}`;
            };
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>Є замовлення в:</span>
                {others.map(s => (
                  <a key={s.value} href={hrefFor(s.value)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '30px', padding: '0 12px', borderRadius: '8px', background: s.bg, color: s.color, fontSize: '13px', fontWeight: 700, textDecoration: 'none', border: `1px solid ${s.color}22` }}>
                    {s.label} <span style={{ background: s.color, color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '11px' }}>{statusCounts[s.value]}</span>
                  </a>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="oc-sheet-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(order => {
            const isExpanded = expandedId === order.id;
            let status = STATUSES.find(s => s.value === order.status) ?? STATUSES[0];
            // Косметика Варіанту 3: shipped без приймання НП = «Готово до відправки»
            // (ТТН створена, товар ще на складі); після приймання перевізником —
            // «Відправлено». На облік не впливає — лише мітка статусу.
            if (order.status === 'shipped' && !order.carrier_accepted_at) {
              status = { ...status, label: 'До відправки', color: '#B45309', bg: '#FEF3C7' };
            }
            const date = new Date(order.created_at).toLocaleString('uk-UA', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            });
            // На телефоні №, дата, канал, статус і сума стоять одним рядком, і повна
            // дата з часом туди не влазила. Там показуємо короткий варіант: день і
            // місяць, а час — лише коли замовлення сьогоднішнє (у свіжих потрібен саме він).
            // Повна дата лишається на десктопі, у підказці й у розгорнутій картці.
            const dateShort = new Date(order.created_at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' }) === todayKey
              ? new Date(order.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })
              : new Date(order.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
            const delivery = DELIVERY_LABEL[order.delivery_type] ?? order.delivery_type;
            const subtype = order.delivery_subtype === 'courier' ? ' — кур\'єр' : order.delivery_subtype === 'warehouse' ? ' — відділення' : '';
            const isCod = order.payment_type === 'cod';
            // Номер у кабінеті МП беремо з власних колонок, а не з JSON-знімка:
            // prom_order_id / rozetka_order_id — це те, за чим замовлення шукає
            // синк, і другої правди з prom_data.id тут заводити не треба.
            const mpNumber = order.prom_order_id ?? order.rozetka_order_id ?? null;
            const paymentConfirmed = order.payment_confirmed ?? false;
            const settlement = initialSettlement[order.id];
            const noCallback = order.comment?.includes('Не передзвонювати') ?? false;
            const callbackDone = order.callback_done ?? false;
            const isDropship = order.channel_code === 'dropship';
            const channel = CHANNEL_LABEL[order.channel_code ?? 'website'] ?? CHANNEL_LABEL.website;
            const isUnpaidInvoice = !paymentConfirmed && order.payment_type !== 'cod'
              && !['delivered', 'cancelled'].includes(order.status);
            const isFlashing = flashId === order.id;

            const isCancelled = order.status === 'cancelled';
            // Rozetka Smart: безкоштовна доставка для покупця, компенсацію (12/18/30 грн)
            // списують з нас. Будь-яке редагування складу замовлення знімає Smart безповоротно.
            const isSmart = order.channel_code === 'rozetka' && Boolean(order.rozetka_data?.is_smart);
            // Доставка в точки видачі Rozetka: накладну оформлюємо не в НП, а через Rozetka
            // (номер «RMP-…»). Видно в списку, щоб не почати збирати посилку не тим перевізником.
            const isRzPickup = order.delivery_type === ROZETKA_DELIVERY_TYPE;
            // Колір плашки з номером — за ФІЗИЧНИМ місцем видачі, а не за тим, чиїм
            // API виписана накладна. Обидві «Rozetka» їдуть в одні й ті самі точки,
            // і в списку менеджер зчитує кольором саме це: помаранчеве — Нова Пошта,
            // зелене — точка видачі. Розрізняти API треба лише там, де від нього
            // залежить дія (кнопки накладної), і для цього лишається isRzPickup.
            const isRozetkaPoint = isRzPickup || order.delivery_type === RZ_DELIVERY_TYPE;
            // Акція Prom «Дешева доставка»: покупцю доставка майже безкоштовна, а
            // організацію оплачуємо ми — 10 ₴ від 200 і 30 ₴ від 700 за замовлення.
            // У кабінеті Prom це видно плашкою, у нас замовлення виглядало звичайним.
            const isPromCheapDeliv = order.channel_code === 'prom' && isPromCheapDelivery(order.prom_data);
            const promDeliveryFee = isPromCheapDeliv
              ? computePromDeliveryFee(order.total_price, feeTariffs.promDelivery)
              : 0;

            /**
             * Мітки рядка. Дві групи, бо вони про різне:
             *  orderBadges    — про саме замовлення і те, що вимагає уваги (терміново,
             *                   проблемне, повернення) — стоять біля ПІБ;
             *  deliveryBadges — про умови доставки (SMART, точка видачі, дешева доставка
             *                   Prom, спільна накладна) — стоять у колонці «Доставка»,
             *                   поруч із ТТН, якої вони й стосуються.
             * На телефоні колонки доставки немає, тому там обидві групи показуються
             * поруч із ПІБ (oc-only-m у розмітці нижче).
             */
            const orderBadges = (
              <>
                {(order.flags ?? []).includes('urgent') && (
                  <span title="Терміново" style={{ ...rowBadge, color: '#B91C1C', background: '#FEE2E2', borderColor: 'var(--border-danger)' }}>⚡</span>
                )}
                {(order.flags ?? []).includes('problem') && (
                  <span title="Проблемний" style={{ ...rowBadge, color: 'var(--color-warn)', background: '#FEF3C7', borderColor: 'var(--border-warn)' }}>⚠</span>
                )}
                {/* Замовлення відредагували в кабінеті МП, а наш склад лишився
                    старий: чіпати його автоматично не можна, поки висять резерв
                    і ЗП постачальнику. Мітка з розшифровкою — рішення за людиною. */}
                {(() => {
                  const ch = (order.rozetka_data as { _items_changed?: { at: string; summary: string } } | null)?._items_changed;
                  return ch ? (
                    <span title={`Змінено в кабінеті Rozetka ${new Date(ch.at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: ${ch.summary}. Наш склад не змінювався — звірте резерв, ЗП постачальнику і ТТН.`}
                      style={{ ...rowBadge, color: '#9A3412', background: '#FFF7ED', borderColor: '#FDBA74' }}>
                      ✎ змінено в МП
                    </span>
                  ) : null;
                })()}
                {order.mp_refund_status && (
                  <span title={`Покупець відкрив повернення — ${order.mp_refund_status}`} style={{ ...rowBadge, color: '#B91C1C', background: '#FEE2E2', borderColor: 'var(--border-danger)' }}>↩ повернення</span>
                )}
                {order.np_return_ref && (
                  <span title={`Заявка на повернення в НП${order.np_return_number ? ` №${order.np_return_number}` : ''} — посилка їде назад на наше відділення`} style={{ ...rowBadge, color: '#9A3412', background: '#FFF7ED', borderColor: '#FDBA74' }}>↩ НП</span>
                )}
                {isReturnPending(order) && (() => {
                  const rs = returnState(order);
                  const s = rs === 'received'
                    ? { t: '↩ забрано', c: '#15803D', bg: '#F0FDF4', b: '#BBF7D0', title: 'Повернення забрано з пошти' }
                    : rs === 'abandoned'
                    ? { t: '↩ залишено', c: '#64748B', bg: '#F8FAFC', b: '#E2E8F0', title: 'Вирішено не забирати (повернення дорожче за товар)' }
                    // «Зараз» беремо з руху ЗВОРОТНОЇ накладної, якщо він відомий:
                    // статус старої після відмови застигає і про поточне місце
                    // нічого не каже.
                    : { t: '↩ забрати?', c: '#C2410C', bg: '#FFF7ED', b: '#FDBA74', title: `Замовлення скасоване, але посилку вже прийняла ${isRozetkaPoint ? 'Rozetka Доставка' : 'НП'} — вона їде назад${
                        order.np_return_tracking ? ` (зараз: ${returnTrackingLabel(order.np_return_tracking, new Date())})`
                        : order.carrier_status_text ? ` (зараз: «${order.carrier_status_text}»)` : ''
                      }. Відкрийте замовлення і вирішіть: забрати з пошти чи залишити.` };
                  return <span title={s.title} style={{ ...rowBadge, color: s.c, background: s.bg, borderColor: s.b }}>{s.t}</span>;
                })()}
              </>
            );

            const deliveryBadges = (
              <>
                {isSmart && (
                  <span title="Rozetka Smart — безкоштовна доставка для покупця, компенсація списується з нас. НЕ редагуйте склад замовлення: будь-яка зміна знімає Smart безповоротно." style={{ ...rowBadge, color: '#713F12', background: '#FDE047', borderColor: '#FACC15' }}>SMART</span>
                )}
                {isPromCheapDeliv && (
                  <span title={`Замовлення за акцією Prom «Дешева доставка»: покупець платить за доставку символічно, організацію оплачуємо ми${promDeliveryFee > 0 ? ` — ${promDeliveryFee} ₴ за це замовлення` : ''}. Prom списує збір після вручення посилки; невикуп не списується. Збір проводиться автоматично при доставці.`}
                    style={{ ...rowBadge, color: '#7C2D12', background: '#FDBA74', borderColor: '#FB923C' }}>
                    ДЕШ. ДОСТ.
                  </span>
                )}
              </>
            );

            /**
             * Спільна накладна — ознака самого замовлення, а не умов доставки: вона
             * каже «це замовлення їде разом з іншим». Тому стоїть під номером, поруч
             * із номерами-сусідами, а не в колонці доставки.
             */
            const mergedBadge = (() => {
              const group = order.tracking_number ? mergedByTtn.get(order.tracking_number) : undefined;
              if (!group) return null;
              const others = group.filter((n: number) => n !== order.order_number);
              return (
                <span
                  title={`Одна посилка на ${group.length} замовлення — спільна ТТН ${order.tracking_number}. Разом із №${others.join(', №')}. Відвантажувати треба всі, інакше частина залишиться висіти.`}
                  style={{ ...rowBadge, marginTop: '2px', color: '#5B21B6', background: '#F5F3FF', borderColor: '#C4B5FD' }}>
                  ⛓ №{others.join(', №')}
                </span>
              );
            })();

            // Той самий покупець, ще без накладної. Кольори чергуються між
            // групами, щоб дві пари поруч не зливались в одну.
            const buyerBadge = (() => {
              const g = sameBuyer.get(order.id);
              if (!g) return null;
              const others = g.numbers.filter(n => n !== order.order_number);
              const tone = SAME_BUYER_TONES[g.index % SAME_BUYER_TONES.length];
              const allPicked = g.ids.every(id => selectedIds.has(id));
              return (
                <span
                  role="button"
                  onClick={e => {
                    e.stopPropagation();
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (allPicked) g.ids.forEach(id => next.delete(id)); else g.ids.forEach(id => next.add(id));
                      return next;
                    });
                  }}
                  title={`Той самий покупець ще має замовлення №${others.join(', №')} без накладної${g.sameAddress ? ' на ту саму адресу' : ' (адреса відрізняється — перевірте)'}. Можна відправити однією ТТН. Клік — ${allPicked ? 'зняти вибір з групи' : 'вибрати всю групу, далі «Об\'єднати» внизу'}.`}
                  style={{ ...rowBadge, marginTop: '2px', cursor: 'pointer', color: tone.c, background: tone.bg, borderColor: tone.b }}>
                  👥 + №{others.join(', №')}{g.sameAddress ? '' : ' ≠адр'}
                </span>
              );
            })();

            // Перевізник рядком: раніше це читалося лише з кольору плашки ТТН, а для
            // точок видачі Rozetka була окрема мітка «ТОЧКА» — тепер про це прямо
            // сказано першим рядком колонки, і окрема мітка не потрібна.
            const carrierLabel = order.delivery_type === 'pickup' ? 'Самовивіз'
              : isRzPickup ? 'Rozetka Доставка'
              : order.delivery_type === RZ_DELIVERY_TYPE ? 'ROZETKA Доставка'
              : isManualPostalCarrier(order.delivery_type) ? MANUAL_CARRIER_LABEL[order.delivery_type]
              : 'Нова Пошта';

            // ТТН вже в реєстрі НП → тиха зелена крапка в чипі номера. Показуємо
            // ЛИШЕ поки замовлення «До відправки» (ТТН створена, НП ще не прийняла):
            // саме тут треба бачити, кого ще не додано в реєстр. Після приймання
            // перевізником питання закрите — крапка стає шумом і зникає.
            const inRegistry = order.status === 'shipped' && !order.carrier_accepted_at
              && !!order.tracking_number && registryAdded.has(order.tracking_number);

            /**
             * Де зараз посилка (з синку перевізника). Один елемент на два місця:
             * у таблиці він стоїть під статусом замовлення, на телефоні — поруч із
             * ТТН, якої стосується. Зайвий екземпляр ховає CSS, а не умова в JS,
             * щоб розмітка лишалась однією і не розповзалася двома копіями.
             */
            // Для доставлених у тому ж місці — коли саме покупець забрав посилку.
            // Пріоритет — час перевізника (carrier_delivered_at, НП); якщо його
            // немає (Rozetka, ручне «Виконано») — наш delivered_at із поясненням у title.
            const deliveredAt = order.status === 'delivered' ? (order.carrier_delivered_at ?? order.delivered_at) : null;
            const carrierNote = order.status === 'shipped' && order.carrier_status_text ? (
              <span className="oc-cstat"
                title={order.carrier_status_synced_at ? `${order.carrier_status_text} · оновлено ${new Date(order.carrier_status_synced_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : order.carrier_status_text}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', maxWidth: '100%', fontSize: '10px', fontWeight: 500, color: order.carrier_accepted_at ? 'var(--color-success)' : 'var(--color-warn)', overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                <Truck size={10} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.carrier_status_text}</span>
              </span>
            ) : deliveredAt ? (
              <span className="oc-cstat"
                title={order.carrier_delivered_at
                  ? `Вручено ${new Date(deliveredAt).toLocaleString('uk-UA')} — час видачі за даними перевізника`
                  : `Доставку зафіксовано ${new Date(deliveredAt).toLocaleString('uk-UA')} — перевізник часу видачі не дав, це наш час`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', maxWidth: '100%', fontSize: '10px', fontWeight: 500, color: 'var(--color-success)', overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                <Check size={10} strokeWidth={3} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {new Date(deliveredAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
            ) : null;

            // Вибір під групову дію (друк, реєстр, об'єднання) було видно лише
            // по галочці зліва — на довгому списку легко втратити, що саме
            // потрапить у пачку. Тому позначаємо весь рядок.
            const isPicked = selectedIds.has(order.id);

            /**
             * «Терміново» і «проблемний» позначались значком 18×18 біля ПІБ —
             * на списку в 50 рядків він не читався. Підсвічуємо рядок цілком,
             * але делікатно: ледь помітний відтінок плюс смуга зліва, як у
             * неоплаченого рахунку. Насиченим лишається лише сам значок.
             */
            const flags = order.flags ?? [];
            // Рамка по периметру насиченим кольором кричала на весь список,
            // тож акцент лише зліва, а контур — світлий.
            const rowTone = flags.includes('urgent')
              ? { bg: '#FEF6F6', bgOpen: '#FDEDED', bar: '#DC2626', edge: '#FADBDB' }
              : flags.includes('problem')
                ? { bg: '#FFFCF3', bgOpen: '#FEF7E6', bar: '#F59E0B', edge: '#FBE7BF' }
                : isUnpaidInvoice
                  ? { bg: '#FFFBF0', bgOpen: '#FEF9EC', bar: '#FCD34D', edge: '#FDE8B0' }
                  : null;

            // Тон рядка (неоплачений рахунок, терміново, проблемний) — це попередження,
            // і воно не має зникати ні під курсором, ні у виборі. Раніше наведення
            // перефарбовувало рядок у нейтральний, а вибір — у бірюзову заливку, і
            // неоплачене в пачці з оплаченими виглядало однаково (30.10.2026): так
            // його легко було відправити на збірку разом з усіма. Тепер вибір —
            // бірюзовий контур і смуга зліва, а заливка лишається тоном рядка.
            const pickedBg = rowTone ? rowTone.bgOpen : 'var(--brand-teal-light)';
            const rowBg = isFlashing ? '#F0FDF4' : isPicked ? pickedBg : rowTone?.bg ?? 'var(--bg-card)';

            return (
              <div key={order.id} id={`order-${order.id}`} className={`oc-sheet-row${isExpanded ? ' is-open' : ''}${isPicked ? ' is-picked' : ''}`} style={{
                background: rowBg,
                // Відкрита картка виділяється висотою, а не кольором: синій контур
                // читався як «виділено мишею», хоча це просто розгорнутий запис.
                border: `1px solid ${isFlashing ? 'var(--border-success)' : isPicked ? 'var(--brand-teal)' : isExpanded ? '#D8DEE7' : rowTone?.edge ?? 'var(--border-light)'}`,
                borderLeft: isPicked ? '4px solid var(--brand-teal)' : rowTone ? `4px solid ${rowTone.bar}` : undefined,
                borderRadius: '14px', overflow: 'hidden',
                boxShadow: isExpanded ? '0 2px 4px rgba(16,24,40,0.04), 0 24px 48px -16px rgba(16,24,40,0.28)' : isFlashing ? '0 0 0 3px #BBF7D0' : isPicked ? '0 2px 10px rgba(61,191,184,0.25)' : '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
                opacity: expandedId && !isExpanded ? 0.35 : 1,
                transition: 'box-shadow 0.3s, border-color 0.3s, opacity 0.15s, background 0.3s',
                // Наведення — темніший відтінок того ж тону (CSS читає змінну), а не нейтральний
                ['--row-hover' as string]: rowTone?.bgOpen ?? 'var(--bg-soft)',
              }}>

                <OrderCompactRow isExpanded={isExpanded} order={order} isPicked={isPicked} pickedBg={pickedBg} rowTone={rowTone} date={date} dateShort={dateShort} mergedBadge={mergedBadge} buyerBadge={buyerBadge} channel={channel} mpNumber={mpNumber} deliveryBadges={deliveryBadges} isCod={isCod} paymentConfirmed={paymentConfirmed} settlement={settlement} isCancelled={isCancelled} orderBadges={orderBadges} carrierLabel={carrierLabel} delivery={delivery} inRegistry={inRegistry} isRozetkaPoint={isRozetkaPoint} carrierNote={carrierNote} status={status} isDropship={isDropship} noCallback={noCallback} callbackDone={callbackDone} />

                {/* Верхній прогрес-бар статусів прибрано — унизу є таймлайн «Історія замовлення» */}

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <>
                  {/* Банер відкритого повернення з маркетплейсу (orders.mp_refund_status,
                      ставить/гасить cron-вотчер marketplace-returns-watch) */}
                  {order.mp_refund_status && (
                    <div style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-danger)', padding: '10px 16px', fontSize: '13px', color: '#B91C1C', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>↩ Покупець відкрив повернення на маркетплейсі — статус: {order.mp_refund_status}.</span>{' '}
                      <span>Прийміть товар і оформіть «↩ Повернення» в цій картці — це сторнує виручку, COGS і комісію.</span>
                    </div>
                  )}
                  {/* Банер повернення посилки: замовлення скасоване, але НП уже прийняла
                      відправлення — воно їде назад. Менеджер вирішує, забирати з пошти
                      чи ні (коли зворотна доставка дорожча за товар) */}
                  {isReturnPending(order) && (() => {
                    const rs = returnState(order);
                    return (
                      <div style={{ borderTop: '1px solid var(--border-light)', background: rs ? 'var(--bg-soft)' : '#FFF7ED', padding: '10px 16px', fontSize: '13px', color: rs ? 'var(--text-secondary)' : '#9A3412', lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 700 }}>
                          {order.status === 'cancelled'
                            ? '↩ Замовлення скасоване, а посилка вже в дорозі назад'
                            : '↩ Посилку не забрали — вона їде назад'}
                        </span>
                        {order.tracking_number && <span> · ТТН {order.tracking_number}</span>}
                        {order.carrier_status_text && <span> · {isRozetkaPoint ? 'Rozetka' : 'НП'}: «{order.carrier_status_text}»</span>}
                        {/* Де посилка ЗАРАЗ. Статус вище стосується накладної «туди»,
                            яка після відмови застигає назавжди; назад посилка їде
                            новою накладною, і саме її рух відповідає на питання
                            «чи вже приїхала і скільки в мене часу її забрати». */}
                        {(() => {
                          const rt = order.np_return_tracking;
                          if (!rt) return null;
                          const days = storageDaysLeft(rt, new Date());
                          const hot = days !== null && days <= 2;
                          return (
                            <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontWeight: 600 }}>
                              <Truck size={13} style={{ flexShrink: 0 }} />
                              <span>Зворотна ТТН {rt.ttn} · {returnTrackingLabel(rt, new Date())}</span>
                              {hot && (
                                <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', color: '#B91C1C', background: 'var(--bg-danger)', border: '1px solid var(--border-danger)' }}>
                                  {days < 0 ? 'зберігання вже платне' : days === 0 ? 'останній день' : `${days} дн до платного`}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                          {rs === null && <>
                            <span>Посилка повертається {isRozetkaPoint ? 'у наше відділення відправлення' : 'на відділення'}. Вирішіть:</span>
                            <button onClick={() => setReturnState(order.id, 'received')}
                              style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid #BBF7D0', background: 'var(--bg-success)', color: 'var(--color-success)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                              ✓ Забрав {isRozetkaPoint ? 'посилку' : 'з пошти'}
                            </button>
                            <button onClick={() => setReturnState(order.id, 'abandoned')}
                              title="Коли зворотна доставка дорожча за товар — дешевше залишити посилку на пошті"
                              style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                              ✗ Не забираю
                            </button>
                          </>}
                          {rs === 'received' && <>
                            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ Повернення забрано з пошти.</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Якщо товар був закуплений — не забудьте оприбуткувати його на склад (Закупівля → Прихід).</span>
                            <button onClick={() => setReturnState(order.id, null)} style={{ height: '26px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '11.5px', cursor: 'pointer' }}>скасувати рішення</button>
                          </>}
                          {rs === 'abandoned' && <>
                            <span style={{ fontWeight: 600 }}>✗ Вирішено не забирати (повернення дорожче за товар).</span>
                            <button onClick={() => setReturnState(order.id, null)} style={{ height: '26px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '11.5px', cursor: 'pointer' }}>скасувати рішення</button>
                          </>}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Попередження Rozetka Smart: редагування складу замовлення знімає Smart безповоротно */}
                  {isSmart && !isCancelled && (
                    <div style={{ borderTop: '1px solid var(--border-light)', background: '#FEFCE8', padding: '10px 16px', fontSize: '13px', color: '#713F12', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>⚡ Замовлення Rozetka Smart.</span>{' '}
                      <span>Не змінюйте кількість і склад позицій — будь-яке редагування знімає Smart безповоротно (покупець втратить безкоштовну доставку). Компенсація доставки ({order.total_price < 400 ? 12 : order.total_price < 700 ? 18 : 30} ₴) буде проведена автоматично при доставці.</span>
                    </div>
                  )}
                  {/* Шапка розгорнутого замовлення — новий дизайн */}
                  <div className={`oc-expand-header${(actionsOpen[order.id] ?? true) ? '' : ' oc-actions-off'}`} style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-soft)', padding: '16px 14px 14px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    {/* main-part — дзеркалить основну область сітки (Клієнт | Оплата) */}
                    <div className="oc-main-part" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div className="oc-hdr-title" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div className="oc-hdr-num" style={{ fontSize: '17px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}><span className="oc-hide-m">Замовлення </span>#{order.order_number}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                        {!paymentConfirmed && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                            color: 'var(--color-warn)', background: '#FEF3C7' }}>
                            <CreditCard size={12} />{isCod ? 'Накладений платіж' : 'Очікує оплату'}
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: channel.color, background: channel.bg, whiteSpace: 'nowrap' }}>
                          <ShoppingCart size={12} />{channel.label}
                        </span>
                        {(order.channel_code === 'rozetka' && order.rozetka_order_id) && (
                          <button onClick={() => { navigator.clipboard.writeText(String(order.rozetka_order_id)); showToast('Номер Rozetka скопійовано'); }}
                            title="Скопіювати номер замовлення Rozetka"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', whiteSpace: 'nowrap', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                            №{order.rozetka_order_id} <Copy size={12} />
                          </button>
                        )}
                        {(order.channel_code === 'prom' && order.prom_order_id) && (
                          <button onClick={() => { navigator.clipboard.writeText(String(order.prom_order_id)); showToast('Номер Prom скопійовано'); }}
                            title="Скопіювати номер замовлення Prom"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', whiteSpace: 'nowrap', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                            №{order.prom_order_id} <Copy size={12} />
                          </button>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {date}
                        </span>
                        {order.promo_code && (
                          <span title="Знижку вже враховано в сумі замовлення"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: 'var(--color-warn)', background: '#FEF3C7', whiteSpace: 'nowrap' }}>
                            <Tag size={12} /> {order.promo_code} · −{Number(order.promo_discount ?? 0).toFixed(2)} ₴
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Права половина шапки — тільки «Підтвердити». Суму звідси прибрано:
                        вона є в підсумку таблиці товарів і в згорнутому рядку журналу,
                        а тут лише розганяла шапку на два поверхи. */}
                    <div className="oc-pay-part" style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {order.status === 'new' && (() => {
                      const busy = confirming === order.id;
                      const confirmErr = confirmErrors[order.id];
                      return (
                        <div className="oc-confirm-block" style={{ width: '230px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
                          <button onClick={() => confirmOrder(order.id)} disabled={busy}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '34px', padding: '0 18px', borderRadius: '9px', border: 'none', background: busy ? 'var(--text-muted)' : 'var(--navy)', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', boxShadow: '0 1px 2px rgba(30,58,95,0.35)', whiteSpace: 'nowrap' }}>
                            {busy ? 'Обробка…' : <><Check size={17} /> Підтвердити замовлення</>}
                          </button>
                          {confirmErr && (
                            <div style={{ maxWidth: '300px', padding: '8px 10px', background: 'var(--bg-danger)', border: '1px solid #FECACA', borderRadius: '8px', textAlign: 'left' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-danger)', marginBottom: confirmErr.insufficient?.length ? '6px' : 0 }}>⚠ {confirmErr.error}</div>
                              {confirmErr.insufficient?.map(item => {
                                const name = order.items.find(i => i.sku === item.sku)?.name;
                                return (
                                  <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '2px 0', borderTop: '1px solid #FECACA' }}>
                                    <span style={{ color: '#7F1D1D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{name ?? item.sku}</span>
                                    <span style={{ color: 'var(--color-danger)', fontWeight: 700, flexShrink: 0 }}>{item.available} / {item.requested} шт</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    </div>{/* /кнопка Підтвердити */}
                    </div>{/* /Оплата-part */}
                    </div>{/* /main-part */}
                    {/* Статус — над правою панеллю (250px), «...» = ручна зміна */}
                    <div className="oc-status-panel" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                      {/* Стан перевізника — ліворуч від плашки, а не під нею: це уточнення
                          до статусу, і в один рядок воно не додає шапці поверху. */}
                      <div className="oc-status-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                      {(() => {
                        // Що зараз у кабінеті Rozetka. Показуємо, лише коли кабінет
                        // попереду нас: коли статуси збігаються, зайвий рядок біля
                        // плашки нічого не додає й тільки шумить.
                        const cab = rozetkaCabinet(order);
                        if (!cab?.ahead) return null;
                        return (
                          <div className="oc-carrier-note" title={cab.at ? `Зчитано з кабінету: ${new Date(cab.at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : undefined}
                            style={{ fontSize: '11px', fontWeight: 600, textAlign: 'right', lineHeight: 1.3, color: 'var(--color-success)' }}>
                            ↳ у кабінеті: {cab.label}
                          </div>
                        );
                      })()}
                      {order.status === 'shipped' && order.tracking_number && (
                        <div className="oc-carrier-note" title={order.carrier_status_synced_at ? `Оновлено: ${new Date(order.carrier_status_synced_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : undefined}
                          style={{ fontSize: '11px', fontWeight: 600, textAlign: 'right', lineHeight: 1.3, color: order.carrier_accepted_at ? 'var(--color-success)' : 'var(--color-warn)' }}>
                          {order.carrier_accepted_at ? '✓' : '⏳'} {order.carrier_status_text ?? `${order.carrier_accepted_at ? 'Прийнято' : 'Очікує приймання'} ${isRozetkaPoint ? 'Rozetka' : 'НП'}`}
                        </div>
                      )}
                      <div className="oc-status-box" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '186px', flexShrink: 0, height: '32px', borderRadius: '8px', color: status.color, background: status.bg, border: `1.5px solid ${status.color}` }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap' }}>{status.label}</span>
                        <button onClick={() => setStatusEditOpen(p => ({ ...p, [order.id]: !p[order.id] }))}
                          title="Змінити статус вручну"
                          style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: (statusEditOpen[order.id] ?? false) ? 'rgba(0,0,0,0.12)' : 'none', border: 'none', cursor: 'pointer', color: status.color, padding: '2px', borderRadius: '6px', display: 'inline-flex' }}>
                          <MoreHorizontal size={15} />
                        </button>
                      </div>
                      </div>
                      {(statusEditOpen[order.id] ?? false) && (
                        <div style={{ width: '186px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Змінити вручну{!isAdmin && <span style={{ marginLeft: '4px', color: '#F59E0B' }}>🔒</span>}
                          </div>
                          <select
                            value={order.status}
                            onChange={e => { if (e.target.value !== order.status) changeStatus(order.id, e.target.value); }}
                            style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-primary)' }}
                          >
                            {STATUSES.filter(s => {
                              if (isAdmin) return true;
                              if (s.value === 'cancelled') return order.status === 'new';
                              return (STATUS_RANK[s.value] ?? -1) >= (STATUS_RANK[order.status] ?? 0);
                            }).map(s => (
                              <option key={s.value} value={s.value} style={s.value === 'cancelled' ? { color: 'var(--color-danger)', fontWeight: 700 } : undefined}>
                                {s.value === 'cancelled' ? '⚠ ' + s.label : s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`order-expand-grid${(actionsOpen[order.id] ?? true) ? '' : ' oc-actions-off'}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', gap: '14px', padding: '14px', background: 'var(--bg-soft)', alignItems: 'stretch' }}>

                    {/* MAIN column (Товари + Контакт/Доставка) */}
                    <div className="order-main-col" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>

                    {/* Col 1: Items */}
                    <OrderItemsCard order={order} isCod={isCod} paymentConfirmed={paymentConfirmed} isDropship={isDropship} />

                    <OrderNoteAndSections order={order} />

                    {/* Col 2: Contact + Delivery + payment + callback + TTN */}
                    <div className="oc-info-wrap" style={{ order: -1, position: 'relative' }}>
                    <div className="oc-info-cards"
                      onScroll={e => {
                        const el = e.currentTarget;
                        const atStart = el.scrollLeft <= 4;
                        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
                        const s = atEnd ? 'end' : atStart ? 'start' : 'mid';
                        setCardSwipe(p => p[order.id] === s ? p : { ...p, [order.id]: s });
                      }}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'stretch' }}>
                    <OrderClientCard order={order} isDropship={isDropship} noCallback={noCallback} callbackDone={callbackDone} isCod={isCod} paymentConfirmed={paymentConfirmed} />
                    <OrderDeliveryCard order={order} delivery={delivery} deliveryBadges={deliveryBadges} subtype={subtype} isRzPickup={isRzPickup} isRozetkaPoint={isRozetkaPoint} />
                    {/* /Доставка card + /grid Клієнт|Доставка */}
                    </div>
                    {(() => {
                      const scrollTo = (e: React.MouseEvent<HTMLButtonElement>, dir: 'left' | 'right') => {
                        const strip = e.currentTarget.parentElement?.querySelector('.oc-info-cards');
                        strip?.scrollTo({ left: dir === 'right' ? strip.scrollWidth : 0, behavior: 'smooth' });
                      };
                      return (
                        <>
                          {(cardSwipe[order.id] ?? 'start') !== 'end' && (
                            <button type="button" className="oc-swipe-hint oc-swipe-right"
                              aria-label="Показати доставку" title="Показати доставку"
                              onClick={e => scrollTo(e, 'right')}>›</button>
                          )}
                          {(cardSwipe[order.id] ?? 'start') !== 'start' && (
                            <button type="button" className="oc-swipe-hint oc-swipe-left"
                              aria-label="Показати клієнта" title="Показати клієнта"
                              onClick={e => scrollTo(e, 'left')}>‹</button>
                          )}
                        </>
                      );
                    })()}
                    </div>{/* /oc-info-wrap */}
                    {/* /MAIN column */}
                    </div>

                    <OrderActionsColumn order={order} />

                  </div>

                  <OrderEventLog order={order} isRozetkaPoint={isRozetkaPoint} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
          {currentPage > 1 && (
            <a href={pageHref(currentPage - 1)} style={{
              height: '36px', padding: '0 16px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center',
              border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>← Попередня</a>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => Math.abs(p - currentPage) <= 2)
            .map(p => (
              <a key={p} href={pageHref(p)} style={{
                height: '36px', width: '36px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: `1.5px solid ${p === currentPage ? '#162035' : 'var(--border)'}`,
                background: p === currentPage ? 'linear-gradient(135deg, #162035 0%, var(--navy) 100%)' : 'var(--bg-card)',
                color: p === currentPage ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
              }}>{p}</a>
            ))}
          {currentPage < totalPages && (
            <a href={pageHref(currentPage + 1)} style={{
              height: '36px', padding: '0 16px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center',
              border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>Наступна →</a>
          )}
        </div>
      )}

      <OrdersBulkBar />

      <SupplierSendQueueModal />

      <BulkSupplierSendModal />

      {/* ── Ship modal (partial / full shipment) ──────────────────────────── */}
      {/* Вибір причини скасування для Rozetka: без причини кабінет скасування не приймає
          (статус 13 «Скасовано адміністратором» продавцю через API недоступний) */}
      {rozCancelFor && (() => {
        const REASONS = [
          { id: 16, label: 'Немає в наявності / брак' },
          { id: 18, label: 'Не вдалося зв\'язатися' },
          { id: 17, label: 'Не влаштовують умови оплати' },
          { id: 24, label: 'Не влаштовує доставка' },
          { id: 20, label: 'Товар не підходить за характеристиками' },
          { id: 11, label: 'Не прийшов за замовленням' },
          { id: 12, label: 'Відмова при отриманні' },
          { id: 25, label: 'Тестове замовлення' },
        ];
        const ord = orders.find(o => o.id === rozCancelFor);
        return (
          <Modal open onClose={() => setRozCancelFor(null)} width={420} padding={0} dismissible={false} aria-label="Скасування замовлення Rozetka" style={{ background: '#fff' }}>
            <div style={{ background: '#fff', padding: '24px', width: '100%' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: 'var(--color-danger)' }}>Скасування замовлення Rozetka</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-gray)', marginBottom: '16px', lineHeight: 1.5 }}>
                #{ord?.order_number} — Rozetka вимагає вказати причину. Її побачить покупець, і вона піде в статистику кабінету.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                {REASONS.map(r => (
                  <button key={r.id}
                    onClick={() => { const id = rozCancelFor; setRozCancelFor(null); changeStatus(id, 'cancelled', r.id); }}
                    style={{ height: '38px', padding: '0 14px', textAlign: 'left', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.background = '#FEF2F2'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
                    {r.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setRozCancelFor(null)}
                style={{ width: '100%', height: '36px', borderRadius: '9px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Не скасовувати
              </button>
            </div>
          </Modal>
        );
      })()}

      <NpRegistryPickerModal />
    </>
    </OrdersCtx.Provider>
  );
}
