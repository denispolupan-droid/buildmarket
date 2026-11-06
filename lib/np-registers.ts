/**
 * Реєстри відправлень НП (ScanSheet) для сторінки /admin/dispatch.
 *
 * Чиста логіка (без fetch), щоб покрити тестом. До 06.11.2026 сторінка показувала
 * лише ОСТАННІЙ реєстр, а посилки для нього шукала тільки за датою створення
 * реєстру — ті, що створені днем раніше, не знаходились (частина реєстрів
 * виглядала порожньою), суми брались з НП (для замовлень без наложки там 0).
 * Тепер: один список документів НП за період → розкладаємо за ScanSheetNumber,
 * суми й номери замовлень — з нашої бази, стан «передано» — за прийняттям
 * перевізником.
 */

export type NpScanSheet = { Ref: string; Number: string; DateTime: string; Count?: string | number; Printed?: string | number };

export type NpDoc = {
  IntDocNumber?: string;
  ScanSheetNumber?: string;
  RecipientContactPerson?: string;
  RecipientDescription?: string;
  BackwardDeliverySum?: string | number;
  CostOnSite?: string | number;
};

export type OrderByTtn = {
  id: string;
  order_number: number;
  contact: string | null;
  total_price: number | string | null;
  carrier_accepted_at: string | null;
};

export type RegisterTtn = {
  ttn: string;
  contact: string;
  amount: number;
  orderId: string | null;
  orderNumber: number | null;
  /** Перевізник уже прийняв посилку — з реєстру її не прибрати, в інший не додати */
  accepted: boolean;
};

export type RegisterView = {
  ref: string;
  number: string;
  dateTime: string;
  /** Скільки документів у реєстрі за даними НП (може бути більше, ніж знайдено в періоді) */
  npCount: number;
  printed: boolean;
  ttns: RegisterTtn[];
  total: number;
  /** Усі посилки з нашими замовленнями прийняті перевізником — реєстр закритий для змін.
   *  ТТН без замовлення (перевипущена накладна тощо) стану не мають і на це не впливають. */
  handedOver: boolean;
};

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

export function buildRegisterViews(
  sheets: NpScanSheet[],
  docs: NpDoc[],
  ordersByTtn: Map<string, OrderByTtn>,
): RegisterView[] {
  const bySheet = new Map<string, NpDoc[]>();
  for (const d of docs) {
    const sn = (d.ScanSheetNumber ?? '').trim();
    const ttn = (d.IntDocNumber ?? '').trim();
    if (!sn || !ttn) continue;
    const list = bySheet.get(sn) ?? [];
    if (!list.some(x => x.IntDocNumber === ttn)) list.push(d);
    bySheet.set(sn, list);
  }

  return [...sheets]
    .sort((a, b) => String(b.DateTime).localeCompare(String(a.DateTime)))
    .map(s => {
      const ttns: RegisterTtn[] = (bySheet.get(s.Number) ?? []).map(d => {
        const ttn = String(d.IntDocNumber);
        const o = ordersByTtn.get(ttn);
        return {
          ttn,
          contact: (o?.contact || d.RecipientContactPerson || d.RecipientDescription || '').trim(),
          // Сума з нашого замовлення; без нього — що дала НП (наложка/оцінка)
          amount: o ? num(o.total_price) : num(d.BackwardDeliverySum) || num(d.CostOnSite),
          orderId: o?.id ?? null,
          orderNumber: o?.order_number ?? null,
          accepted: Boolean(o?.carrier_accepted_at),
        };
      });
      return {
        ref: s.Ref,
        number: s.Number,
        dateTime: s.DateTime,
        npCount: num(s.Count),
        printed: String(s.Printed ?? '') === '1',
        ttns,
        total: Math.round(ttns.reduce((sum, t) => sum + t.amount, 0) * 100) / 100,
        handedOver: ttns.some(t => t.orderId) && ttns.filter(t => t.orderId).every(t => t.accepted),
      };
    });
}

/**
 * Реєстр, у який додаємо нові посилки: найновіший НЕ переданий перевізнику.
 * null — відкритого немає, НП створить новий при першому додаванні.
 */
export function openRegister(views: RegisterView[]): RegisterView | null {
  return views.find(v => !v.handedOver) ?? null;
}
