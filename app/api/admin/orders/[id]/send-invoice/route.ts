import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { Resend } from 'resend';
import { buildInvoiceHtml } from '../../../../../../lib/invoice-html';
import { buildInvoicePdf } from '../../../../../../lib/invoice-pdf';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { email?: string };
  const db = createServiceClient();

  const { data: order, error } = await db.from('orders').select('*').eq('id', id).single();
  if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const toEmail = body.email?.trim() || order.email;
  if (!toEmail) return NextResponse.json({ error: 'Email не вказано' }, { status: 400 });

  const invoiceUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/invoice/${id}`;

  const bankParams = {
    order,
    bankRecipient: process.env.BANK_RECIPIENT ?? '',
    bankIban:      process.env.BANK_IBAN ?? '',
    bankName:      process.env.BANK_NAME ?? '',
    bankEdrpou:    process.env.BANK_EDRPOU ?? '',
    bankAddress:   process.env.BANK_ADDRESS ?? '',
    signatoryName: process.env.SIGNATORY_NAME ?? '',
  };

  const [html, pdfBuffer] = await Promise.all([
    Promise.resolve(buildInvoiceHtml({ ...bankParams, invoiceUrl })),
    buildInvoicePdf(bankParams),
  ]);

  const date = new Date(order.created_at).toLocaleDateString('uk-UA', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const { error: sendErr } = await resend.emails.send({
    from:    `${process.env.BANK_RECIPIENT ?? 'Buildmarket'} <${process.env.RESEND_FROM_EMAIL ?? process.env.ADMIN_EMAIL ?? 'noreply@buildmarket.com.ua'}>`,
    to:      toEmail,
    subject: `Рахунок на оплату №${order.order_number} від ${date}`,
    html,
    attachments: [{
      filename: `Рахунок_${order.order_number}.pdf`,
      content:  pdfBuffer,
    }],
  });

  if (sendErr) return NextResponse.json({ error: String(sendErr) }, { status: 500 });

  return NextResponse.json({ ok: true, to: toEmail });
}
