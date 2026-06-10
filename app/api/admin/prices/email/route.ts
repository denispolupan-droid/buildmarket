import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const email: string = body.email ?? '';
  const pdfBase64: string = body.pdfBase64 ?? '';
  const date: string = body.date ?? new Date().toISOString().slice(0, 10);

  if (!email.includes('@')) {
    return NextResponse.json({ error: 'Невірний email' }, { status: 400 });
  }
  if (!pdfBase64) {
    return NextResponse.json({ error: 'PDF не передано' }, { status: 400 });
  }

  const dateLabel = new Date().toLocaleDateString('uk-UA');

  const { error } = await resend.emails.send({
    from: 'FixLine <orders@fixline.com.ua>',
    to:   [email],
    subject: `Прайс-лист FixLine — ${dateLabel}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0F172A">
      <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">FixLine — Прайс-лист</div>
        <div style="font-size:20px;font-weight:800">fixline.com.ua</div>
      </div>
      <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;background:#F8FAFC">
        <p style="color:#374151;font-size:14px;margin:0">Актуальний прайс-лист у вкладенні (PDF).</p>
        <p style="color:#6B7280;font-size:12px;margin:8px 0 0">Дата: ${dateLabel}</p>
      </div>
    </div>`,
    attachments: [{
      filename: `pricelist_${date}.pdf`,
      content:  pdfBase64,
    }],
  });

  if (error) {
    console.error('[prices/email] resend error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
