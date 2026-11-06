'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trash2, ShoppingCart, ArrowLeft, Check, User, Truck, CreditCard, MessageSquare, AlertCircle, Pencil, TicketPercent } from 'lucide-react';

import './cart.css';

// Чернетка оформлення в localStorage покупця (див. «Чернетка оформлення» в компоненті).
// Усі звернення — у try/catch: приватний режим чи заблоковане сховище не мають ламати кошик.
const CHECKOUT_DRAFT_KEY = 'fixline_checkout_draft_v1';
const CHECKOUT_DRAFT_TTL_MS = 14 * 24 * 3600 * 1000;
type CheckoutDraft = {
  lastName: string; firstName: string; middleName: string; phone: string; company: string; email: string;
  delivery: string; novaSubtype: 'warehouse' | 'courier' | 'postomat' | ''; address: string;
  novaCityRef: string; novaCityName: string; novaWarehouseRef: string;
  rzCityId: string; rzCityName: string; rzDepId: string; rzDepLabel: string;
  payment: string; comment: string; noCallback: boolean;
};
function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    const { savedAt, data } = JSON.parse(raw) as { savedAt: number; data: Partial<CheckoutDraft> };
    if (!savedAt || Date.now() - savedAt > CHECKOUT_DRAFT_TTL_MS || !data) { localStorage.removeItem(CHECKOUT_DRAFT_KEY); return null; }
    const s = (v: unknown) => (typeof v === 'string' ? v : '');
    const sub = s(data.novaSubtype);
    return {
      lastName: s(data.lastName), firstName: s(data.firstName), middleName: s(data.middleName),
      phone: s(data.phone), company: s(data.company), email: s(data.email),
      delivery: s(data.delivery),
      novaSubtype: sub === 'warehouse' || sub === 'courier' || sub === 'postomat' ? sub : '',
      address: s(data.address), novaCityRef: s(data.novaCityRef), novaCityName: s(data.novaCityName), novaWarehouseRef: s(data.novaWarehouseRef),
      rzCityId: s(data.rzCityId), rzCityName: s(data.rzCityName), rzDepId: s(data.rzDepId), rzDepLabel: s(data.rzDepLabel),
      payment: s(data.payment), comment: s(data.comment), noCallback: data.noCallback !== false,
    };
  } catch { return null; }
}
function writeCheckoutDraft(data: CheckoutDraft) {
  try { localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
}
function clearCheckoutDraft() {
  try { localStorage.removeItem(CHECKOUT_DRAFT_KEY); } catch {}
}

// 1 товар · 2–4 товари · 5+ товарів (укр/рос однакова логіка, різні форми)
function pluralForm(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
import { fmtMoney } from '../../lib/format';
import { WHOLESALE_MIN } from '../../lib/site';
import { useCart } from '../../lib/cart';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { getStoredUtm, clearUtm } from '../../lib/utm';
import { GCR_STORAGE_KEY } from '../components/GoogleCustomerReviewsOptIn';
import { phoneInputDigits as getLocalDigits, phoneInputFormat as formatPhone } from '../../lib/notify/phone';
import { trackBeginCheckout, trackPurchase } from '../../lib/analytics';
import ProductImage from '../components/ProductImage';
import NovaPoshtaSelect from '../components/NovaPoshtaSelect';
import RzDeliverySelect from '../components/RzDeliverySelect';
import { cartWeightKg } from '../../lib/parcel-weight';
import { RZ_DELIVERY_TYPE } from '../../lib/rz-delivery';

type Lang = 'uk' | 'ru';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const T = {
  uk: {
    deliveryNova: 'Нова Пошта',
    deliveryRz: 'ROZETKA Доставка',
    deliveryRzSub: 'Точки видачі ROZETKA',
    errRzPoint: 'Оберіть місто та точку видачі ROZETKA',
    payCard: 'Карткою онлайн',
    payCardSub: 'Visa, Mastercard, Apple/Google Pay',
    payCodLabel: 'Накладний платіж',
    payCodSub: 'Оплата при отриманні',
    payInvoiceLabel: 'За рахунком (IBAN)',
    payInvoiceSub: 'ФОП, юрособи й фізособи',
    pageTitle: 'Оформлення замовлення',
    itemsCount: (n: number, price: number) => `${n} ${pluralForm(n, 'товар', 'товари', 'товарів')} на суму ${fmtMoney(price)} грн`,
    backShop: 'До магазину',
    backCatalog: 'До каталогу',
    backShopHref: '/shop',
    backCatalogHref: '/catalog',
    emptyTitle: 'Кошик порожній',
    emptyText: 'Додайте товари з каталогу',
    sectionContact: 'Контактні дані',
    sectionDelivery: 'Спосіб доставки',
    sectionPayment: 'Спосіб оплати',
    sectionComment: 'Коментар до замовлення',
    company: 'Назва компанії',
    companyPh: 'ТОВ «Будмайстер»',
    companyRetail: 'Компанія / ФОП',
    companyRetailPh: 'ФОП Іваненко І. І.',
    lastName: 'Прізвище',
    lastNamePh: 'Іванченко',
    firstName: 'Ім\'я',
    firstNamePh: 'Іван',
    middleName: 'По батькові',
    middleNameOpt: '(необов\'язково)',
    middleNamePh: 'Іванович',
    phone: 'Телефон',
    email: 'Email для підтвердження',
    emailRetail: 'Email',
    emailRetailHint: "(необов'язково)",
    errCompany: 'Вкажіть назву компанії',
    errLastName: 'Вкажіть прізвище',
    errFirstName: 'Вкажіть ім\'я',
    errPhone: 'Введіть коректний номер телефону',
    errEmail: 'Вкажіть email',
    errDelivery: 'Оберіть спосіб доставки',
    errNovaSubtype: 'Оберіть відділення або кур\'єр',
    errAddress: 'Оберіть місто та відділення Нової Пошти',
    errPayment: 'Оберіть спосіб оплати',
    novaWarehouse: 'Відділення',
    novaPostomat: 'Поштомат',
    novaCourier: 'Кур\'єр',
    addressLabel: 'Адреса доставки',
    addressPh: 'Вулиця, будинок, квартира / офіс',
    change: 'змінити',
    orderSummary: 'Ваше замовлення',
    clearCart: 'Очистити',
    itemsTotal: (n: number) => `Товарів (${n} шт)`,
    deliveryLabel: 'Доставка',
    deliveryByCarrier: 'За тарифами перевізника',
    total: 'Разом',
    minReached: '✓ Мінімум досягнуто',
    minNeeded: (n: number) => `Мін. замовлення: ${n.toLocaleString('uk-UA')} ₴`,
    minRemaining: (n: number) => `ще ${n.toFixed(0)} ₴`,
    minWarning: (n: number) => `Додайте товарів ще на ${n.toFixed(0)} ₴ для оформлення замовлення`,
    guestHint: '💡 Можна оформити замовлення без реєстрації — просто заповніть форму.',
    noCallbackLabel: 'Не передзвонювати для підтвердження',
    noCallbackShort: 'Не передзвонювати',
    submitting: 'Завантаження...',
    submitCard: 'Перейти до оплати →',
    submitOrder: 'Підтвердити замовлення →',
    commentPh: 'Побажання, уточнення до замовлення...',
    promoLabel: 'Промокод',
    promoPlaceholder: 'PROMO20',
    promoApply: 'Застосувати',
    promoApplying: 'Перевірка...',
    promoRemove: 'Видалити',
    promoDiscount: 'Знижка за промокодом',
  },
  ru: {
    deliveryNova: 'Новая Почта',
    deliveryRz: 'ROZETKA Доставка',
    deliveryRzSub: 'Точки выдачи ROZETKA',
    errRzPoint: 'Выберите город и точку выдачи ROZETKA',
    payCard: 'Картой онлайн',
    payCardSub: 'Visa, Mastercard, Apple/Google Pay',
    payCodLabel: 'Наложенный платёж',
    payCodSub: 'Оплата при получении',
    payInvoiceLabel: 'По счёту (IBAN)',
    payInvoiceSub: 'ФЛП, юрлица и физлица',
    pageTitle: 'Оформление заказа',
    itemsCount: (n: number, price: number) => `${n} ${pluralForm(n, 'товар', 'товара', 'товаров')} на сумму ${fmtMoney(price)} грн`,
    backShop: 'В магазин',
    backCatalog: 'В каталог',
    backShopHref: '/ru/shop',
    backCatalogHref: '/ru/catalog',
    emptyTitle: 'Корзина пуста',
    emptyText: 'Добавьте товары из каталога',
    sectionContact: 'Контактные данные',
    sectionDelivery: 'Способ доставки',
    sectionPayment: 'Способ оплаты',
    sectionComment: 'Комментарий к заказу',
    company: 'Название компании',
    companyPh: 'ТОВ «Будмайстер»',
    companyRetail: 'Компания / ФЛП',
    companyRetailPh: 'ФЛП Иваненко И. И.',
    lastName: 'Фамилия',
    lastNamePh: 'Иванченко',
    firstName: 'Имя',
    firstNamePh: 'Иван',
    middleName: 'Отчество',
    middleNameOpt: '(необязательно)',
    middleNamePh: 'Иванович',
    phone: 'Телефон',
    email: 'Email для подтверждения',
    emailRetail: 'Email',
    emailRetailHint: '(необязательно)',
    errCompany: 'Укажите название компании',
    errLastName: 'Укажите фамилию',
    errFirstName: 'Укажите имя',
    errPhone: 'Введите корректный номер телефона',
    errEmail: 'Укажите email',
    errDelivery: 'Выберите способ доставки',
    errNovaSubtype: 'Выберите отделение или курьер',
    errAddress: 'Выберите город и отделение Новой Почты',
    errPayment: 'Выберите способ оплаты',
    novaWarehouse: 'Отделение',
    novaPostomat: 'Постомат',
    novaCourier: 'Курьер',
    addressLabel: 'Адрес доставки',
    addressPh: 'Улица, дом, квартира / офис',
    change: 'изменить',
    orderSummary: 'Ваш заказ',
    clearCart: 'Очистить',
    itemsTotal: (n: number) => `Товаров (${n} шт)`,
    deliveryLabel: 'Доставка',
    deliveryByCarrier: 'По тарифам перевозчика',
    total: 'Итого',
    minReached: '✓ Минимум достигнут',
    minNeeded: (n: number) => `Мин. заказ: ${n.toLocaleString('ru-UA')} ₴`,
    minRemaining: (n: number) => `ещё ${n.toFixed(0)} ₴`,
    minWarning: (n: number) => `Добавьте товаров ещё на ${n.toFixed(0)} ₴ для оформления заказа`,
    guestHint: '💡 Можно оформить заказ без регистрации — просто заполните форму.',
    noCallbackLabel: 'Не перезванивать для подтверждения',
    noCallbackShort: 'Не перезванивать',
    submitting: 'Загрузка...',
    submitCard: 'Перейти к оплате →',
    submitOrder: 'Подтвердить заказ →',
    commentPh: 'Пожелания, уточнения к заказу...',
    promoLabel: 'Промокод',
    promoPlaceholder: 'PROMO20',
    promoApply: 'Применить',
    promoApplying: 'Проверка...',
    promoRemove: 'Удалить',
    promoDiscount: 'Скидка по промокоду',
  },
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%', height: '40px', padding: '0 14px',
  border: '1px solid #E2E8F0', borderRadius: '10px',
  background: 'var(--bg-card)', fontSize: '14px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600,
  color: '#374151', marginBottom: '5px',
};

/**
 * Секція форми кошика. Заповнена й не в роботі — згортається в один рядок із підсумком
 * («Пол Ден · ФОП ПП · +38… · email») і кнопкою «Змінити».
 * Тіло при згортанні лише ховається (display:none), а не демонтується: селекти НП/ROZETKA
 * тримають свій внутрішній стан (місто, відділення), і після «Змінити» він має лишитись.
 */
function Section({ icon: Icon, title, children, error, done, collapsed, summary, changeLabel, collapseLabel, onEditStart, onEditEnd, onReopen, active }: {
  icon: React.ElementType; title: string; children: React.ReactNode; error?: boolean; done?: boolean;
  collapsed?: boolean; summary?: string; changeLabel?: string; collapseLabel?: string;
  onEditStart?: () => void; onEditEnd?: () => void;
  /** «Змінити» на згорнутій секції — для доставки/оплати одразу показати весь список варіантів */
  onReopen?: () => void;
  /** Секція «в роботі» (editing) — тоді клік будь-де поза нею = вихід із секції */
  active?: boolean;
}) {
  // Вихід із секції ловимо не лише blur-ом: плитки доставки/оплати навмисно не беруть фокус
  // (keepFocus), тож клік по них фокус не переносив — і підсвітка порожніх полів спрацьовувала
  // лише коли вікно втрачало фокус (напр. на знімку екрана). Тепер — pointerdown поза секцією.
  const rootRef = useRef<HTMLDivElement>(null);
  const onEditEndRef = useRef(onEditEnd);
  useEffect(() => { onEditEndRef.current = onEditEnd; });
  // Вихід = клік поза секцією або фокус (Tab) на елемент поза нею. Не blur: коли елемент у фокусі
  // зникає з розмітки (обрали місто НП — список закрився), браузер шле blur «у нікуди», і секція
  // вважала, що з неї вийшли, — підсвічувала незаповнене відділення, поки людина ще обирала.
  useEffect(() => {
    if (!active) return;
    const outside = (t: EventTarget | null) => !!rootRef.current && t instanceof Node && t.isConnected && !rootRef.current.contains(t);
    const onDown = (e: PointerEvent) => { if (outside(e.target)) onEditEndRef.current?.(); };
    const onFocusIn = (e: FocusEvent) => { if (outside(e.target)) onEditEndRef.current?.(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('focusin', onFocusIn, true);
    };
  }, [active]);
  // «Прийнято»: одна зелена підсвітка рядка-підсумку в МОМЕНТ ЗГОРТАННЯ заповненої секції
  // (05.11.2026 замість спалаху кнопки «згорнути» посеред набору — той спрацьовував на останній
  // цифрі телефону й далеко від поля, на яке дивишся). На старті сторінки не спалахує:
  // дані з профілю/минулого замовлення підтягуються вже після монтування, це не дія покупця.
  const [flash, setFlash] = useState(false);
  const prevCollapsed = useRef(collapsed);
  const mountedAt = useRef(0);
  useEffect(() => { mountedAt.current = Date.now(); }, []);
  useEffect(() => {
    const was = prevCollapsed.current;
    prevCollapsed.current = collapsed;
    if (!collapsed || was || !done || Date.now() - mountedAt.current < 1500) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [collapsed, done]);
  return (
    <div
      ref={rootRef}
      className={'cart-sec' + (collapsed ? ' is-collapsed' : '') + (flash ? ' is-flash' : '')}
      style={{
        background: 'var(--bg-card)', border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`, borderRadius: '14px',
        transition: 'border-color 0.15s',
      }}
      // Фокус усередині — секція «в роботі» й не згортається; вихід — див. ефект вище (клік/фокус поза)
      onFocus={onEditStart}
    >
      <div
        className="cart-sec__head"
        onClick={collapsed ? () => { onEditStart?.(); onReopen?.(); } : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 16px', borderBottom: collapsed ? 'none' : `1px solid ${error ? '#FECACA' : 'var(--border)'}`,
          // Помилка: світло-червона шапка (було #2D0A0A — колір темної теми, у світлій виглядав чорно-бордовим)
          background: error ? 'var(--bg-danger)' : 'var(--bg-soft)',
          borderRadius: collapsed ? '14px' : '14px 14px 0 0',
          cursor: collapsed ? 'pointer' : undefined,
        }}
      >
        {/* Секцію заповнено — квадрат іконки фірмовий синій; ні — світлий */}
        <div className={'cart-sec-icon' + (done ? ' is-done' : '') + (flash ? ' is-accepted' : '')}>
          {/* Під час «прийнято» іконка секції на мить стає галочкою */}
          {flash ? <Check size={16} strokeWidth={3} className="cart-sec__tick" /> : <Icon size={16} strokeWidth={2} />}
        </div>
        {/* У згорнутому рядку назву секції ховаємо (лишається для скрінрідера) — іконка й так
            показує розділ, а місце потрібне, щоб підсумок даних читався повністю, без «…» */}
        <span className={collapsed ? 'cart-sec__title is-hidden' : 'cart-sec__title'} style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', flexShrink: 0 }}>{title}</span>
        {collapsed && summary && <span className="cart-sec__summary" title={summary}>{summary}</span>}
        {collapsed && (
          <button
            type="button" className="cart-sec__change cart-sec__change--icon"
            // Іконка-олівець замість слова — більше місця під підсумок (суть згорнутого рядка — швидко
            // перевірити свої дані). Текст — у title/aria-label.
            title={changeLabel} aria-label={changeLabel}
            // Без фокусу на mousedown: інакше секція розгортається ще ДО кліку (onFocus), кнопка
            // зникає з розмітки, і сам клик — а з ним onReopen (повний список) — губиться
            onMouseDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); onEditStart?.(); onReopen?.(); }}
          >
            <Pencil size={15} strokeWidth={2} aria-hidden />
          </button>
        )}
        {/* Розгорнута, але вже заповнена — можна згорнути вручну, не шукаючи, куди клікнути */}
        {!collapsed && done && collapseLabel && (
          <button type="button" className="cart-sec__change" onClick={e => { e.stopPropagation(); onEditEnd?.(); }}>
            {collapseLabel}
          </button>
        )}
      </div>
      {/* Плавне згортання: висота тіла анімується через grid-template-rows 1fr → 0fr (cart.css).
          Тіло лишається змонтованим (селекти НП/ROZETKA тримають стан); inert — щоб у згорнуту
          секцію не потрапляв фокус із клавіатури. */}
      <div className={'cart-sec__body' + (collapsed ? ' is-collapsed' : '')} inert={collapsed}>
        <div className="cart-sec__inner">
          <div style={{ padding: '16px' }}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function CartPageContent({ lang = 'uk' }: { lang?: Lang }) {
  const tr = T[lang];
  const { items, totalItems, totalPrice, loaded, addItem, removeItem, updateQty, clearCart } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>({});
  function getQtyInputVal(sku: string, fallback: number) { return qtyInputs[sku] ?? String(fallback); }
  function commitQtyInput(sku: string, minOrder: number) {
    const raw = qtyInputs[sku];
    if (raw === undefined) return;
    const v = parseInt(raw, 10);
    const valid = !isNaN(v) && v >= minOrder ? v : minOrder;
    updateQty(sku, valid);
    setQtyInputs(prev => { const n = { ...prev }; delete n[sku]; return n; });
  }

  // Однаковий список для роздрібу й опту: рахунок (IBAN) потрібен і роздрібному покупцю,
  // якому треба безготівкові документи на 1 шт. (рішення власника 04.11.2026).
  // Назва компанії для рахунку в роздрібі не обов'язкова — покупцем у рахунку буде ПІБ.
  const PAYMENT_OPTIONS = [
    { value: 'card',    label: tr.payCard,         sub: tr.payCardSub },
    { value: 'cod',     label: tr.payCodLabel,     sub: tr.payCodSub },
    { value: 'invoice', label: tr.payInvoiceLabel, sub: tr.payInvoiceSub },
  ];

  const [role, setRole] = useState<'wholesale' | 'retail' | 'guest'>('guest');
  const [company,    setCompany]    = useState('');
  const [lastName,   setLastName]   = useState('');
  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,     setEmail]     = useState('');

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(async ({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      if (!data.user) {
        setRole('guest');
        return;
      }
      const type = data.user.app_metadata?.account_type as string | undefined;
      const wholesale = ['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? '');
      setRole(wholesale ? 'wholesale' : 'retail');
      // Підстановка з профілю й минулого замовлення — лише в порожні поля:
      // чернетка (вже відновлена) і введене покупцем мають пріоритет.
      setCompany(p => p || (data.user!.user_metadata?.company_name ?? ''));
      setEmail(p => p || (data.user!.email ?? ''));

      if (wholesale) {
        const { data: orders } = await supabase
          .from('orders')
          .select('contact, phone, delivery_type, delivery_address, payment_type')
          .eq('user_id', data.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (orders) {
          if (orders.contact) {
            const parts = orders.contact.trim().split(/\s+/);
            setLastName(p => p || (parts[0] ?? ''));
            setFirstName(p => p || (parts[1] ?? ''));
            setMiddleName(p => p || (parts[2] ?? ''));
          }
          if (orders.phone) setPhone(p => p || orders.phone);
          // Доставку з минулого замовлення не підставляємо: там лише тип і текст адреси,
          // без підтипу, міста й відділення — секція виглядала заповненою наполовину
          // («Нова Пошта» без пункту) і все одно вимагала вибору заново.
          if (orders.payment_type) setPayment(p => p || orders.payment_type);
        }
      }
    });
  }, []);

  // Restore cart from abandoned-cart email link (?restore=TOKEN)
  useEffect(() => {
    const token = searchParams.get('restore');
    if (!token || !loaded) return;
    fetch(`/api/cart/restore/${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items?.length) {
          for (const item of data.items) addItem(item, item.qty);
          router.replace(lang === 'ru' ? '/ru/cart' : '/cart', { scroll: false });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Save cart to DB for abandoned-cart reminders (debounced 5s).
  // Адресу перевіряємо повністю, а не на наявність «@»: інакше кожна пауза під
  // час набору лишала в базі окремий недописаний рядок. 2 с теж було замало —
  // стільки людина легко думає посеред власної пошти.
  useEffect(() => {
    if (!loaded || !EMAIL_RE.test((email ?? '').trim()) || items.length === 0) return;
    const t = setTimeout(() => {
      fetch('/api/cart/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), items, totalPrice }),
      }).catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, [email, items, totalPrice, loaded]);

  const [delivery,          setDelivery]          = useState('');
  const [novaSubtype,       setNovaSubtype]       = useState<'warehouse' | 'courier' | 'postomat' | ''>('');
  const [address,           setAddress]           = useState('');
  const [novaCityRef,       setNovaCityRef]       = useState('');
  const [novaCityName,      setNovaCityName]      = useState('');
  const [novaWarehouseRef,  setNovaWarehouseRef]  = useState('');
  const [rzCityId,          setRzCityId]          = useState('');
  const [rzCityName,        setRzCityName]        = useState('');
  const [rzDepId,           setRzDepId]           = useState('');
  const [rzDepLabel,        setRzDepLabel]        = useState('');
  // null — конфіг ще не приїхав; опцію не малюємо, доки не знаємо, чи вона жива
  const [rzConfig, setRzConfig] = useState<{ enabled: boolean; maxWeightKg: number | null } | null>(null);

  useEffect(() => {
    fetch('/api/rz-delivery/config')
      .then(r => r.json())
      .then((d: { enabled?: boolean; maxWeightKg?: number | null }) =>
        setRzConfig({ enabled: Boolean(d.enabled), maxWeightKg: d.maxWeightKg ?? null }))
      .catch(() => setRzConfig({ enabled: false, maxWeightKg: null }));
  }, []);

  // Вага замовлення — з фасування товару (products.volume). Потрібна ДО вибору
  // доставки: точки видачі Rozetka мають ліміт ваги, і наш склад здачі теж.
  const orderWeightKg = cartWeightKg(items);
  const rzAvailable = Boolean(
    rzConfig?.enabled && (rzConfig.maxWeightKg == null || orderWeightKg <= rzConfig.maxWeightKg),
  );

  const DELIVERY_OPTIONS = [
    // logo — офіційні файли з сайтів перевізників (public/images/carriers, завантажено 04.11.2026)
    { value: 'nova', label: tr.deliveryNova, sub: null as string | null, logo: '/images/carriers/nova-poshta.svg' },
    ...(rzAvailable ? [{ value: RZ_DELIVERY_TYPE, label: tr.deliveryRz, sub: tr.deliveryRzSub, logo: '/images/carriers/rozetka-mark.svg' }] : []),
  ];

  // Спосіб міг прийти з минулого замовлення (підстановка вище) або перестати
  // підходити після правки кількості — тоді вибір треба зняти, інакше в списку
  // не лишиться жодної опції і секція доставки виглядатиме порожньою.
  useEffect(() => {
    if (delivery === RZ_DELIVERY_TYPE && rzConfig && !rzAvailable) {
      setDelivery('');
      setRzCityId(''); setRzCityName(''); setRzDepId(''); setRzDepLabel('');
    }
  }, [delivery, rzAvailable, rzConfig]);

  // Скидання вибору доставки — ПОВНЕ: разом зі способом/підтипом чистимо й місто та відділення.
  // Раніше «змінити» скидала лише address і novaSubtype, а novaWarehouseRef лишався від
  // попереднього вибору: після повторного «НП → Відділення» з порожнім містом валідація вже
  // вважала доставку заповненою, і замовлення пішло б зі старим відділенням, якого не видно.
  // npInit/rzInit (відновлення з чернетки) теж скидаємо — інакше перемонтований селект підставив би старий пункт
  const clearNovaPoint = () => { npInit.current = null; setAddress(''); setNovaCityName(''); setNovaCityRef(''); setNovaWarehouseRef(''); };
  const clearDelivery = () => {
    setDelivery(''); setNovaSubtype(''); clearNovaPoint(); rzInit.current = null;
    setRzCityId(''); setRzCityName(''); setRzDepId(''); setRzDepLabel('');
  };

  const [payment,   setPayment]   = useState('');
  const [comment,     setComment]     = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [noCallback,  setNoCallback]  = useState(true);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  // Секція «в роботі» (фокус усередині або натиснули «Змінити») — не згортаємо її, навіть якщо заповнена
  const [editing, setEditing] = useState({ contact: false, delivery: false, payment: false });
  const editStart = (k: keyof typeof editing) => () => setEditing(s => (s[k] ? s : { ...s, [k]: true }));
  const editEnd   = (k: keyof typeof editing) => () => setEditing(s => (s[k] ? { ...s, [k]: false } : s));
  // Вийшли з секції (фокус пішов далі) — обов'язкові поля цієї секції, що лишились порожні,
  // одразу підсвічуємо червоним, а не чекаємо натискання «Підтвердити».
  const SECTION_FIELDS = {
    contact:  ['company', 'lastName', 'firstName', 'phone', 'email'],
    delivery: ['delivery', 'novaSubtype', 'address', 'rzPoint'],
    payment:  ['payment'],
  } as const;
  const leaveSection = (k: keyof typeof editing) => () => {
    editEnd(k)();
    const missing = collectErrors();
    const add = SECTION_FIELDS[k].filter(f => missing.has(f));
    if (add.length) setErrors(prev => new Set([...prev, ...add]));
  };
  // Відкрили згорнуту доставку/оплату через «Змінити» — показуємо всі варіанти з позначеним поточним,
  // а не лише обраний (інакше треба було тиснути «змінити» вдруге). Скидається, щойно обрали варіант.
  const [reopened, setReopened] = useState({ delivery: false, payment: false });
  // Клік по плитці варіанта не забирає фокус: інакше спершу спрацьовує blur секції, вона
  // згортається, і клік (а з ним і вибір) губиться. Сам вибір іде через label → radio.
  // Поле промокоду сховане за «Маю промокод» — ним користуються рідко, а рядок займав завжди
  const [promoOpen, setPromoOpen] = useState(false);
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  // Права картка липне до верху (sticky top 88px), але внизу сторінки її низ має збігтися з низом
  // блоку підсумку зліва (прохання власника 05.11). Прокрутка закінчується раніше, ніж контейнер
  // «доштовхне» картку, тож на останніх d px прокрутки опускаємо її (top 88 → 88 + d) — у самому
  // кінці низи колонок на одній лінії. Лише коли картка справді sticky (на телефоні — static).
  const itemsCardRef = useRef<HTMLDivElement>(null);
  const totalsRef    = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const STICKY_TOP = 88;
    let raf = 0;
    const place = () => {
      raf = 0;
      const card = itemsCardRef.current, totals = totalsRef.current;
      if (!card || !totals) return;
      if (getComputedStyle(card).position !== 'sticky') {
        card.style.top = '';
        const l = card.querySelector<HTMLElement>('.cart-items-scroll'); if (l) l.style.maxHeight = '';
        return;
      }
      // Усе рахуємо в пікселях вʼюпорта (getBoundingClientRect), а в style.top переводимо назад:
      // на <html> стоїть zoom 0.95, і rect-и вже масштабовані, а CSS-значення — ні.
      // Змішування одиниць давало недоліт ~15–20 px.
      let cardRect = card.getBoundingClientRect();
      const z = card.offsetHeight ? cardRect.height / card.offsetHeight : 1;
      // Висота списку — щоб уся картка влазила в екран від її поточного верху (до прилипання —
      // від місця в сітці, після — від 88px) до низу вікна з відступом 16px. Рахуємо від «базового»
      // верху (без зсуву вирівнювання внизу), інакше висота й зсув підкручували б одне одного.
      const list = card.querySelector<HTMLElement>('.cart-items-scroll');
      const grid = card.parentElement;
      if (list && grid) {
        const headH = list.getBoundingClientRect().top - cardRect.top;
        // Верх картки «на старті сторінки» — стала величина, не залежить від прокрутки. Раніше брали
        // поточний верх сітки: висота списку мінялась на кожному кадрі прокрутки, картка «тремтіла».
        const gridTopAtStart = grid.getBoundingClientRect().top - document.documentElement.getBoundingClientRect().top;
        const baseTop = Math.max(STICKY_TOP * z, gridTopAtStart);
        // …і не вища за ліву колонку (форма + підсумок): інакше права картка стає найвищою в сітці,
        // перестає липнути й не вирівнюється з низом підсумку
        const leftH = totals.getBoundingClientRect().bottom - grid.getBoundingClientRect().top;
        const maxVp = Math.max(160 * z, Math.min(window.innerHeight - 16 * z - baseTop, leftH) - headH);
        const next = `${Math.round(maxVp / z)}px`;
        if (list.style.maxHeight !== next) list.style.maxHeight = next;
        cardRect = card.getBoundingClientRect();
      }
      const remaining = Math.max(0, document.documentElement.getBoundingClientRect().bottom - window.innerHeight);
      const stickyTop = STICKY_TOP * z;
      // Де буде низ підсумку, коли докрутимо до кінця, і наскільки нижче за звичайне місце має стати картка
      const totalsBottomAtEnd = totals.getBoundingClientRect().bottom - remaining;
      const d = totalsBottomAtEnd - cardRect.height - stickyTop;
      card.style.top = `${(stickyTop + Math.max(0, d - remaining)) / z}px`;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(place); };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Висота колонок міняється без прокрутки (згортання секцій, кількість товарів)
    const ro = new ResizeObserver(schedule);
    if (itemsCardRef.current) ro.observe(itemsCardRef.current);
    if (totalsRef.current) ro.observe(totalsRef.current);
    if (totalsRef.current?.parentElement) ro.observe(totalsRef.current.parentElement);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [loaded, items.length]);
  // Позначка (кружок із галочкою) біля обраного варіанта — теж «змінити»: клік знімає вибір.
  // preventDefault/stopPropagation — щоб клік не пішов у label і не обрав варіант знову.
  const uncheckProps = (selected: boolean, clear: () => void) => selected ? {
    className: 'cart-check is-on',
    role: 'button' as const,
    title: tr.change,
    'aria-label': tr.change,
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); clear(); },
  } : {};

  // Чиста перевірка (без setState) — нею ж рахуємо, які секції вже заповнені (підсвітка іконок)
  function collectErrors(): Set<string> {
    const e = new Set<string>();
    // Назва компанії — лише для опту. Роздріб може платити за рахунком і як фізособа: у рахунку тоді ПІБ (lib/invoice-buyer)
    if (!isRetail && !company.trim()) e.add('company');
    if (!lastName.trim())  e.add('lastName');
    if (!firstName.trim()) e.add('firstName');
    if (!/^\+?3?8?(0\d{9})$/.test(phone.replace(/[\s\-()]/g, ''))) e.add('phone');
    // Email обов'язковий лише для опту; у роздрібі — необов'язковий, але якщо введено, має бути схожим на адресу
    if (!isRetail && !email.trim()) e.add('email');
    if (email.trim() && !email.includes('@')) e.add('email');
    if (!delivery)        e.add('delivery');
    if (delivery === 'nova' && !novaSubtype) e.add('novaSubtype');
    if (delivery === 'nova' && (novaSubtype === 'warehouse' || novaSubtype === 'postomat') && !novaWarehouseRef) e.add('address');
    if (delivery === 'nova' && novaSubtype === 'courier' && !address.trim()) e.add('address');
    if (delivery === RZ_DELIVERY_TYPE && !rzDepId) e.add('rzPoint');
    if (!payment)         e.add('payment');
    return e;
  }

  function validate(): Set<string> {
    const e = collectErrors();
    setErrors(e);
    return e;
  }

  function scrollToFirstError(errs: Set<string>) {
    const priority = ['company', 'lastName', 'firstName', 'phone', 'email', 'delivery', 'novaSubtype', 'address', 'rzPoint', 'payment'];
    for (const key of priority) {
      if (errs.has(key)) {
        const el = document.getElementById(`field-${key}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [promoInput,   setPromoInput]   = useState('');
  const [promoApplied, setPromoApplied] = useState<{
    code: string; discountType: 'percent' | 'fixed';
    discountValue: number; discountAmount: number; finalTotal: number;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError,   setPromoError]   = useState('');

  // Reset promo when cart contents change
  useEffect(() => { setPromoApplied(null); setPromoError(''); }, [totalPrice]);

  // ── Чернетка оформлення (06.11.2026) ─────────────────────────────────────
  // Дані форми жили лише в стані сторінки: «у каталог → назад у кошик» —
  // і контакти, доставка, оплата зникали. Тримаємо чернетку в localStorage
  // браузера покупця (14 днів, очищається після оформлення). Відновлюємо після
  // монтування, а не в ініціалізаторі useState, — інакше розійдеться гідратація.
  const [draftReady, setDraftReady] = useState(false);
  // Відновлений вибір НП/Rozetka — для initial*-пропсів селектів; заморожений на
  // момент відновлення, щоб набір у полях не запускав повторне «відновлення».
  const npInit = useRef<{ city: string; cityRef: string; whRef: string; address: string } | null>(null);
  const rzInit = useRef<{ city: string; cityId: string; dep: string } | null>(null);
  useEffect(() => {
    const d = readCheckoutDraft();
    if (d) {
      setLastName(d.lastName); setFirstName(d.firstName); setMiddleName(d.middleName);
      setPhone(d.phone); setCompany(d.company); setEmail(d.email);
      setDelivery(d.delivery); setNovaSubtype(d.novaSubtype); setAddress(d.address);
      setNovaCityRef(d.novaCityRef); setNovaCityName(d.novaCityName); setNovaWarehouseRef(d.novaWarehouseRef);
      setRzCityId(d.rzCityId); setRzCityName(d.rzCityName); setRzDepId(d.rzDepId); setRzDepLabel(d.rzDepLabel);
      setPayment(d.payment); setComment(d.comment); setNoCallback(d.noCallback);
      // Відновлюємо пункт НП лише з Ref міста — інакше селект почав би шукати місто за назвою
      if (d.novaCityRef) npInit.current = { city: d.novaCityName, cityRef: d.novaCityRef, whRef: d.novaWarehouseRef, address: d.novaSubtype === 'courier' ? d.address : '' };
      if (d.rzCityId) rzInit.current = { city: d.rzCityName, cityId: d.rzCityId, dep: d.rzDepLabel };
    }
    setDraftReady(true);
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    const t = setTimeout(() => writeCheckoutDraft({
      lastName, firstName, middleName, phone, company, email,
      delivery, novaSubtype, address, novaCityRef, novaCityName, novaWarehouseRef,
      rzCityId, rzCityName, rzDepId, rzDepLabel, payment, comment, noCallback,
    }), 400);
    return () => clearTimeout(t);
  }, [draftReady, lastName, firstName, middleName, phone, company, email,
      delivery, novaSubtype, address, novaCityRef, novaCityName, novaWarehouseRef,
      rzCityId, rzCityName, rzDepId, rzDepLabel, payment, comment, noCallback]);

  const promoEligibleTotal = items.reduce((s, i) => s + (i.is_promo ? 0 : i.price * i.qty), 0);

  async function handleApplyPromo() {
    if (!promoInput.trim()) return;
    setPromoLoading(true); setPromoError('');
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: promoInput.trim(), cartTotal: promoEligibleTotal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPromoApplied(data);
      setPromoInput('');
    } catch (e) {
      setPromoError(e instanceof Error ? e.message : 'Помилка');
      setPromoApplied(null);
    } finally {
      setPromoLoading(false);
    }
  }

  async function handleSubmit() {
    const errs = validate();
    if (errs.size > 0) {
      setTimeout(() => scrollToFirstError(errs), 50);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const finalTotal = promoApplied?.finalTotal ?? totalPrice;
    trackBeginCheckout(items, finalTotal);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          contact: [lastName, firstName, middleName].filter(Boolean).join(' '),
          phone, email,
          deliveryType: delivery,
          deliverySubtype: delivery === 'nova' ? novaSubtype : null,
          deliveryAddress: (delivery === RZ_DELIVERY_TYPE ? rzDepLabel : address) || null,
          // Ідентифікатори точок ROZETKA — uuid, а не Ref НП; лягають у ті самі
          // колонки, бо роль однакова, а перевізника видно по delivery_type.
          deliveryCityRef: delivery === 'nova' ? (novaCityRef || null)
            : delivery === RZ_DELIVERY_TYPE ? (rzCityId || null) : null,
          deliveryCityName: delivery === 'nova' ? (novaCityName || null)
            : delivery === RZ_DELIVERY_TYPE ? (rzCityName || null) : null,
          deliveryWarehouseRef: delivery === 'nova'
            ? ((novaSubtype === 'warehouse' || novaSubtype === 'postomat') && novaWarehouseRef ? novaWarehouseRef : null)
            : delivery === RZ_DELIVERY_TYPE ? (rzDepId || null) : null,
          paymentType: payment,
          comment: [comment, noCallback ? '⛔ Не передзвонювати для підтвердження' : ''].filter(Boolean).join('\n') || null,
          items,
          totalPrice,
          promoCode: promoApplied?.code ?? null,
          promoEligibleTotal: promoApplied ? promoEligibleTotal : undefined,
          ...getStoredUtm(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Помилка сервера');
      clearCheckoutDraft();
      // Для вікна «Google Отзывы клиентов» на сторінці успіху — пошта й номер,
      // не через URL (див. app/components/GoogleCustomerReviewsOptIn)
      try { sessionStorage.setItem(GCR_STORAGE_KEY, JSON.stringify({ email, num: data.orderNumber })); } catch {}
      if (payment === 'card' && data.pageUrl) {
        clearUtm();
        window.location.href = data.pageUrl;
      } else {
        // Гілка карткової оплати сюди не заходить — там ще нічого не оплачено,
        // і подія purchase на редіректі рахувала б непідтверджені замовлення.
        trackPurchase(String(data.id), finalTotal);
        clearCart();
        clearUtm();
        router.push(`/order-success?id=${data.id}&num=${data.orderNumber}${isRetail ? '&from=shop' : ''}`);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Невідома помилка');
    } finally {
      setSubmitting(false);
    }
  }

  function err(field: string) {
    return errors.has(field) ? '1.5px solid #EF4444' : undefined;
  }

  const isRetail     = role !== 'wholesale';
  const backHref     = isRetail ? tr.backShopHref : tr.backCatalogHref;
  const backLabel    = isRetail ? tr.backShop : tr.backCatalog;

  // Які секції вже заповнені (підсвітка іконок). Рахувати ТІЛЬКИ тут, після isRetail:
  // collectErrors читає isRetail, і виклик вище кидав «Cannot access before initialization».
  const pending = collectErrors();
  // Зелена галочка в заповненому полі контактів (cart.css .cart-field.is-valid) — підказка просто
  // там, куди дивишся, що поле прийнято. Перевірки — ті самі, що в collectErrors.
  const phoneValid = /^\+?3?8?(0\d{9})$/.test(phone.replace(/[\s\-()]/g, ''));
  const fieldCls = (valid: boolean) => 'cart-field' + (valid ? ' is-valid' : '');
  const contactDone  = !['company', 'lastName', 'firstName', 'phone', 'email'].some(k => pending.has(k));
  const deliveryDone = !['delivery', 'novaSubtype', 'address', 'rzPoint'].some(k => pending.has(k));
  const paymentDone  = !pending.has('payment');

  // Контакти: усе обов'язкове введено, і 2,5 с нічого не змінювали — згортаємо, навіть якщо курсор
  // лишився в полі (браузерне автозаповнення вносить усе разом і фокус не йде далі).
  // Таймер стартує лише від ЗМІНИ значень — просто розгорнути «змінити» й дивитись не згорне.
  const contactSig = [lastName, firstName, middleName, company, phone, email].join('\u0001');
  const prevContactSig = useRef(contactSig);
  useEffect(() => {
    const changed = prevContactSig.current !== contactSig;
    prevContactSig.current = contactSig;
    if (!changed || !contactDone || !editing.contact) return;
    const t = setTimeout(() => {
      setEditing(s => ({ ...s, contact: false }));
      // Фокус із поля, що зараз сховається (inert), — інакше браузер лишає курсор «у нікуди»
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest('.cart-sec')?.querySelector('#field-lastName')) el.blur();
    }, 2500);
    return () => clearTimeout(t);
  }, [contactSig, contactDone, editing.contact]);

  // Доставка: щойно вибір став повним (обрали відділення/поштомат/точку ROZETKA) — згортаємо, навіть
  // якщо курсор лишився в полі пошуку відділення. Вибір зі списку — дискретна дія, тож пауза
  // коротка (0,6 с); кур'єрську адресу друкують — там, як у контактах, 2,5 с після останньої зміни.
  const deliverySig = [delivery, novaSubtype, novaCityRef, novaWarehouseRef, address, rzDepId].join('\u0001');
  const prevDeliverySig = useRef(deliverySig);
  useEffect(() => {
    const changed = prevDeliverySig.current !== deliverySig;
    prevDeliverySig.current = deliverySig;
    if (!changed || !deliveryDone || !editing.delivery) return;
    const t = setTimeout(() => {
      setEditing(s => ({ ...s, delivery: false }));
      // Фокус із поля пошуку, що зараз сховається (inert). Секція доставки — сусід якоря #field-delivery.
      const sec = document.getElementById('field-delivery')?.parentElement?.querySelector('.cart-sec');
      const el = document.activeElement as HTMLElement | null;
      if (sec && el && sec.contains(el)) el.blur();
    }, delivery === 'nova' && novaSubtype === 'courier' ? 2500 : 600);
    return () => clearTimeout(t);
  }, [deliverySig, deliveryDone, editing.delivery, delivery, novaSubtype]);

  // Згорнута секція: заповнена, не в роботі й без помилки після спроби відправити
  const contactErr  = ['company', 'lastName', 'firstName', 'phone', 'email'].some(k => errors.has(k));
  const deliveryErr = ['delivery', 'novaSubtype', 'address', 'rzPoint'].some(k => errors.has(k));
  const contactCollapsed  = contactDone  && !editing.contact  && !contactErr;
  const deliveryCollapsed = deliveryDone && !editing.delivery && !deliveryErr;
  const paymentCollapsed  = paymentDone  && !editing.payment  && !errors.has('payment');

  const contactSummary = [
    [lastName, firstName, middleName].map(s => s.trim()).filter(Boolean).join(' '),
    company.trim(),
    phone.trim(), email.trim(),
  ].filter(Boolean).join(' · ');
  // «м. Павлоград, Павлоградський р-н, Дніпропетровська обл.» → «м. Павлоград»
  const shortCity = (s: string) => s.split(',')[0].trim();
  const deliverySummary = (() => {
    if (delivery === 'nova') {
      // Назва пункту НП уже починається з «Відділення №…»/«Поштомат №…» — тип окремо не пишемо,
      // інакше «Відділення · Харків, Відділення №5». Для кур'єра типу в адресі нема — лишаємо.
      const sub = novaSubtype === 'courier' ? tr.novaCourier : '';
      // Для перевірки покупцю досить міста й пункту: «м. Павлоград, Павлоградський р-н,
      // Дніпропетровська обл.» → «м. Павлоград» (район/область лише роздували рядок до «…»)
      const city = shortCity(novaCityName);
      const point = address && novaCityName && address.startsWith(novaCityName) ? address.slice(novaCityName.length).replace(/^[,\s]+/, '') : address;
      const place = point && point !== novaCityName ? [city, point].filter(Boolean).join(', ') : city;
      return [tr.deliveryNova, sub, place].filter(Boolean).join(' · ');
    }
    if (delivery === RZ_DELIVERY_TYPE) return [tr.deliveryRz, [shortCity(rzCityName), rzDepLabel].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    return '';
  })();
  const paymentSummary = PAYMENT_OPTIONS.find(o => o.value === payment)?.label ?? '';

  if (!loaded) return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#1E3A5F', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (items.length === 0) {
    return (
      <>
        <div style={{ background: 'var(--bg-soft)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ color: 'var(--brand-blue)', opacity: 0.45, marginBottom: '16px' }}>
              <ShoppingCart size={64} strokeWidth={1} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{tr.emptyTitle}</h1>
            <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>{tr.emptyText}</p>
            <Link href={backHref} style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '44px', padding: '0 24px', borderRadius: '10px',
              background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
            }}>
              <ArrowLeft size={15} />{backLabel}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div className="mobile-pad" style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 32px 64px' }}>

          {/* Page header */}
          <div className="cart-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
            {/* Заголовок і «N товарів на суму …» — одним рядком (на вузькому екрані підсумок переноситься) */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap', minWidth: 0 }}>
              <h1 className="cart-head__title" style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{tr.pageTitle}</h1>
              <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>{tr.itemsCount(totalItems, totalPrice)}</p>
            </div>
            <Link href={backHref} className="cart-head__back" aria-label={backLabel} title={backLabel} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              height: '36px', padding: '0 14px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              <ArrowLeft size={13} /><span className="cart-head__back-text">{backLabel}</span>
            </Link>
          </div>

          {/* Main grid */}
          {/* 3 : 2 (було 2 : 1) — ліва форма вужча, колонки врівноваженіші. minmax(0, …): довгий рядок-підсумок доставки (nowrap + «…») інакше розпирав ліву колонку й стискав праву зі списком товарів */}
          <div className="cart-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: '24px', alignItems: 'start' }}>

            {/* ── LEFT: Checkout form ── */}
            <div className="cart-form-col" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Contact info */}
              <Section icon={User} done={contactDone} collapsed={contactCollapsed} summary={contactSummary} changeLabel={tr.change} collapseLabel={lang === 'ru' ? 'свернуть' : 'згорнути'} onEditStart={editStart('contact')} onEditEnd={leaveSection('contact')} active={editing.contact} title={tr.sectionContact}>
                {/* Рядок 1: Прізвище · Ім'я · По батькові; рядок 2: Компанія (лише опт) · Телефон · Email */}
                <div className="cart-contact-grid">
                  <div id="field-lastName" className={fieldCls(!!lastName.trim())}>
                    <label style={{ ...labelStyle, color: errors.has('lastName') ? '#EF4444' : undefined }}>{tr.lastName}</label>
                    <input style={{ ...inputStyle, border: err('lastName') ?? inputStyle.border }} placeholder={tr.lastNamePh} value={lastName} onChange={e => { setLastName(e.target.value); setErrors(s => { const n = new Set(s); n.delete('lastName'); return n; }); }} />
                    {errors.has('lastName') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errLastName}</p>}
                  </div>
                  <div id="field-firstName" className={fieldCls(!!firstName.trim())}>
                    <label style={{ ...labelStyle, color: errors.has('firstName') ? '#EF4444' : undefined }}>{tr.firstName}</label>
                    <input style={{ ...inputStyle, border: err('firstName') ?? inputStyle.border }} placeholder={tr.firstNamePh} value={firstName} onChange={e => { setFirstName(e.target.value); setErrors(s => { const n = new Set(s); n.delete('firstName'); return n; }); }} />
                    {errors.has('firstName') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errFirstName}</p>}
                  </div>
                  <div>
                    <label style={labelStyle}>{tr.middleName} <span style={{ fontWeight: 400, color: '#94A3B8' }}>{tr.middleNameOpt}</span></label>
                    <input style={inputStyle} placeholder={tr.middleNamePh} value={middleName} onChange={e => setMiddleName(e.target.value)} />
                  </div>
                  {!isRetail && (
                    <div id="field-company" className={fieldCls(!!company.trim())}>
                      <label style={{ ...labelStyle, color: errors.has('company') ? '#EF4444' : undefined }}>{tr.company}</label>
                      <input style={{ ...inputStyle, border: err('company') ?? inputStyle.border }} placeholder={tr.companyPh} value={company} onChange={e => { setCompany(e.target.value); setErrors(s => { const n = new Set(s); n.delete('company'); return n; }); }} />
                      {errors.has('company') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errCompany}</p>}
                    </div>
                  )}
                  <div id="field-phone" className={fieldCls(phoneValid)}>
                    <label style={{ ...labelStyle, color: errors.has('phone') ? '#EF4444' : undefined }}>{tr.phone}</label>
                    <input
                      style={{ ...inputStyle, border: err('phone') ?? inputStyle.border }}
                      placeholder="+38 (0__) ___-__-__"
                      value={phone}
                      onChange={e => {
                        setPhone(formatPhone(getLocalDigits(e.target.value)));
                        setErrors(s => { const n = new Set(s); n.delete('phone'); return n; });
                      }}
                      onKeyDown={e => {
                        if (e.key !== 'Backspace') return;
                        e.preventDefault();
                        const shorter = getLocalDigits(phone).slice(0, -1);
                        setPhone(formatPhone(shorter));
                        setErrors(s => { const n = new Set(s); n.delete('phone'); return n; });
                      }}
                    />
                    {errors.has('phone') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errPhone}</p>}
                  </div>
                  <div id="field-email" className={fieldCls(!!email.trim() && email.includes('@'))}>
                    {/* Роздріб — email необов'язковий (лист-підтвердження, якщо вказали); опт — обов'язковий */}
                    <label style={{ ...labelStyle, color: errors.has('email') ? '#EF4444' : undefined }}>
                      {isRetail ? <>{tr.emailRetail} <span style={{ fontWeight: 400, color: '#94A3B8' }}>{tr.emailRetailHint}</span></> : tr.email}
                    </label>
                    <input style={{ ...inputStyle, border: err('email') ?? inputStyle.border }} type="email" placeholder={isRetail ? 'name@email.com' : 'company@email.com'} value={email} onChange={e => { setEmail(e.target.value); setErrors(s => { const n = new Set(s); n.delete('email'); return n; }); }} />
                    {errors.has('email') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errEmail}</p>}
                  </div>
                  {/* Роздріб: компанія/ФОП необов'язкова — для документів на ФОП (рахунок, видаткова);
                      порожня — у документах ПІБ. Заодно вирівнює другий рядок до трьох полів. */}
                  {isRetail && (
                    <div id="field-company" className={fieldCls(!!company.trim())}>
                      <label style={labelStyle}>{tr.companyRetail} <span style={{ fontWeight: 400, color: '#94A3B8' }}>{tr.middleNameOpt}</span></label>
                      <input style={inputStyle} placeholder={tr.companyRetailPh} value={company} onChange={e => setCompany(e.target.value)} />
                    </div>
                  )}
                </div>
              </Section>

              {/* Delivery */}
              {/* Якорі прокрутки до помилки — в одній обгортці з секцією: окремими дітьми колонки
                  кожен додавав gap 16px, і між «Контактами» й «Доставкою» була діра ~80px */}
              <div>
              <div id="field-delivery" /><div id="field-novaSubtype" /><div id="field-address" /><div id="field-rzPoint" />
              <Section icon={Truck} done={deliveryDone} collapsed={deliveryCollapsed} summary={deliverySummary} changeLabel={tr.change} collapseLabel={lang === 'ru' ? 'свернуть' : 'згорнути'} onEditStart={editStart('delivery')} onEditEnd={leaveSection('delivery')} active={editing.delivery} onReopen={() => setReopened(r => ({ ...r, delivery: true }))} title={tr.sectionDelivery} error={errors.has('delivery') || errors.has('novaSubtype') || errors.has('address')}>
                <div className={'cart-opt-list' + (!delivery ? ' cart-opt-list--row' : '')}>
                  {DELIVERY_OPTIONS.filter(opt => !delivery || reopened.delivery || delivery === opt.value).map(opt => (
                    <div key={opt.value}>
                      <label onMouseDown={keepFocus} style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', borderRadius: '10px', cursor: delivery === opt.value ? 'default' : 'pointer',
                        border: `1.5px solid ${delivery === opt.value ? '#1E3A5F' : 'var(--border)'}`,
                        background: delivery === opt.value ? '#1E3A5F22' : 'var(--bg-card)',
                        transition: 'all 0.15s',
                      }}>
                        <div {...uncheckProps(delivery === opt.value, clearDelivery)} style={{
                          width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${delivery === opt.value ? '#1E3A5F' : '#CBD5E1'}`,
                          background: delivery === opt.value ? '#1E3A5F' : 'var(--bg-card)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {delivery === opt.value && <Check size={10} color="#fff" strokeWidth={3} />}
                        </div>
                        <input type="radio" name="delivery" value={opt.value} checked={delivery === opt.value} onChange={() => { if (delivery && delivery !== opt.value) clearDelivery(); setDelivery(opt.value); setReopened(r => ({ ...r, delivery: false })); setErrors(s => { const n = new Set(s); n.delete('delivery'); return n; }); }} style={{ display: 'none' }} />
                        <span style={{ fontSize: '14px', fontWeight: delivery === opt.value ? 600 : 500, color: 'var(--text-primary)', flex: 1 }}>
                          {opt.label}
                          {opt.sub && <span style={{ display: 'block', fontSize: '12px', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '2px' }}>{opt.sub}</span>}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element -- маленький статичний SVG, next/image тут зайвий */}
                        <img src={opt.logo} alt="" aria-hidden className="cart-carrier-logo" />
                        {delivery === opt.value && !reopened.delivery && (
                          <button
                            onClick={e => { e.preventDefault(); clearDelivery(); }}
                            style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                          >
                            {tr.change}
                          </button>
                        )}
                      </label>

                      {/* Nova Poshta sub-options */}
                      {opt.value === 'nova' && delivery === 'nova' && (
                        <div className={'cart-opt-sub' + (!novaSubtype ? ' cart-opt-list--row' : '')}>
                          {(['warehouse', 'postomat', 'courier'] as const).filter(sub => !novaSubtype || novaSubtype === sub).map(sub => (
                            <label key={sub} onMouseDown={keepFocus} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '10px 14px', borderRadius: '8px', cursor: novaSubtype === sub ? 'default' : 'pointer',
                              border: `1.5px solid ${novaSubtype === sub ? '#1E3A5F' : 'var(--border)'}`,
                              background: novaSubtype === sub ? '#1E3A5F22' : 'var(--bg-soft)',
                              transition: 'all 0.15s',
                            }}>
                              <div {...uncheckProps(novaSubtype === sub, () => { setNovaSubtype(''); clearNovaPoint(); })} style={{
                                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${novaSubtype === sub ? '#1E3A5F' : '#CBD5E1'}`,
                                background: novaSubtype === sub ? '#1E3A5F' : 'var(--bg-card)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {novaSubtype === sub && <Check size={8} color="#fff" strokeWidth={3} />}
                              </div>
                              <input type="radio" name="nova_sub" value={sub} checked={novaSubtype === sub} onChange={() => { npInit.current = null; setNovaSubtype(sub); setErrors(s => { const n = new Set(s); n.delete('novaSubtype'); return n; }); }} style={{ display: 'none' }} />
                              <span style={{ fontSize: '13px', fontWeight: novaSubtype === sub ? 600 : 500, color: 'var(--text-primary)', flex: 1 }}>
                                {sub === 'warehouse' ? tr.novaWarehouse : sub === 'postomat' ? tr.novaPostomat : tr.novaCourier}
                              </span>
                              {novaSubtype === sub && (
                                <button
                                  onClick={e => { e.preventDefault(); setNovaSubtype(''); clearNovaPoint(); }}
                                  style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                                >
                                  {tr.change}
                                </button>
                              )}
                            </label>
                          ))}
                          {novaSubtype && (
                            <div style={{ marginTop: '6px' }}>
                              <NovaPoshtaSelect
                                key={novaSubtype}
                                mode={novaSubtype}
                                lang={lang}
                                // Відновлення з чернетки (лише при першому монтуванні — див. npInit)
                                initialCity={npInit.current?.city}
                                initialCityRef={npInit.current?.cityRef}
                                initialWarehouseRef={npInit.current?.whRef}
                                initialAddress={npInit.current?.address}
                                onCityChange={city => { setNovaCityName(city); setAddress(city); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                                onWarehouseChange={wh => { setAddress(wh); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                                onAddressChange={addr => { setAddress(addr); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                                onCityRefChange={setNovaCityRef}
                                onWarehouseRefChange={setNovaWarehouseRef}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* ROZETKA Доставка — точка видачі */}
                      {opt.value === RZ_DELIVERY_TYPE && delivery === RZ_DELIVERY_TYPE && (
                        <div style={{ marginTop: '10px', paddingLeft: '14px' }}>
                          <RzDeliverySelect
                            weightKg={orderWeightKg}
                            lang={lang}
                            initialCity={rzInit.current?.city}
                            initialCityId={rzInit.current?.cityId}
                            initialDepartment={rzInit.current?.dep}
                            onCityChange={setRzCityName}
                            onCityIdChange={setRzCityId}
                            onDepartmentChange={setRzDepLabel}
                            onDepartmentIdChange={id => {
                              setRzDepId(id);
                              if (id) setErrors(s => { const n = new Set(s); n.delete('rzPoint'); return n; });
                            }}
                          />
                        </div>
                      )}

                      {/* Kharkiv delivery address */}
                      {opt.value === 'kharkiv' && delivery === 'kharkiv' && (
                        <div style={{ marginTop: '10px', paddingLeft: '14px' }}>
                          <label style={labelStyle}>{tr.addressLabel}</label>
                          <input
                            style={{ ...inputStyle, paddingLeft: '14px', border: err('address') ?? inputStyle.border }}
                            placeholder={tr.addressPh}
                            value={address}
                            onChange={e => { setAddress(e.target.value); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                  {/* ROZETKA Доставка не підходить за вагою — показуємо неактивною з причиною,
                      а не ховаємо: інакше «Нова Пошта» виглядає єдиним способом без пояснень */}
                  {!delivery && rzConfig?.enabled && !rzAvailable && rzConfig.maxWeightKg != null && (
                    <div className="cart-opt-disabled" aria-disabled="true">
                      <span className="cart-opt-disabled__dot" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/carriers/rozetka-mark.svg" alt="" aria-hidden className="cart-carrier-logo cart-carrier-logo--off" style={{ order: 9 }} />
                      <span>
                        {tr.deliveryRz}
                        <span className="cart-opt-disabled__why">
                          {lang === 'ru'
                            ? `Недоступно: заказ ≈ ${Math.ceil(orderWeightKg)} кг, лимит ${rzConfig.maxWeightKg} кг`
                            : `Недоступно: замовлення ≈ ${Math.ceil(orderWeightKg)} кг, ліміт ${rzConfig.maxWeightKg} кг`}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
                {errors.has('delivery') &&<p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errDelivery}</p>}
                {errors.has('novaSubtype') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errNovaSubtype}</p>}
                {errors.has('address') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errAddress}</p>}
                {errors.has('rzPoint') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errRzPoint}</p>}
              </Section>
              </div>

              {/* Payment */}
              <div>
              <div id="field-payment" />
              <Section icon={CreditCard} done={paymentDone} collapsed={paymentCollapsed} summary={paymentSummary} changeLabel={tr.change} collapseLabel={lang === 'ru' ? 'свернуть' : 'згорнути'} onEditStart={editStart('payment')} onEditEnd={editEnd('payment')} active={editing.payment} onReopen={() => setReopened(r => ({ ...r, payment: true }))} title={tr.sectionPayment} error={errors.has('payment')}>
                <div className={'cart-opt-list' + (!payment ? ' cart-opt-list--row' : '')}>
                  {PAYMENT_OPTIONS.filter(opt => !payment || reopened.payment || payment === opt.value).map(opt => (
                    <label key={opt.value} onMouseDown={keepFocus} title={`${opt.label} — ${opt.sub}`} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '10px', cursor: payment === opt.value ? 'default' : 'pointer',
                      border: `1.5px solid ${payment === opt.value ? '#1E3A5F' : 'var(--border)'}`,
                      background: payment === opt.value ? '#1E3A5F22' : 'var(--bg-card)',
                      transition: 'all 0.15s',
                    }}>
                      <div {...uncheckProps(payment === opt.value, () => setPayment(''))} style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${payment === opt.value ? '#1E3A5F' : '#CBD5E1'}`,
                        background: payment === opt.value ? '#1E3A5F' : 'var(--bg-card)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {payment === opt.value && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <input type="radio" name="payment" value={opt.value} checked={payment === opt.value} onChange={() => { setPayment(opt.value); setReopened(r => ({ ...r, payment: false })); editEnd('payment')(); setErrors(s => { const n = new Set(s); n.delete('payment'); return n; }); }} style={{ display: 'none' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="cart-opt-line" style={{ fontSize: '14px', fontWeight: payment === opt.value ? 600 : 500, color: 'var(--text-primary)' }}>{opt.label}</div>
                        {opt.sub && <div className="cart-opt-line" style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</div>}
                      </div>
                      {payment === opt.value && !reopened.payment && (
                        <button
                          onClick={e => { e.preventDefault(); setPayment(''); }}
                          style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                        >
                          {tr.change}
                        </button>
                      )}
                    </label>
                  ))}
                </div>
                {errors.has('payment') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>{tr.errPayment}</p>}
              </Section>
              </div>

              {/* Comment */}
              {/* Коментар — у тій самій логіці, що згорнуті секції: іконка, текст (або сіра підказка,
                  поки порожній), праворуч олівець; розгорнутий — «згорнути». Необов'язковий, тож без
                  жирного заголовка — не виділяється сильніше за обов'язкові секції. */}
              <div className="cart-sec" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div
                  className="cart-sec__head"
                  onClick={() => { if (!commentOpen) setCommentOpen(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', background: 'var(--bg-soft)', cursor: commentOpen ? undefined : 'pointer',
                    borderBottom: commentOpen ? `1px solid var(--border)` : 'none',
                  }}
                >
                  <div className="cart-sec-icon"><MessageSquare size={16} strokeWidth={2} /></div>
                  {commentOpen
                    ? <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{tr.sectionComment}</span>
                    : comment.trim()
                      ? <span className="cart-sec__summary" title={comment}>{comment.replace(/\s+/g, ' ')}</span>
                      : <span className="cart-sec__summary" style={{ color: 'var(--text-muted)' }}>{lang === 'ru' ? 'Добавить комментарий (необязательно)' : 'Додати коментар (необов\'язково)'}</span>}
                  {commentOpen ? (
                    <button type="button" className="cart-sec__change" onClick={e => { e.stopPropagation(); setCommentOpen(false); }}>
                      {lang === 'ru' ? 'свернуть' : 'згорнути'}
                    </button>
                  ) : (
                    <button type="button" className="cart-sec__change cart-sec__change--icon" title={tr.sectionComment} aria-label={tr.sectionComment}
                      onClick={e => { e.stopPropagation(); setCommentOpen(true); }}>
                      <Pencil size={15} strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </div>
                {commentOpen && (
                  <div style={{ padding: '16px' }}>
                    <textarea
                      autoFocus
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder={tr.commentPh}
                      rows={4}
                      style={{
                        width: '100%', padding: '12px 14px',
                        border: '1px solid #E2E8F0', borderRadius: '10px',
                        background: 'var(--bg-card)', fontSize: '14px', color: 'var(--text-primary)',
                        outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

            </div>

            {/* ── RIGHT: Order summary ── */}
              {/* Items list */}
              <div ref={itemsCardRef} className="cart-items-list" style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  // Та сама висота шапки, що в секціях форми зліва (Section: 10px + іконка 32px + 10px)
                  // (53px з урахуванням нижньої лінії); по горизонталі — 16px, як у секціях
                  padding: '10px 16px', minHeight: '53px', boxSizing: 'border-box',
                  background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {/* Іконка в тому ж квадраті, що в секціях форми */}
                    {/* Товари вже є — блок «заповнений», іконка синя */}
                    <span className="cart-sec-icon is-done">
                      <ShoppingCart size={16} strokeWidth={2} />
                    </span>
                    {tr.orderSummary}
                  </span>
                  <button
                    onClick={clearCart}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '12px', color: '#EF4444', background: 'none',
                      border: 'none', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    <Trash2 size={12} />{tr.clearCart}
                  </button>
                </div>

                <div className="cart-items-scroll">
                  {items.map((item, idx) => (
                    <div key={item.sku} className={'cart-item' + (idx < items.length - 1 ? ' cart-item--sep' : '')}>
                      <Link href={`/product/${item.sku}`} className="cart-item__thumb">
                        <ProductImage
                          brand={item.brand} nl1={item.nl1} nl2={item.nl2}
                          volume={item.volume ?? ''} bc={item.bc} ac={item.ac} type={item.img_type}
                          imageUrl={item.imageUrl}
                        />
                      </Link>
                      <div className="cart-item__body">
                        <div className="cart-item__head">
                          <div style={{ minWidth: 0 }}>
                            <div className="cart-item__meta">{item.brand} · {item.sku}</div>
                            <Link href={`/product/${item.sku}`} className="cart-item__name">
                              {lang === 'ru' && item.name_ru ? item.name_ru : item.name}
                            </Link>
                          </div>
                          <button type="button" className="cart-item__del" onClick={() => removeItem(item.sku)}
                            aria-label={lang === 'ru' ? 'Удалить' : 'Видалити'} title={lang === 'ru' ? 'Удалить' : 'Видалити'}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="cart-item__row">
                          {/* Той самий вигляд, що в картці товару: «− N +» однією рамкою */}
                          <div className="cart-qty-stepper">
                            <button
                              type="button" aria-label={lang === 'ru' ? 'Меньше' : 'Менше'}
                              onClick={() => { setQtyInputs(prev => { const n = { ...prev }; delete n[item.sku]; return n; }); updateQty(item.sku, item.qty - item.min_order); }}
                            >−</button>
                            <input
                              type="number"
                              min={item.min_order}
                              value={getQtyInputVal(item.sku, item.qty)}
                              onChange={e => setQtyInputs(prev => ({ ...prev, [item.sku]: e.target.value }))}
                              onBlur={() => commitQtyInput(item.sku, item.min_order)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            />
                            <button
                              type="button" aria-label={lang === 'ru' ? 'Больше' : 'Більше'}
                              onClick={() => { setQtyInputs(prev => { const n = { ...prev }; delete n[item.sku]; return n; }); updateQty(item.sku, item.qty + item.min_order); }}
                            >+</button>
                          </div>
                          <div className="cart-item__price">
                            {item.price > 0 && item.qty > 1 && (
                              <div className="cart-item__unit">{fmtMoney(item.price)} × {item.qty}</div>
                            )}
                            <div className="cart-item__sum">
                              {item.price > 0 ? <>{fmtMoney(item.price * item.qty)} <span>грн</span></> : '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals + submit */}
              <div ref={totalsRef} className="cart-totals-block" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                {role === 'wholesale' && (() => {
                  const pct     = Math.min(100, Math.round((totalPrice / WHOLESALE_MIN) * 100));
                  const metMin  = totalPrice >= WHOLESALE_MIN;
                  const need    = WHOLESALE_MIN - totalPrice;
                  return (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                        <span style={{ color: metMin ? '#15803D' : 'var(--text-secondary)', fontWeight: 600 }}>
                          {metMin ? tr.minReached : tr.minNeeded(WHOLESALE_MIN)}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                          {metMin ? '' : tr.minRemaining(need)}
                        </span>
                      </div>
                      <div className="wm-progress">
                        <div className={'wm-progress__fill' + (metMin ? ' met' : '')} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })()}

                {/* Підказку «можна без реєстрації» прибрано (04.11.2026): форма й так без входу */}

                {role === 'wholesale' && totalPrice < WHOLESALE_MIN && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: '#FEF3C7', border: '1px solid #FCD34D',
                    borderRadius: '10px', padding: '10px 14px', marginBottom: '12px',
                    fontSize: '13px', color: '#92400E',
                  }}>
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    {tr.minWarning(WHOLESALE_MIN - totalPrice)}
                  </div>
                )}

                {/* Над сумою: «не передзвонювати» і промокод (схований за посиланням) — промокод поруч із сумою, на яку впливає */}
                <div className={'cart-total-extras' + (promoOpen && !promoApplied ? ' is-promo-open' : '')}>
                  <label className={'cart-nocall' + (noCallback ? ' is-on' : '')} title={tr.noCallbackLabel}>
                    <input type="checkbox" checked={noCallback} onChange={e => setNoCallback(e.target.checked)} />
                    {/* На телефоні — коротко, щоб поруч у тому ж рядку влізла кнопка промокоду */}
                    <span className="cart-nocall__full">{tr.noCallbackLabel}</span>
                    <span className="cart-nocall__short">{tr.noCallbackShort}</span>
                  </label>
                  {promoApplied ? (
                    <span className="cart-promo-applied">
                      <Check size={14} strokeWidth={3} aria-hidden />
                      <b style={{ fontFamily: 'monospace' }}>{promoApplied.code}</b>
                      <button type="button" aria-label={tr.promoRemove} title={tr.promoRemove} onClick={() => { setPromoApplied(null); setPromoError(''); setPromoOpen(false); setPromoInput(''); }}>✕</button>
                    </span>
                  ) : !promoOpen ? (
                    <button type="button" className="cart-promo-toggle" onClick={() => setPromoOpen(true)}>
                      <TicketPercent size={16} strokeWidth={2} aria-hidden />
                      <span className="cart-promo-toggle__full">{lang === 'ru' ? 'Есть промокод' : 'Маю промокод'} ▾</span>
                      <span className="cart-promo-toggle__short">{lang === 'ru' ? 'Промокод' : 'Промокод'}</span>
                    </button>
                  ) : (
                    <span className={'cart-promo-inline' + (promoError ? ' has-error' : '')}>
                      <input
                        autoFocus
                        value={promoInput}
                        onChange={e => { setPromoInput(e.target.value.toUpperCase()); if (promoError) setPromoError(''); }}
                        onKeyDown={e => e.key === 'Enter' && handleApplyPromo()}
                        placeholder={tr.promoPlaceholder}
                      />
                      <button type="button" onClick={handleApplyPromo} disabled={promoLoading || !promoInput.trim()}>
                        {promoLoading ? tr.promoApplying : tr.promoApply}
                      </button>
                      {/* Згорнути поле назад у «Маю промокод» */}
                      <button type="button" className="cart-promo-close" aria-label={lang === 'ru' ? 'Скрыть' : 'Сховати'} title={lang === 'ru' ? 'Скрыть' : 'Сховати'}
                        onClick={() => { setPromoOpen(false); setPromoInput(''); setPromoError(''); }}>✕</button>
                      {/* Помилка/примітка — дрібним рядком під полем, поверх відступу (absolute):
                          не додає рядка й не зсуває розмітку. Поле при помилці — з червоною рамкою. */}
                      {promoError
                        ? <span className="cart-promo-note is-error">{promoError}</span>
                        : promoEligibleTotal < totalPrice && promoEligibleTotal > 0
                          ? <span className="cart-promo-note">Знижка не розповсюджується на акційні товари</span>
                          : null}
                    </span>
                  )}
                </div>

                {/* Компактний підсумок: сума поруч із кнопкою; «Товарів / Доставка» — сірим підписом */}
                <div className="cart-total-bar">
                  <div className="cart-total-bar__sum">
                    {/* Зі знижкою: стара сума закреслена, нова — зелена, поруч плашка «−450,93 грн».
                        Підпис знизу короткий, щоб кнопка лишалась у тому ж рядку. */}
                    <div className="cart-total-bar__main">
                      <span>{tr.total}</span>
                      {promoApplied && <s className="cart-total-bar__old">{fmtMoney(totalPrice)}</s>}
                      <strong className={promoApplied ? 'is-discounted' : undefined}>{fmtMoney(promoApplied?.finalTotal ?? totalPrice)} грн</strong>
                      {promoApplied && <span className="cart-total-bar__save">−{fmtMoney(promoApplied.discountAmount)} грн</span>}
                    </div>
                    <div className="cart-total-bar__sub">
                      {tr.itemsTotal(totalItems)} · {tr.deliveryLabel} {tr.deliveryByCarrier.toLowerCase()}
                    </div>
                  </div>
                  <button
                    className="cart-total-bar__btn"
                    onClick={handleSubmit}
                    disabled={submitting || (role === 'wholesale' && totalPrice < WHOLESALE_MIN)}
                  >
                    {submitting ? tr.submitting : payment === 'card' ? tr.submitCard : tr.submitOrder}
                  </button>
                </div>
                {submitError && (
                  <p style={{ fontSize: '12px', color: '#EF4444', textAlign: 'right', margin: '8px 0 0' }}>{submitError}</p>
                )}

              </div>

          </div>
        </div>
      </div>
    </>
  );
}
