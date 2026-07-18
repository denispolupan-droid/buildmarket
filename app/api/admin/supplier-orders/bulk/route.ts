import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { orderIds, comment } = await req.json() as { orderIds: string[]; comment?: string };
  if (!orderIds?.length) return NextResponse.json({ error: 'orderIds required' }, { status: 400 });

  const db = createServiceClient();

  const { data: settingsRows } = await db.from('app_settings').select('key, value')
    .in('key', ['orders_from_email', 'orders_from_name', 'company_contact_name', 'company_contact_phone']);
  const cfg: Record<string, string> = {};
  (settingsRows ?? []).forEach(r => { cfg[r.key] = r.value; });
  const fromEmail    = cfg.orders_from_email       || 'orders@fixline.com.ua';
  const fromName     = cfg.orders_from_name        || 'FIXLINE';
  const contactName  = cfg.company_contact_name    || '';
  const contactPhone = cfg.company_contact_phone   || '';
  const FROM = `${fromName} <${fromEmail}>`;

  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, items, contact, phone, delivery_city_name, tracking_number')
    .in('id', orderIds);

  if (!orders?.length) return NextResponse.json({ error: 'Orders not found' }, { status: 404 });

  const allSkus = [...new Set(orders.flatMap(o => (o.items ?? []).map((i: { sku: string }) => i.sku)))];

  const { data: skuMapRows } = await db
    .from('supplier_sku_map')
    .select('our_sku, supplier_id, supplier_sku')
    .in('our_sku', allSkus);

  const supplierIds = [...new Set((skuMapRows ?? []).map(r => r.supplier_id).filter(Boolean))];
  const { data: supplierRows } = await db
    .from('suppliers')
    .select('id, name, email, notes, contact_name, contact_phone')
    .in('id', supplierIds);

  const skuToSupplier = new Map((skuMapRows ?? []).map(r => [r.our_sku, r]));
  const supplierMap = new Map((supplierRows ?? []).map(s => [s.id, s]));

  function extractEmail(text: string): string | null {
    const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    return m ? m[0] : null;
  }

  // Group all items across all orders by supplier
  type LineItem = { supplierSku: string; name: string; qty: number; orderNumber: number; trackingNumber?: string | null };
  const bySupplier = new Map<number, LineItem[]>();

  for (const order of orders) {
    const items = (order.items ?? []) as { sku: string; name: string; brand: string; qty: number }[];
    for (const item of items) {
      const mapping = skuToSupplier.get(item.sku);
      if (!mapping?.supplier_id) continue;
      if (!bySupplier.has(mapping.supplier_id)) bySupplier.set(mapping.supplier_id, []);
      bySupplier.get(mapping.supplier_id)!.push({
        supplierSku: mapping.supplier_sku ?? item.sku,
        name: `${item.brand ? item.brand + ' ' : ''}${item.name}`,
        qty: item.qty,
        orderNumber: order.order_number,
        trackingNumber: order.tracking_number,
      });
    }
  }

  const results: { supplier_id: number; supplier_name: string; emailed: boolean }[] = [];
  const orderNumbers = orders.map(o => `#${o.order_number}`).join(', ');

  for (const [supplierId, lines] of bySupplier) {
    const supplier = supplierMap.get(supplierId);
    if (!supplier) continue;

    const supplierEmail = supplier.email ?? extractEmail(supplier.notes ?? '');
    const toName = supplier.contact_name || supplier.name;
    let emailed = false;

    if (supplierEmail) {
      // Group lines by order number for display
      const byOrder = new Map<number, LineItem[]>();
      for (const line of lines) {
        if (!byOrder.has(line.orderNumber)) byOrder.set(line.orderNumber, []);
        byOrder.get(line.orderNumber)!.push(line);
      }

      const orderSections = [...byOrder.entries()].map(([num, items]) => {
        const ttn = items[0]?.trackingNumber;
        const ttnStr = ttn ? `<span style="font-family:monospace;font-size:13px;color:#1E3A5F;margin-left:8px">ТТН: <strong>${ttn}</strong></span>` : '';
        return `
        <div style="margin-bottom:16px">
          <div style="font-size:13px;font-weight:700;color:#1E3A5F;margin-bottom:6px">Замовлення #${num}${ttnStr}</div>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#F8FAFC">
                <th style="padding:6px 10px;text-align:left;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">АРТИКУЛ</th>
                <th style="padding:6px 10px;text-align:left;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">НАЗВА</th>
                <th style="padding:6px 10px;text-align:center;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">К-СТЬ</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => `
                <tr>
                  <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;color:#666">${i.supplierSku}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #eee">${i.name}</td>
                  <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${i.qty} шт</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('');

      const commentBlock = comment?.trim()
        ? `<div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:8px;font-size:13px;color:#92400E"><strong>Коментар:</strong> ${comment}</div>`
        : '';

      const contactBlock = (contactName || contactPhone)
        ? `<p style="font-size:13px;color:#374151;margin-top:8px">Менеджер: <strong>${contactName}</strong>${contactPhone ? ` · ${contactPhone}` : ''}</p>`
        : '';

      const html = `
        <div style="font-family:sans-serif;max-width:680px;margin:0 auto">
          <h2 style="color:#1E3A5F">Замовлення від ${fromName} — ${orderNumbers}</h2>
          ${contactBlock}
          ${orderSections}
          ${commentBlock}
          <p style="color:#94A3B8;font-size:12px;margin-top:24px">${fromName} — ${fromEmail}</p>
        </div>`;

      try {
        await resend.emails.send({
          from: FROM,
          to: supplierEmail,
          subject: `Замовлення від ${fromName} — ${orderNumbers}`,
          html,
          ...(toName !== supplier.name && { replyTo: `${toName} <${fromEmail}>` }),
        });
        emailed = true;
      } catch (err) {
        console.error('[bulk-supplier-order] email failed:', err);
      }
    }

    results.push({ supplier_id: supplierId, supplier_name: supplier.name, emailed });
  }

  return NextResponse.json({ ok: true, results });
}
