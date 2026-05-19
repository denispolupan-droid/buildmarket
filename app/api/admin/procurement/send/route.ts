import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const db     = createServiceClient();

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { ids, comment } = await req.json() as { ids: string[]; comment?: string };
  if (!ids?.length) return NextResponse.json({ error: 'ids required' }, { status: 400 });

  // Налаштування відправника
  const { data: settingsRows } = await db.from('app_settings').select('key, value')
    .in('key', ['orders_from_email', 'orders_from_name', 'company_contact_name', 'company_contact_phone']);
  const cfg: Record<string, string> = {};
  (settingsRows ?? []).forEach(r => { cfg[r.key] = r.value; });
  const fromEmail   = cfg.orders_from_email    || 'orders@fixline.com.ua';
  const fromName    = cfg.orders_from_name     || 'FIXLINE';
  const contactName = cfg.company_contact_name || '';
  const contactPhone= cfg.company_contact_phone|| '';

  // Отримуємо документи + рядки + постачальника
  const { data: docs } = await db
    .from('acc_documents')
    .select(`
      id, doc_number, doc_date, notes, expected_date,
      supplier:supplier_id ( id, name, email, notes, contact_name, contact_phone )
    `)
    .in('id', ids);

  if (!docs?.length) return NextResponse.json({ error: 'Orders not found' }, { status: 404 });

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('document_id, sku, qty, cost_price, product:sku ( name, brand )')
    .in('document_id', ids);

  const linesByDoc = new Map<string, typeof lines>();
  for (const line of lines ?? []) {
    if (!linesByDoc.has(line.document_id)) linesByDoc.set(line.document_id, []);
    linesByDoc.get(line.document_id)!.push(line);
  }

  const results: { id: string; doc_number: string; supplier: string; emailed: boolean; error?: string }[] = [];

  for (const doc of docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supplier = doc.supplier as any;
    const supplierEmail = supplier?.email
      ?? (supplier?.notes ?? '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0]
      ?? null;

    if (!supplierEmail) {
      results.push({ id: doc.id, doc_number: doc.doc_number, supplier: supplier?.name ?? '—', emailed: false, error: 'Email постачальника не вказано' });
      continue;
    }

    const docLines = linesByDoc.get(doc.id) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableRows = docLines.map((l: any) => {
      const name = l.product ? `${l.product.brand ?? ''} ${l.product.name ?? ''}`.trim() : l.sku;
      return `
        <tr>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;color:#555">${l.sku}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-size:13px">${name}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700">${l.qty} шт</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right;color:#1E3A5F;font-weight:600">${Number(l.cost_price ?? 0).toFixed(2)} ₴</td>
        </tr>`;
    }).join('');

    const total = docLines.reduce((s: number, l: any) => s + (l.qty ?? 0) * (l.cost_price ?? 0), 0);
    const expectedStr = doc.expected_date
      ? `Очікувана дата: <strong>${new Date(doc.expected_date).toLocaleDateString('uk-UA')}</strong>`
      : '';
    const commentBlock = comment?.trim()
      ? `<div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:8px;font-size:13px;color:#92400E"><strong>Коментар:</strong> ${comment}</div>`
      : '';
    const toName = supplier?.contact_name || supplier?.name || supplierEmail;
    const contactBlock = (contactName || contactPhone)
      ? `<p style="font-size:13px;color:#374151">Менеджер: <strong>${contactName}</strong>${contactPhone ? ` · ${contactPhone}` : ''}</p>`
      : '';

    const html = `
      <div style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#1a1a1a">
        <h2 style="color:#1E3A5F;margin-bottom:4px">Замовлення постачальнику ${doc.doc_number}</h2>
        <p style="font-size:13px;color:#64748B;margin:0 0 16px">${new Date(doc.doc_date).toLocaleDateString('uk-UA')} · ${expectedStr}</p>
        ${contactBlock}
        ${doc.notes ? `<p style="font-size:13px;color:#374151;background:#F8FAFC;padding:8px 12px;border-radius:6px">${doc.notes}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin-top:12px">
          <thead>
            <tr style="background:#F8FAFC">
              <th style="padding:7px 10px;text-align:left;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">АРТИКУЛ</th>
              <th style="padding:7px 10px;text-align:left;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">НАЗВА</th>
              <th style="padding:7px 10px;text-align:center;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">К-СТЬ</th>
              <th style="padding:7px 10px;text-align:right;font-size:11px;color:#94A3B8;border-bottom:2px solid #E2E8F0">ЦІНА</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:8px 10px;text-align:right;font-weight:700;font-size:13px">Разом:</td>
              <td style="padding:8px 10px;text-align:right;font-weight:800;font-size:14px;color:#1E3A5F">${total.toFixed(2)} ₴</td>
            </tr>
          </tfoot>
        </table>
        ${commentBlock}
        <p style="color:#94A3B8;font-size:12px;margin-top:24px">${fromName} · ${fromEmail}</p>
      </div>`;

    try {
      await resend.emails.send({
        from:    `${fromName} <${fromEmail}>`,
        to:      [supplierEmail],
        subject: `Замовлення ${doc.doc_number} від ${fromName}`,
        replyTo: fromEmail,
        html,
      });

      // Оновлюємо статус на "sent"
      await db.from('acc_documents')
        .update({ procurement_status: 'sent' })
        .eq('id', doc.id);

      results.push({ id: doc.id, doc_number: doc.doc_number, supplier: supplier?.name ?? supplierEmail, emailed: true });
    } catch (err) {
      results.push({ id: doc.id, doc_number: doc.doc_number, supplier: supplier?.name ?? supplierEmail, emailed: false, error: String(err) });
    }
  }

  const ok    = results.filter(r => r.emailed).length;
  const fails = results.filter(r => !r.emailed).length;
  return NextResponse.json({ results, ok, fails });
}
