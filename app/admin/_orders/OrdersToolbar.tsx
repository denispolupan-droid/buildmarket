'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, ChevronDown, Search, Check, ClipboardList, ArrowDownUp, Plus } from 'lucide-react';
import SmartDateInput from '../../components/SmartDateInput';
import { PAYMENT_GROUPS } from '../../../lib/payment-method';
import { CARRIER_FILTERS } from '../../../lib/carriers';
import { CHANNEL_LABEL } from './constants';
import { rozetkaCabinet } from './helpers';
import { useOrdersCtx } from './OrdersContext';
import { SaveFilterButton, SavedFiltersMenu } from './SavedFilters';

export function OrdersToolbar() {
  const {
    pushFilters, dateFrom, dateTo, totalFound, summaryAmount, currentStatus,
    totalPages, currentPage, searchBoxRef, searchInput, searchHint, searchInputRef,
    setSearchInput, pushSearch, pendingReturns, retFilter,
    channelFilter, channelCounts, carrierFilter, carrierCounts, payCounts, payFilter,
    orders, cabinetAheadOnly, setCabinetAheadOnly, initialSearch, sentFilter,
    sortBy, sortDir, filtered, selectedIds, setSelectedIds,
  } = useOrdersCtx();
  // Дати пресетів — за Києвом: toISOString() дає UTC, і після опівночі
  // до 03:00 «Сьогодні» було ще вчорашнім днем
  const kyivYmd = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
  const today = kyivYmd(Date.now());
  const weekAgo = kyivYmd(Date.now() - 7 * 86400000);
  const monthStart = `${today.slice(0, 7)}-01`;
  const applyDate = (from: string, to: string) => pushFilters({ dateFrom: from, dateTo: to });
  const hasDateFilter = !!(dateFrom || dateTo);
  const PERIODS = [
    { value: 'today', label: 'Сьогодні', from: today,      to: today },
    { value: 'week',  label: '7 днів',   from: weekAgo,    to: today },
    { value: 'month', label: 'Місяць',   from: monthStart, to: today },
  ];
  const periodPreset = PERIODS.find(p => dateFrom === p.from && dateTo === p.to)?.value;
  // Телефон: рядок своїх дат під фільтрами — відкритий, коли обрано «Свої дати…»
  // або період не збігається з жодним пресетом
  const [customDates, setCustomDates] = useState(false);
  const showCustom = customDates || (hasDateFilter && !periodPreset);
  // 16px — інакше iOS зумить сторінку на фокусі поля
  // fontFamily: inherit — поле вводу інакше бере системний шрифт, не шрифт сайту (06.11.2026)
  const mDateStyle: React.CSSProperties = { height: '36px', width: '100%', minWidth: 0, fontSize: '16px', fontFamily: 'inherit', fontWeight: 500, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em', textAlign: 'center', borderRadius: '9px', padding: '0 6px', border: '1.5px solid var(--border)' };
  const ddmm = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '…');
  return (
    <>
      {/* Filters + search */}
      <div className="oc-toolbar-wrap" style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Панель інструментів — один ряд: підсумок · період · пошук. Фільтри
            каналу / перевізника / оплати на десктопі — лійками в шапці аркуша,
            на телефоні — рядком пігулок нижче (варіант 2, 18.10.2026). */}
        <div>
        {/* Row 0: підсумок активної вкладки + період + пошук. Сума — головний
            акцент, поруч кількість і середній чек стовпчиком. */}
        {(() => {
          const fmt = (v: number) => v.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
          const cnt = totalFound;
          const avg = cnt > 0 && summaryAmount > 0 ? Math.round(summaryAmount / cnt) : 0;
          // 1–4 замовлення (крім 11–14) · 5+ замовлень; було «4 замовлень»
          const noun = cnt % 10 >= 1 && cnt % 10 <= 4 && (cnt % 100 < 11 || cnt % 100 > 14) ? 'замовлення' : 'замовлень';
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
                  <span className="oc-summary-stat"><b>{cnt}</b> <span className="oc-summary-noun">{noun}</span><span className="oc-summary-noun-short">зам.</span>{totalPages > 1 && <span className="oc-summary-page"> · стор. {currentPage}/{totalPages}</span>}</span>
                  {showMoney && avg > 0 && <span className="oc-summary-stat oc-summary-stat--avg"><span className="oc-summary-stat__long">середній </span>чек <b>{fmt(avg)} ₴</b></span>}
                </span>
              </div>
              {/* Телефон: праворуч від суми — сортування. Шапки
                  колонок (де на десктопі сортують) на телефоні немає (06.11.2026). */}
              <div className="oc-summary-tools oc-only-m" style={{ display: 'none' }}>
                <MobileFilterSelect
                  label="Нові" allLabel="Нові спочатку"
                  className="oc-msort"
                  icon={<ArrowDownUp size={14} strokeWidth={2.2} aria-hidden className="oc-msort__icon" />}
                  value={sortBy === 'created_at' && sortDir === 'desc' ? '' : `${sortBy}:${sortDir}`}
                  onChange={v => {
                    const [key, dir] = (v || 'created_at:desc').split(':');
                    pushFilters({ sortBy: key, sortDir: dir as 'asc' | 'desc' });
                  }}
                  options={SORT_OPTIONS}
                />
                {/* Нове замовлення — та сама подія, що й кнопка в шапці (NewOrderButton) */}
                <button type="button" className="oc-mnew" aria-label="Нове замовлення" title="Нове замовлення"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-order-draft'))}>
                  <Plus size={18} strokeWidth={2.5} aria-hidden />
                </button>
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
              <div className="oc-filter-dates oc-period oc-hide-m" role="group" aria-label="Період">
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
                      border: `1.5px solid ${active ? 'var(--color-danger)' : 'var(--danger-border)'}`, background: active ? 'var(--danger-bg)' : 'var(--bg-danger)', color: active ? '#991B1B' : 'var(--danger-dark)' }}>
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
          <div className="oc-mfilter-bar">
            {/* «Вибрати всі» — квадрат-чекбокс першим у рядку фільтрів (рішення власника 06.11.2026);
                поруч із ним — лічильник вибраних, коли щось вибрано */}
            {filtered.length > 0 && (() => {
              const allIds = filtered.map(o => o.id);
              const allSelected = allIds.every(id => selectedIds.has(id));
              const picked = allIds.filter(id => selectedIds.has(id)).length;
              return (
                <button type="button" className={`oc-mselect${picked > 0 ? ' is-on' : ''}`}
                  onClick={() => setSelectedIds(allSelected ? new Set() : new Set(allIds))}
                  aria-pressed={allSelected}
                  aria-label={allSelected ? 'Зняти вибір' : `Вибрати всі ${allIds.length}`}
                  title={allSelected ? 'Зняти вибір' : `Вибрати всі ${allIds.length}`}>
                  <span className={`oc-mselect__box${allSelected ? ' is-checked' : picked > 0 ? ' is-partial' : ''}`} aria-hidden>
                    {allSelected ? <Check size={10} strokeWidth={3.5} /> : picked > 0 ? '–' : null}
                  </span>
                  {picked > 0 && <span className="oc-mselect__n">{picked}</span>}
                </button>
              );
            })()}
            <MobileFilterSelect
              label="Період" allLabel="Усі дати"
              value={hasDateFilter ? (periodPreset ?? 'custom') : (customDates ? 'custom' : '')}
              onChange={v => {
                if (v === 'custom') { setCustomDates(true); return; }
                setCustomDates(false);
                const p = PERIODS.find(x => x.value === v);
                if (p) applyDate(p.from, p.to); else pushFilters({ dateFrom: '', dateTo: '' });
              }}
              options={[
                ...PERIODS.map(p => ({ value: p.value, label: p.label })),
                { value: 'custom', label: hasDateFilter && !periodPreset ? `${ddmm(dateFrom)}–${ddmm(dateTo)}` : 'Свої дати…', short: hasDateFilter && !periodPreset ? undefined : 'Дати' },
              ]}
            />
            {/* Телефон: три кнопки в один ряд, кожна — нативний <select> (системний
                список вибору на Android/iOS). Без фільтра на кнопці назва групи, з
                фільтром — обране значення з підсвіткою. Раніше групи стояли пігулками
                одна під одною й займали пів екрана (06.11.2026). */}
            <MobileFilterSelect
              label="Канал" allLabel="Всі канали"
              value={channelFilter}
              onChange={v => pushFilters({ channel: v })}
              total={Object.values(channelCounts).reduce((s, c) => s + c, 0)}
              options={CHANNEL_OPTIONS
                .map(ch => ({ value: ch.value, label: ch.label, n: channelCounts[ch.value] ?? 0 }))
                .filter(o => o.n > 0 || o.value === channelFilter)}
              activeColor={CHANNEL_LABEL[channelFilter]?.color}
              activeBg={CHANNEL_LABEL[channelFilter]?.bg}
            />
            <MobileFilterSelect
              label="Доставка" allLabel="Усі перевізники"
              value={carrierFilter}
              onChange={v => pushFilters({ carrier: v })}
              total={Object.values(carrierCounts).reduce((s, c) => s + c, 0)}
              options={CARRIER_FILTERS
                .map(c => ({ value: c.value as string, label: c.short, n: carrierCounts[c.value] ?? 0 }))
                .filter(o => o.n > 0 || o.value === carrierFilter)}
              activeColor="#7C2D12" activeBg="#FFF7ED"
            />
            <MobileFilterSelect
              label="Оплата" allLabel="Будь-яка оплата"
              value={payFilter}
              onChange={v => pushFilters({ pay: v })}
              total={Object.values(payCounts).reduce((s, c) => s + c, 0)}
              options={PAYMENT_GROUPS
                .map(g => ({ value: g.key as string, label: g.label, n: payCounts[g.key] ?? 0 }))
                .filter(o => o.n > 0 || o.value === payFilter)}
              activeColor="#6D28D9" activeBg="#F3E8FF"
            />
            {/* Реєстр НП — окремий блок після риски (дія, а не фільтр). На телефоні
                кнопка тут, а не біля «Нове замовлення» в шапці (06.11.2026) */}
            <span className="oc-mfilter-sep" aria-hidden />
            <Link href="/admin/dispatch" className="oc-mnp" title="Реєстри відправлень Нової Пошти" aria-label="Реєстр НП">
              <ClipboardList size={17} strokeWidth={2} aria-hidden />
            </Link>
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
                    border: `1.5px solid ${active ? 'var(--orange-border)' : 'var(--border)'}`,
                    background: active ? 'var(--orange-bg)' : 'var(--bg-card)',
                    color: active ? 'var(--orange)' : 'var(--text-secondary)',
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
                    background: cabinetAheadOnly ? 'var(--ok-bg)' : 'var(--bg-card)',
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
        {/* Телефон: свої дати — окремим рядком під фільтрами, лише коли обрано «Свої дати…» */}
        {showCustom && (
          <div className="oc-mfilter-dates oc-only-m" style={{ display: 'none' }}>
            <span>з</span>
            <SmartDateInput value={dateFrom ?? ''} onChange={v => applyDate(v, dateTo ?? '')} style={mDateStyle} withPicker />
            <span>по</span>
            <SmartDateInput value={dateTo ?? ''} onChange={v => applyDate(dateFrom ?? '', v)} style={mDateStyle} withPicker />
            <button type="button" aria-label="Скинути період" title="Скинути період"
              onClick={() => { setCustomDates(false); pushFilters({ dateFrom: '', dateTo: '' }); }}>✕</button>
          </div>
        )}
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
          if (carrierFilter) chips.push({ key: 'carrier', label: `Доставка: ${CARRIER_FILTERS.find(c => c.value === carrierFilter)?.label ?? carrierFilter}`, clear: () => pushFilters({ carrier: '' }) });
          if (payFilter) chips.push({ key: 'pay', label: `Оплата: ${PAYMENT_GROUPS.find(g => g.key === payFilter)?.label ?? payFilter}`, clear: () => pushFilters({ pay: '' }) });
          if (retFilter === 'pending') chips.push({ key: 'ret', label: 'Повернення без рішення', clear: () => pushFilters({ ret: '' }) });
          if (sentFilter) chips.push({ key: 'sent', label: ({
            sent: 'Постачальнику: надіслано', unsent: 'Постачальнику: ще не надіслано',
            own: 'Склад: FXL', supplier: 'Склад: постачальник', mixed: 'Склад: змішана',
          } as Record<string, string>)[sentFilter] ?? sentFilter, clear: () => pushFilters({ sent: '' }) });
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

// Сортування на телефоні (значення — «колонка:напрям», як у шапці аркуша на десктопі).
// Перший пункт («Нові спочатку») — порядок за замовчуванням, тож його тут немає.
const SORT_OPTIONS = [
  { value: 'created_at:asc',  label: 'Старі спочатку' },
  { value: 'total_price:desc', label: 'Сума ↓' },
  { value: 'total_price:asc',  label: 'Сума ↑' },
  { value: 'status:asc',       label: 'За статусом' },
  { value: 'contact:asc',      label: 'За клієнтом' },
];

// Канали в порядку фільтра (порожні ховаються — див. MobileFilterSelect)
const CHANNEL_OPTIONS = [
  { value: 'website',  label: 'Магазин' },
  { value: 'b2b',      label: 'Опт' },
  { value: 'dropship', label: 'Дроп' },
  { value: 'retail',   label: 'Роздріб' },
  { value: 'phone',    label: 'Телефон' },
  { value: 'prom',     label: 'Prom' },
  { value: 'rozetka',  label: 'Rozetka' },
];

/**
 * Фільтр-кнопка для телефону: пігулка з назвою групи (або обраним значенням),
 * а поверх неї — прозорий нативний <select>, тож дотик відкриває системний
 * список вибору. Перше значення списку скидає фільтр.
 */
function MobileFilterSelect({ label, allLabel, value, onChange, options, total, activeColor, activeBg, icon, className }: {
  label: string;
  allLabel: string;
  value: string;
  onChange: (v: string) => void;
  /** short — підпис на самій кнопці, коли повний не влазить («Свої дати…» → «Дати») */
  options: { value: string; label: string; n?: number; short?: string }[];
  /** Скільки всього — у першому пункті «Усі …»; без нього лічильників немає (Період) */
  total?: number;
  activeColor?: string;
  activeBg?: string;
  /** Іконка перед підписом (сортування: на вузьких екранах лишається тільки вона) */
  icon?: React.ReactNode;
  className?: string;
}) {
  const current = options.find(o => o.value === value);
  const active = Boolean(value);
  return (
    <label className={`oc-mfilter${active ? ' is-active' : ''}${className ? ' ' + className : ''}`} title={active ? (current?.label ?? value) : label}
      style={active ? { color: activeColor ?? 'var(--navy)', background: activeBg ?? 'var(--blue-bg)', borderColor: activeColor ?? 'var(--navy)' } : undefined}>
      {icon}
      <span className="oc-mfilter__text">{active ? (current?.short ?? current?.label ?? value) : label}</span>
      <ChevronDown size={13} aria-hidden />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
        <option value="">{total == null ? allLabel : `${allLabel} (${total})`}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.n == null ? o.label : `${o.label} (${o.n})`}</option>)}
      </select>
    </label>
  );
}
