/**
 * Постачальник товару, проданого З НАШОГО СКЛАДУ — за партіями FIFO (stock_batches).
 *
 * Рядок РН зі складу має supplier_id = null (постачальник відомий лише в партії),
 * тож у «Валовий прибуток по постачальниках» усе складське падало в «Наш склад» —
 * 07.11.2026 власник не побачив там «Ринок», хоча продано 5 шт його товару.
 * Тут продажі складу програються по партіях кожного SKU в порядку надходження
 * (FIFO, як і собівартість), і кожна одиниця отримує постачальника своєї партії.
 * Чисто, без БД — під тести.
 */
export type BatchIn = { sku: string; supplierId: number | null; qty: number; receivedAt: string };
export type OwnSale = { key: string; sku: string; qty: number; date: string };
export type SupplierShare = { supplierId: number | null; qty: number };

export function attributeOwnSales(batches: BatchIn[], sales: OwnSale[]): Map<string, SupplierShare[]> {
  const queues = new Map<string, { supplierId: number | null; left: number }[]>();
  for (const b of [...batches].sort((x, y) => x.receivedAt.localeCompare(y.receivedAt))) {
    if (!(b.qty > 0)) continue;
    const q = queues.get(b.sku) ?? [];
    q.push({ supplierId: b.supplierId, left: b.qty });
    queues.set(b.sku, q);
  }
  const out = new Map<string, SupplierShare[]>();
  for (const s of [...sales].sort((x, y) => x.date.localeCompare(y.date) || x.key.localeCompare(y.key))) {
    let need = s.qty;
    const shares: SupplierShare[] = [];
    const q = queues.get(s.sku) ?? [];
    for (const b of q) {
      if (need <= 0) break;
      if (b.left <= 0) continue;
      const take = Math.min(b.left, need);
      b.left -= take; need -= take;
      const prev = shares.find(x => x.supplierId === b.supplierId);
      if (prev) prev.qty += take; else shares.push({ supplierId: b.supplierId, qty: take });
    }
    if (need > 0) shares.push({ supplierId: null, qty: need });   // партії не знайшлось — лишається «Наш склад»
    out.set(s.key, shares);
  }
  return out;
}
