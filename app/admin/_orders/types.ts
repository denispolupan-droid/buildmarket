import type { OrderFulfillmentInfo } from '../../../lib/accounting/dropship';
import type { FulfillmentSource } from '../../../lib/accounting/fulfillment';
import { type ReturnTracking } from '../../../lib/np-return-tracking';
import { type MarketplaceFeeTariffs } from '../../../lib/marketplace-delivery-fee';
import type { OrderSettlement } from '../../../lib/accounting/order-settlement';

/** Історія клієнта для картки — /api/admin/orders/[id]/customer-orders */
export type CustomerHistory = {
  count: number;
  total: number;
  orders: { id: string; order_number: number; created_at: string; channel_code: string | null; status: string; total_price: number; items: { sku: string; name: string; qty: number }[] }[];
  more: boolean;
  bought: Record<string, { qty: number; orders: number; last: string }>;
};

export type EnrichedFulfillmentSource = FulfillmentSource & {
  available_own: number;
  supplier_in_stock: boolean;
};

export type FulfillmentData = OrderFulfillmentInfo & {
  plan?: { items: EnrichedFulfillmentSource[]; has_own: boolean; has_dropship: boolean; unresolved: string[] };
  reservations?: { sku: string; qty: number; warehouse_id: number; reservation_status: string }[];
  /** Факт з леджера (є, коли проведена ≥1 РН): виручка/COGS/комісія/доставка за проводками */
  /** extra — еквайринг і збори НП (переказ наложки, утримання, збір Rozetka Доставки), крім доставки */
  fact?: { revenue: number; cogs: number; commission: number; delivery: number; extra?: number; posted_docs: number } | null;
  /** Серверна оцінка комісії МП (брекети Rozetka / категорійні ставки Prom) для непроведених */
  commission_estimate?: number | null;
  /** Винагорода RozetkaPay за переказ: fact — з реєстру виплати, estimate — за середньою ставкою */
  payment_fee?: { amount: number; source: 'fact' | 'estimate' } | null;
  /** Джерело всіх позицій уже зафіксоване документами — сервер не питав роутер заново */
  source_fixed?: boolean;
};

export type OrderItem = { sku: string; name: string; brand: string; qty: number; price: number; is_bonus?: boolean; supplier_sku?: string };

export type PromCommissionItem = {
  sku: string; item_total: number; commission_pct: number; commission_amt: number; category_slug: string | null;
};

export type PromCommissionData = {
  total_commission: number; net_revenue: number; plan: string; items: PromCommissionItem[];
};

export type RozetkaCommissionItem = {
  sku: string; item_total: number; commission_pct: number; commission_amt: number; category_slug: string | null;
};

export type RozetkaCommissionData = {
  total_commission: number; net_revenue: number; items: RozetkaCommissionItem[];
};

export type Order = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  internal_note?: string | null;
  flags?: string[] | null;
  total_price: number;
  company: string | null;
  contact: string;
  phone: string;
  email: string;
  delivery_type: string;
  delivery_subtype: string | null;
  delivery_address: string | null;
  delivery_city_ref: string | null;
  delivery_city_name: string | null;
  delivery_warehouse_ref: string | null;
  payment_type: string;
  /** generated-колонка (міграція 099): форма оплати з payload площадки — те саме, що фільтр «оплата» */
  payment_method_code?: string | null;
  comment: string | null;
  tracking_number: string | null;
  carrier_accepted_at: string | null;
  carrier_status_text: string | null;
  carrier_status_synced_at: string | null;
  /** Час видачі за даними перевізника; null — перевізник часу не дав */
  carrier_delivered_at:   string | null;
  /** Звідки прийшов покупець: мітка з реклами або сайт-реферер */
  utm_source:             string | null;
  utm_medium:             string | null;
  utm_campaign:           string | null;
  referrer_url:           string | null;
  status_changed_by:  string | null;
  payment_confirmed:  boolean;
  amount_paid:        number;
  callback_done:      boolean;
  invoice_as_company: boolean | null;
  invoice_options:    Record<string, boolean> | null;
  supplier_sent_at:   string | null;
  /** хто надіслав (міграція 131); null — надіслано до 18.10.2026 */
  supplier_sent_by?:  string | null;
  channel_code:       string | null;
  prom_order_id:      string | number | null;
  rozetka_order_id:   string | number | null;
  epicentr_order_id:  string | null;
  customer_id:        string | null;
  price_type:         string | null;
  discount_pct:       number | null;
  discount_amount:    number | null;
  promo_code:         string | null;
  promo_discount:     number | null;
  shipping_supplier_id: number | null;
  mp_refund_status:   string | null;
  np_return_ref:      string | null;
  np_return_number:   string | null;
  np_return_tracking: ReturnTracking | null;
  fulfillment_mode:   string | null;
  confirmed_at:       string | null;
  shipped_at:         string | null;
  delivered_at:       string | null;
  cancelled_at:       string | null;
  status_history:     { status: string; at: string; by: string }[] | null;
  payment_due_date:   string | null;
  items: OrderItem[];
  prom_data:          ({ _commission?: PromCommissionData } & Record<string, unknown>) | null;
  rozetka_data:       ({ _commission?: RozetkaCommissionData } & Record<string, unknown>) | null;
  epicentr_data:      ({ _commission?: PromCommissionData; number?: string } & Record<string, unknown>) | null;
};

/**
 * Колонки, які журнал реально читає з orders — рівно поля типу Order вище.
 * Раніше page.tsx брав select('*'): 88 колонок, серед них ttn_snapshot і сирі
 * payload площадок, яких журнал не показує, їхали в RSC-пропси кожного показу
 * (аудит 31.10, §3 п. 5). Додаєш поле в Order — додай і сюди.
 */
export const ORDER_SELECT =
  'id, order_number, created_at, status, internal_note, flags, total_price, company, contact, phone, email, delivery_type, delivery_subtype, delivery_address, delivery_city_ref, delivery_city_name, delivery_warehouse_ref, payment_type, payment_method_code, comment, tracking_number, carrier_accepted_at, carrier_status_text, carrier_status_synced_at, carrier_delivered_at, utm_source, utm_medium, utm_campaign, referrer_url, status_changed_by, payment_confirmed, amount_paid, callback_done, invoice_as_company, invoice_options, supplier_sent_at, supplier_sent_by, channel_code, prom_order_id, rozetka_order_id, epicentr_order_id, customer_id, price_type, discount_pct, discount_amount, promo_code, promo_discount, shipping_supplier_id, mp_refund_status, np_return_ref, np_return_number, np_return_tracking, fulfillment_mode, confirmed_at, shipped_at, delivered_at, cancelled_at, status_history, payment_due_date, items, prom_data, rozetka_data, epicentr_data';

export type CounterpartyOption = { id: string; name: string; company: string | null; phone: string | null; city: string | null; type: string | null };

export interface AdminOrdersProps {
  initialOrders: Order[];
  currentPage?: number;
  totalPages?: number;
  userRole?: string;
  hasRecentReceipts?: boolean;
  expandOrderId?: string;
  dateFrom?: string;
  dateTo?: string;
  statusCounts?: Record<string, number>;
  currentStatus?: string;
  /** Пошук і фільтри каналу/перевізника/оплати застосовує сервер — сюди приходить чинний стан з URL */
  initialSearch?: string;
  channelFilter?: string;
  carrierFilter?: string;
  /** код форми оплати з orders.payment_method_code ('' — без фільтра) */
  payFilter?: string;
  /** 'pending' — показані лише повернення без рішення (зріз перекриває вкладку статусу) */
  retFilter?: string;
  /** Фільтр колонки «Відправка»: 'sent' | 'unsent' — чи надіслано постачальнику;
   *  'own' | 'supplier' | 'mixed' — спосіб відправки (fulfillment_mode); '' — без фільтра */
  sentFilter?: string;
  sentCounts?: Record<string, number>;
  /** скільки посилок їде назад без рішення «забрати з пошти / залишити» */
  pendingReturns?: number;
  channelCounts?: Record<string, number>;
  carrierCounts?: Record<string, number>;
  /** скільки замовлень на кожну форму оплати в поточному зрізі */
  payCounts?: Record<string, number>;
  /** Скільки замовлень підпадає під чинний зріз у всій базі (не на сторінці) */
  totalFound?: number;
  /** Сума замовлень активної вкладки статусу (0 — не показувати) */
  summaryAmount?: number;
  /** sku першої позиції → шлях до фото, для мініатюри в рядку */
  productThumbs?: Record<string, string>;
  sortBy?: string;
  sortDir?: string;
  promCommissionPct?: number;
  rozetkaCommissionPct?: number;
  /** Тарифи зборів за доставку (Smart / точка видачі / «дешева доставка») для оцінки економіки. */
  feeTariffs?: MarketplaceFeeTariffs;
  initialSaleDocs?: Record<string, { id: string; number: string; status?: string }[]>;
  initialReturnDocs?: Record<string, { id: string; number: string }[]>;
  initialShippedQty?: Record<string, Record<string, number>>;
  /** «Виплачено» з леджера: чи дійшли гроші за замовлення до наших рахунків (lib/accounting/order-settlement) */
  initialSettlement?: Record<string, OrderSettlement>;
}
