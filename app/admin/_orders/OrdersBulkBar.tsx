'use client';

import { Truck, X, Printer, Mail, Send, ClipboardList } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { RZ_DELIVERY_TYPE } from '../../../lib/rz-delivery';
import { STATUSES } from './constants';
import { useOrdersCtx } from './OrdersContext';

export function OrdersBulkBar() {
  const {
    selectedIds, orders, setSelectedIds, router, startSupplierSend, supplierQueueLoading,
    startBulkSupplierSend, openMergeModal, bulkPrintLabels, bulkPrinting, registryAdded, bulkAddToRegistry,
    registryBulkLoading, printNpRegistry, npSheetPrinting,
  } = useOrdersCtx();
  return (
    <>
      {/* Merge bar — панель масових дій. Світла картка й кнопки .proc-btn
          (словник «Закупівель»), групи — за ходом роботи: статус → постачальник
          → накладні → реєстр НП → зняти. Стоїть під списком і липне до нижнього
          краю екрана (.oc-merge-* у globals.css), тож виділені рядки лишаються
          перед очима. */}
      {selectedIds.size >= 1 && (
        <div className="oc-merge-bar">
          <span className="oc-merge-title">
            Вибрано <b>{selectedIds.size}</b> · <b>{Math.round(orders.filter(o => selectedIds.has(o.id)).reduce((s, o) => s + o.total_price, 0)).toLocaleString('uk-UA')} ₴</b>
            {/* Неоплачені в пачці — окремим словом: масова зміна статусу чи відправка
                постачальнику стосується і їх, а в довгому виборі тон рядка можна не помітити */}
            {(() => {
              const unpaid = orders.filter(o => selectedIds.has(o.id) && !o.payment_confirmed && o.payment_type !== 'cod' && !['delivered', 'cancelled'].includes(o.status)).length;
              return unpaid > 0
                ? <span style={{ color: 'var(--color-warn)', marginLeft: '6px' }} title="Рахунок ще не оплачено">· неоплачених <b>{unpaid}</b></span>
                : null;
            })()}
          </span>
          <div className="oc-merge-actions">
            {/* 1. Статус */}
            <div className="oc-merge-group">
            <select
              className="proc-btn oc-merge-select"
              defaultValue=""
              onChange={async e => {
                const newStatus = e.target.value;
                if (!newStatus) return;
                e.target.value = '';
                const ids = [...selectedIds];
                const results = await Promise.allSettled(ids.map(id => fetch(`/api/admin/orders/${id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: newStatus }),
                })));
                const ok = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
                const failed = ids.length - ok;
                const label = STATUSES.find(s => s.value === newStatus)?.label ?? newStatus;
                // Панель закривається після дії; невдачі — окремим повідомленням, із
                // причиною першої відмови (інакше «не вдалося 3» нічого не пояснює).
                const firstFail = results.find(r => r.status === 'fulfilled' && !r.value.ok);
                const reason = firstFail && firstFail.status === 'fulfilled'
                  ? ((await firstFail.value.json().catch(() => ({}))) as { error?: string }).error
                  : undefined;
                if (failed) showToast(`Статус «${label}»: ${ok} з ${ids.length}, не вдалося ${failed}${reason ? ` — ${reason}` : ''}`, 'error', 10000);
                else showToast(`Статус «${label}» встановлено: ${ok}`, 'success');
                setSelectedIds(new Set());
                router.refresh();
              }}>
              <option value="" disabled>Змінити статус…</option>
              {STATUSES.filter(s => s.value).map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            </div>
            {(() => {
              const sel = orders.filter(o => selectedIds.has(o.id));
              const supplierSel = sel.filter(o => o.fulfillment_mode === 'supplier' || o.fulfillment_mode === 'mixed' || (o.status === 'new' && (o.fulfillment_mode == null || o.fulfillment_mode === 'supplier')));
              if (supplierSel.length === 0) return null;
              const unsentCount = supplierSel.filter(o => !o.supplier_sent_at).length;
              const ids = supplierSel.map(o => o.id);
              return (
                /* 2. Постачальник. «Усі одразу» — єдина головна кнопка панелі */
                <div className="oc-merge-group">
                  <button className="proc-btn" onClick={() => startSupplierSend(ids)} disabled={supplierQueueLoading}
                    title="Лист постачальнику по кожному замовленню окремо">
                    <Mail size={14} /> Постачальнику{unsentCount > 0 ? ` (${unsentCount} нових)` : ''}
                  </button>
                  {supplierSel.length > 1 && (
                    <button className="proc-btn accent" onClick={() => startBulkSupplierSend(ids)} disabled={supplierQueueLoading}
                      title="Один лист на постачальника з усіма його замовленнями">
                      <Send size={14} /> Відправити всі одразу
                    </button>
                  )}
                </div>
              );
            })()}
            {/* 3. Накладні: об'єднати → надрукувати */}
            <div className="oc-merge-group">
              <button className="proc-btn" onClick={openMergeModal}>
                <Truck size={14} /> Об&apos;єднати в ТТН
              </button>
              {(() => {
                // Друкуємо лише те, на що існує етикетка: НП, обидва типи Rozetka і
                // Meest-Епіцентр (файл накладної віддає Епіцентр)
                const printable = orders.filter(o => selectedIds.has(o.id) && o.tracking_number
                  && (['nova', 'nova_poshta', 'rozetka_delivery', RZ_DELIVERY_TYPE].includes(o.delivery_type ?? '')
                    || (o.delivery_type === 'meest' && o.channel_code === 'epicentr')));
                if (printable.length === 0) return null;
                return (
                  <button className="proc-btn" onClick={bulkPrintLabels} disabled={bulkPrinting}
                    title="Один PDF з етикетками всіх виділених накладних — НП, Rozetka і Meest разом">
                    <Printer size={14} /> {bulkPrinting ? 'Готую PDF…' : `Друк ТТН (${printable.length})`}
                  </button>
                );
              })()}
            </div>
            {/* 4. Реєстр НП: спершу додати ЕН, потім друкувати — НП закриває
                реєстр для нових після друку, тому саме такий порядок */}
            {(() => {
              const addable = orders.filter(o => selectedIds.has(o.id) && o.tracking_number && !registryAdded.has(o.tracking_number));
              const selCount = orders.filter(o => selectedIds.has(o.id)).length;
              const hasNp = orders.some(o => selectedIds.has(o.id) && ['nova', 'nova_poshta'].includes(o.delivery_type ?? ''));
              if (addable.length === 0 && !hasNp) return null;
              return (
                <div className="oc-merge-group">
                  {addable.length > 0 && (
                    <button className="proc-btn" onClick={bulkAddToRegistry} disabled={registryBulkLoading}>
                      <ClipboardList size={14} /> {registryBulkLoading ? 'Додаю…' : `Додати в реєстр${addable.length !== selCount ? ` (${addable.length})` : ''}`}
                    </button>
                  )}
                  {hasNp && (
                    <button className="proc-btn" onClick={printNpRegistry} disabled={npSheetPrinting}
                      title="Офіційна форма реєстру з кабінету НП. Після друку НП закриває реєстр для нових ЕН — спершу додайте ЕН, потім друкуйте">
                      <Printer size={14} /> Друк реєстру НП
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          {/* Зняти виділення — хрестик поза сіткою кнопок, щоб не ламати ряд */}
          <button className="oc-merge-close" onClick={() => setSelectedIds(new Set())} title="Зняти виділення" aria-label="Зняти виділення">
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
