import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { resolveSender } from '../../../../../../lib/email-sender';
import { orderItemSources } from '../../../../../../lib/orders/item-sources';

type SkuMapping = { our_sku: string; supplier_id: number; supplier_sku: string };

/**
 * Resolves supplier for each SKU.
 * Primary: supplier_sku_map; Fallback: supplier_stock (populated on every price sync).
 */
async function resolveSkuMapping(
  db: ReturnType<typeof createServiceClient>,
  skus: string[],
): Promise<Map<string, SkuMapping>> {
  if (skus.length === 0) return new Map();

  const { data: mapRows } = await db
    .from('supplier_sku_map')
    .select('our_sku, supplier_id, supplier_sku')
    .in('our_sku', skus);

  const result = new Map<string, SkuMapping>(
    (mapRows ?? []).map(r => [r.our_sku, r as SkuMapping]),
  );

  // Fallback: supplier_stock for SKUs not in supplier_sku_map
  const unmapped = skus.filter(s => !result.has(s));
  if (unmapped.length > 0) {
    const { data: stockRows } = await db
      .from('supplier_stock')
      .select('sku, supplier_id, supplier_sku')
      .in('sku', unmapped);
    for (const row of stockRows ?? []) {
      if (!result.has(row.sku)) {
        result.set(row.sku, {
          our_sku:      row.sku,
          supplier_id:  row.supplier_id,
          supplier_sku: row.supplier_sku ?? row.sku,
        });
      }
    }
  }

  return result;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const db = createServiceClient();

  const { data: order } = await db.from('orders').select('items, tracking_number, channel_code').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const orderItems = (order.items ?? []) as { sku: string; name: string; brand?: string; qty: number }[];
  const skus = orderItems.map((i) => i.sku);
  const supplierMap = await resolveSkuMapping(db, skus);

  const supplierIds = [...new Set([...supplierMap.values()].map(r => r.supplier_id).filter(Boolean))];
  const { data: suppliers } = await db
    .from('suppliers').select('id, name, email, notes').in('id', supplierIds);

  // Розклад по джерелах — щоб модалка могла попередити, що частина позицій іде
  // з нашого складу, і дати вибір: слати постачальнику все чи тільки його.
  const sources = await orderItemSources(db, id, orderItems, order.channel_code);
  const items = orderItems.map(i => ({
    sku:    i.sku,
    name:   `${i.brand ? i.brand + ' ' : ''}${i.name}`,
    qty:    i.qty,
    source: sources.get(i.sku) ?? 'dropship',
  }));

  const first = suppliers?.[0];
  const supplierEmail = first?.email ?? extractEmail(first?.notes ?? '') ?? '';
  return NextResponse.json({
    supplier_id:      first?.id ?? null,
    supplier_name:    suppliers?.map((s) => s.name).join(', ') ?? '—',
    supplier_email:   supplierEmail,
    tracking_number:  order.tracking_number ?? null,
    items,
    own_count:      items.filter(i => i.source === 'own').length,
    supplier_count: items.filter(i => i.source !== 'own').length,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, items, contact, phone, delivery_city_name, tracking_number, shipping_supplier_id, channel_code')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await _req.json().catch(() => ({}));
  const overrideEmail: string | undefined   = body.overrideEmail || undefined;
  const overrideComment: string | undefined = body.comment       || undefined;
  const senderEmail: string | undefined     = body.senderEmail   || undefined;
  // Що саме слати: тільки позиції постачальника (за замовчуванням) чи все
  // замовлення. Раніше вибору не було — і в лист потрапляли позиції, які ми
  // відвантажуємо зі свого складу.
  const scope: 'supplier' | 'all' = body.scope === 'all' ? 'all' : 'supplier';

  // Відправник (основний / вибраний) + Resend-клієнт із ключем для домену.
  // fromName/fromEmail йдуть у тему й тіло листа — щоб при відправці від budmag
  // ніде не згадувався fixline.
  const { from: FROM, fromName, fromEmail, resend, anonymize } = await resolveSender(db, senderEmail);

  const allItems = (order.items ?? []) as { sku: string; name: string; brand: string; qty: number }[];

  const sources = await orderItemSources(db, id, allItems, order.channel_code);
  const orderItems = scope === 'all' ? allItems : allItems.filter(i => sources.get(i.sku) !== 'own');
  if (!orderItems.length) {
    return NextResponse.json(
      { error: 'Усі позиції цього замовлення відвантажуються з нашого складу — постачальнику надсилати нічого' },
      { status: 400 },
    );
  }
  const skus = orderItems.map(i => i.sku);

  const supplierMap = await resolveSkuMapping(db, skus);

  const supplierIds = [...new Set([...supplierMap.values()].map(r => r.supplier_id).filter(Boolean))];
  const { data: supplierRows } = await db
    .from('suppliers')
    .select('id, name, email, notes')
    .in('id', supplierIds);

  const supplierInfoMap = new Map((supplierRows ?? []).map(s => [s.id, s]));

  // Group items by supplier
  const bySupplier = new Map<number, { items: typeof orderItems; supplierSkus: Map<string, string> }>();
  for (const item of orderItems) {
    const mapping = supplierMap.get(item.sku);
    if (!mapping?.supplier_id) continue;
    if (!bySupplier.has(mapping.supplier_id))
      bySupplier.set(mapping.supplier_id, { items: [], supplierSkus: new Map() });
    bySupplier.get(mapping.supplier_id)!.items.push(item);
    bySupplier.get(mapping.supplier_id)!.supplierSkus.set(item.sku, mapping.supplier_sku ?? item.sku);
  }

  // If no SKUs matched any supplier but overrideEmail is provided, send all items to that email
  if (bySupplier.size === 0 && overrideEmail) {
    const supplierId = -1;
    bySupplier.set(supplierId, {
      items: orderItems,
      supplierSkus: new Map(orderItems.map(i => [i.sku, i.sku])),
    });
    supplierInfoMap.set(supplierId, { id: supplierId, name: 'Постачальник', email: overrideEmail, notes: null });
  }

  const results: { supplier_name: string; emailed: boolean; error?: string }[] = [];

  for (const [supplierId, { items: supplierItems, supplierSkus }] of bySupplier) {
    const supplier = supplierInfoMap.get(supplierId);
    if (!supplier) continue;

    let emailed = false;
    let sendError: string | undefined;
    const toEmail = overrideEmail || supplier.email || extractEmail(supplier.notes ?? '');
    if (toEmail) {
      try {
        // SDK Resend НЕ кидає виняток на помилку API — повертає {data, error}.
        const { error: sendErr } = await resend.emails.send({
          from: FROM,
          to:   toEmail,
          subject: `Замовлення від ${fromName} — #${order.order_number}`,
          html: buildSupplierEmailHtml({
            senderName:     fromName,
            senderEmail:    fromEmail,
            anonymize,
            orderNumber:    order.order_number,
            contact:        order.contact,
            phone:          order.phone,
            deliveryCity:   order.delivery_city_name ?? '',
            trackingNumber: order.tracking_number ?? undefined,
            comment:        overrideComment,
            items: supplierItems.map(item => ({
              supplierSku: supplierSkus.get(item.sku) ?? item.sku,
              name:        `${item.brand ? item.brand + ' ' : ''}${item.name}`,
              qty:         item.qty,
            })),
          }),
        });
        if (sendErr) throw new Error(sendErr.message || JSON.stringify(sendErr));
        emailed = true;
      } catch (err) {
        console.error('[supplier-order] email failed:', err);
        sendError = err instanceof Error ? err.message : String(err);
      }
    }

    results.push({ supplier_name: supplier.name, emailed, ...(sendError && { error: sendError }) });
  }

  if (results.some(r => r.emailed)) {
    const update: Record<string, unknown> = { supplier_sent_at: new Date().toISOString() };
    // Заявку відправлено рівно одному реальному постачальнику → фіксуємо його як
    // фактичного постачальника відвантаження (якщо менеджер ще не обрав вручну).
    const emailedIds = [...bySupplier.keys()].filter(sid => sid > 0);
    if (emailedIds.length === 1 && !order.shipping_supplier_id) {
      update.shipping_supplier_id = emailedIds[0];
    }
    await db.from('orders').update(update).eq('id', id);
  }

  return NextResponse.json({ ok: true, results });
}

function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

function buildSupplierEmailHtml(data: {
  senderName: string;
  senderEmail: string;
  anonymize: boolean;
  orderNumber: number;
  contact: string;
  phone: string;
  deliveryCity: string;
  trackingNumber?: string;
  comment?: string;
  items: { supplierSku: string; name: string; qty: number }[];
}) {
  const rows = data.items.map(i => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-family:monospace;color:#666">${i.supplierSku}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${i.qty} шт</td>
    </tr>`).join('');

  // Анонімний режим (напр. BudMag): дані клієнта не показуємо, ТТН — лише останні 4 цифри.
  const ttnDigits = data.trackingNumber ? data.trackingNumber.replace(/\D/g, '') : '';
  const ttnBlock = data.trackingNumber
    ? (data.anonymize
        ? `<p style="margin-top:12px;color:#1E3A5F;font-size:14px">ТТН (останні 4 цифри): <strong style="font-family:monospace;font-size:15px;letter-spacing:0.5px">••••&nbsp;${ttnDigits.slice(-4)}</strong></p>`
        : `<p style="margin-top:12px;color:#1E3A5F;font-size:14px">ТТН Нова Пошта: <strong style="font-family:monospace;font-size:15px;letter-spacing:0.5px">${data.trackingNumber}</strong></p>`)
    : '';

  const recipientBlock = data.anonymize
    ? ''
    : `<p style="color:#555">Отримувач: <strong>${data.contact}</strong> · ${data.phone}${data.deliveryCity ? ` · ${data.deliveryCity}` : ''}</p>`;

  const commentBlock = data.comment?.trim()
    ? `<div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:8px;font-size:13px;color:#92400E"><strong>Коментар:</strong> ${data.comment}</div>`
    : '';

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1E3A5F">Замовлення від ${data.senderName} #${data.orderNumber}</h2>
      ${recipientBlock}
      ${ttnBlock}
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead>
          <tr style="background:#F8FAFC">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#94A3B8;border-bottom:2px solid #E2E8F0">АРТИКУЛ</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#94A3B8;border-bottom:2px solid #E2E8F0">НАЗВА</th>
            <th style="padding:8px 12px;text-align:center;font-size:12px;color:#94A3B8;border-bottom:2px solid #E2E8F0">К-СТЬ</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${commentBlock}
      <p style="color:#94A3B8;font-size:12px;margin-top:24px">${data.senderName} — ${data.senderEmail}</p>
    </div>`;
}
