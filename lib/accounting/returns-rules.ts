// Чисті правила документа «Повернення» — без БД, покриті юніт-тестами
// (tests/returns-rules.test.ts). Робота з базою — в lib/accounting/returns.ts.
//
// Два види документа живуть у acc_documents:
//   ПВ — return_in       (повернення від покупця): заявка «очікуємо товар» →
//        проведення «товар отримано» (сторно виручки/COGS/комісії, товар на склад)
//   ПП — supplier_return (повернення постачальнику): проводиться при відправці
//        «відправлено» (склад OUT, борг постачальнику менше) → «прийнято»
// Реквізити повернення (стадія, причина, ТТН, галочки) — в acc_documents.meta.return.

export type ReturnKind  = 'customer' | 'supplier';
export type ReturnStage = 'awaiting' | 'received' | 'sent' | 'accepted';
export type ReturnReason = 'surplus' | 'defect' | 'wrong_item' | 'not_fit' | 'damaged' | 'other';
export type RefundMethod = 'bank' | 'cash';

export type ReturnMeta = {
  kind: ReturnKind;
  stage: ReturnStage;
  reason: ReturnReason;
  reason_text?: string | null;
  /** ТТН: для ПВ — зворотна посилка від покупця, для ПП — посилка постачальнику. */
  ttn?: string | null;
  /** ПВ по маркетплейсу: площадка про повернення не знає — комісію не сторнуємо. */
  mp_unaware?: boolean;
  /** ПВ: при отриманні товару повернути кошти покупцю з банку/каси. */
  refund?: { method: RefundMethod } | null;
  received_at?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  /** ПВ: фактично сторнована комісія маркетплейсу (для сторно при скасуванні). */
  commission_reversed?: number;
  /** ПВ: фактично повернуті покупцю кошти. */
  refunded?: number;
};

export const REASON_LABEL: Record<ReturnReason, string> = {
  surplus:    'Надлишок (замовили більше)',
  defect:     'Брак / дефект',
  wrong_item: 'Пересорт (не той товар)',
  not_fit:    'Не підійшов',
  damaged:    'Пошкоджено при доставці',
  other:      'Інше',
};

export const STAGE_LABEL: Record<ReturnStage, string> = {
  awaiting: 'Очікуємо товар',
  received: 'Товар отримано',
  sent:     'Відправлено постачальнику',
  accepted: 'Прийнято постачальником',
};

export const KIND_LABEL: Record<ReturnKind, string> = {
  customer: 'Від покупця',
  supplier: 'Постачальнику',
};

export const MARKETPLACE_CHANNELS = new Set(['prom', 'rozetka', 'epicentr']);

export function isReturnReason(v: unknown): v is ReturnReason {
  return typeof v === 'string' && v in REASON_LABEL;
}

/** Стадія з meta документа; для старих документів без meta — за статусом. */
export function stageOf(meta: ReturnMeta | null | undefined, docType: string, status: string): ReturnStage {
  if (meta?.stage) return meta.stage;
  if (docType === 'return_in') return status === 'confirmed' ? 'received' : 'awaiting';
  return 'sent';
}

export function kindOf(docType: string): ReturnKind {
  return docType === 'return_in' ? 'customer' : 'supplier';
}

// ── Скільки можна повернути ──────────────────────────────────────────────────

export type QtyLine = { sku: string; qty: number };

/**
 * Доступно до повернення по SKU: відвантажено мінус уже повернуто.
 * Чернетки-заявки теж рахуються як «повернуто» — інакше по одному товару
 * можна відкрити дві заявки.
 */
export function returnableBySku(shipped: QtyLine[], returned: QtyLine[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of shipped)  m.set(l.sku, (m.get(l.sku) ?? 0) + Number(l.qty));
  for (const l of returned) if (m.has(l.sku)) m.set(l.sku, (m.get(l.sku) ?? 0) - Number(l.qty));
  for (const [sku, q] of m) m.set(sku, Math.max(0, Math.round(q * 1000) / 1000));
  return m;
}

/** Перевірка запиту проти доступного; повертає текст помилки або null. */
export function validateRequestedQty(
  requested: QtyLine[],
  available: Map<string, number>,
): string | null {
  const seen = new Set<string>();
  for (const r of requested) {
    if (!r.sku || seen.has(r.sku)) return `${r.sku || '?'}: рядок дублюється`;
    seen.add(r.sku);
    const q = Number(r.qty);
    if (!Number.isFinite(q) || q <= 0) return `${r.sku}: кількість має бути більше нуля`;
    const avail = available.get(r.sku) ?? 0;
    if (q > avail + 1e-9) return `${r.sku}: до повернення доступно ${avail}, запитано ${q}`;
  }
  return null;
}

// ── Комісія маркетплейсу ─────────────────────────────────────────────────────

/**
 * Сторно комісії при поверненні: пропорція від ФАКТИЧНО проведеної комісії
 * (ставка на момент нарахування могла відрізнятися від поточної), не більше
 * повної. Площадка не знає про повернення (mp_unaware) → нічого не сторнуємо.
 */
export function commissionToReverse(params: {
  postedNet: number;
  returnedTotal: number;
  orderTotal: number;
  mpUnaware: boolean;
}): number {
  const { postedNet, returnedTotal, orderTotal, mpUnaware } = params;
  if (mpUnaware) return 0;
  if (postedNet <= 0 || orderTotal <= 0 || returnedTotal <= 0) return 0;
  const share = Math.min(1, returnedTotal / orderTotal);
  return Math.round(share * postedNet * 100) / 100;
}

// ── Дозволені дії за стадією ────────────────────────────────────────────────

export type ReturnActions = {
  receive: boolean;          // ПВ: товар отримано → провести
  supplierReturn: boolean;   // ПВ: створити ПП на підставі
  accept: boolean;           // ПП: прийнято постачальником
  cancel: boolean;
  editTtn: boolean;
};

export function actionsFor(params: {
  kind: ReturnKind;
  stage: ReturnStage;
  status: string;
  /** ПВ: скільки штук ще не поїхало постачальнику */
  supplierReturnableQty?: number;
  /** ПВ: є активні ПП на підставі → скасовувати не можна */
  hasActiveChildren?: boolean;
}): ReturnActions {
  const { kind, stage, status } = params;
  const cancelled = status === 'cancelled';
  if (cancelled) return { receive: false, supplierReturn: false, accept: false, cancel: false, editTtn: false };
  if (kind === 'customer') {
    return {
      receive:        stage === 'awaiting',
      supplierReturn: stage === 'received' && (params.supplierReturnableQty ?? 0) > 0,
      accept:         false,
      cancel:         !params.hasActiveChildren,
      editTtn:        true,
    };
  }
  return {
    receive:        false,
    supplierReturn: false,
    accept:         stage === 'sent',
    cancel:         true,
    editTtn:        stage === 'sent',
  };
}

/** Хронологія документа — для картки й журналу. */
export type TimelineStep = { key: string; label: string; at: string | null; done: boolean };

export function timelineFor(params: {
  kind: ReturnKind;
  stage: ReturnStage;
  status: string;
  createdAt: string | null;
  confirmedAt: string | null;
  meta: ReturnMeta | null;
  cancelledAt?: string | null;
}): TimelineStep[] {
  const { kind, stage, status, meta } = params;
  const steps: TimelineStep[] = [];
  if (kind === 'customer') {
    steps.push({ key: 'created',  label: 'Заявка створена', at: params.createdAt, done: true });
    steps.push({ key: 'received', label: 'Товар отримано, проведено', at: meta?.received_at ?? params.confirmedAt, done: stage === 'received' });
  } else {
    steps.push({ key: 'sent',     label: 'Відправлено постачальнику', at: meta?.sent_at ?? params.confirmedAt ?? params.createdAt, done: true });
    steps.push({ key: 'accepted', label: 'Прийнято постачальником', at: meta?.accepted_at ?? null, done: stage === 'accepted' });
  }
  if (status === 'cancelled') steps.push({ key: 'cancelled', label: 'Скасовано', at: params.cancelledAt ?? null, done: true });
  return steps;
}

/** Сума документа повернення: ПВ — за цінами продажу, ПП — за собівартістю. */
export function returnTotal(kind: ReturnKind, lines: Array<{ qty: number; price: number | null; cost_price: number | null }>): number {
  const sum = lines.reduce((s, l) => s + Math.abs(Number(l.qty)) * Number((kind === 'customer' ? l.price : l.cost_price) ?? 0), 0);
  return Math.round(sum * 100) / 100;
}
