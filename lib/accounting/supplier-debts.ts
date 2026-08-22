// Відкриті борги перед постачальником: що саме ще не оплачено.
//
// Борг — це проводка на рахунку 'supplier' зі знаком мінус (прихід зі складу
// або РН із дропшип-рядками). Оплата — та сама проводка зі знаком плюс.
// Скільки по боргу лишилось = |сума| − рознесене на нього.

import { createServiceClient } from '../supabase';
import type { OpenCharge } from './allocation';

export type SupplierCharge = OpenCharge & {
  total: number;
  allocated: number;
  docId: string | null;
  docNumber: string | null;
  docType: string | null;
  orderNumber: number | null;
  description: string;
};

/**
 * Борги постачальника з залишками. `onlyOpen` — лишити тільки ті, де ще є що
 * платити (для вікна оплати); повний список потрібен історії розрахунків.
 */
export async function supplierCharges(supplierId: number, onlyOpen = true): Promise<SupplierCharge[]> {
  const db = createServiceClient();

  const { data: entries } = await db
    .from('money_entries')
    .select('id, amount, business_date, description, doc_id, order_id')
    .eq('account_type', 'supplier')
    .eq('counterparty_id', String(supplierId))
    .lt('amount', 0)
    .order('business_date', { ascending: true });

  const charges = entries ?? [];
  if (!charges.length) return [];

  const { data: allocs } = await db
    .from('supplier_payment_allocations')
    .select('charge_entry_id, amount')
    .in('charge_entry_id', charges.map(c => c.id));

  const allocated = new Map<string, number>();
  for (const a of (allocs ?? [])) {
    allocated.set(a.charge_entry_id as string, (allocated.get(a.charge_entry_id as string) ?? 0) + Number(a.amount));
  }

  // Номери документів і замовлень — щоб у списку було видно, за що борг
  const docIds = [...new Set(charges.map(c => c.doc_id).filter(Boolean))] as string[];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id as string, d]));

  const orderIds = [...new Set(charges.map(c => c.order_id).filter(Boolean))] as string[];
  const { data: orders } = orderIds.length
    ? await db.from('orders').select('id, order_number').in('id', orderIds)
    : { data: [] };
  const orderMap = new Map((orders ?? []).map(o => [o.id as string, o.order_number as number]));

  const rows = charges.map(c => {
    const total = Math.abs(Number(c.amount));
    const alloc = allocated.get(c.id as string) ?? 0;
    const doc = c.doc_id ? docMap.get(c.doc_id as string) : null;
    return {
      id: c.id as string,
      date: c.business_date as string,
      total,
      allocated: alloc,
      // Округлення до копійки: інакше на 0.1 + 0.2 лишався б хвіст,
      // і борг ніколи не показувався б закритим.
      remaining: Math.max(0, Math.round((total - alloc) * 100) / 100),
      docId: (c.doc_id as string) ?? null,
      docNumber: (doc?.doc_number as string) ?? null,
      docType: (doc?.doc_type as string) ?? null,
      orderNumber: c.order_id ? (orderMap.get(c.order_id as string) ?? null) : null,
      description: (c.description as string) ?? '',
    };
  });

  return onlyOpen ? rows.filter(r => r.remaining > 0) : rows;
}

/** Скільки з оплати ще не рознесено (аванс). */
export async function paymentUnallocated(paymentEntryId: string, paymentAmount: number): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from('supplier_payment_allocations')
    .select('amount')
    .eq('payment_entry_id', paymentEntryId);
  const used = (data ?? []).reduce((s, a) => s + Number(a.amount), 0);
  return Math.max(0, Math.round((paymentAmount - used) * 100) / 100);
}
