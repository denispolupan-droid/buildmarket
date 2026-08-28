/**
 * Integration test — доля товару з посилки, яку покупець не забрав.
 *
 * З міграції 103 борг перед постачальником виникає при ВІДВАНТАЖЕННІ. Тому
 * відмова від отримання більше не «нічого не сталося»: борг уже проведено, товар
 * висить на рахунку «в дорозі», і хтось має сказати, куди він подівся. Рішень два,
 * і вони дають різний результат — саме це тут і перевіряється:
 *
 *   повернули постачальнику → борг знімається, накладна вважається закритою;
 *   лишили собі             → борг ЛИШАЄТЬСЯ (товар справді наш), а вартість
 *                             переїздить із транзиту на склад разом із партією.
 *
 * Запуск:  npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSaleDraft } from '../../lib/accounting/dropship';
import { resolveTransit, pendingTransitDecisions, transitBalanceForOrder } from '../../lib/accounting/transit';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let supplierId: number;
let testSku: string;
const createdOrders: string[] = [];

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });

  const fx = await loadFixtures(db);
  supplierId = fx.supplierId;
  testSku    = fx.sku;
});

afterAll(async () => {
  if (!db) return;
  if (createdOrders.length) await db.from('orders').delete().in('id', createdOrders);
  const { error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
});

/** Замовлення + відвантажена посилка (без складського запасу → рядок дропшипний) */
async function shipParcel(ttn: string, price = 300) {
  const { data: order, error } = await db.from('orders').insert({
    contact: 'TRANSIT тест', phone: '+380000000000', email: 'transit@test.local',
    status: 'shipped', total_price: price, channel_code: 'website',
    delivery_type: 'nova', payment_type: 'cod', tracking_number: ttn,
    items: [{ sku: testSku, name: 'transit', brand: 'test', qty: 1, price }],
  }).select('id, order_number').single();
  if (error) throw new Error('order insert: ' + error.message);
  createdOrders.push(order.id as string);

  const docId = await createSaleDraft({
    order_id: order.id as string,
    order_number: order.order_number as number,
    order_items: [{ sku: testSku, name: 'transit', brand: 'test', qty: 1, price }],
    tracking_number: ttn,
    shipping_supplier_id: supplierId,
    confirmed_by: 'transit-test',
  });
  await db.from('acc_documents').update({ meta: { test: true } }).eq('id', docId);

  // Покупець відмовився — замовлення скасовують
  await db.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
  return { orderId: order.id as string, docId };
}

/** Позначаємо породжені документи тестовими, інакше reset_accounting_test_data відмовиться */
async function markChildrenAsTest(parentDocId: string) {
  await db.from('acc_documents').update({ meta: { test: true } }).eq('parent_doc_id', parentDocId);
}

async function netByAccount(orderId: string, account: string) {
  const { data } = await db
    .from('money_entries')
    .select('amount')
    .eq('order_id', orderId)
    .eq('account_type', account);
  return Math.round((data ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
}

describe('Товар у дорозі: рішення після відмови покупця', () => {
  it('відмова лишає борг і транзит висіти — доки людина не вирішить', async () => {
    const { orderId } = await shipParcel('98' + String(Date.now()).slice(-12));

    expect(await netByAccount(orderId, 'supplier'), 'борг перед постачальником має висіти').toBeLessThan(0);
    expect(await transitBalanceForOrder(orderId), 'товар має висіти в дорозі').toBeGreaterThan(0);

    const pending = await pendingTransitDecisions();
    expect(
      pending.some(p => p.orderId === orderId),
      'посилка має потрапити у список «чекають рішення»',
    ).toBe(true);
  }, 30000);

  it('повернули постачальнику: борг знімається, накладна закривається', async () => {
    const { orderId, docId } = await shipParcel('97' + String(Date.now()).slice(-12));
    const debtBefore = await netByAccount(orderId, 'supplier');
    expect(debtBefore).toBeLessThan(0);

    await resolveTransit({ docId, decision: 'to_supplier', createdBy: 'transit-test' });

    expect(await netByAccount(orderId, 'supplier'), 'борг має обнулитись').toBe(0);
    expect(await transitBalanceForOrder(orderId), 'транзит має закритись').toBe(0);

    // Сторно має ще й «погасити» ту саму накладну в рознесенні оплат, інакше
    // вона назавжди лишиться в списку неоплачених.
    const { data: charge } = await db
      .from('money_entries')
      .select('id, amount')
      .eq('doc_id', docId)
      .eq('account_type', 'supplier')
      .lt('amount', 0)
      .limit(1)
      .maybeSingle();
    const { data: allocs } = await db
      .from('supplier_payment_allocations')
      .select('amount')
      .eq('charge_entry_id', charge!.id);
    const closed = (allocs ?? []).reduce((s, a) => s + Number(a.amount), 0);
    expect(Math.round(closed * 100), 'накладна має бути закрита сторно повністю')
      .toBe(Math.round(Math.abs(Number(charge!.amount)) * 100));

    const { data: doc } = await db.from('acc_documents').select('status').eq('id', docId).single();
    expect(doc?.status, 'чернетка більше не «в дорозі»').toBe('cancelled');

    // Повторний виклик нічого не ламає й не дублює
    await expect(resolveTransit({ docId, decision: 'to_supplier' })).rejects.toThrow();
  }, 30000);

  it('лишили собі: борг лишається, вартість переїздить на склад', async () => {
    const { orderId, docId } = await shipParcel('96' + String(Date.now()).slice(-12));
    const debtBefore = await netByAccount(orderId, 'supplier');
    const transitBefore = await transitBalanceForOrder(orderId);
    expect(transitBefore).toBeGreaterThan(0);

    await resolveTransit({ docId, decision: 'keep', createdBy: 'transit-test' });
    await markChildrenAsTest(docId);

    expect(await netByAccount(orderId, 'supplier'), 'борг має лишитись — товар наш')
      .toBe(debtBefore);
    expect(await transitBalanceForOrder(orderId), 'транзит має закритись').toBe(0);
    expect(await netByAccount(orderId, 'inventory_asset'), 'вартість має стати на склад')
      .toBe(transitBefore);

    // Прихід створюється БЕЗ постачальника — інакше виник би другий борг
    const { data: stockIn } = await db
      .from('acc_documents')
      .select('id, doc_type, supplier_id, status')
      .eq('parent_doc_id', docId)
      .eq('doc_type', 'stock_in')
      .maybeSingle();
    expect(stockIn, 'має зʼявитись прихід на склад').toBeTruthy();
    expect(stockIn?.supplier_id, 'прихід без постачальника — борг уже є з відвантаження').toBeNull();
    expect(stockIn?.status).toBe('confirmed');

    // FIFO-партія створена: товар можна продавати далі
    const { data: batches } = await db
      .from('stock_batches')
      .select('id, remaining_qty')
      .eq('document_id', stockIn!.id);
    expect((batches ?? []).length, 'має зʼявитись партія').toBeGreaterThan(0);
  }, 30000);
});
