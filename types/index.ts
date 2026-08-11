export type Category = {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
  parent_slug: string | null;
  prom_section_url: string | null;
  prom_section_id: number | null;
  created_at: string;
};

export type Product = {
  id: number;
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  category_slug: string | null;
  product_type: string | null;
  color: string | null;
  volume: string | null;
  pack_qty: number;
  min_order: number;
  name_ru: string | null;
  description: string | null;
  description_ru: string | null;
  description_full: string | null;
  description_full_ru: string | null;
  /** Окремий опис для фідів Rozetka/Prom — щоб картка маркетплейса не дублювала сайт */
  description_mp: string | null;
  description_mp_ru: string | null;
  image: string | null;
  nl1: string | null;
  nl2: string | null;
  bc: string;
  ac: string;
  img_type: 'tube' | 'canister';
  is_active: boolean;
  is_hit: boolean;
  is_new: boolean;
  sort_order: number;
  prom_portal_url: string | null;
  keywords: string | null;
  keywords_ru: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductCharacteristic = {
  id: number;
  product_sku: string;
  label: string;
  value: string;
  sort_order: number;
};

export type ProductStock = {
  id: number;
  sku: string;
  price_cost: number | null;
  price_unit: number;
  price_old: number | null;
  price_retail: number | null;
  price_retail_old: number | null;
  price_promo: number | null;
  price_drop: number | null;
  stock_qty: number;
  stock_status: 'in_stock' | 'out_of_stock' | 'on_order';
  supplier_sku: string | null;
  updated_at: string;
};

/**
 * Те, що дозволено віддати в браузер анонімного відвідувача.
 *
 * До розділення публічний листинг тягнув product_stock(*) — і закупівельна ціна,
 * оптова, дропшип та код постачальника лежали у вихідному коді /shop і в
 * відкритому /api/products по всьому каталогу. Тип навмисно вужчий за
 * ProductStock: спроба прочитати price_cost із публічних даних тепер не
 * збереться, замість тихого undefined у рантаймі.
 */
export type ProductStockPublic = Pick<
  ProductStock,
  'price_retail' | 'price_retail_old' | 'price_promo' | 'stock_status' | 'stock_qty'
>;

/** Характеристика без службових полів — листингу треба лише пара «лейбл-значення». */
export type ProductCharacteristicPublic = Pick<ProductCharacteristic, 'label' | 'value'>;

/** Товар для публічної вітрини. */
export type ProductPublic = Product & {
  stock: ProductStockPublic | null;
  characteristics: ProductCharacteristicPublic[];
};

/** Склад для B2B-кабінету: вітринні поля + оптова ціна. Собівартості тут теж немає. */
export type ProductStockB2B = Pick<
  ProductStock,
  'price_retail' | 'price_retail_old' | 'price_promo' | 'price_old' | 'price_unit' | 'stock_status' | 'stock_qty'
>;

/** Товар для /catalog — оптовий кабінет за авторизацією. */
export type ProductB2B = Product & {
  stock: ProductStockB2B | null;
  characteristics: ProductCharacteristicPublic[];
};

/** Товар із повним складом — лише для адмінки і B2B-кабінету за авторизацією. */
export type ProductFull = Product & {
  stock: ProductStock | null;
  characteristics: ProductCharacteristic[];
};

export type ProductListItem = Product & {
  stock: ProductStock | null;
};

export type CartItem = {
  sku: string;
  name: string;
  name_ru?: string | null;
  brand: string;
  volume: string | null;
  price: number;
  qty: number;
  min_order: number;
  nl1: string;
  nl2?: string;
  bc: string;
  ac: string;
  img_type: 'tube' | 'canister';
  imageUrl?: string;
  is_promo?: boolean;
};

export type OrderItem = {
  sku: string;
  name: string;
  brand: string;
  qty: number;
  price: number;
};

export type Order = {
  id: string;
  order_number: number;
  created_at: string;
  status: 'new' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total_price: number;
  company: string | null;
  contact: string;
  phone: string;
  email: string;
  delivery_type: string;
  delivery_subtype: string | null;
  delivery_address: string | null;
  payment_type: string;
  comment: string | null;
  tracking_number: string | null;
  items: OrderItem[];
};

export type UserRole = 'wholesale' | 'retail' | 'dropship' | 'guest';
