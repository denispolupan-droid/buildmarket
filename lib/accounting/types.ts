export type DocType =
  | 'purchase_order'
  | 'receipt'
  | 'sale'
  | 'return_in'
  | 'return_out'
  | 'write_off'
  | 'transfer'
  | 'inventory';

export type DocStatus = 'draft' | 'confirmed' | 'cancelled';

export type FulfillmentType = 'own' | 'dropship';

export type AccDocument = {
  id: string;
  doc_type: DocType;
  doc_number: string;
  status: DocStatus;
  warehouse_id: number;
  warehouse_to_id: number | null;
  supplier_id: number | null;
  order_id: string | null;
  customer_id: string | null;
  counterparty: string | null;
  channel_code: string | null;
  total_amount: number;
  total_cost: number;
  tracking_number: string | null;
  expected_date: string | null;
  doc_date: string;
  notes: string | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  reversal_of: string | null;
  created_at: string;
  created_by: string | null;
  currency: string;
  exchange_rate: number;
  meta: Record<string, unknown>;
};

export type AccDocumentLine = {
  id: number;
  document_id: string;
  sku: string;
  qty: number;
  price: number;
  cost_price: number | null;
  amount: number;           // GENERATED: qty * price
  warehouse_id: number | null;
  fulfillment_type: FulfillmentType;
  supplier_id: number | null;
  sort_order: number;
  uom_code: string | null;
  uom_factor: number;
  qty_in_base: number;      // GENERATED: qty * uom_factor
  qty_actual: number | null;
  qty_system: number | null;
  exchange_rate: number;
  price_uah: number;        // GENERATED: price * exchange_rate
  meta: Record<string, unknown>;
};

export type AccDocumentWithLines = AccDocument & {
  lines: AccDocumentLine[];
};

// ── Входные данные ────────────────────────────────────────────────────────────

export type CreateDocumentLineInput = {
  sku: string;
  qty: number;
  price: number;
  cost_price?: number;
  warehouse_id?: number;
  fulfillment_type?: FulfillmentType;
  supplier_id?: number;
  uom_code?: string;
  uom_factor?: number;
  qty_actual?: number;
  qty_system?: number;
  exchange_rate?: number;
  meta?: Record<string, unknown>;
};

export type CreateDocumentInput = {
  doc_type: DocType;
  warehouse_id: number;
  warehouse_to_id?: number;
  supplier_id?: number;
  order_id?: string;
  customer_id?: string;
  counterparty?: string;
  channel_code?: string;
  tracking_number?: string;
  expected_date?: string;
  doc_date?: string;
  notes?: string;
  currency?: string;
  exchange_rate?: number;
  lines: CreateDocumentLineInput[];
  created_by?: string;
  meta?: Record<string, unknown>;
};

// ── Резервы ───────────────────────────────────────────────────────────────────

export type ReservationItem = { sku: string; qty: number };

export type CreateReservationInput = {
  order_id: string;
  warehouse_id: number;
  items: ReservationItem[];
  expires_at?: string;
};

export type ReservationResult = {
  success: boolean;
  reserved: ReservationItem[];
  insufficient: Array<{ sku: string; requested: number; available: number }>;
};

// ── Движение (внутренний тип для построения массива движений) ─────────────────

export type MovementInsert = {
  document_id: string;
  document_line_id: number;
  doc_type: string;
  warehouse_id: number;
  sku: string;
  qty: number;
  cost_price: number | null;
  sale_price: number | null;
  order_id: string | null;
  supplier_id: number | null;
};
