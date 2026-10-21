import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildVidatkovaHtml } from '../../../../../../../lib/vidatkova-html';
import { buildVidatkovaPdf } from '../../../../../../../lib/vidatkova-pdf';
import { SELLER } from '../../../../../../../lib/company';
import { loadVidatkova, vidatkovaRenderParams } from '../../../../../../../lib/vidatkova-doc';
import { formatDocDate } from '../../../../../../../lib/doc-format';

const resend = new Resend(process.env.RESEND_API_KEY);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { email?: string };

  const data = await loadVidatkova(db, id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { doc, buyer } = data;

  const toEmail = body.email?.trim() || buyer.email;
  if (!toEmail) return NextResponse.json({ error: 'Email не вказано' }, { status: 400 });

  const buildParams = vidatkovaRenderParams(data);

  const [html, pdfBuffer] = await Promise.all([
    Promise.resolve(buildVidatkovaHtml({ ...buildParams, printUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/vidatkova/${id}` })),
    buildVidatkovaPdf(buildParams),
  ]);

  const date = formatDocDate(doc.doc_date);

  const { error: sendErr } = await resend.emails.send({
    from:    `${SELLER.name} <${process.env.RESEND_FROM_EMAIL ?? process.env.ADMIN_EMAIL ?? 'noreply@buildmarket.com.ua'}>`,
    to:      toEmail,
    subject: `Видаткова накладна ${doc.doc_number} від ${date}`,
    html,
    attachments: [{
      filename: `Видаткова_${doc.doc_number}.pdf`,
      content:  pdfBuffer,
    }],
  });

  if (sendErr) return NextResponse.json({ error: String(sendErr) }, { status: 500 });
  return NextResponse.json({ ok: true, to: toEmail });
}
