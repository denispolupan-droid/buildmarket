'use client';

import { X, ChevronDown, Search } from 'lucide-react';
import SmartDateInput from '../../components/SmartDateInput';
import { PAYMENT_METHOD_HINT, PAYMENT_METHOD_LABEL, PAYMENT_METHOD_ORDER } from '../../../lib/payment-method';
import { CHANNEL_LABEL } from './constants';
import { rozetkaCabinet } from './helpers';
import { useOrdersCtx } from './OrdersContext';
import { SaveFilterButton, SavedFiltersMenu } from './SavedFilters';

export function OrdersToolbar() {
  const {
    pushFilters, dateFrom, dateTo, totalFound, summaryAmount, currentStatus,
    totalPages, currentPage, searchBoxRef, searchInput, searchHint, searchInputRef,
    setSearchInput, pushSearch, pendingReturns, retFilter, grpOpen, toggleGroup,
    channelFilter, channelCounts, carrierFilter, carrierCounts, payCounts, payFilter,
    orders, cabinetAheadOnly, setCabinetAheadOnly, initialSearch, sentFilter,
  } = useOrdersCtx();
  return (
    <>
      {/* Filters + search */}
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Панель інструментів — один ряд: підсумок · період · пошук. Фільтри
            каналу / перевізника / оплати на десктопі — лійками в шапці аркуша,
            на телефоні — рядком пігулок нижче (варіант 2, 18.10.2026). */}
        <div>
        {/* Row 0: підсумок активної вкладки + період + пошук. Сума — головний
            акцент, поруч кількість і середній чек стовпчиком. */}
        {(() => {
          // Дати пресетів — за Києвом: toISOString() дає UTC, і після опівночі
          // до 03:00 «Сьогодні» було ще вчорашнім днем
          const kyivYmd = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
          const today = kyivYmd(Date.now());
          const weekAgo = kyivYmd(Date.now() - 7 * 86400000);
          const monthStart = `${today.slice(0, 7)}-01`;
          const applyDate = (from: string, to: string) => pushFilters({ dateFrom: from, dateTo: to });
          const hasDateFilter = !!(dateFrom || dateTo);
          const fmt = (v: number) => v.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
          const cnt = totalFound;
          const avg = cnt > 0 && summaryAmount > 0 ? Math.round(summaryAmount / cnt) : 0;
          const noun = cnt % 10 === 1 && cnt % 100 !== 11 ? 'замовлення' : 'замовлень';
          // Скасовані — це не гроші: сума й середній чек по них означали б
          // «виручка, якої не було». Лишаємо тільки кількість. Під зрізом
          // «повернення без рішення» сума навпаки потрібна — це те, що зараз
          // їде назад (зріз приходить з currentStatus = '').
          const moneyless = currentStatus === 'cancelled';
          const showMoney = summaryAmount > 0 && !moneyless;
          // Ні період, ні назву вкладки біля суми не пишемо (рішення власника
          // 20.10.2026): вкладка підсвічена вище, вибраний період видно по
          // пігулці чи заповнених датах — підпис лише дублював би їх.
          // Текст зліва: з вирівнюванням по центру курсор стояв посередині поля
          const inpStyle: React.CSSProperties = { height: '26px', width: '92px', padding: '0 8px', border: 'none', borderRadius: '999px', fontSize: '12.5px', outline: 'none', background: 'transparent', color: 'var(--text-primary)', textAlign: 'left' };
          return (
            <div className="oc-summary-row">
              <div className="oc-summary">
                {showMoney && <span className="oc-summary-amount">{fmt(summaryAmount)}<span className="oc-summary-cur">₴</span></span>}
                {/* Біля суми — два тихі рядки: скільки замовлень і середній чек.
                    На «Скасовано» другого немає: сума по скасованих означала б
                    виручку, якої не було, тож грошей там не показуємо взагалі. */}
                <span className="oc-summary-stats">
                  <span className="oc-summary-stat"><b>{cnt}</b> {noun}{totalPages > 1 && <span className="oc-summary-page"> · стор. {currentPage}/{totalPages}</span>}</span>
                  {showMoney && avg > 0 && <span className="oc-summary-stat">середній чек <b>{fmt(avg)} ₴</b></span>}
                </span>
              </div>
              {/* Порядок у рядку (рішення власника 20.10.2026): пошук → період →
                  повернення. Пошук перший, бо ним користуються найчастіше.
                  Внутрішня обгортка з position: relative — точка відліку для
                  лупи й хрестика (на телефоні .oc-filter-search має власний
                  верхній відступ). Підказка стоїть по центру, поки поле порожнє
                  й поза фокусом — див. .oc-search-input. */}
              <div className="oc-filter-search oc-search-compact" ref={searchBoxRef}>
              <div style={{ position: 'relative' }}>
                <Search size={15} color="var(--brand-blue)" style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  className={`oc-search-input${searchInput ? ' has-text' : ''}`}
                  placeholder={searchHint}
                  title="№ замовлення або МП, ПІБ, компанія, телефон, ТТН — пошук по всій базі"
                  ref={searchInputRef}
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') pushSearch(searchInput.trim()); }}
                  style={{
                    // Вирівнювання — в .oc-search-input: підказка по центру, а у
                    // фокусі й із набраним текстом ліворуч (інакше курсор блимав
                    // би посеред порожнього поля).
                    width: '100%', height: '34px',
                    paddingLeft: '36px', paddingRight: searchInput ? '30px' : '36px',
                    borderRadius: '999px', fontSize: '13px',
                    outline: 'none', boxSizing: 'border-box', color: 'var(--text-primary)',
                  }}
                />
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    aria-label="Очистити пошук"
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              </div>
              <div className="oc-filter-dates oc-period" role="group" aria-label="Період">
                {[
                  { label: 'Сьогодні', from: today,      to: today },
                  { label: '7 днів',   from: weekAgo,    to: today },
                  { label: 'Місяць',   from: monthStart, to: today },
                ].map(p => {
                  const active = dateFrom === p.from && dateTo === p.to;
                  return (
                    <button key={p.label} type="button" className={`oc-period-btn${active ? ' active' : ''}`} onClick={() => applyDate(p.from, p.to)}>
                      {p.label}
                    </button>
                  );
                })}
                <div className="oc-period-range">
                  {/* Межі незалежні: заповнена лише «з» — фільтр «від дати й далі»,
                      друге поле лишається порожнім, поки його не заповнять самі */}
                  <SmartDateInput value={dateFrom ?? ''} onChange={v => applyDate(v, dateTo ?? '')} style={inpStyle} withPicker />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                  <SmartDateInput value={dateTo ?? ''} onChange={v => applyDate(dateFrom ?? '', v)} style={inpStyle} withPicker />
                </div>
                {hasDateFilter && (
                  <button type="button" onClick={() => pushFilters({ dateFrom: '', dateTo: '' })} title="Скинути період" aria-label="Скинути період" className="oc-date-clear oc-period-clear">✕</button>
                )}
              </div>
              {/* Збережені зрізи (localStorage): меню зникає, поки нічого не збережено */}
              <SavedFiltersMenu />
              {/* Повернення без рішення — лише на «Скасовано» (або поки зріз
                  увімкнений); на десктопі тут, бо рядок пігулок нижче мобільний */}
              {((currentStatus === 'cancelled' && pendingReturns > 0) || retFilter === 'pending') && (() => {
                const active = retFilter === 'pending';
                return (
                  <button type="button" className="oc-hide-m" onClick={() => pushFilters({ ret: active ? '' : 'pending' })}
                    title="Посилки, які їдуть назад, і рішення по них ще немає: забрати з пошти чи залишити. Показує всі статуси одразу."
                    style={{ height: '34px', padding: '0 12px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer',
                      // Блідо-червона підсвітка (палітра --bg-danger / --color-danger):
                      // це робота, що висить, а не звичайний фільтр
                      border: `1.5px solid ${active ? 'var(--color-danger)' : '#FECACA'}`, background: active ? '#FEE2E2' : 'var(--bg-danger)', color: active ? '#991B1B' : '#B91C1C' }}>
                    ↩ Повернення без рішення <span style={{ marginLeft: '4px', opacity: 0.75 }}>{pendingReturns}</span>
                  </button>
                );
              })()}
              {/* «Реєстр НП» — у шапці сторінки поруч із «Нове замовлення»
                  (page.tsx); Excel прибрано, вивантаження лишилось за адресою
                  /api/admin/orders/export */}
            </div>
          );
        })()}

        {/* Row 1 (лише телефон): смуга фільтрів Канал · Доставка · Оплата
            пігулками — на десктопі ці фільтри в шапці аркуша. Клік по підпису
            секції згортає її до підпису й обраного значення. */}
        <div className="oc-filter-row oc-only-m" style={{ display: 'none' }}>
          <div className="oc-filter-bar">
            <div className={`oc-filter-group${grpOpen('channel') ? ' open' : ''}`}>
            <button type="button" className="oc-filter-grp" onClick={() => toggleGroup('channel')} aria-expanded={grpOpen('channel')} title={grpOpen('channel') ? 'Згорнути' : 'Фільтр за каналом'}>Канал <ChevronDown size={11} /></button>
            {[
              { value: '',         label: 'Всі' },
              { value: 'website',  label: 'Магазин' },
              { value: 'b2b',      label: 'Опт' },
              { value: 'dropship', label: 'Дроп' },
              { value: 'retail',   label: 'Роздріб' },
              { value: 'phone',    label: 'Телефон' },
              { value: 'prom',     label: 'Prom' },
              { value: 'rozetka',  label: 'Rozetka' },
            ].map(ch => {
              const active = channelFilter === ch.value;
              const cfg = ch.value ? CHANNEL_LABEL[ch.value] : null;
              const n = ch.value
                ? (channelCounts[ch.value] ?? 0)
                : Object.values(channelCounts).reduce((s, c) => s + c, 0);
              // Порожні канали ховаємо: на вкладці статусу їх буває половина
              // ряду («Опт 0 · Дроп 0 · Телефон 0»), через що фільтри
              // переносились на другий рядок. Перемикатись туди все одно нема
              // на що. «Всі канали» і вибраний чіп лишаються завжди.
              if (ch.value && !n && !active) return null;
              // Згорнута група показує лише обраний канал («Всі канали» — не фільтр)
              if (!grpOpen('channel') && !(active && ch.value)) return null;
              return (
                <button
                  key={ch.value}
                  onClick={() => pushFilters({ channel: ch.value })}
                  style={{
                    height: '30px', padding: '0 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${active ? (cfg?.color ?? 'var(--navy)') : 'var(--border)'}`,
                    background: active ? (cfg?.bg ?? '#EFF4FF') : 'var(--bg-card)',
                    color: active ? (cfg?.color ?? 'var(--navy)') : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {ch.label}
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{n}</span>
                </button>
              );
            })}
            </div>
            {/* Перевізник. Окремий ряд кнопок був би зайвим рядком у щільній
                панелі, тож стоять тут же, своєю групою з підписом (.oc-filter-group):
                підпис і пігулки на спільній підкладці читаються одним блоком. */}
            <div className={`oc-filter-group${grpOpen('carrier') ? ' open' : ''}`}>
            <button type="button" className="oc-filter-grp" onClick={() => toggleGroup('carrier')} aria-expanded={grpOpen('carrier')} title={grpOpen('carrier') ? 'Згорнути' : 'Фільтр за перевізником'}>Доставка <ChevronDown size={11} /></button>
            {[
              { value: 'nova',    label: 'НП',      color: '#7C2D12', bg: '#FFF7ED', border: '#FDBA74' },
              { value: 'rozetka', label: 'Rozetka Доставка', color: '#065F46', bg: '#ECFDF5', border: '#6EE7B7' },
            ].map(c => {
              const active = carrierFilter === c.value;
              const n = carrierCounts[c.value] ?? 0;
              if (!n && !active) return null;
              if (!grpOpen('carrier') && !active) return null;
              return (
                <button
                  key={c.value}
                  title={c.value === 'nova' ? 'Відправлення Новою Поштою' : 'Доставка в точки видачі Rozetka (накладна RMP-…)'}
                  onClick={() => pushFilters({ carrier: active ? '' : c.value })}
                  style={{
                    height: '30px', padding: '0 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${active ? c.border : 'var(--border)'}`,
                    background: active ? c.bg : 'var(--bg-card)',
                    color: active ? c.color : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{n}</span>
                </button>
              );
            })}
            {/* Форма оплати. Показуємо лише ті, що реально є в поточному зрізі
                (плюс активну) — інакше і без того щільний ряд фільтрів обріс би
                порожніми «Готівка 0 · Відстрочка 0». */}
            </div>
            <div className={`oc-filter-group${grpOpen('pay') ? ' open' : ''}`}>
            <button type="button" className="oc-filter-grp" onClick={() => toggleGroup('pay')} aria-expanded={grpOpen('pay')} title={grpOpen('pay') ? 'Згорнути' : 'Фільтр за формою оплати'}>Оплата <ChevronDown size={11} /></button>
            {PAYMENT_METHOD_ORDER.filter(code => ((payCounts[code] ?? 0) > 0 || payFilter === code) && (grpOpen('pay') || payFilter === code)).map(code => {
              const active = payFilter === code;
              return (
                <button
                  key={code}
                  title={PAYMENT_METHOD_HINT[code]}
                  onClick={() => pushFilters({ pay: active ? '' : code })}
                  style={{
                    height: '30px', padding: '0 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${active ? '#7C3AED' : 'var(--border)'}`,
                    background: active ? '#F3E8FF' : 'var(--bg-card)',
                    color: active ? '#6D28D9' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  {PAYMENT_METHOD_LABEL[code]}
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{payCounts[code] ?? 0}</span>
                </button>
              );
            })}
            </div>
            {/* Повернення без рішення. Це не стан замовлення, а робота, яка
                висить: посилка їде назад, а забирати її з пошти чи залишити —
                ще ніхто не сказав. Серед десятків скасованих такі рядки
                губилися, а зберігання на відділенні з якогось дня стає платним.
                Зріз рахує і фільтрує сервер, тому чіп видно на будь-якій
                вкладці, і він перекриває вкладку статусу. */}
            {/* Чип лише на вкладці «Скасовано» (там живуть ці посилки) або поки
                зріз увімкнений — щоб було чим його зняти; з інших вкладок на нього
                веде бейдж «↩ N» на самій вкладці */}
            {((currentStatus === 'cancelled' && pendingReturns > 0) || retFilter === 'pending') && (() => {
              const active = retFilter === 'pending';
              return (
                <button
                  onClick={() => pushFilters({ ret: active ? '' : 'pending' })}
                  title="Посилки, які їдуть назад, і рішення по них ще немає: забрати з пошти чи залишити (коли зворотна доставка дорожча за товар). Показує всі статуси одразу."
                  style={{
                    height: '30px', padding: '0 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${active ? '#FDBA74' : 'var(--border)'}`,
                    background: active ? '#FFF7ED' : 'var(--bg-card)',
                    color: active ? '#C2410C' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}
                >
                  ↩ Повернення без рішення
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{pendingReturns}</span>
                </button>
              );
            })()}
            {(() => {
              // Кнопка з'являється тільки коли є що показувати — інакше вона
              // просто займає місце в і без того щільній панелі фільтрів.
              const n = orders.filter(o => rozetkaCabinet(o)?.ahead).length;
              if (!n && !cabinetAheadOnly) return null;
              return (
                <button
                  onClick={() => setCabinetAheadOnly(v => !v)}
                  title="Замовлення, які в кабінеті Rozetka вже рухнули далі, ніж у нас"
                  style={{
                    height: '30px', padding: '0 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${cabinetAheadOnly ? 'var(--color-success)' : 'var(--border)'}`,
                    background: cabinetAheadOnly ? '#DCFCE7' : 'var(--bg-card)',
                    color: cabinetAheadOnly ? 'var(--color-success)' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  Оброблені в кабінеті
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{n}</span>
                </button>
              );
            })()}
          </div>
        </div>
        </div>

        {/* Період — у рядку підсумку вище (Row 0); сортування — кліком по
            заголовках колонок у шапці аркуша. */}

        {/* Пошук — у рядку підсумку поруч із періодом (Row 0) */}

        {/* Обрані фільтри — чипами з хрестиком: видно, що саме звужує список, і
            кожен знімається окремо, а не всі разом. Лічильник — по всій базі,
            а не по цій сторінці. */}
        {(() => {
          const fmtD = (d: string) => d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d;
          const chips: { key: string; label: string; clear: () => void }[] = [];
          if (initialSearch) chips.push({ key: 'q', label: `Пошук: «${initialSearch}»`, clear: () => { setSearchInput(''); pushFilters({ q: '' }); } });
          if (channelFilter) chips.push({ key: 'channel', label: `Канал: ${CHANNEL_LABEL[channelFilter]?.label ?? channelFilter}`, clear: () => pushFilters({ channel: '' }) });
          if (carrierFilter) chips.push({ key: 'carrier', label: `Доставка: ${carrierFilter === 'nova' ? 'Нова Пошта' : 'Rozetka Доставка'}`, clear: () => pushFilters({ carrier: '' }) });
          if (payFilter) chips.push({ key: 'pay', label: `Оплата: ${(PAYMENT_METHOD_LABEL as Record<string, string>)[payFilter] ?? payFilter}`, clear: () => pushFilters({ pay: '' }) });
          if (retFilter === 'pending') chips.push({ key: 'ret', label: 'Повернення без рішення', clear: () => pushFilters({ ret: '' }) });
          if (sentFilter) chips.push({ key: 'sent', label: sentFilter === 'sent' ? 'Постачальнику: надіслано' : 'Постачальнику: ще не надіслано', clear: () => pushFilters({ sent: '' }) });
          if (dateFrom || dateTo) chips.push({ key: 'date', label: `Період: ${dateFrom ? fmtD(dateFrom) : '…'} — ${dateTo ? fmtD(dateTo) : '…'}`, clear: () => pushFilters({ dateFrom: '', dateTo: '' }) });
          if (!chips.length) return null;
          return (
            <div className="oc-active-filters">
              <span className="oc-active-filters-lbl">Обрано:</span>
              {chips.map(c => (
                <span key={c.key} className="oc-filter-chip">
                  {c.label}
                  <button type="button" onClick={c.clear} aria-label={`Зняти фільтр: ${c.label}`} title="Зняти">×</button>
                </span>
              ))}
              <SaveFilterButton />
              <button type="button" className="oc-active-filters-clear"
                onClick={() => { setSearchInput(''); pushFilters({ q: '', channel: '', carrier: '', pay: '', ret: '', sent: '', dateFrom: '', dateTo: '' }); }}>
                Очистити
              </button>
              <span className="oc-active-filters-found">знайдено <strong>{totalFound}</strong> у всій базі</span>
            </div>
          );
        })()}
      </div>
    </>
  );
}
