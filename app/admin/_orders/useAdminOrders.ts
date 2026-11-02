'use client';

// Логіка журналу замовлень: стани, ефекти й обробники. Розмітка — у
// AdminOrders.tsx; тут нічого не рендериться.

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateTTNModal from '../../components/admin/CreateTTNModal';
import { phoneLocalDigits } from '../../../lib/notify/phone';
import { buildCopyLines, describeCopy, mapCopyDelivery, mapCopyPayment, copyComment, type CopyProduct } from '../../../lib/order-copy';
import { formNovaSubtype } from '../../../lib/np-resolve';
import { ttnFollowUpAction, type TtnSource } from '../../../lib/orders/ttn-followup';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';
import { showConfirm } from '../../../lib/confirm';
import { showToast } from '../../../lib/toast';
import { planMergeTtn, sameBuyerGroups } from '../../../lib/orders/merge-ttn';
import type { CustomerHistory, FulfillmentData, OrderItem, Order, AdminOrdersProps } from './types';
import { DELIVERY_NEEDS_CITY, DELIVERY_LABEL, PAYMENT_LABEL } from './constants';
import { itemTitle, rozetkaCabinet } from './helpers';

export function useAdminOrders(props: AdminOrdersProps) {
  const {
  initialOrders, currentPage = 1, totalPages = 1, userRole = 'admin',
  hasRecentReceipts = false, expandOrderId, dateFrom, dateTo,
  statusCounts = {}, currentStatus = '',
  initialSearch = '', channelFilter = '', carrierFilter = '', payFilter = '', retFilter = '',
  sentFilter = '', sentCounts = {},
  pendingReturns = 0,
  channelCounts = {}, carrierCounts = {}, payCounts = {},
  totalFound = 0, summaryAmount = 0, productThumbs = {},
  sortBy = 'created_at', sortDir = 'desc',
  promCommissionPct = 3,
  rozetkaCommissionPct = 15,
  feeTariffs = {},
  initialSaleDocs = {}, initialReturnDocs = {}, initialShippedQty = {},
  initialSettlement = {},
} = props;

  const isAdmin = userRole === 'admin';
  const router = useRouter();
  // Посилання пагінації мусять нести з собою решту фільтрів: голий `?page=2`
  // стирав ?status=/?dateFrom=/?sortBy=, і друга сторінка вкладки «Доставлено»
  // відкривалася як повний список замовлень із дефолтним статусом.
  const searchParams = useSearchParams();
  const pageHref = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    // expand прив'язаний до конкретного замовлення на поточній сторінці
    params.delete('expand');
    return `?${params.toString()}`;
  };
  const [orders, setOrders]         = useState<Order[]>(initialOrders);
  // Sync when server re-renders with new sort/filter
  useEffect(() => {
    setOrders(initialOrders);
    // Розгорнуте замовлення поїхало з вкладки (відвантажили → router.refresh):
    // без скидання решта рядків лишалась приглушеною (opacity 0.35 для
    // «не розгорнутих», поки expandedId вказує на зниклий рядок).
    setExpandedId(prev => prev && !initialOrders.some(o => o.id === prev) ? null : prev);
  }, [initialOrders]);

  // Повний текст у підказці для БУДЬ-ЯКОГО обрізаного рядка (…): один делегований
  // обробник замість ручного title у кожній комірці — покриває й майбутні поля.
  // Перевірка тільки при наведенні, тому нічого не коштує на рендері. Явно
  // проставлені title (напр., стан посилки з часом синку) не перебиваються.
  useEffect(() => {
    function onOver(e: MouseEvent) {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el.closest('[title]')) return;
      if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
      const cs = getComputedStyle(el);
      const clamped = cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden'
        || (cs as CSSStyleDeclaration & { webkitLineClamp?: string }).webkitLineClamp !== 'none';
      const text = el.textContent?.trim();
      if (clamped && text) el.title = text;
    }
    document.addEventListener('mouseover', onOver);
    return () => document.removeEventListener('mouseover', onOver);
  }, []);

  // Список постачальників для вибору фактичного постачальника відвантаження
  const [suppliersList, setSuppliersList] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { id: number; name: string }[]) =>
        setSuppliersList(Array.isArray(rows) ? rows.map(s => ({ id: s.id, name: s.name })) : []))
      .catch(() => setSuppliersList([]));
  }, []);

  // Модал повернення від покупця
  const [returnFor, setReturnFor] = useState<{ id: string; number: number } | null>(null);
  const [npReturnFor, setNpReturnFor] = useState<{ id: string; number: number } | null>(null);

  const PRICE_TYPE_LABELS: Record<string, string> = { retail: 'Роздріб', wholesale: 'Опт', drop: 'Дроп' };

  async function changePriceType(orderId: string, priceType: string) {
    const ok = await showConfirm(
      `Перерахувати всі позиції за тарифом «${PRICE_TYPE_LABELS[priceType] ?? priceType}»? Ціни та суму замовлення буде змінено.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reprice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_type: priceType }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId
          ? { ...o, price_type: priceType, items: data.items ?? o.items, total_price: data.total_price ?? o.total_price }
          : o));
        showToast(`Тип цін: ${PRICE_TYPE_LABELS[priceType]} · нова сума ${Number(data.total_price).toFixed(2)} ₴`, 'success');
      } else {
        showToast(data.error ?? 'Помилка перерахунку', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  // Ручна знижка по замовленню — зашивається в построчну ціну (Варіант A).
  // mode 'pct' — відсоток, 'amount' — сума грн (сервер переведе у %). 0 знімає знижку.
  async function applyDiscount(orderId: string, mode: 'pct' | 'amount', value: number) {
    const clean = Number(value);
    if (Number.isNaN(clean) || clean < 0) { showToast('Некоректне значення знижки', 'error'); return; }
    const label = mode === 'pct' ? `${clean}%` : `${clean.toFixed(2)} ₴`;
    const ok = clean === 0
      ? await showConfirm('Прибрати знижку і повернути повні ціни?')
      : await showConfirm(`Застосувати знижку ${label}? Ціни всіх позицій буде знижено.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'pct' ? { pct: clean } : { amount: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId
          ? { ...o, items: data.items ?? o.items, total_price: data.total_price ?? o.total_price, discount_pct: data.discount_pct ?? 0, discount_amount: data.discount_amount ?? 0 }
          : o));
        showToast(
          data.discount_pct > 0
            ? `Знижка ${data.discount_pct}% (−${Number(data.discount_amount).toFixed(2)} ₴) · сума ${Number(data.total_price).toFixed(2)} ₴`
            : 'Знижку прибрано',
          'success',
        );
      } else {
        showToast(data.error ?? 'Помилка знижки', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function setShippingSupplier(orderId: string, supplierId: number | null) {
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipping_supplier_id: supplierId }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, shipping_supplier_id: supplierId } : o));
      showToast(supplierId ? 'Постачальника відвантаження збережено' : 'Постачальника відвантаження скинуто');
    } else {
      showToast('Не вдалося зберегти постачальника', 'error');
    }
  }

  // «Уже оброблені в кабінеті» — замовлення, які на Rozetka рухнули далі, ніж у нас.
  // Єдиний фільтр, що лишився клієнтським: ознака рахується з rozetka_data вже в
  // браузері, окремої колонки в базі під неї немає.
  const [cabinetAheadOnly, setCabinetAheadOnly] = useState(false);
  // Групи фільтрів (канал / доставка / оплата): клік по підпису згортає групу
  // до підпису й обраного значення, повторний — розгортає вправо. За
  // замовчуванням усі розгорнуті (рішення власника 17.10.2026).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['channel', 'carrier', 'pay']));
  // На десктопі фільтри каналу / перевізника / оплати живуть у шапці аркуша —
  // лійка в заголовку колонки відкриває меню значень (варіант 2, 18.10.2026).
  // Відкрите меню закривається кліком поза ним або Escape.
  const [hdrMenu, setHdrMenu] = useState<null | 'channel' | 'carrier' | 'pay' | 'sent'>(null);
  useEffect(() => {
    if (!hdrMenu) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.('.oc-th-filter')) setHdrMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setHdrMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [hdrMenu]);
  const grpOpen = (g: string) => openGroups.has(g);
  const toggleGroup = (g: string) => setOpenGroups(prev => {
    const next = new Set(prev);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });

  // Пошук і фільтри каналу/перевізника живуть в URL, застосовує їх сервер по всій
  // базі. Локально тримаємо лише набране в полі, щоб не смикати навігацію на кожну
  // літеру; після паузи стан їде в URL і сторінка перезапитує дані.
  const [searchInput, setSearchInput] = useState(initialSearch);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Останнє значення, яке МИ відправили в URL. Відповідь сервера на нього — не
  // новина, і поле чіпати не треба. Раніше поле перезаписувалося на кожну зміну
  // initialSearch: сервер відповідав на проміжний зріз («261010»), коли в полі
  // вже було «26101033», і стирав набраний хвіст — набрати номер руками не
  // виходило, лише вставити. Ззовні (назад/вперед, «Скинути фільтри») URL
  // підтягуємо, але не поверх живого набору у сфокусованому полі.
  const pushedSearchRef = useRef(initialSearch);
  useEffect(() => {
    if (initialSearch === pushedSearchRef.current) return;
    pushedSearchRef.current = initialSearch;
    if (document.activeElement === searchInputRef.current) return;
    setSearchInput(initialSearch);
  }, [initialSearch]);

  // Підказка пошуку за шириною поля: повний перелік того, за чим шукаємо, у
  // вузькому полі обрізався на півслові. Міряємо саме поле (ResizeObserver), а
  // не вікно: ширина залежить ще й від того, чи показана сума й кнопка
  // повернень. Текст міняється, лише коли поле порожнє, — щоб підказка не
  // смикалась під час набору.
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [searchHint, setSearchHint] = useState('Пошук: №, ПІБ, телефон, ТТН');
  useEffect(() => {
    const el = searchBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const hint = (w: number) => w >= 520 ? 'Пошук: № замовлення (маркетплейс, сайт), ПІБ, телефон, ТТН'
      : w >= 330 ? 'Пошук: №, ПІБ, телефон, ТТН'
      : 'Пошук';
    const ro = new ResizeObserver(entries => setSearchHint(hint(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pushFilters = useCallback((patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete('page');   // новий зріз — завжди з першої сторінки
    params.delete('expand');
    router.push(`/admin?${params.toString()}`);
  }, [router, searchParams]);

  const pushSearch = useCallback((value: string) => {
    if (value === pushedSearchRef.current) return;
    pushedSearchRef.current = value;
    pushFilters({ q: value });
  }, [pushFilters]);
  useEffect(() => {
    const value = searchInput.trim();
    if (value === initialSearch) return;
    const timer = setTimeout(() => pushSearch(value), 500);
    return () => clearTimeout(timer);
  }, [searchInput, initialSearch, pushSearch]);
  const [loading, setLoading]       = useState<string | null>(null);
  const [ttnValues, setTtnValues] = useState<Record<string, string>>(
    Object.fromEntries(initialOrders.map(o => [o.id, o.tracking_number ?? '']))
  );
  const [ttnSaving,      setTtnSaving]      = useState<string | null>(null);
  const [ttnDeleting,    setTtnDeleting]    = useState<string | null>(null);
  const [registryAdding, setRegistryAdding] = useState<string | null>(null);
  const [registryAdded,  setRegistryAdded]  = useState<Set<string>>(new Set());
  const [registryBulkLoading, setRegistryBulkLoading] = useState(false);
  // Реєстр НП, у який востаннє додавали в цій сесії — кнопка «Друк реєстру» відкриє
  // саме його; якщо не додавали — візьме найсвіжіший сьогоднішній зі списку НП
  const [npSheetRef, setNpSheetRef] = useState<string | null>(null);
  const [npSheetPrinting, setNpSheetPrinting] = useState(false);
  // Модалка вибору реєстру: якщо за сьогодні вже є відкриті реєстри — питаємо,
  // додати в один із них чи створити новий (живий випадок: друге додавання
  // за день мовчки плодило другий реєстр)
  const [registryPick, setRegistryPick] = useState<{
    items: { orderId: string; ttn: string; orderNumber: number }[];
    sheets: { Ref: string; Number: string; DateTime: string; Count?: string }[];
  } | null>(null);
  const [invoiceCfg,     setInvoiceCfg]     = useState<Order | null>(null);
  type ContactEntry = { name: string; email: string; note?: string };
  // items/scope — для змішаних замовлень: показати, що частина позицій іде з
  // нашого складу, і дати вибір, чи слати їх постачальнику.
  type SupplierQLine = { sku: string; name: string; qty: number; source: 'own' | 'dropship' };
  type SupplierQItem = { orderId: string; orderNumber: number; supplierName: string; supplierId: number | null; email: string; contacts: ContactEntry[]; comment: string; lines: SupplierQLine[]; scope: 'supplier' | 'all' };
  const [supplierQueue,        setSupplierQueue]        = useState<SupplierQItem[] | null>(null);
  const [supplierQueueIdx,     setSupplierQueueIdx]     = useState(0);
  const [supplierQueueLoading, setSupplierQueueLoading] = useState(false);
  const [supplierQueueSending, setSupplierQueueSending] = useState(false);
  const [supplierQueueDone,    setSupplierQueueDone]    = useState(false);
  // Масова відправка: замовлення згруповані по постачальнику → один лист на постачальника
  type BulkGroup = { supplierId: number | null; supplierName: string; orderNumbers: number[]; email: string; contacts: ContactEntry[] };
  type BulkResult = { supplierName: string; emailed: boolean; orderNumbers: number[]; error?: string };
  const [bulkGroups,   setBulkGroups]   = useState<BulkGroup[] | null>(null);
  const [bulkOrderIds, setBulkOrderIds] = useState<string[]>([]);
  const [bulkComment,  setBulkComment]  = useState('');
  const [bulkSending,  setBulkSending]  = useState(false);
  const [bulkResults,  setBulkResults]  = useState<BulkResult[] | null>(null);
  // Відправники (основний + додаткові) — вибір «від кого» слати постачальнику
  const [senders,      setSenders]      = useState<{ name: string; email: string }[]>([]);
  const [chosenSender, setChosenSender] = useState('');
  useEffect(() => {
    fetch('/api/admin/procurement/senders')
      .then(r => r.json())
      .then(d => { const list = d.senders ?? []; setSenders(list); setChosenSender(d.defaultSender || list[0]?.email || ''); })
      .catch(() => {});
  }, []);
  const [ttnModalOrder,  setTtnModalOrder]  = useState<Order | null>(null);
  const [rzTtnModal,     setRzTtnModal]     = useState<Order | null>(null);
  // «Деталі ЕН» — перегляд того, що вписано в накладну (усі перевізники)
  const [ttnDetailsFor,  setTtnDetailsFor]  = useState<{ id: string; number: number } | null>(null);
  // Накладна власного договору «ROZETKA Доставки» (замовлення сайту) — окреме
  // вікно й окремий роут, щоб не плутати з маркетплейсним rzTtnModal вище
  const [rzOwnTtnModal,  setRzOwnTtnModal]  = useState<Order | null>(null);
  // Об'єднана посилка для обох Rozetka-вікон: усі замовлення групи (перше —
  // основне, з нього виписується накладна). null — звичайне одиночне вікно.
  const [rzMergeGroup,   setRzMergeGroup]   = useState<Order[] | null>(null);
  const [rzLabelBusy,    setRzLabelBusy]    = useState<string | null>(null);
  const [bulkPrinting,   setBulkPrinting]   = useState(false);
  const [rzRegBusy,      setRzRegBusy]      = useState<string | null>(null);
  // Останній реєстр, у який щось клали в цій сесії — щоб кнопка друку з'явилася
  // одразу після додавання, а не вимагала окремого екрана реєстрів
  const [rzReception,    setRzReception]    = useState<number | null>(null);
  const [creatingPo,     setCreatingPo]     = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashId,    setFlashId]    = useState<string | null>(null);
  const [sourceOverrides, setSourceOverrides] = useState<Record<string, Record<string, 'own' | 'dropship'>>>({});
  // `${orderId}:${sku}` поки зміна джерела летить на сервер
  const [savingSource,    setSavingSource]    = useState<string | null>(null);
  const [shipping,      setShipping]      = useState<string | null>(null);
  const [saleDocMap,    setSaleDocMap]    = useState<Record<string, { id: string; number: string; status?: string }[]>>(initialSaleDocs);
  const [shippedQtyMap, setShippedQtyMap] = useState<Record<string, Record<string, number>>>(initialShippedQty);
  type ShipModalItem = { sku: string; name: string; brand: string; orderQty: number; shippedQty: number; shipQty: number };
  const [shipModal, setShipModal] = useState<{ orderId: string; items: ShipModalItem[]; ttn: string; isProm: boolean } | null>(null);
  const [editDeliveryId,   setEditDeliveryId]   = useState<string | null>(null);
  const [editDeliveryForm, setEditDeliveryForm] = useState<{ type: string; subtype: string; cityName: string; address: string }>({ type: '', subtype: '', cityName: '', address: '' });
  const [savingDelivery,   setSavingDelivery]   = useState(false);
  const [editPaymentTypeId,    setEditPaymentTypeId]    = useState<string | null>(null);
  const [editPaymentTypeValue, setEditPaymentTypeValue] = useState('');
  const [savingPaymentType,    setSavingPaymentType]    = useState(false);
  const [reserving, setReserving] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<Record<string, 'supplier' | 'own' | 'mixed'>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmErrors, setConfirmErrors] = useState<Record<string, { error: string; insufficient?: { sku: string; requested: number; available: number }[] }>>({});
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [copiedSupplierSku, setCopiedSupplierSku] = useState<string | null>(null);
  // ТТН із мобільного рядка картки: копіюємо, щоб одразу вставити в пошук перевізника.
  const [copiedTtn, setCopiedTtn] = useState<string | null>(null);
  function copyTtn(ttn: string) {
    navigator.clipboard.writeText(ttn);
    setCopiedTtn(ttn);
    setTimeout(() => setCopiedTtn(c => (c === ttn ? null : c)), 1500);
  }

  // Телефон із рядка: копіюємо, щоб одразу набрати або вставити в пошук.
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  function copyPhone(phone: string) {
    // Копіюємо в національному вигляді «0504449875»: саме його чекають пошук у
    // кабінеті перевізника, форма ТТН і дзвінок — «+380…» доводилось правити руками.
    navigator.clipboard.writeText(phoneLocalDigits(phone));
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(p => (p === phone ? null : p)), 1500);
  }

  // Edit order items
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editItems,   setEditItems]   = useState<OrderItem[]>([]);
  const [editSaving,  setEditSaving]  = useState(false);
  const [editWarnings, setEditWarnings] = useState<Record<string, string[]>>({});
  const [addName,     setAddName]     = useState('');
  const [addQty,      setAddQty]      = useState(1);
  const [addPrice,    setAddPrice]    = useState('');
  const [addSku,      setAddSku]      = useState('');
  const [prodSearch,  setProdSearch]  = useState('');
  const [prodResults, setProdResults] = useState<{sku:string;name:string;brand:string;price:number}[]>([]);
  const [prodOpen,    setProdOpen]    = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);

  // Часткові оплати
  type OrderPayment = { id: string; amount: number; payment_mode: string; payment_date: string; note: string | null; reversed: boolean; created_at: string; created_by: string | null };
  const [orderPayments,    setOrderPayments]    = useState<Record<string, OrderPayment[]>>({});
  const [payFormOpen,      setPayFormOpen]      = useState<Record<string, boolean>>({});
  const [payFormAmount,    setPayFormAmount]    = useState<Record<string, string>>({});
  const [payFormMode,      setPayFormMode]      = useState<Record<string, string>>({});
  const [payFormDate,      setPayFormDate]      = useState<Record<string, string>>({});
  const [payFormNote,      setPayFormNote]      = useState<Record<string, string>>({});
  const [discInput,        setDiscInput]        = useState<Record<string, string>>({});
  const [discMode,         setDiscMode]         = useState<Record<string, 'pct' | 'amount'>>({});
  const [priceBlockOpen,   setPriceBlockOpen]   = useState<Record<string, boolean>>({});
  /** Історія замовлення згорнута за замовчуванням: до неї звертаються зрідка,
   *  а висоти вона додає більше за будь-який інший блок картки. */
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  /** Колонка «Дії» відкрита за замовчуванням; чевронц біля підпису згортає її
   *  в вузьку кнопку, і тоді 250px забирають блоки, які читають. */
  const [actionsOpen, setActionsOpen] = useState<Record<string, boolean>>({});
  /** Нотатку пишуть в одному замовленні з двадцяти, тож поле відкривається за
   *  вимогою: постійно порожній інпут на всю ширину читався як «заповни мене». */
  const [noteEditing, setNoteEditing] = useState<Record<string, boolean>>({});
  /** На телефоні колонка «Дії» займає цілий екран, тож там вона згорнута
   *  за замовчуванням, а перемикач стоїть у ряду з нотаткою й історією. */
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  const [finLogOpen,       setFinLogOpen]       = useState<Record<string, boolean>>({});
  const [statusEditOpen,   setStatusEditOpen]   = useState<Record<string, boolean>>({});
  const [itemsExpanded,    setItemsExpanded]    = useState<Record<string, boolean>>({});
  // Позиція свайпу стрічки карток (Клієнт/Оплата) на мобілці — для стрілок ‹ / ›
  const [cardSwipe,        setCardSwipe]        = useState<Record<string, 'start' | 'mid' | 'end'>>({});
  // sku → мініатюра і слаг: слаг потрібен, щоб вести на сторінку товару в
  // магазині без зайвого 308 із SKU-адреси на ЧПУ
  const [itemProducts,     setItemProducts]     = useState<Record<string, Record<string, { image: string | null; slug: string | null }>>>({});
  const [payFormSaving,    setPayFormSaving]    = useState<Record<string, boolean>>({});
  const [payRemoving,      setPayRemoving]      = useState<string | null>(null);

  async function loadPayments(orderId: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/payments`);
    if (!res.ok) return;
    const data = await res.json();
    setOrderPayments(prev => ({ ...prev, [orderId]: data }));
  }

  async function addPayment(order: Order) {
    const amount = parseFloat(payFormAmount[order.id] ?? '');
    if (!amount || amount <= 0) return;
    setPayFormSaving(prev => ({ ...prev, [order.id]: true }));
    const res = await fetch(`/api/admin/orders/${order.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_mode: payFormMode[order.id] ?? 'cash',
        payment_date: payFormDate[order.id] ?? new Date().toISOString().slice(0, 10),
        note: payFormNote[order.id] || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === order.id
        ? { ...o, amount_paid: data.amount_paid, payment_confirmed: data.is_fully_paid }
        : o,
      ));
      setOrderPayments(prev => ({ ...prev, [order.id]: [...(prev[order.id] ?? []), data.payment] }));
      setPayFormOpen(prev => ({ ...prev, [order.id]: false }));
      setPayFormAmount(prev => ({ ...prev, [order.id]: '' }));
      setPayFormNote(prev => ({ ...prev, [order.id]: '' }));
    }
    setPayFormSaving(prev => ({ ...prev, [order.id]: false }));
  }

  async function reversePayment(order: Order, paymentId: string) {
    if (!confirm('Скасувати цей платіж?')) return;
    setPayRemoving(paymentId);
    const res = await fetch(`/api/admin/orders/${order.id}/payments/${paymentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === order.id
        ? { ...o, amount_paid: data.amount_paid, payment_confirmed: data.is_fully_paid }
        : o,
      ));
      setOrderPayments(prev => ({
        ...prev,
        [order.id]: (prev[order.id] ?? []).map(p => p.id === paymentId ? { ...p, reversed: true } : p),
      }));
    }
    setPayRemoving(null);
  }

  // Fulfillment / margin info
  const [fulfillmentData,    setFulfillmentData]    = useState<Record<string, FulfillmentData>>({});
  const [fulfillmentOpen,    setFulfillmentOpen]    = useState<Set<string>>(new Set());
  const [fulfillmentLoading, setFulfillmentLoading] = useState<Set<string>>(new Set());

  // PO-звязки для кожного замовлення
  type LinkedPO = { id: string; doc_number: string; doc_date: string; expected_date: string | null; created_at: string; procurement_status: string | null; total_cost: number | null; supplier: { name: string } | null };
  type LinkedReceipt = { id: string; doc_number: string; doc_date: string; created_at: string; total_cost: number | null; parent_doc_id: string };
  type ReceiptLine   = { document_id: string; sku: string; qty_actual: number | null; qty: number };
  const [linkedPOs,       setLinkedPOs]       = useState<Record<string, LinkedPO[]>>({});
  const [linkedReceipts,  setLinkedReceipts]  = useState<Record<string, LinkedReceipt[]>>({});
  const [receiptLines,    setReceiptLines]    = useState<Record<string, ReceiptLine[]>>({});

  async function loadLinkedPOs(orderId: string) {
    if (linkedPOs[orderId]) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/purchase-orders`);
      const data = await res.json();
      setLinkedPOs(prev => ({ ...prev, [orderId]: data.pos ?? [] }));
      setLinkedReceipts(prev => ({ ...prev, [orderId]: data.receipts ?? [] }));
      setReceiptLines(prev => ({ ...prev, [orderId]: data.receiptLines ?? [] }));
    } catch { /* silent */ }
  }

  async function loadFulfillment(orderId: string) {
    if (fulfillmentData[orderId]) return;
    setFulfillmentLoading(prev => new Set([...prev, orderId]));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`);
      const data = await res.json();
      setFulfillmentData(prev => ({ ...prev, [orderId]: data }));
    } finally {
      setFulfillmentLoading(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }

  async function toggleFulfillment(orderId: string) {
    if (fulfillmentOpen.has(orderId)) {
      setFulfillmentOpen(prev => { const s = new Set(prev); s.delete(orderId); return s; });
      return;
    }
    setFulfillmentOpen(prev => new Set([...prev, orderId]));
    await loadFulfillment(orderId);
  }

  async function confirmOrder(orderId: string) {
    const mode = selectedMode[orderId] ?? 'supplier';
    setConfirming(orderId);
    setConfirmErrors(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillment_mode: mode }),
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId
          ? { ...o, status: data.status, fulfillment_mode: data.fulfillment_mode }
          : o));
        setFulfillmentData(prev => { const n = { ...prev }; delete n[orderId]; return n; });
        loadFulfillment(orderId);

        // ТТН створили ДО підтвердження — тоді відвантаження не спрацювало:
        // з «нового» замовлення відвантажувати нічого (немає ні резервів, ні
        // замовлення постачальнику). Тепер, коли статус став підтвердженим,
        // доводимо справу до кінця тим самим шляхом, що й після створення ТТН.
        const src = orders.find(o => o.id === orderId);
        if (src?.tracking_number) {
          await ttnFollowUp({ ...src, status: data.status, fulfillment_mode: data.fulfillment_mode });
        }

        router.refresh();
      } else {
        setConfirmErrors(prev => ({ ...prev, [orderId]: { error: data?.error ?? 'Помилка підтвердження', insufficient: data?.insufficient } }));
      }
    } catch (err) {
      console.error('[confirmOrder] fetch failed:', err);
      setConfirmErrors(prev => ({ ...prev, [orderId]: { error: 'Помилка мережі' } }));
    } finally {
      setConfirming(null);
    }
  }

  // Спільне: підтягуємо дані постачальника (email + контакти) для кожного замовлення.
  async function fetchSupplierQItems(orderIds: string[]): Promise<SupplierQItem[]> {
    return Promise.all(orderIds.map(async (oid) => {
      const order = orders.find(o => o.id === oid);
      try {
        const d = await fetch(`/api/admin/orders/${oid}/supplier-order`).then(r => r.json());
        const supplierId: number | null = d.supplier_id ?? null;
        let contacts: ContactEntry[] = [];
        if (supplierId) {
          try {
            const sd = await fetch(`/api/admin/suppliers/${supplierId}`).then(r => r.json());
            contacts = sd.contacts ?? [];
          } catch { /* silent */ }
        }
        const firstContact = contacts.find(c => c.email?.includes('@'));
        const email = firstContact?.email || d.supplier_email || '';
        return { orderId: oid, orderNumber: order?.order_number ?? 0, supplierName: d.supplier_name ?? '—', supplierId, email, contacts, comment: '',
                 lines: (d.items ?? []) as SupplierQLine[], scope: 'supplier' as const };
      } catch {
        return { orderId: oid, orderNumber: order?.order_number ?? 0, supplierName: '—', supplierId: null, email: '', contacts: [], comment: '', lines: [], scope: 'supplier' as const };
      }
    }));
  }

  async function confirmMissingTtn(orderIds: string[]): Promise<boolean> {
    const missingTtn = orderIds.some(oid => !orders.find(o => o.id === oid)?.tracking_number);
    if (!missingTtn) return true;
    return showConfirm('ТТН не створена для цього замовлення. Все одно відправити постачальнику?');
  }

  // Поштучна відправка — модалка веде по одному замовленню (вибір контакту, коментар).
  async function startSupplierSend(orderIds: string[]) {
    if (!(await confirmMissingTtn(orderIds))) return;
    setSupplierQueueLoading(true);
    setSupplierQueueDone(false);
    const items = await fetchSupplierQItems(orderIds);
    setSupplierQueueLoading(false);
    setSupplierQueue(items);
    setSupplierQueueIdx(0);
  }

  // Масова відправка — один лист на постачальника (замовлення згруповані).
  async function startBulkSupplierSend(orderIds: string[]) {
    if (!(await confirmMissingTtn(orderIds))) return;
    setSupplierQueueLoading(true);
    const items = await fetchSupplierQItems(orderIds);
    setSupplierQueueLoading(false);

    const groupMap = new Map<string, BulkGroup>();
    for (const it of items) {
      const key = it.supplierId != null ? `s${it.supplierId}` : `n:${it.supplierName}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { supplierId: it.supplierId, supplierName: it.supplierName, orderNumbers: [], email: it.email, contacts: it.contacts });
      }
      const g = groupMap.get(key)!;
      g.orderNumbers.push(it.orderNumber);
      if (!g.email && it.email) g.email = it.email;
      if (g.contacts.length === 0 && it.contacts.length > 0) g.contacts = it.contacts;
    }
    const groups = [...groupMap.values()].map(g => ({ ...g, orderNumbers: [...new Set(g.orderNumbers)].sort((a, b) => a - b) }));
    setBulkGroups(groups);
    setBulkOrderIds(orderIds);
    setBulkComment('');
    setBulkResults(null);
  }

  async function sendBulkSuppliers() {
    if (!bulkGroups) return;
    setBulkSending(true);
    try {
      const emailOverrides: Record<string, string> = {};
      for (const g of bulkGroups) {
        if (g.supplierId != null && g.email.includes('@')) emailOverrides[String(g.supplierId)] = g.email.trim();
      }
      const res = await fetch('/api/admin/supplier-orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: bulkOrderIds, comment: bulkComment || undefined, senderEmail: chosenSender || undefined, emailOverrides }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results: BulkResult[] = (data.results ?? []).map((r: { supplier_name: string; emailed: boolean; order_numbers: number[]; error?: string }) =>
        ({ supplierName: r.supplier_name, emailed: r.emailed, orderNumbers: r.order_numbers ?? [], error: r.error }));
      // Порожній results при 200 = жодна позиція не змапилась на постачальника —
      // без цього рядка модалка показувала порожній екран «успіху».
      setBulkResults(results.length ? results : [{ supplierName: '—', emailed: false, orderNumbers: [], error: 'Сервер не знайшов жодного постачальника для цих замовлень' }]);
      const sentIds: string[] = data.sent_order_ids ?? [];
      if (sentIds.length) {
        const sentAt = new Date().toISOString();
        setOrders(prev => prev.map(o => sentIds.includes(o.id) ? { ...o, supplier_sent_at: sentAt } : o));
      }
    } catch (err) {
      setBulkResults([{ supplierName: '—', emailed: false, orderNumbers: [], error: `Запит не пройшов (${err instanceof Error ? err.message : 'мережа'}) — спробуйте ще раз` }]);
    } finally {
      setBulkSending(false);
    }
  }

  function advanceSupplierQueue() {
    if (!supplierQueue) return;
    const next = supplierQueueIdx + 1;
    if (next >= supplierQueue.length) {
      setSupplierQueue(null);
      // Черга пройдена — панель виділення закривається; невдалі листи вже
      // показані окремими повідомленнями по ходу черги.
      showToast(`Розсилку постачальникам завершено (${supplierQueue.length})`, 'success');
      setSelectedIds(new Set());
    }
    else { setSupplierQueueIdx(next); setSupplierQueueDone(false); }
  }

  async function sendCurrentSupplier() {
    if (!supplierQueue) return;
    const item = supplierQueue[supplierQueueIdx];
    setSupplierQueueSending(true);
    try {
      const res = await fetch(`/api/admin/orders/${item.orderId}/supplier-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideEmail: item.email || undefined, comment: item.comment || undefined, senderEmail: chosenSender || undefined, scope: item.scope }),
      });
      // Раніше відповідь не читалась і UI показував успіх навіть коли Resend
      // відхилив лист — тепер невдала відправка лишає замовлення в черзі з помилкою.
      const data = await res.json().catch(() => ({ results: [] }));
      const failed = (data.results ?? []).filter((r: { emailed: boolean; error?: string }) => !r.emailed);
      if (!res.ok || failed.length) {
        // Сервер пояснює відмову текстом (напр. «усі позиції з нашого складу») —
        // без цього рядка користувач бачив голий код помилки.
        const reason = failed[0]?.error ?? data.error ?? (res.ok ? 'немає email постачальника' : `HTTP ${res.status}`);
        showToast(`Лист не відправлено: ${reason}`, 'error', 6000);
        advanceSupplierQueue();
        return;
      }
      const sentAt = new Date().toISOString();
      setOrders(prev => prev.map(o => o.id === item.orderId ? { ...o, supplier_sent_at: sentAt } : o));
      setSupplierQueueDone(true);
      setTimeout(() => advanceSupplierQueue(), 1400);
    } catch {
      showToast('Лист не відправлено: мережева помилка', 'error', 6000);
      advanceSupplierQueue();
    } finally {
      setSupplierQueueSending(false);
    }
  }

  async function refreshFulfillment(orderId: string) {
    setFulfillmentLoading(prev => new Set([...prev, orderId]));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`);
      const data = await res.json();
      setFulfillmentData(prev => ({ ...prev, [orderId]: data }));
    } finally {
      setFulfillmentLoading(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }

  /**
   * Зміна джерела в уже проведеному замовленні. Сервер перебудовує резерви й
   * ЗП постачальнику, тож надсилаємо повну картину по всіх позиціях, а не одну
   * зміну: інакше два швидкі перемикання дали б розбіжність.
   */
  async function applySourceChange(order: Order, sku: string, value: 'own' | 'dropship') {
    const key = `${order.id}:${sku}`;
    setSavingSource(key);
    try {
      const planItems = fulfillmentData[order.id]?.plan?.items ?? [];
      const overrides = { ...(sourceOverrides[order.id] ?? {}), [sku]: value };
      const sources: Record<string, 'own' | 'dropship'> = {};
      for (const it of (order.items ?? []) as OrderItem[]) {
        sources[it.sku] = overrides[it.sku]
          ?? (planItems.find(p => p.sku === it.sku)?.fulfillment_type ?? 'dropship');
      }

      const res = await fetch(`/api/admin/orders/${order.id}/fulfillment-source`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error ?? 'Не вдалось змінити джерело', 'error');
        // Відкочуємо локальний вибір — на сервері нічого не змінилось
        setSourceOverrides(prev => {
          const next = { ...(prev[order.id] ?? {}) };
          delete next[sku];
          return { ...prev, [order.id]: next };
        });
        return;
      }

      if (data.insufficient?.length) {
        const miss = data.insufficient.map((i: { sku: string; available: number; requested: number }) =>
          `${i.sku}: є ${i.available} з ${i.requested}`).join('; ');
        showToast(`Не вистачило на своєму складі — лишили за постачальником (${miss})`, 'error');
      } else {
        showToast('Джерело змінено', 'success');
      }
      await refreshFulfillment(order.id);
      router.refresh();
    } catch {
      showToast('Не вдалось змінити джерело', 'error');
    } finally {
      setSavingSource(null);
    }
  }

  async function reserveOrder(orderId: string) {
    const fi = fulfillmentData[orderId];
    if (!fi?.plan) return;
    setReserving(orderId);
    try {
      const overrides = sourceOverrides[orderId] ?? {};
      const ownItems = fi.plan.items
        .filter(src => (overrides[src.sku] ?? src.fulfillment_type) === 'own')
        .map(src => ({ sku: src.sku, warehouse_id: src.warehouse_id, qty: src.qty }));
      if (ownItems.length === 0) return;
      await fetch(`/api/admin/orders/${orderId}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ownItems }),
      });
      await refreshFulfillment(orderId);
    } finally {
      setReserving(null);
    }
  }

  // Merge orders
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [mergeModal,     setMergeModal]     = useState<Parameters<typeof CreateTTNModal>[0]['order'] | null>(null);

  // Auto-load fulfillment data when order is expanded
  useEffect(() => {
    if (expandedId) loadFulfillment(expandedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // Історія клієнта (скільки замовлень + сума, попередні замовлення, що з
  // поточного складу вже брав) — при розкритті
  const [custStats, setCustStats] = useState<Record<string, CustomerHistory>>({});
  const [histOpenId, setHistOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!expandedId || custStats[expandedId]) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${expandedId}/customer-orders`);
        if (res.ok) {
          const d = await res.json();
          setCustStats(prev => ({ ...prev, [expandedId]: {
            count: d.count ?? 0, total: d.total ?? 0, orders: d.orders ?? [], more: !!d.more, bought: d.bought ?? {},
          } }));
        }
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  /**
   * Копія замовлення: відкриваємо нову чернетку з тим самим клієнтом, доставкою
   * і складом, але цінами з каталогу на СЬОГОДНІ — суму рахуємо з БД, а не
   * переносимо збережену (див. lib/order-copy). Що не копіюється: номери й дані
   * кабінету маркетплейсу, ТТН, оплати, документи, промокод — усе це належить
   * конкретному замовленню, а не його змісту. Канал копії — «Роздріб»: назад у
   * кабінет Prom/Rozetka замовлення не заведеш.
   */
  const [copying, setCopying] = useState<string | null>(null);
  const copyOrder = useCallback(async (order: Order) => {
    setCopying(order.id);
    try {
      const items = (order.items ?? []) as OrderItem[];
      const skus = items.map(i => i.sku).filter(Boolean);
      let products: CopyProduct[] = [];
      if (skus.length) {
        const res = await fetch('/api/admin/products/search-skus', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus }),
        });
        if (res.ok) products = (await res.json()).products ?? [];
      }
      const tier = order.price_type || 'retail';
      const copy = buildCopyLines(items, products, tier);
      // Форма ручного замовлення знає лише свої словники доставки й оплати;
      // те, що в них не лягає (доставка Rozetka, картка, передоплата), дописуємо
      // в коментар, щоб менеджер бачив, як було в оригіналі.
      const dlv = mapCopyDelivery(order.delivery_type);
      const pay = mapCopyPayment(order.payment_type);
      const place = [order.delivery_city_name, order.delivery_address].filter(Boolean).join(' · ');
      // Підтип у БД буває 'address'/'doors' (Prom/Rozetka), а поштомат у Prom
      // видно лише з тексту адреси — форма ж знає тільки свої три вкладки.
      const novaSubtype = dlv.kept && dlv.delivery === 'nova'
        ? formNovaSubtype(order.delivery_subtype, order.delivery_address)
        : '';

      window.dispatchEvent(new CustomEvent('open-order-draft', {
        detail: {
          customerId:       order.customer_id,
          contact:          order.contact,
          phone:            order.phone,
          email:            order.email ?? '',
          company:          order.company ?? '',
          channelCode:      'retail',
          priceTier:        tier,
          delivery:         dlv.delivery,
          novaSubtype,
          // Ref міста/відділення в маркетплейсних замовленнях порожні — тоді
          // форма (NovaPoshtaSelect) підбирає їх за назвою міста і текстом адреси.
          novaCityRef:      dlv.kept ? (order.delivery_city_ref ?? '') : '',
          novaCityName:     dlv.kept ? (order.delivery_city_name ?? '') : '',
          novaWarehouseRef: dlv.kept ? (order.delivery_warehouse_ref ?? '') : '',
          address:          dlv.kept ? (order.delivery_address ?? '') : '',
          payment:          pay.payment,
          comment: copyComment(order.order_number, [
            dlv.kept ? null : `доставка в оригіналі: ${DELIVERY_LABEL[order.delivery_type] ?? order.delivery_type}${place ? `, ${place}` : ''}`,
            pay.kept ? null : `оплата в оригіналі: ${PAYMENT_LABEL[order.payment_type] ?? order.payment_type}`,
          ]),
          lines:            copy.lines.length ? copy.lines : undefined,
        },
      }));

      const note = describeCopy(copy);
      showToast(
        note ? `Копія №${order.order_number}: ${note}` : `Копія замовлення №${order.order_number}`,
        copy.missing.length ? 'warning' : 'success',
        copy.missing.length ? 6000 : 3500,
      );
    } catch {
      showToast('Не вдалося скопіювати замовлення', 'error');
    } finally {
      setCopying(null);
    }
  }, []);

  // Мініатюри фото і слаги товарів — підвантажуємо з products по SKU при розкритті
  useEffect(() => {
    if (!expandedId || itemProducts[expandedId]) return;
    const ord = orders.find(o => o.id === expandedId);
    const skus = ((ord?.items ?? []) as OrderItem[]).map(i => i.sku).filter(Boolean);
    if (skus.length === 0) return;
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from('products').select('sku, image, slug').in('sku', skus);
      const map: Record<string, { image: string | null; slug: string | null }> = {};
      (data ?? []).forEach((p: { sku: string; image: string | null; slug: string | null }) => {
        map[p.sku] = { image: p.image, slug: p.slug };
      });
      setItemProducts(prev => ({ ...prev, [expandedId]: map }));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // Розгорнутий запис завжди піднімаємо вгору: його ручка стає одразу під
  // липкою панеллю статусів, а сам запис займає екран (рішення власника
  // 17.10.2026). Інакше запис із середини екрана розкривався вниз, і де його
  // початок — доводилось шукати очима.
  useEffect(() => {
    if (!expandedId) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`order-${expandedId}`);
      if (!el) return;
      const bar = document.querySelector<HTMLElement>('.admin-status-bar');
      const barH = bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().height : 0;
      // Прокручуємо найближчий контейнер зі скролом (у шелі адмінки це не
      // вікно) своєю анімацією: вбудований smooth-скрол надто різкий і не
      // має тривалості, а тут потрібно плавно, ~700 мс.
      let box: HTMLElement | null = el.parentElement;
      while (box && box !== document.body) {
        const ov = getComputedStyle(box).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && box.scrollHeight > box.clientHeight) break;
        box = box.parentElement;
      }
      const scroller: HTMLElement = box && box !== document.body ? box : (document.scrollingElement as HTMLElement);
      const boxTop = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top;
      const from = scroller.scrollTop;
      const maxTop = scroller.scrollHeight - scroller.clientHeight;
      const to = Math.max(0, Math.min(maxTop, from + el.getBoundingClientRect().top - boxTop - barH - 4));
      if (Math.abs(to - from) < 2) return;
      const duration = 700;
      const t0 = performance.now();
      const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / duration);
        scroller.scrollTop = from + (to - from) * ease(p);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [expandedId]);

  // Відкриваємо замовлення з пропу expandOrderId (передається через ?expand= з page.tsx)
  useEffect(() => {
    if (expandOrderId) {
      setExpandedId(expandOrderId);
      loadLinkedPOs(expandOrderId);
      loadFulfillment(expandOrderId);
      setTimeout(() => {
        document.getElementById(`order-${expandOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandOrderId]);

  // Pre-load registry TTNs so the button and the green dot in the TTN chip show
  // correct state on mount. Три останні реєстри, не один: журнал показує
  // відправки за кілька днів, а реєстр НП створюється щодня — з одним листом
  // крапка «в реєстрі» зникала б у вчорашніх ТТН.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/registers');
        const data = await res.json();
        const sheets = (data.sheets ?? []).slice(0, 3);
        if (sheets.length === 0) return;
        // Послідовно, не Promise.all: НП ріже паралельний бурст запитів
        // («To many requests»), і прелоад мовчки повертав нуль ТТН.
        const ttns: string[] = [];
        for (const s of sheets as { Ref: string }[]) {
          try {
            const r = await fetch(`/api/admin/registers?ref=${s.Ref}`);
            const d = await r.json();
            ttns.push(...(d.ttns ?? []).map((t: { ttn: string }) => t.ttn));
          } catch { /* пропускаємо лист */ }
        }
        // Мердж, не заміна: частковий список не стирає вже відоме
        if (ttns.length > 0) setRegistryAdded(prev => new Set([...prev, ...ttns]));
      } catch { /* silent */ }
    })();

  }, []);

  async function openSupplierPO(order: Order) {
    setCreatingPo(order.id);
    try {
      // Fetch suppliers + fulfillment prices in parallel
      const [suppliers, fi] = await Promise.all([
        fetch('/api/admin/suppliers').then(r => r.json()),
        fulfillmentData[order.id]
          ? Promise.resolve(fulfillmentData[order.id])
          : fetch(`/api/admin/orders/${order.id}/fulfillment`).then(r => r.json()),
      ]);

      // Build cost-price map from fulfillment data
      const costMap: Record<string, number> = {};
      for (const group of fi?.by_supplier ?? []) {
        for (const item of group.items ?? []) {
          if (item.sku && item.cost_price > 0) costMap[item.sku] = item.cost_price;
        }
      }

      const lines = order.items.map(i => ({
        sku: i.sku,
        name: itemTitle(i),
        qty: i.qty,
        cost_price: costMap[i.sku] ?? 0,
        matched: !!costMap[i.sku],
      }));

      window.dispatchEvent(new CustomEvent('open-po-draft', {
        detail: {
          suppliers,
          prefill: {
            lines,
            notes:   `Замовлення покупця №${order.order_number}`,
            orderId: order.id,
          },
        },
      }));
    } finally {
      setCreatingPo(null);
    }
  }

  // Кнопки «Синхронізувати НП» (і фонового автосинку раз на 4 години) тут більше
  // немає: рух посилок і проводки при доставці веде крон (vercel.json →
  // /api/cron/sync-delivery-status). Ручний вхід був другою копією тієї ж логіки,
  // яка відстала й ставила замовленням «Доставлено» без проведення видаткової.

  // Скасування Rozetka-замовлення вимагає причини (статус 13 «Скасовано
  // адміністратором» продавцю недоступний) — перехоплюємо і питаємо менеджера.
  const [rozCancelFor, setRozCancelFor] = useState<string | null>(null);

  async function changeStatus(id: string, status: string, rozetkaCancelReason?: number) {
    const order = orders.find(o => o.id === id);
    if (status === 'cancelled' && order?.channel_code === 'rozetka' && order.rozetka_order_id && rozetkaCancelReason === undefined) {
      setRozCancelFor(id); // відкриваємо вибір причини; PATCH піде після вибору
      return;
    }
    setLoading(id + status);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(rozetkaCancelReason !== undefined ? { rozetka_cancel_reason: rozetkaCancelReason } : {}) }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } else {
      // Відмову сервера (нема РН для «Відправлено», кредитний ліміт, права) треба
      // показати: селект мовчки повертався на старий статус, і менеджер не розумів, чому.
      const data = await res.json().catch(() => ({})) as { error?: string };
      showToast(data.error ?? `Статус не змінено (${res.status})`, 'error', 8000);
    }
    setLoading(null);
  }

  function openEditDelivery(order: Order) {
    setEditDeliveryForm({
      type:     order.delivery_type ?? 'nova',
      subtype:  order.delivery_subtype ?? 'warehouse',
      cityName: order.delivery_city_name ?? '',
      address:  order.delivery_address ?? '',
    });
    setEditDeliveryId(order.id);
  }

  async function saveDelivery(orderId: string) {
    setSavingDelivery(true);
    const f = editDeliveryForm;
    const body: Record<string, unknown> = {
      delivery_type:    f.type,
      // Підтип (відділення/кур'єр) є лише в НП: у ROZETKA Доставці двері поки
      // не ввімкнені, там завжди точка видачі.
      delivery_subtype: f.type === 'nova' ? f.subtype : null,
      delivery_city_name: DELIVERY_NEEDS_CITY.includes(f.type) ? f.cityName || null : null,
      delivery_address:   DELIVERY_NEEDS_CITY.includes(f.type) || f.type === 'kharkiv' ? f.address || null : null,
    };
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        delivery_type:    f.type,
        delivery_subtype: f.type === 'nova' ? f.subtype : null,
        delivery_city_name: DELIVERY_NEEDS_CITY.includes(f.type) ? f.cityName || null : null,
        delivery_address:   f.address || null,
      } : o));
      setEditDeliveryId(null);
    }
    setSavingDelivery(false);
  }

  async function savePaymentType(orderId: string, newType: string) {
    setSavingPaymentType(true);
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_type: newType }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        payment_type: newType,
        payment_due_date: newType === 'deferred' ? (data.payment_due_date ?? o.payment_due_date) : null,
      } : o));
      setEditPaymentTypeId(null);
    }
    setSavingPaymentType(false);
  }

  async function autoShipDropship(orderId: string, redirect = false) {
    const res = await fetch(`/api/admin/orders/${orderId}/ship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(redirect ? { redirect: true } : {}),
    });
    const data = await res.json();
    if (!res.ok && data.ttn_conflict && !redirect) {
      if (confirm(`${data.error}\n\nЦе переадресація тієї самої посилки з #${data.ttn_conflict.order_number}?`)) {
        return autoShipDropship(orderId, true);
      }
      return;
    }
    if (res.ok) {
      if (data.redirect_warning) showToast(data.redirect_warning, 'error', 12000);
      if (data.fully_shipped) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'shipped' } : o));
        // Як і в ручній відгрузці: згорнути картку, бо рядок зараз поїде з вкладки
        setExpandedId(prev => prev === orderId ? null : prev);
        // Список вкладки й лічильники статусів приходять із сервера: без цього
        // відвантажене замовлення лишалося у «Підтверджених» до перезавантаження,
        // а в «До відправки» з'являлося лише після F5 (як і після підтвердження).
        router.refresh();
      }
      if (data.sale_doc_id) {
        setSaleDocMap(prev => ({
          ...prev,
          [orderId]: [...(prev[orderId] ?? []), { id: data.sale_doc_id, number: data.sale_doc_number ?? '', status: 'draft' }],
        }));
        if (data.shipped_items) {
          setShippedQtyMap(prev => {
            const cur = { ...(prev[orderId] ?? {}) };
            for (const it of data.shipped_items as { sku: string; qty: number }[]) cur[it.sku] = (cur[it.sku] ?? 0) + it.qty;
            return { ...prev, [orderId]: cur };
          });
        }
        showToast(`Відвантажено · ${data.sale_doc_number ?? 'ВН створено'}`, 'success', 5000);
      } else {
        showToast('Відвантажено', 'success');
      }
    } else {
      showToast(data.error ?? 'Помилка відвантаження', 'error');
    }
  }

  function shipOrder(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const shippedQty = shippedQtyMap[orderId] ?? {};
    const modalItems = (order.items as OrderItem[]).map(item => ({
      sku:        item.sku,
      name:       item.name,
      brand:      (item as OrderItem & { brand?: string }).brand ?? '',
      orderQty:   item.qty,
      shippedQty: shippedQty[item.sku] ?? 0,
      shipQty:    Math.max(0, item.qty - (shippedQty[item.sku] ?? 0)),
    })).filter(i => i.shipQty > 0);
    if (modalItems.length === 0) {
      showToast('Всі позиції вже відвантажені', 'info');
      return;
    }
    setShipModal({
      orderId,
      items:  modalItems,
      ttn:    order.tracking_number ?? '',
      isProm: order.channel_code === 'prom',
    });
  }

  async function executeShip(orderId: string, items: { sku: string; shipQty: number }[], ttn?: string, redirect = false) {
    setShipModal(null);
    setShipping(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ sku: i.sku, qty: i.shipQty })),
          ...(ttn ? { ttn } : {}),
          ...(redirect ? { redirect: true } : {}),
        }),
      });
      const data = await res.json();
      // ЕН уже в іншому замовленні: сервер відмовив, бо без підтвердження це
      // подвійний борг перед постачальником. Переадресація тієї самої посилки —
      // підтверджуємо, і борг переноситься зі старого замовлення.
      if (!res.ok && data.ttn_conflict && !redirect) {
        if (confirm(`${data.error}\n\nЦе переадресація тієї самої посилки з #${data.ttn_conflict.order_number}?`)) {
          return executeShip(orderId, items, ttn, true);
        }
        return;
      }
      if (res.ok) {
        if (data.redirect_warning) showToast(data.redirect_warning, 'error', 12000);
        if (data.fully_shipped) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: data.status } : o));
          setExpandedId(null);
          setFlashId(orderId);
          setTimeout(() => setFlashId(null), 1800);
          // Перечитати вкладку з сервера — інакше замовлення лишається в поточній
          // вкладці, а «До відправки» його не бачить до перезавантаження.
          router.refresh();
        }
        if (data.sale_doc_id) {
          setSaleDocMap(prev => ({
            ...prev,
            [orderId]: [...(prev[orderId] ?? []), { id: data.sale_doc_id, number: data.sale_doc_number ?? '', status: 'draft' }],
          }));
        }
        if (data.shipped_items) {
          setShippedQtyMap(prev => {
            const cur = { ...(prev[orderId] ?? {}) };
            for (const it of data.shipped_items as { sku: string; qty: number }[]) cur[it.sku] = (cur[it.sku] ?? 0) + it.qty;
            return { ...prev, [orderId]: cur };
          });
        }
        showToast(
          data.fully_shipped
            ? `✅ Відвантажено · ${data.sale_doc_number}`
            : `📦 Частково відвантажено · ${data.sale_doc_number}`,
          'success', 6000,
        );
        // Rozetka не пускає замовлення далі «в обробці» без номера накладної.
        // Кажемо про це одразу після відгрузки: менеджер ще тут і може внести
        // ТТН, інакше кабінет висітиме «обробляється», поки не спитає покупець.
        if (data.rozetka_warning) showToast(data.rozetka_warning, 'error', 12000);
      } else {
        showToast(data.error ?? 'Помилка відвантаження', 'error');
      }
    } finally {
      setShipping(null);
    }
  }

  // Product search for add-item
  useEffect(() => {
    if (prodSearch.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from('products')
        .select('sku, name, brand, stock:product_stock(price_unit)')
        .or(`name.ilike.%${prodSearch}%,sku.ilike.%${prodSearch}%`)
        .limit(6);
      setProdResults((data ?? []).map((p: { sku: string; name: string; brand: string; stock: { price_unit: number }[] | null }) => ({
        sku: p.sku, name: p.name, brand: p.brand,
        price: p.stock?.[0]?.price_unit ?? 0,
      })));
      setProdOpen(true);
    }, 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setProdOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function startEdit(order: Order) {
    setEditingId(order.id);
    setEditItems(order.items.map(i => ({ ...i })));
    setAddName(''); setAddQty(1); setAddPrice(''); setAddSku(''); setProdSearch('');
  }

  async function saveEdit(orderId: string) {
    setEditSaving(true);
    const total = editItems.reduce((s, i) => s + i.price * i.qty, 0);
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: editItems, total_price: total }),
    });
    const d = await res.json().catch(() => ({}));

    // Правка складу зачіпає облік — сервер може її і не пропустити (проведена
    // РН, закритий період). Тоді нічого не змінилось, і показувати новий склад
    // у списку не можна: менеджер вирішить, що зберіг.
    if (!res.ok || d?.error) {
      setEditWarnings(prev => ({ ...prev, [orderId]: [d?.error ?? 'Не вдалося зберегти зміни'] }));
      setEditSaving(false);
      return;
    }

    setEditWarnings(prev => {
      const next = { ...prev };
      if (Array.isArray(d?.warnings) && d.warnings.length) next[orderId] = d.warnings as string[];
      else delete next[orderId];
      return next;
    });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: editItems, total_price: total } : o));
    setEditingId(null);
    setEditSaving(false);
  }

  function addItem() {
    if (!addName.trim() || addQty < 1) return;
    setEditItems(prev => [
      ...prev,
      { sku: addSku || `MANUAL-${Date.now()}`, name: addName.trim(), brand: '', qty: addQty, price: parseFloat(addPrice) || 0 },
    ]);
    setAddName(''); setAddQty(1); setAddPrice(''); setAddSku(''); setProdSearch('');
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /**
   * Накладна створена — одразу віддаємо номер у кабінет Rozetka.
   *
   * Раніше ТТН їхала туди лише в момент «Відправити», тож між створенням
   * накладної й відправкою кабінет про посилку не знав нічого: живий випадок
   * 03.08 — два об'єднані замовлення отримали спільний номер, а в кабінеті
   * обидва так і висіли «Обробляється менеджером» без ТТН.
   *
   * Помилку показуємо, а не ховаємо в консоль: якщо номер не пішов, менеджер
   * має дізнатися про це зараз, а не з претензії покупця.
   */
  async function pushTtnToRozetka(ids: string[]) {
    const targets = orders.filter(o => ids.includes(o.id) && o.channel_code === 'rozetka' && o.rozetka_order_id);
    if (!targets.length) return;
    const failures = (await Promise.all(targets.map(async o => {
      try {
        const res = await fetch(`/api/admin/orders/${o.id}/push-rozetka-ttn`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        return res.ok && !data.error ? null : `№${o.order_number}: ${data.error ?? res.status}`;
      } catch (err) {
        return `№${o.order_number}: ${err instanceof Error ? err.message : 'збій мережі'}`;
      }
    }))).filter(Boolean) as string[];

    if (failures.length) showToast(`ТТН не передано в Rozetka — ${failures.join('; ')}`, 'error');
    else showToast(targets.length > 1 ? `ТТН передано в Rozetka (${targets.length} замовлення)` : 'ТТН передано в Rozetka', 'success');
  }

  /**
   * Що робиться після створення накладної — однаково для одного замовлення і
   * для об'єднаної посилки.
   *
   * Раніше цей хвіст існував лише в гілці одиночного замовлення, а об'єднання
   * його не мало зовсім. Через це два об'єднані замовлення на постачальника
   * (03.08, №26081001 і №26081002) лишилися в «Підтверджено» замість того, щоб
   * відвантажитись самі, як робить будь-яке одиночне замовлення в тому ж режимі.
   *
   * Порядок важливий: у режимі «постачальник» відвантаження саме пушить статус
   * і ТТН у маркетплейс, тож окремий пуш там був би другим поспіль — і Rozetka
   * відповіла б на нього відмовою переходу.
   */
  /**
   * Що робимо, коли в замовлення з'явилась ТТН (або коли воно нарешті
   * підтверджене, а ТТН уже була). Дві дії: дропшип-замовлення відвантажуємо,
   * решті доносимо номер у маркетплейс.
   *
   * Приймає САМЕ об'єкт замовлення, а не id: після підтвердження статус у
   * стані ще старий, і функція, що читає його зі списку, вирішувала б за
   * застарілими даними — замовлення так і лишалось у «Підтверджено» замість
   * «До відправки».
   */
  async function ttnFollowUp(o: Order, source: TtnSource = 'api') {
    // Саме рішення — чиста функція під тестами (lib/orders/ttn-followup):
    // «уже відвантажене повторно не відвантажуємо», «нове — не пушимо в МП»,
    // «точку видачі Rozetka не пушимо їй же назад, якщо номер виписали ми самі»
    // перевіряються там.
    switch (ttnFollowUpAction(o, source)) {
      case 'ship':
        await autoShipDropship(o.id);   // всередині — і статус, і пуш у маркетплейс
        return;
      case 'push-rozetka':
        await pushTtnToRozetka([o.id]);
        return;
      case 'push-prom':
        try {
          const res = await fetch(`/api/admin/orders/${o.id}/push-prom-ttn`, { method: 'POST' });
          const d = await res.json().catch(() => ({}));
          showToast(d.ok ? 'ТТН надіслано на Prom' : `Prom TTN: ${d.error ?? 'помилка'}`, d.ok ? 'success' : 'error');
        } catch {
          showToast('Не вдалося надіслати ТТН на Prom', 'error');
        }
        return;
      case 'push-epicentr':
        try {
          const res = await fetch(`/api/admin/orders/${o.id}/push-epicentr-ttn`, { method: 'POST' });
          const d = await res.json().catch(() => ({}));
          showToast(d.ok ? 'ТТН надіслано в Епіцентр' : `Епіцентр TTN: ${d.error ?? 'помилка'}`, d.ok ? 'success' : 'error');
        } catch {
          showToast('Не вдалося надіслати ТТН в Епіцентр', 'error');
        }
        return;
      default:
        return;
    }
  }

  async function finishTtnFlow(ids: string[], source: TtnSource = 'api') {
    for (const o of orders.filter(o => ids.includes(o.id))) await ttnFollowUp(o, source);
  }

  function openMergeModal() {
    const sel = orders.filter(o => selectedIds.has(o.id));
    if (sel.length < 2) return;
    // Яким перевізником і чи взагалі можна — чиста функція під тестами
    // (lib/orders/merge-ttn): одна точка, один покупець, жодне ще без накладної.
    const plan = planMergeTtn(sel);
    if (!plan.ok) { showToast(plan.error, 'error'); return; }
    if (plan.kind !== 'nova') {
      // Обидва потоки Rozetka: те саме вікно, що для одиночного замовлення, але
      // з сумарними позиціями (вага) і списком замовлень для роуту.
      setRzMergeGroup(sel);
      if (plan.kind === 'rozetka_delivery') setRzTtnModal(sel[0]);
      else setRzOwnTtnModal(sel[0]);
      return;
    }
    const primary = sel[0];
    const mergedItems = sel.flatMap(o => o.items);
    const totalPrice = sel.reduce((s, o) => s + o.total_price, 0);
    const totalQty   = sel.reduce((s, o) => s + o.items.reduce((sq, i) => sq + i.qty, 0), 0);
    setMergeModal({
      id: primary.id,
      mergedIds: sel.map(o => o.id),
      contact: primary.contact,
      phone: primary.phone,
      total_price: totalPrice,
      payment_type: primary.payment_type,
      total_qty: totalQty,
      items: mergedItems.map(i => ({ sku: i.sku, qty: i.qty, name: i.name })),
      delivery_city_ref: primary.delivery_city_ref,
      delivery_city_name: primary.delivery_city_name,
      delivery_warehouse_ref: primary.delivery_warehouse_ref,
      delivery_subtype: primary.delivery_subtype,
      delivery_address: primary.delivery_address,
      customer_id: primary.customer_id,
      invoice_as_company: primary.invoice_as_company,
    });
  }

  async function toggleFlag(id: string, field: 'payment_confirmed' | 'callback_done' | 'invoice_as_company', value: boolean) {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  }

  // Швидкі прапорці замовлення (Терміново / Проблемний) — зберігаються в orders.flags
  async function toggleOrderFlag(id: string, flag: string) {
    const cur = orders.find(o => o.id === id)?.flags ?? [];
    const next = cur.includes(flag) ? cur.filter(f => f !== flag) : [...cur, flag];
    setOrders(prev => prev.map(o => o.id === id ? { ...o, flags: next } : o));
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: next }),
    });
  }

  // ── Відмова від посилки (НП) ────────────────────────────────────────────────
  // Скасоване замовлення з "Відмова від отримання" у статусі перевізника = посилка
  // їде назад. Рішення менеджера зберігаємо у flags: return_received (забрав) /
  // return_abandoned (не забираю — коли повернення дорожче за товар).
  // Ознака «посилка десь є і з нею треба щось робити»: замовлення скасоване, але
  // перевізник ВЖЕ прийняв відправлення (carrier_accepted_at). Джерело скасування
  // неважливе — відмова на пошті, скасування покупцем у кабінеті МП чи наше рішення:
  // фізично посилка їде назад у будь-якому разі. Раніше тут шукали слово «відмова»
  // в статусі НП — і кейс #26071023 (скасування прийшло з кабінету Rozetka, а текст
  // НП завмер на «Прибув у відділення») не підсвічувався взагалі.
  const isReturnPending = (o: Order) =>
    (o.status === 'cancelled' && !!o.carrier_accepted_at)
    || !!o.np_return_ref || !!o.np_return_tracking;
  const returnState = (o: Order): 'received' | 'abandoned' | null =>
    (o.flags ?? []).includes('return_received') ? 'received'
    : (o.flags ?? []).includes('return_abandoned') ? 'abandoned'
    : null;
  async function setReturnState(id: string, state: 'received' | 'abandoned' | null) {
    const cur = orders.find(o => o.id === id)?.flags ?? [];
    const base = cur.filter(f => f !== 'return_received' && f !== 'return_abandoned');
    const next = state ? [...base, `return_${state}`] : base;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, flags: next } : o));
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: next }),
    });
  }

  // Внутрішня нотатка менеджера — зберігаємо по blur
  const [noteSaving, setNoteSaving] = useState<string | null>(null);
  async function saveInternalNote(id: string, note: string) {
    setNoteSaving(id);
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_note: note }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, internal_note: note || null } : o));
    setNoteSaving(null);
  }

  async function saveTTN(id: string) {
    setTtnSaving(id);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: ttnValues[id] || null }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, tracking_number: ttnValues[id] || null } : o));
      // Той самий хвіст, що й після створення накладної: номер, введений руками,
      // нічим не гірший за згенерований. Тут теж був перекіс — Rozetka чекала
      // status === 'shipped', тобто ТТН, вписана в підтверджене замовлення,
      // у кабінет не йшла зовсім.
      // 'manual': номер вписали руками. Для точки видачі Rozetka це єдиний
      // випадок, коли номер треба донести в кабінет — накладну виписали не ми.
      if (ttnValues[id]) await finishTtnFlow([id], 'manual');
    } else {
      // Раніше відмова сервера губилась мовчки: поле лишалось із номером,
      // а в базі його не було — менеджер дізнавався про це вже від покупця.
      const d = await res.json().catch(() => ({}));
      showToast(`Не вдалося зберегти номер: ${d.error ?? res.status}`, 'error');
    }
    setTtnSaving(null);
  }

  /**
   * Заміна номера у вже виписаній накладній. Окремо від saveTTN, бо це інша
   * операція: разом із номером сервер скидає стан старої посилки (статус
   * перевізника, приймання, дату відправки) і переписує номер у непроведеній РН.
   * Стару накладну в НП це не чіпає — якщо вона жива, її треба видалити кошиком
   * до заміни, інакше в кабінеті лишиться зайва посилка.
   */
  async function replaceTTN(id: string) {
    const order = orders.find(o => o.id === id);
    const next = (ttnValues[id] ?? '').trim();
    if (!order || !next) return;
    const ok = await showConfirm(
      `Замінити ТТН ${order.tracking_number} → ${next}?\n\n` +
      'Статус перевізника і дата відправки будуть скинуті під нову посилку, номер оновиться в накладній обліку та поїде в кабінет маркетплейсу.\n\n' +
      'Стару накладну в Новій Пошті це НЕ видаляє.',
      { confirmLabel: 'Замінити' },
    );
    if (!ok) return;

    setTtnSaving(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/replace-ttn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttn: next }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(`Помилка: ${data.error}`); return; }
      setOrders(prev => prev.map(o => o.id === id
        ? { ...o, tracking_number: next, carrier_status_text: null, carrier_accepted_at: null }
        : o));
      showToast(data.pushErrors?.length
        ? `ТТН замінено, але кабінет не оновився: ${data.pushErrors.join('; ')}`
        : 'ТТН замінено і передано в кабінет');
    } finally {
      setTtnSaving(null);
    }
  }

  /** Спільний крок обох шляхів (одиночного і масового): якщо за сьогодні вже є
   *  реєстри — відкриваємо вибір «в існуючий чи новий», інакше одразу створюємо
   *  новий. Живий випадок: друге додавання за день мовчки плодило другий реєстр. */
  async function openRegistryPicker(items: { orderId: string; ttn: string; orderNumber: number }[]) {
    if (items.length === 0) return;
    let sheets: { Ref: string; Number: string; DateTime: string; Count?: string; Printed?: string }[] = [];
    try {
      const res = await fetch('/api/admin/registers');
      const data = await res.json();
      const now = new Date();
      const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      // Лише сьогоднішні і не роздруковані: у закритий реєстр НП вставку відхилить
      sheets = (data.sheets ?? []).filter((s: { DateTime?: string; Printed?: string }) =>
        String(s.DateTime ?? '').startsWith(ymd) && String(s.Printed ?? '0') !== '1');
    } catch { /* список не отримали — просто створимо новий */ }
    if (sheets.length === 0) { await runRegistryAdd(items, null); return; }
    setRegistryPick({ items, sheets });
  }

  /** Додавання ТТН у реєстр НП: ref — обраний реєстр, null — створити новий
   *  (перший успішний POST створює реєстр і повертає ref, який протягуємо на
   *  решту, інакше кожен POST плодив би свій). */
  async function runRegistryAdd(items: { orderId: string; ttn: string; orderNumber: number }[], ref: string | null) {
    setRegistryPick(null);
    if (items.length === 1) setRegistryAdding(items[0].orderId); else setRegistryBulkLoading(true);

    const added: string[] = [];
    const errors: string[] = [];
    for (const it of items) {
      try {
        const res = await fetch('/api/admin/registers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttnNumber: it.ttn, registerRef: ref }),
        });
        const data: { ref?: string; error?: string } = await res.json().catch(() => ({}));
        if (res.ok) {
          added.push(it.ttn);
          if (!ref && data.ref) ref = data.ref;
        } else {
          errors.push(`#${it.orderNumber}: ${data.error ?? res.status}`);
        }
      } catch { errors.push(`#${it.orderNumber}: мережа`); }
    }
    if (added.length) setRegistryAdded(prev => new Set([...prev, ...added]));
    if (added.length && ref) setNpSheetRef(ref);
    setRegistryAdding(null);
    setRegistryBulkLoading(false);
    if (errors.length) showToast(`Додано в реєстр: ${added.length}. Не вдалося: ${errors.length} — ${errors.join('; ')}`, 'error', 8000);
    else if (added.length) showToast(`Додано в реєстр: ${added.length}`, 'success');
    // Групове додавання з панелі виділення (усі позиції — з виділених): після
    // успіху панель закривається. Одиночне з рядка виділення не чіпає.
    const fromBulk = items.length > 1 || (items.length === 1 && selectedIds.has(items[0].orderId) && selectedIds.size === 1);
    if (fromBulk && added.length && !errors.length) setSelectedIds(new Set());
  }

  /** Друк реєстру НП офіційною формою (як з кабінету). Після друку НП закриває
   *  реєстр для нових ЕН — тому спершу «Додати в реєстр», потім друк. */
  async function printNpRegistry() {
    setNpSheetPrinting(true);
    try {
      let ref = npSheetRef;
      if (!ref) {
        const res = await fetch('/api/admin/registers');
        const data = await res.json().catch(() => ({}));
        const now = new Date();
        const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const today = ((data.sheets ?? []) as { Ref: string; DateTime?: string }[])
          .filter(s => String(s.DateTime ?? '').startsWith(ymd))
          .sort((a, b) => String(b.DateTime).localeCompare(String(a.DateTime)));
        ref = today[0]?.Ref ?? null;
      }
      if (!ref) { showToast('За сьогодні реєстру НП ще немає — спершу додайте ЕН у реєстр', 'error'); return; }
      window.open(`/api/admin/registers/${ref}/pdf`, '_blank');
      showToast('Реєстр НП відкрито для друку', 'success');
      setSelectedIds(new Set());
    } finally {
      setNpSheetPrinting(false);
    }
  }

  async function addToRegistry(orderId: string, ttn: string) {
    if (registryAdded.has(ttn)) return;
    const order = orders.find(o => o.id === orderId);
    await openRegistryPicker([{ orderId, ttn, orderNumber: order?.order_number ?? 0 }]);
  }

  // Групове додавання виділених замовлень у реєстр НП (по їх ТТН, які ще не в реєстрі)
  async function bulkAddToRegistry() {
    const sel = orders.filter(o => selectedIds.has(o.id) && o.tracking_number && !registryAdded.has(o.tracking_number));
    await openRegistryPicker(sel.map(o => ({ orderId: o.id, ttn: o.tracking_number!, orderNumber: o.order_number })));
  }

  /**
   * Етикетка PDF по накладній: всі перевізники віддають base64 через `?label=1`
   * на своєму роуті — 'ttn' (НП, маркування 100×100), 'rz-ttn' (власний договір
   * rz-delivery), 'rozetka-delivery-ttn' (МП-накладні в точки видачі, RMP-…).
   * PDF розгортаємо в blob і відкриваємо у вкладці: data:-URL на PDF Chrome
   * блокує, а зберігати файл на диск заради одного друку зайве.
   */
  async function printLabel(id: string, path: 'ttn' | 'rz-ttn' | 'rozetka-delivery-ttn') {
    setRzLabelBusy(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/${path}?label=1`);
      const data = await res.json();
      if (!res.ok || !data.label) { showToast(data.error ?? 'Не вдалося отримати етикетку', 'error'); return; }
      openPdfBase64(data.label);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Збій мережі', 'error');
    } finally {
      setRzLabelBusy(null);
    }
  }

  /**
   * Групова печатка етикеток по виділених замовленнях: сервер збирає PDF-и всіх
   * трьох перевізників (НП + обидва типи Rozetka) і склеює в один документ —
   * одна вкладка, один друк. Замовлення без накладної просто пропускаються.
   */
  async function bulkPrintLabels() {
    const ids = orders.filter(o => selectedIds.has(o.id) && o.tracking_number).map(o => o.id);
    if (!ids.length) return;
    setBulkPrinting(true);
    try {
      const res = await fetch('/api/admin/orders/print-labels', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: ids }),
      });
      const data = await res.json();
      if (!res.ok || !data.label) { showToast(data.error ?? 'Не вдалося отримати етикетки', 'error', 6000); return; }
      openPdfBase64(data.label);
      const errs = (data.errors as string[] | undefined) ?? [];
      if (errs.length) showToast(`Частина етикеток не надрукована — ${errs.join('; ')}`, 'error', 8000);
      else { showToast(`Етикетки відкрито: ${ids.length}`, 'success'); setSelectedIds(new Set()); }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Збій мережі', 'error');
    } finally {
      setBulkPrinting(false);
    }
  }

  /** PDF з base64 у нову вкладку: data:-URL на PDF Chrome блокує. */
  function openPdfBase64(b64: string) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Додати ЕН у сьогоднішній реєстр (сервер сам створить його за потреби). */
  async function addRzToReception(orderId: string) {
    setRzRegBusy(orderId);
    try {
      const res = await fetch('/api/admin/rz-delivery/reception', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: [orderId] }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { showToast(d.error ?? 'Не вдалося додати в реєстр', 'error', 6000); return; }
      setRzReception(d.receptionId);
      const rejected = (d.rejected as string[] | undefined)?.length ?? 0;
      showToast(
        rejected
          ? `Реєстр №${d.receptionId}: додано ${d.added}, відхилено ${rejected}`
          : `Додано в реєстр №${d.receptionId}`,
        rejected ? 'error' : 'success', 5000,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Збій мережі', 'error');
    } finally {
      setRzRegBusy(null);
    }
  }

  /**
   * Заборона видачі: посилка вже в дорозі/в точці, а замовлення не потрібне.
   * Статус замовлення не чіпаємо — рух назад веде крон доставки.
   */
  async function returnRzTrack(orderId: string) {
    const reason = prompt('Причина повернення (побачить Rozetka):', 'Замовлення скасовано покупцем');
    if (!reason?.trim()) return;
    setRzRegBusy(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/rz-return`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { showToast(d.error ?? 'Не вдалося оформити повернення', 'error', 6000); return; }
      showToast('Повернення оформлено — рух посилки підхопить синк', 'success', 5000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Збій мережі', 'error');
    } finally {
      setRzRegBusy(null);
    }
  }

  /** Друкована форма реєстру: API віддає або base64, або посилання. */
  async function printRzReception(id: number) {
    try {
      const res = await fetch(`/api/admin/rz-delivery/reception?print=${id}`);
      const d = await res.json();
      if (!res.ok || d.error) { showToast(d.error ?? 'Не вдалося отримати реєстр', 'error', 6000); return; }
      if (d.base64) openPdfBase64(d.base64);
      else if (d.url) window.open(d.url, '_blank');
      else showToast('Rozetka не повернула документ реєстру', 'error');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Збій мережі', 'error');
    }
  }

  /**
   * Видалення ЕН «ROZETKA Доставки». На відміну від НП-кнопки, номер із
   * замовлення прибирає СЕРВЕР і лише коли накладної в Rozetka справді не
   * стало — тому тут просто відображаємо результат, а не чистимо наперед.
   */
  async function deleteRzTtn(id: string) {
    if (!confirm('Видалити ЕН у Rozetka і прибрати номер із замовлення?')) return;
    setTtnDeleting(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/rz-ttn`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || data.error) { showToast(data.error ?? 'Не вдалося видалити ЕН', 'error', 6000); return; }
      setOrders(prev => prev.map(o => o.id === id ? { ...o, tracking_number: null } : o));
      setTtnValues(prev => { const n = { ...prev }; delete n[id]; return n; });
      showToast('ЕН видалена', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Збій мережі', 'error');
    } finally {
      setTtnDeleting(null);
    }
  }

  async function deleteTTN(id: string) {
    if (!confirm('Видалити ТТН з бази та з кабінету Нової Пошти?')) return;
    setTtnDeleting(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/ttn`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, tracking_number: null } : o));
        setTtnValues(prev => { const n = { ...prev }; delete n[id]; return n; });
        if (data.np_error) alert(`ТТН видалено з бази, але помилка в НП: ${data.np_error}`);
      } else {
        alert(`Помилка: ${data.error}`);
      }
    } finally {
      setTtnDeleting(null);
    }
  }

  /**
   * Об'єднані замовлення — ті, що їдуть однією посилкою. Окремої колонки в базі
   * немає й не треба: ознака об'єднання — це і є спільна накладна, її прописує
   * модалка створення ТТН усім вибраним замовленням. Без цієї підказки два
   * однакові номери в довгому списку оком не зловиш, і легко відвантажити одне
   * з двох, а друге забути.
   */
  const mergedByTtn = useMemo(() => {
    const byTtn = new Map<string, number[]>();
    for (const o of orders) {
      if (!o.tracking_number) continue;
      const a = byTtn.get(o.tracking_number) ?? [];
      a.push(o.order_number);
      byTtn.set(o.tracking_number, a);
    }
    for (const [ttn, nums] of byTtn) if (nums.length < 2) byTtn.delete(ttn);
    return byTtn;
  }, [orders]);

  /**
   * Кандидати на одну ТТН: ще не відправлені замовлення одного покупця тим самим
   * способом доставки (lib/orders/merge-ttn → sameBuyerGroups). Мітка під номером
   * не дає відправити двома посилками те, що їде однією; клік по ній вибирає всю
   * групу — далі «Об'єднати» в панелі масових дій.
   */
  const sameBuyer = useMemo(() => sameBuyerGroups(orders), [orders]);

  // Пошук, канал і перевізник уже відфільтровані базою (див. applyOrderFilters
  // у app/admin/page.tsx). Тут лишається тільки те, що рахується з rozetka_data
  // у браузері й колонки в базі не має.
  // Сьогоднішня дата за Києвом — саме за нею в шапці рядка вирішується, показати
  // час чи день з місяцем. Рахуємо через toLocaleDateString('sv-SE') з явним
  // поясом: на сервері (UTC) і в браузері (Київ) інакше вийшли б різні рядки і
  // React лаявся б на розбіжність розмітки.
  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });

  const filtered = cabinetAheadOnly
    ? orders.filter(o => rozetkaCabinet(o)?.ahead)
    : orders;

  return {
    currentPage,
    totalPages,
    hasRecentReceipts,
    dateFrom,
    dateTo,
    statusCounts,
    currentStatus,
    initialSearch,
    channelFilter,
    carrierFilter,
    payFilter,
    retFilter,
    sentFilter,
    sentCounts,
    pendingReturns,
    channelCounts,
    carrierCounts,
    payCounts,
    totalFound,
    summaryAmount,
    productThumbs,
    sortBy,
    sortDir,
    promCommissionPct,
    rozetkaCommissionPct,
    feeTariffs,
    initialReturnDocs,
    initialSettlement,
    isAdmin,
    router,
    searchParams,
    pageHref,
    orders,
    setOrders,
    suppliersList,
    returnFor,
    setReturnFor,
    npReturnFor,
    setNpReturnFor,
    PRICE_TYPE_LABELS,
    changePriceType,
    applyDiscount,
    setShippingSupplier,
    cabinetAheadOnly,
    setCabinetAheadOnly,
    hdrMenu,
    setHdrMenu,
    grpOpen,
    toggleGroup,
    searchInput,
    setSearchInput,
    searchInputRef,
    searchBoxRef,
    searchHint,
    pushFilters,
    pushSearch,
    loading,
    ttnValues,
    setTtnValues,
    ttnSaving,
    ttnDeleting,
    registryAdding,
    registryAdded,
    registryBulkLoading,
    npSheetPrinting,
    registryPick,
    setRegistryPick,
    invoiceCfg,
    setInvoiceCfg,
    supplierQueue,
    setSupplierQueue,
    supplierQueueIdx,
    supplierQueueLoading,
    supplierQueueSending,
    supplierQueueDone,
    bulkGroups,
    setBulkGroups,
    bulkOrderIds,
    bulkComment,
    setBulkComment,
    bulkSending,
    bulkResults,
    senders,
    chosenSender,
    setChosenSender,
    ttnModalOrder,
    setTtnModalOrder,
    rzTtnModal,
    setRzTtnModal,
    ttnDetailsFor,
    setTtnDetailsFor,
    rzOwnTtnModal,
    setRzOwnTtnModal,
    rzMergeGroup,
    setRzMergeGroup,
    rzLabelBusy,
    bulkPrinting,
    rzRegBusy,
    rzReception,
    creatingPo,
    expandedId,
    setExpandedId,
    flashId,
    sourceOverrides,
    setSourceOverrides,
    savingSource,
    shipping,
    saleDocMap,
    shippedQtyMap,
    shipModal,
    setShipModal,
    editDeliveryId,
    setEditDeliveryId,
    editDeliveryForm,
    setEditDeliveryForm,
    savingDelivery,
    editPaymentTypeId,
    setEditPaymentTypeId,
    editPaymentTypeValue,
    setEditPaymentTypeValue,
    savingPaymentType,
    selectedMode,
    setSelectedMode,
    confirming,
    confirmErrors,
    copiedSku,
    setCopiedSku,
    copiedSupplierSku,
    setCopiedSupplierSku,
    copiedTtn,
    copyTtn,
    copiedPhone,
    copyPhone,
    editingId,
    setEditingId,
    editItems,
    setEditItems,
    editSaving,
    editWarnings,
    setEditWarnings,
    addName,
    setAddName,
    addQty,
    setAddQty,
    addPrice,
    setAddPrice,
    setAddSku,
    prodSearch,
    setProdSearch,
    prodResults,
    prodOpen,
    setProdOpen,
    prodRef,
    orderPayments,
    payFormOpen,
    setPayFormOpen,
    payFormAmount,
    setPayFormAmount,
    payFormMode,
    setPayFormMode,
    payFormDate,
    setPayFormDate,
    payFormNote,
    setPayFormNote,
    discInput,
    setDiscInput,
    discMode,
    setDiscMode,
    priceBlockOpen,
    setPriceBlockOpen,
    historyOpen,
    setHistoryOpen,
    actionsOpen,
    setActionsOpen,
    noteEditing,
    setNoteEditing,
    isNarrow,
    finLogOpen,
    setFinLogOpen,
    statusEditOpen,
    setStatusEditOpen,
    cardSwipe,
    setCardSwipe,
    itemProducts,
    payFormSaving,
    payRemoving,
    loadPayments,
    addPayment,
    reversePayment,
    fulfillmentData,
    fulfillmentLoading,
    linkedPOs,
    linkedReceipts,
    receiptLines,
    loadLinkedPOs,
    loadFulfillment,
    confirmOrder,
    startSupplierSend,
    startBulkSupplierSend,
    sendBulkSuppliers,
    advanceSupplierQueue,
    sendCurrentSupplier,
    applySourceChange,
    selectedIds,
    setSelectedIds,
    mergeModal,
    setMergeModal,
    custStats,
    histOpenId,
    setHistOpenId,
    copying,
    copyOrder,
    openSupplierPO,
    rozCancelFor,
    setRozCancelFor,
    changeStatus,
    openEditDelivery,
    saveDelivery,
    savePaymentType,
    shipOrder,
    executeShip,
    startEdit,
    saveEdit,
    addItem,
    toggleSelect,
    finishTtnFlow,
    openMergeModal,
    toggleFlag,
    toggleOrderFlag,
    isReturnPending,
    returnState,
    setReturnState,
    noteSaving,
    saveInternalNote,
    saveTTN,
    replaceTTN,
    runRegistryAdd,
    printNpRegistry,
    addToRegistry,
    bulkAddToRegistry,
    printLabel,
    bulkPrintLabels,
    addRzToReception,
    returnRzTrack,
    printRzReception,
    deleteRzTtn,
    deleteTTN,
    mergedByTtn,
    sameBuyer,
    todayKey,
    filtered,
  };
}
