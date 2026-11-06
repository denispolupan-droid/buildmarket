'use client';

import { Check } from 'lucide-react';
import { PAYMENT_GROUPS } from '../../../lib/payment-method';
import { CHANNEL_LABEL } from './constants';
import { useOrdersCtx } from './OrdersContext';

export function OrdersTableHeader() {
  const {
    filtered, selectedIds, setSelectedIds, hdrMenu, setHdrMenu, channelCounts,
    channelFilter, carrierCounts, carrierFilter, sentCounts, payCounts, payFilter,
    sortBy, sortDir, pushFilters, sentFilter,
  } = useOrdersCtx();
  return (
    <>
      {/* Table header */}
      {filtered.length > 0 && (
        <div className="oc-hide-m oc-sheet-head" style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          // 17px = 16px падінгу картки + її 1px рамка, щоб колонки шапки стояли
          // рівно над вмістом рядка, а не на два пікселі лівіше
          padding: '5px 17px', marginBottom: '2px',
          fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          borderBottom: '1px solid var(--border-light)',
        }}>
          {/* Select all */}
          <div
            onClick={() => {
              const allIds = filtered.map(o => o.id);
              const allSelected = allIds.every(id => selectedIds.has(id));
              setSelectedIds(allSelected ? new Set() : new Set(allIds));
            }}
            title={filtered.every(o => selectedIds.has(o.id)) ? 'Зняти всі' : 'Вибрати всі'}
            style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer', border: `2px solid ${filtered.length > 0 && filtered.every(o => selectedIds.has(o.id)) ? '#3DBFB8' : 'var(--border)'}`, background: filtered.length > 0 && filtered.every(o => selectedIds.has(o.id)) ? '#3DBFB8' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {filtered.length > 0 && filtered.every(o => selectedIds.has(o.id)) && <Check size={9} color="#fff" strokeWidth={3} />}
          </div>
          {/* Заголовки колонок — кнопки сортування: клік по колонці сортує по
              ній, повторний клік міняє напрямок (стрілка показує активну).
              Список колонок узгоджено з SORT_COLS у page.tsx. */}
          {(() => {
            // Лійка в заголовку колонки: меню значень із лічильниками поточного
            // зрізу; активний фільтр — заповнена лійка й синій заголовок.
            const funnel = (filled: boolean) => (
              <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>
            );
            const flt = (key: 'channel' | 'carrier' | 'pay' | 'sent', label: string, current: string, options: { value: string; label: string; n: number }[], apply: (v: string) => void) => {
              const active = !!current;
              const open = hdrMenu === key;
              return (
                <span className="oc-th-filter">
                  <button type="button" className={`oc-th-funnel${active ? ' active' : ''}${open ? ' open' : ''}`}
                    onClick={e => { e.stopPropagation(); setHdrMenu(open ? null : key); }}
                    aria-haspopup="menu" aria-expanded={open} title={`Фільтр: ${label}`}>
                    {funnel(active)}
                  </button>
                  {open && (
                    <div role="menu" className="oc-th-menu">
                      {options.map(o => (
                        <button type="button" role="menuitemradio" aria-checked={current === o.value} key={o.value || '_all'}
                          className={`oc-th-menu-item${current === o.value ? ' active' : ''}`}
                          onClick={() => { setHdrMenu(null); apply(o.value); }}>
                          <span>{o.label}</span><span className="oc-th-menu-n">{o.n}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              );
            };
            const sum = (m: Record<string, number>) => Object.values(m).reduce((s, c) => s + c, 0);
            const channelOpts = [
              { value: '', label: 'Всі', n: sum(channelCounts) },
              ...Object.entries(CHANNEL_LABEL)
                .filter(([v]) => (channelCounts[v] ?? 0) > 0 || channelFilter === v)
                .map(([v, c]) => ({ value: v, label: c.label, n: channelCounts[v] ?? 0 })),
            ];
            const carrierOpts = [
              { value: '', label: 'Всі', n: sum(carrierCounts) },
              { value: 'nova', label: 'Нова Пошта', n: carrierCounts.nova ?? 0 },
              { value: 'rozetka', label: 'Rozetka Доставка', n: carrierCounts.rozetka ?? 0 },
            ].filter(o => !o.value || o.n > 0 || carrierFilter === o.value);
            const sentOpts = [
              { value: '', label: 'Всі', n: sum(sentCounts) },
              { value: 'sent', label: 'Надіслано постачальнику', n: sentCounts.sent ?? 0 },
              { value: 'unsent', label: 'Ще не надіслано', n: sentCounts.unsent ?? 0 },
            ];
            const payOpts = [
              { value: '', label: 'Всі', n: sum(payCounts) },
              ...PAYMENT_GROUPS
                .filter(g => (payCounts[g.key] ?? 0) > 0 || payFilter === g.key)
                .map(g => ({ value: g.key, label: g.label, n: payCounts[g.key] ?? 0 })),
            ];
            const th = (key: string, label: string, style?: React.CSSProperties) => {
              const active = sortBy === key;
              const nextDir = active && sortDir === 'desc' ? 'asc' : 'desc';
              return (
                <button type="button" className={`oc-th${active ? ' active' : ''}`} style={style}
                  onClick={() => pushFilters({ sortBy: key, sortDir: nextDir })}
                  title={active
                    ? (sortDir === 'desc' ? 'За спаданням — натисніть для зворотного порядку' : 'За зростанням — натисніть для зворотного порядку')
                    : `Сортувати за: ${label}`}>
                  {label}<span className="oc-th-arrow" aria-hidden>{active ? (sortDir === 'desc' ? '↓' : '↑') : ''}</span>
                </button>
              );
            };
            return (
              <>
                <div style={{ width: '92px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                  {th('order_number', '№')}
                  {th('created_at', 'Дата')}
                </div>
                {/* Порожня комірка під мініатюру товару — щоб заголовки не з'їхали з колонок */}
                {/* 94px = дві плитки по 44 + 6 проміжку */}
                <span style={{ width: '94px', flexShrink: 0, marginLeft: '8px' }}>Товар</span>
                <span style={{ flex: '0 1 calc(50% - 266px)', minWidth: 0 }}>{th('contact', 'Клієнт')}</span>
                <span style={{ width: '84px', flexShrink: 0, textAlign: 'right', paddingRight: '24px', boxSizing: 'border-box' }}>{th('total_price', 'Сума')}</span>
                {/* Колонки з лійкою — без overflow: hidden, інакше меню обрізалось би */}
                <span className={carrierFilter ? 'oc-th-cell filtered' : 'oc-th-cell'} style={{ flex: 1, minWidth: '200px', whiteSpace: 'nowrap' }}>{th('delivery_type', 'Доставка')}{flt('carrier', 'доставка', carrierFilter, carrierOpts, v => pushFilters({ carrier: v }))}</span>
                {/* 118px — рівно як у комірки статусу в рядку (.oc-status). Було 104,
                    і заголовок стояв на 14px правіше за плашку під ним. */}
                <span style={{ width: '118px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>{th('status', 'Статус')}</span>
                {/* 76 і 58 px — ширше за «Відпр.», бо в цих двох є лійка; комірки
                    рядка нижче мають ті самі ширини */}
                <span className={channelFilter ? 'oc-th-cell filtered' : 'oc-th-cell'} style={{ width: '76px', flexShrink: 0, whiteSpace: 'nowrap' }}>{th('channel_code', 'Канал')}{flt('channel', 'канал', channelFilter, channelOpts, v => pushFilters({ channel: v }))}</span>
                <span className={sentFilter ? 'oc-th-cell filtered' : 'oc-th-cell'} style={{ width: '112px', flexShrink: 0, whiteSpace: 'nowrap' }}>{th('fulfillment_mode', 'Відправка')}{flt('sent', 'надіслано постачальнику', sentFilter, sentOpts, v => pushFilters({ sent: v }))}</span>
                <span className={payFilter ? 'oc-th-cell filtered' : 'oc-th-cell'} style={{ width: '58px', flexShrink: 0, whiteSpace: 'nowrap' }}>{th('payment_method_code', 'Опл.')}{flt('pay', 'оплата', payFilter, payOpts, v => pushFilters({ pay: v }))}</span>
                <span style={{ width: '34px', flexShrink: 0, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>Дзв.</span>
                <div style={{ width: '14px', flexShrink: 0 }} />
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}
