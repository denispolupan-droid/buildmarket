/**
 * MarketplaceAdapter (аудит 31.10.2026, §1/§8/§10 п. 17): один контракт для
 * площадок замість трьох копій синку. Четверта площадка = один файл-адаптер
 * тут + міграція з колонкою <code>_order_id/<code>_data, без правок у 20 файлах.
 *
 * Адаптер знає ЛИШЕ свій API і мапінг у наш формат; спільне (клієнт за
 * телефоном, вставка замовлення, знімок комісії) робить import-order.ts, а
 * комісії для обліку — fees.ts. Синки (lib/<code>-sync.ts) лишають собі
 * самолікування пушів і специфіку кабінету, яка в кожної площадки своя.
 */
export type MarketplaceCode = 'prom' | 'rozetka' | 'epicentr';

/** Позиція замовлення в нашому форматі (orders.items). */
export type MappedItem = { sku: string; name: string; brand: string; qty: number; price: number; supplier_sku?: string };

/** Замовлення площадки, зведене до наших колонок orders. */
export type MappedOrder = {
  contact: string;
  phone: string;
  email: string;
  delivery_type: string;
  delivery_subtype?: string | null;
  delivery_address?: string | null;
  delivery_city_ref?: string | null;
  delivery_city_name?: string | null;
  delivery_warehouse_ref?: string | null;
  payment_type: string;
  paid: boolean;
  comment: string | null;
  items: MappedItem[];
  total_price: number;
};

/** Спільна частина результатів compute*Commission трьох площадок. */
export type CommissionResult = { total_commission: number };

export interface MarketplaceAdapter<Raw = unknown> {
  readonly code: MarketplaceCode;
  /** Колонки orders: ідентифікатор площадки й сирий знімок payload. */
  readonly idColumn: 'prom_order_id' | 'rozetka_order_id' | 'epicentr_order_id';
  readonly dataColumn: 'prom_data' | 'rozetka_data' | 'epicentr_data';
  /** Ідентифікатор замовлення на площадці (як зберігаємо в idColumn). */
  externalId(raw: Raw): number | string;
  /** Людський номер для логів (у Епіцентру id ≠ number). */
  label(raw: Raw): string;
  /** Скасоване/відхилене ще до імпорту — такі не заводимо. */
  cancelledOnImport(raw: Raw): boolean;
  mapOrder(raw: Raw): MappedOrder;
  /** Сирий знімок для dataColumn (без _commission — його додає import-order). */
  snapshot(raw: Raw): Record<string, unknown>;
  /** Оцінка комісії по позиціях за ставками категорій (знімок при імпорті і фолбек в обліку). */
  estimateCommission(items: MappedItem[]): Promise<CommissionResult>;
}
