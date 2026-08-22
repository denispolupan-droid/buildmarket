import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';
import PayablesClient, { type SupplierBalance, type TransitItem } from './PayablesClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PayablesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // 1. Всі проводки по рахунку постачальника (пагінація: money_entries росте безмежно,
  //    без range() PostgREST мовчки обрізав би на 1000 → неправильні баланси постачальників)
  const entries = await fetchAllRows((f, t) => db
    .from('money_entries')
    .select('counterparty_id, doc_type, amount, business_date, description, doc_id, order_id')
    .eq('account_type', 'supplier')
    .not('counterparty_id', 'is', null)
    .order('business_date', { ascending: true })
    .range(f, t));

  // 2. Номери документів
  const docIds = [...new Set((entries ?? []).map(e => e.doc_id).filter(Boolean))];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));

  // 2b. Номери замовлень. Проводка знає order_id, а от опис — не завжди: борг
  //     дропшипу з 21.07 створює інша гілка коду, і номер у текст не потрапляє.
  //     Тягнемо його з бази, тож номер видно і в старих, і в нових рядках.
  const orderIds = [...new Set((entries ?? []).map(e => e.order_id).filter(Boolean))] as string[];
  const ordersRes = orderIds.length
    ? await db.from('orders').select('id, order_number').in('id', orderIds)
    : { data: [] };
  const orderNumMap = new Map((ordersRes.data ?? []).map(o => [o.id as string, o.order_number as number]));

  // 3. Назви постачальників
  const supplierIds = [...new Set(
    (entries ?? []).map(e => parseInt(e.counterparty_id as string)).filter(n => !isNaN(n))
  )];
  const { data: suppliers } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supplierNameMap = new Map((suppliers ?? []).map(s => [s.id as number, s.name as string]));

  // 4. Агрегація per постачальник
  const aggMap = new Map<number, SupplierBalance>();
  for (const e of (entries ?? [])) {
    const supplierId = parseInt(e.counterparty_id as string);
    if (isNaN(supplierId)) continue;

    if (!aggMap.has(supplierId)) {
      aggMap.set(supplierId, {
        supplier_id:    supplierId,
        supplier_name:  supplierNameMap.get(supplierId) ?? `Постачальник #${supplierId}`,
        total_receipts: 0,
        total_payments: 0,
        balance:        0,
        transactions:   [],
      });
    }

    const agg = aggMap.get(supplierId)!;
    const amt = Number(e.amount);
    agg.balance += amt;
    if (amt < 0) agg.total_receipts += Math.abs(amt);
    else          agg.total_payments += amt;

    const docInfo = e.doc_id ? docMap.get(e.doc_id as string) : null;
    agg.transactions.push({
      doc_type:      e.doc_type as string,
      amount:        amt,
      business_date: e.business_date as string,
      description:   e.description as string,
      doc_id:        (e.doc_id as string) ?? null,
      doc_number:    docInfo?.number ?? null,
      acc_doc_type:  docInfo?.type  ?? null,
      order_number:  e.order_id ? (orderNumMap.get(e.order_id as string) ?? null) : null,
    });
  }

  // AP-aging: старіння непогашеного боргу. Оплати (дебети) погашають борги
  // (кредити) за FIFO від найстарішого; залишки бакетуються за віком.
  function computeAging(txns: { amount: number; business_date: string }[]) {
    const debts: { date: string; left: number }[] = [];
    let payPool = 0;
    for (const t of txns) {           // транзакції вже відсортовані за датою asc
      if (t.amount < 0) debts.push({ date: t.business_date, left: -t.amount });
      else payPool += t.amount;
    }
    for (const d of debts) {
      if (payPool <= 0) break;
      const use = Math.min(d.left, payPool);
      d.left -= use; payPool -= use;
    }
    const buckets = { d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
    let oldest: string | null = null;
    const nowMs = Date.now();
    for (const d of debts) {
      if (d.left <= 0.005) continue;
      if (!oldest) oldest = d.date;
      const age = Math.floor((nowMs - new Date(d.date).getTime()) / 86400000);
      if (age <= 30) buckets.d0_30 += d.left;
      else if (age <= 60) buckets.d31_60 += d.left;
      else if (age <= 90) buckets.d61_90 += d.left;
      else buckets.d90p += d.left;
    }
    return { ...buckets, oldest_date: oldest };
  }

  for (const agg of aggMap.values()) {
    if (agg.balance < -0.005) agg.aging = computeAging(agg.transactions);
  }

  // 5. Дропшип «в дорозі»: відвантажені, ще не доставлені посилки (РН-чернетки).
  // Борг у леджері виникає лише при доставці (postSaleDoc), але постачальник уже
  // відвантажив — показуємо окремо, щоб «разом до сплати» збігався з рахунком
  // постачальника. Групування дзеркалить postSaleDoc: dropship-рядки чернетки,
  // постачальник = line.supplier_id → мапінг SKU.
  const draftDocs = await fetchAllRows((f, t) => db
    .from('acc_documents')
    .select('id, order_id, doc_number, doc_date, tracking_number')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .order('doc_date', { ascending: true })
    .range(f, t));

  const draftIds = (draftDocs ?? []).map(d => d.id as string);
  const { data: draftLines } = draftIds.length
    ? await db.from('acc_document_lines')
        .select('document_id, sku, qty, cost_price, fulfillment_type, supplier_id')
        .in('document_id', draftIds)
        .limit(10000)
    : { data: [] };
  const dropDraftLines = (draftLines ?? []).filter(l => l.fulfillment_type === 'dropship');

  const unmappedSkus = [...new Set(dropDraftLines.filter(l => !l.supplier_id).map(l => l.sku as string))];
  const { data: skuMapRows } = unmappedSkus.length
    ? await db.from('supplier_sku_map').select('our_sku, supplier_id').in('our_sku', unmappedSkus)
    : { data: [] };
  const supplierBySku = new Map((skuMapRows ?? []).map(r => [r.our_sku as string, r.supplier_id as number]));

  const draftOrderIds = [...new Set((draftDocs ?? []).map(d => d.order_id).filter(Boolean))] as string[];
  const { data: draftOrders } = draftOrderIds.length
    ? await db.from('orders').select('id, order_number').in('id', draftOrderIds)
    : { data: [] };
  const orderNumById = new Map((draftOrders ?? []).map(o => [o.id as string, o.order_number as number]));

  // (постачальник, РН) → сума собівартості цієї посилки
  const transitByDocSupplier = new Map<string, number>();
  for (const l of dropDraftLines) {
    const supplierId = (l.supplier_id as number | null) ?? supplierBySku.get(l.sku as string) ?? null;
    const cost = Number(l.cost_price ?? 0) * Number(l.qty);
    if (!supplierId || cost <= 0) continue;
    const key = `${supplierId}:${l.document_id}`;
    transitByDocSupplier.set(key, (transitByDocSupplier.get(key) ?? 0) + cost);
  }

  const transitSupplierIds = [...new Set([...transitByDocSupplier.keys()].map(k => parseInt(k)))];
  const { data: transitSuppliers } = transitSupplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', transitSupplierIds)
    : { data: [] };
  const transitNameMap = new Map((transitSuppliers ?? []).map(s => [s.id as number, s.name as string]));

  const docById = new Map((draftDocs ?? []).map(d => [d.id as string, d]));
  for (const [key, amount] of transitByDocSupplier) {
    const [supplierIdStr, docId] = key.split(':');
    const supplierId = parseInt(supplierIdStr);
    const doc = docById.get(docId)!;
    // постачальник може ще не мати жодної проводки в леджері — створюємо рядок
    if (!aggMap.has(supplierId)) {
      aggMap.set(supplierId, {
        supplier_id:    supplierId,
        supplier_name:  supplierNameMap.get(supplierId) ?? transitNameMap.get(supplierId) ?? `Постачальник #${supplierId}`,
        total_receipts: 0,
        total_payments: 0,
        balance:        0,
        transactions:   [],
      });
    }
    const agg = aggMap.get(supplierId)!;
    const item: TransitItem = {
      doc_id:          docId,
      doc_number:      (doc.doc_number as string) ?? null,
      doc_date:        String(doc.doc_date ?? '').slice(0, 10),
      order_number:    doc.order_id ? (orderNumById.get(doc.order_id as string) ?? null) : null,
      tracking_number: (doc.tracking_number as string) ?? null,
      amount:          Math.round(amount * 100) / 100,
    };
    agg.in_transit_items = [...(agg.in_transit_items ?? []), item];
    agg.in_transit_total = Math.round(((agg.in_transit_total ?? 0) + amount) * 100) / 100;
  }

  // Сортуємо за ЗАГАЛЬНИМ боргом (проведений + в дорозі): balance від'ємний = винні,
  // транзит завжди додає до боргу. Не фільтруємо по балансу тут — клієнт сам вирішує.
  const balances: SupplierBalance[] = [...aggMap.values()]
    .sort((a, b) => (a.balance - (a.in_transit_total ?? 0)) - (b.balance - (b.in_transit_total ?? 0)));

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Кредиторка</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Взаєморозрахунки з постачальниками: борг, оплати і посилки в дорозі
        </p>
      </div>

      <FinanceTabs />

      <div style={{ marginTop: '20px' }}>
        <PayablesClient balances={balances} />
      </div>
    </div>
  );
}
