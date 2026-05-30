import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft, ShoppingCart, AlertTriangle, CheckCircle2, Package } from 'lucide-react';
import ReorderClient from './ReorderClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function ReorderPage() {
  // Позиції нижче мінімального залишку
  const { data: lowStock } = await db
    .from('stock_balance')
    .select('sku, qty_total, qty_available, avg_cost, min_reorder_qty, warehouse_id')
    .not('min_reorder_qty', 'is', null)
    .gt('min_reorder_qty', 0)
    .filter('qty_total', 'lte', db.from('stock_balance').select('min_reorder_qty'))
    .order('qty_total', { ascending: true })
    .limit(200);

  // Обхід — фільтруємо на рівні JS (Supabase не підтримує порівняння двох колонок напряму)
  const { data: allWithMin } = await db
    .from('stock_balance')
    .select('sku, qty_total, qty_available, avg_cost, min_reorder_qty, warehouse_id')
    .not('min_reorder_qty', 'is', null)
    .gt('min_reorder_qty', 0)
    .limit(500);

  const belowMin = (allWithMin ?? []).filter(r => Number(r.qty_total) <= Number(r.min_reorder_qty));

  if (!belowMin.length) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: '1000px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <Link href="/admin/accounting/stock" style={{ display: 'flex', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            <ArrowLeft size={16} />
          </Link>
          <AlertTriangle size={18} color="#F59E0B" />
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Що потрібно докупити</h1>
        </div>
        <div style={{ padding: '48px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <CheckCircle2 size={40} color="#15803D" style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '16px', fontWeight: 700, color: '#15803D', marginBottom: '6px' }}>Всі залишки в нормі</div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Немає позицій нижче мінімального залишку
          </div>
        </div>
      </div>
    );
  }

  const skus = belowMin.map(r => r.sku);

  // Назви товарів
  const { data: products } = await db
    .from('products')
    .select('sku, name, brand')
    .in('sku', skus);

  const nameMap: Record<string, { name: string; brand: string }> = {};
  for (const p of products ?? []) nameMap[p.sku] = { name: p.name ?? '', brand: p.brand ?? '' };

  // Відкриті ЗП для цих SKU (двоетапно — Supabase JS не підтримує підзапити в .in())
  const { data: openPOs } = await db
    .from('acc_documents')
    .select('id')
    .eq('doc_type', 'purchase_order')
    .eq('status', 'confirmed')
    .not('procurement_status', 'in', '("received","cancelled","closed")');
  const openPOIds = (openPOs ?? []).map((p: { id: string }) => p.id);

  const { data: openPOLines } = openPOIds.length ? await db
    .from('acc_document_lines')
    .select('sku, qty, document_id')
    .in('sku', skus)
    .in('document_id', openPOIds)
  : { data: [] };

  // Відкритий попит з замовлень покупців
  const { data: waitingOrders } = await db
    .from('orders')
    .select('id, items')
    .in('status', ['confirmed', 'awaiting_stock']);

  const demandMap: Record<string, { orders: number; qty: number }> = {};
  for (const o of waitingOrders ?? []) {
    for (const item of (o.items as { sku: string; qty: number }[] ?? [])) {
      if (skus.includes(item.sku)) {
        demandMap[item.sku] = {
          orders: (demandMap[item.sku]?.orders ?? 0) + 1,
          qty:    (demandMap[item.sku]?.qty    ?? 0) + item.qty,
        };
      }
    }
  }

  // Скільки вже замовлено у відкритих ЗП
  const orderedMap: Record<string, number> = {};
  for (const l of openPOLines ?? []) {
    orderedMap[l.sku] = (orderedMap[l.sku] ?? 0) + Number(l.qty ?? 0);
  }

  const rows = belowMin.map(r => ({
    ...r,
    qty_total:     Number(r.qty_total),
    qty_available: Number(r.qty_available),
    avg_cost:      Number(r.avg_cost ?? 0),
    min_reorder_qty: Number(r.min_reorder_qty),
    name:       nameMap[r.sku]?.name  ?? r.sku,
    brand:      nameMap[r.sku]?.brand ?? '',
    ordered_qty: orderedMap[r.sku] ?? 0,
    demand:     demandMap[r.sku] ?? null,
  }));

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Link href="/admin/accounting/stock" style={{ display: 'flex', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <AlertTriangle size={18} color="#F59E0B" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Що потрібно докупити
        </h1>
        <span style={{ fontSize: '13px', padding: '2px 10px', borderRadius: '6px', background: '#FEF3C7', color: '#92400E', fontWeight: 700 }}>
          {rows.length} позицій
        </span>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px', marginLeft: '28px' }}>
        Позиції де поточний залишок ≤ мінімального рівня
      </p>

      <ReorderClient rows={rows} />
    </div>
  );
}
