import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { toEmail, registerNumber, pdfBase64 } = await req.json();

  if (!toEmail || !pdfBase64) {
    return NextResponse.json({ error: 'Email та PDF обов\'язкові' }, { status: 400 });
  }

  const { error } = await resend.emails.send({
    from:    'FixLine <orders@fixline.com.ua>',
    to:      [toEmail],
    subject: `Реєстр НП #${registerNumber} — для підпису та відправки`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0F172A;max-width:560px">
        <div style="background:#1E3A5F;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">
          <div style="font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">Нова Пошта — Реєстр відправлень</div>
          <div style="font-size:20px;font-weight:800">#${registerNumber}</div>
        </div>
        <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 10px 10px">
          <p style="color:#374151;font-size:13px;margin:0">
            Реєстр відправлень у вкладенні PDF.<br>
            Роздрукуйте, підпишіть і передайте кур'єру Нової Пошти разом з посилками.
          </p>
        </div>
      </div>`,
    attachments: [{
      filename: `register-${registerNumber}.pdf`,
      content:  pdfBase64,
    }],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
