import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { resolveSender } from '../../../../../lib/email-sender';

type SkuMapping = { our_sku: string; supplier_id: number; supplier_sku: string };

/**
 * Resolves supplier for each SKU. Mirrors the per-order route:
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

function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

/**
 * Масова відправка замовлень постачальникам: товари з усіх вибраних замовлень
 * групуються по постачальнику → кожен постачальник отримує ОДИН лист зі всіма
 * своїми замовленнями (кожне окремим блоком із ТТН). Одна кнопка замість
 * поштучної розсилки.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const orderIds: string[] = body.orderIds ?? [];
  const comment: string | undefined = body.comment || undefined;
  const senderEmail: string | undefined = body.senderEmail || undefined;
  // Перевизначення email по постачальнику: { [supplierId]: email }
  const emailOverrides: Record<string, string> = body.emailOverrides ?? {};
  if (!orderIds.length) return NextResponse.json({ error: 'orderIds required' }, { status: 400 });

  const db = createServiceClient();

  // Відправник (основний / вибраний) + Resend-клієнт із ключем для домену.
  const { from: FROM, fromName, fromEmail, resend, anonymize } = await resolveSender(db, senderEmail);

  const { data: cfgRows } = await db.from('app_settings').select('key, value')
    .in('key', ['company_contact_name', 'company_contact_phone']);
  const cfg: Record<string, string> = {};
  (cfgRows ?? []).forEach(r => { cfg[r.key] = r.value; });
  const contactName  = cfg.company_contact_name  || '';
  const contactPhone = cfg.company_contact_phone || '';

  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, items, contact, phone, delivery_city_name, tracking_number, shipping_supplier_id')
    .in('id', orderIds);

  if (!orders?.length) return NextResponse.json({ error: 'Orders not found' }, { status: 404 });

  const allSkus = [...new Set(orders.flatMap(o => ((o.items ?? []) as { sku: string }[]).map(i => i.sku)))];
  const supplierMap = await resolveSkuMapping(db, allSkus);

  const supplierIds = [...new Set([...supplierMap.values()].map(r => r.supplier_id).filter(Boolean))];
  const { data: supplierRows } = await db
    .from('suppliers')
    .select('id, name, email, notes, contact_name')
    .in('id', supplierIds);
  const supplierInfoMap = new Map((supplierRows ?? []).map(s => [s.id, s]));

  // Групуємо позиції всіх замовлень по постачальнику
  type LineItem = { supplierSku: string; name: string; qty: number; orderId: string; orderNumber: number };
  const bySupplier = new Map<number, LineItem[]>();
  // Замовлення → набір постачальників (для supplier_sent_at / shipping_supplier_id)
  const orderSuppliers = new Map<string, Set<number>>();

  type OrderMeta = { contact: string; phone: string; city: string; ttn: string | null };
  const orderMeta = new Map<number, OrderMeta>();

  for (const order of orders) {
    orderMeta.set(order.order_number, {
      contact: order.contact ?? '',
      phone:   order.phone ?? '',
      city:    order.delivery_city_name ?? '',
      ttn:     order.tracking_number ?? null,
    });
    const items = (order.items ?? []) as { sku: string; name: string; brand: string; qty: number }[];
    for (const item of items) {
      const mapping = supplierMap.get(item.sku);
      if (!mapping?.supplier_id) continue;
      if (!bySupplier.has(mapping.supplier_id)) bySupplier.set(mapping.supplier_id, []);
      bySupplier.get(mapping.supplier_id)!.push({
        supplierSku: mapping.supplier_sku ?? item.sku,
        name:        `${item.brand ? item.brand + ' ' : ''}${item.name}`,
        qty:         item.qty,
        orderId:     order.id,
        orderNumber: order.order_number,
      });
      if (!orderSuppliers.has(order.id)) orderSuppliers.set(order.id, new Set());
      orderSuppliers.get(order.id)!.add(mapping.supplier_id);
    }
  }

  const results: { supplier_id: number; supplier_name: string; emailed: boolean; order_numbers: number[]; error?: string }[] = [];
  const emailedSupplierIds = new Set<number>();

  for (const [supplierId, lines] of bySupplier) {
    const supplier = supplierInfoMap.get(supplierId);
    if (!supplier) continue;

    const toEmail = emailOverrides[String(supplierId)]?.trim()
      || supplier.email
      || extractEmail(supplier.notes ?? '');
    const orderNums = [...new Set(lines.map(l => l.orderNumber))].sort((a, b) => a - b);
    let emailed = false;
    let sendError: string | undefined;

    if (toEmail && toEmail.includes('@')) {
      // Групуємо позиції по замовленню для відображення
      const byOrder = new Map<number, LineItem[]>();
      for (const line of lines) {
        if (!byOrder.has(line.orderNumber)) byOrder.set(line.orderNumber, []);
        byOrder.get(line.orderNumber)!.push(line);
      }

      const orderSections = [...byOrder.entries()].sort((a, b) => a[0] - b[0]).map(([num, items]) => {
        const meta = orderMeta.get(num);
        const ttn = meta?.ttn ?? null;
        const ttnDigits = ttn ? ttn.replace(/\D/g, '') : '';
        const ttnStr = ttn
          ? (anonymize
              ? `<span style="font-family:monospace;font-size:12px;color:#CBD5E1">ТТН: <strong style="color:#fff">••••&nbsp;${ttnDigits.slice(-4)}</strong></span>`
              : `<span style="font-family:monospace;font-size:12px;color:#CBD5E1">ТТН: <strong style="color:#fff">${ttn}</strong></span>`)
          : '';
        const recipient = (!anonymize && meta && (meta.contact || meta.city))
          ? `<div style="font-size:12px;color:#475569;margin-top:8px">Отримувач: <strong>${meta.contact}</strong>${meta.phone ? ` · ${meta.phone}` : ''}${meta.city ? ` · ${meta.city}` : ''}</div>`
          : '';
        // Кожне замовлення — окрема картка з помітним заголовком-плашкою,
        // щоб постачальник не плутав позиції різних замовлень.
        return `
        <div style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;margin-bottom:20px">
          <div style="background:#1E3A5F;padding:10px 14px">
            <span style="font-size:14px;font-weight:800;color:#fff;letter-spacing:0.3px">📦 Замовлення #${num}</span>
            ${ttnStr ? `<span style="margin-left:12px">${ttnStr}</span>` : ''}
          </div>
          <div style="padding:12px 14px">
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
            ${recipient}
          </div>
        </div>`;
      }).join('');

      const commentBlock = comment?.trim()
        ? `<div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:8px;font-size:13px;color:#92400E"><strong>Коментар:</strong> ${comment}</div>`
        : '';

      // Дані менеджера — наш бік. У анонімному режимі (напр. BudMag) не показуємо,
      // щоб не світити реальні контакти.
      const contactBlock = (!anonymize && (contactName || contactPhone))
        ? `<p style="font-size:13px;color:#374151;margin-top:8px">Менеджер: <strong>${contactName}</strong>${contactPhone ? ` · ${contactPhone}` : ''}</p>`
        : '';

      const numsLabel = orderNums.map(n => `#${n}`).join(', ');
      const html = `
        <div style="font-family:sans-serif;max-width:680px;margin:0 auto">
          <h2 style="color:#1E3A5F">Замовлення від ${fromName} — ${numsLabel}</h2>
          ${contactBlock}
          ${orderSections}
          ${commentBlock}
          <p style="color:#94A3B8;font-size:12px;margin-top:24px">${fromName} — ${fromEmail}</p>
        </div>`;

      const toName = supplier.contact_name || supplier.name;
      try {
        // SDK Resend НЕ кидає виняток на помилку API — повертає {data, error}.
        // Без перевірки error відхилений лист виглядав як «✅ відправлено».
        const { error: sendErr } = await resend.emails.send({
          from: FROM,
          to: toEmail,
          subject: `Замовлення від ${fromName} — ${numsLabel}`,
          html,
          ...(!anonymize && toName !== supplier.name && { replyTo: `${toName} <${fromEmail}>` }),
        });
        if (sendErr) throw new Error(sendErr.message || JSON.stringify(sendErr));
        emailed = true;
        emailedSupplierIds.add(supplierId);
      } catch (err) {
        console.error('[bulk-supplier-order] email failed:', err);
        sendError = err instanceof Error ? err.message : String(err);
      }
    }

    results.push({ supplier_id: supplierId, supplier_name: supplier.name, emailed, order_numbers: orderNums, ...(sendError && { error: sendError }) });
  }

  // Позначаємо замовлення як відправлені постачальнику + фіксуємо постачальника
  // відвантаження (якщо однозначний і ще не обраний вручну).
  const sentAt = new Date().toISOString();
  const sentOrders = orders.filter(o => {
    const sids = orderSuppliers.get(o.id);
    return sids && [...sids].some(sid => emailedSupplierIds.has(sid));
  });
  await Promise.all(sentOrders.map(o => {
    const sids = [...(orderSuppliers.get(o.id) ?? [])].filter(sid => emailedSupplierIds.has(sid));
    const update: Record<string, unknown> = { supplier_sent_at: sentAt };
    if (sids.length === 1 && !o.shipping_supplier_id) update.shipping_supplier_id = sids[0];
    return db.from('orders').update(update).eq('id', o.id);
  }));

  return NextResponse.json({ ok: true, results, sent_order_ids: sentOrders.map(o => o.id) });
}
