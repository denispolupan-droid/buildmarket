import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

const resend = new Resend(process.env.RESEND_API_KEY);
const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getNpApiKey() {
  const { data } = await serviceClient.from('app_settings').select('key, value').eq('key', 'np_api_key');
  return data?.[0]?.value || process.env.NOVA_POSHTA_API_KEY || '';
}

async function npCall(apiKey: string, modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

async function generatePdf(
  registerNumber: string,
  sheetDate: string,
  ttns: { ttn: string; contact: string; amount: number }[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const totalCod = ttns.reduce((s, t) => s + (t.amount || 0), 0);

    // ── Header ──────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('Реєстр відправлень Нової Пошти', { align: 'left' });
    doc.fontSize(14).text(`#${registerNumber}`, { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#555')
       .text(`Дата реєстру: ${sheetDate}     Кількість: ${ttns.length}     Загальний COD: ${totalCod.toFixed(2)} грн`);
    doc.moveDown(0.5);

    // ── Separator ───────────────────────────────────────────────────
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000').stroke();
    doc.moveDown(0.5);

    // ── Table header ────────────────────────────────────────────────
    const colX = [40, 65, 220, 450];
    const rowH  = 20;
    const y0    = doc.y;

    doc.rect(40, y0, 515, rowH).fill('#EEEEEE');
    doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
    doc.text('№',         colX[0], y0 + 5, { width: 22, align: 'center' });
    doc.text('ТТН',       colX[1], y0 + 5, { width: 152 });
    doc.text('Отримувач', colX[2], y0 + 5, { width: 226 });
    doc.text('COD (грн)', colX[3], y0 + 5, { width: 105, align: 'right' });

    // ── Table rows ──────────────────────────────────────────────────
    doc.font('Helvetica').fontSize(9);
    let y = y0 + rowH;

    ttns.forEach((t, i) => {
      if (y > 760) { doc.addPage(); y = 40; }

      if (i % 2 === 1) doc.rect(40, y, 515, rowH).fill('#FAFAFA');
      doc.fillColor('#000');

      doc.text(String(i + 1), colX[0], y + 5, { width: 22, align: 'center' });
      doc.font('Helvetica-Bold').text(t.ttn || '—', colX[1], y + 5, { width: 152 });
      doc.font('Helvetica').text(t.contact || '—', colX[2], y + 5, { width: 226 });
      doc.text(t.amount ? t.amount.toFixed(2) : '—', colX[3], y + 5, { width: 105, align: 'right' });

      // row border
      doc.rect(40, y, 515, rowH).strokeColor('#DDDDDD').stroke();
      y += rowH;
    });

    if (ttns.length === 0) {
      doc.text('Немає відправлень у реєстрі', 40, y + 5);
      y += rowH;
    }

    // ── Totals ──────────────────────────────────────────────────────
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica-Bold')
       .text(`Всього: ${ttns.length} відправлень  ·  COD: ${totalCod.toFixed(2)} грн`, { align: 'right' });

    // ── Signature lines ─────────────────────────────────────────────
    const sigY = Math.min(y + 60, 720);
    doc.moveDown(2);
    doc.fontSize(9).font('Helvetica').fillColor('#333');
    doc.text('Відправник: ________________________________', 40, sigY);
    doc.text('підпис / ПІБ', 40, sigY + 14, { width: 200 });
    doc.text('Прийнято оператором НП: ___________________', 310, sigY);
    doc.text('підпис / ПІБ / дата', 310, sigY + 14, { width: 245 });

    doc.end();
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { toEmail, toName, registerNumber, registerRef, ttns: clientTtns } = await req.json();
  if (!toEmail) return NextResponse.json({ error: 'Email обов\'язковий' }, { status: 400 });

  const apiKey = await getNpApiKey();
  let ttns: { ttn: string; contact: string; amount: number }[] = clientTtns ?? [];
  let sheetDate = new Date().toLocaleDateString('uk-UA');

  // Load TTNs from NP
  if (registerRef && registerNumber) {
    try {
      const sheetRes = await npCall(apiKey, 'ScanSheet', 'getScanSheet', { Ref: registerRef });
      const sheet = sheetRes.data?.[0];
      const sheetDateTime = String(sheet?.DateTime ?? '');
      if (sheetDateTime) {
        sheetDate = new Date(sheetDateTime).toLocaleDateString('uk-UA');
      }
      const datePart = sheetDateTime.split(' ')[0] || new Date().toISOString().slice(0, 10);
      const [yr, mo, dy] = datePart.split('-');
      const dateForApi = `${dy}.${mo}.${yr}`;

      const docsRes = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
        DateTimeFrom: dateForApi,
        DateTimeTo:   dateForApi,
        GetFullList:  '1',
        Page:         '1',
      });
      const allDocs: any[] = Array.isArray(docsRes.data) ? docsRes.data : [];
      const fromNP = allDocs
        .filter((d: any) => String(d.ScanSheetNumber ?? '') === registerNumber)
        .map((d: any) => ({
          ttn:    String(d.IntDocNumber ?? ''),
          contact: String(d.RecipientContactPerson ?? d.RecipientDescription ?? '').trim(),
          amount:  parseFloat(d.BackwardDeliverySum ?? d.CostOnSite ?? '0') || 0,
        }))
        .filter(d => d.ttn);
      if (fromNP.length > 0) ttns = fromNP;
    } catch {}
  }

  if (!ttns.length) return NextResponse.json({ error: 'Немає ТТН для відправки' }, { status: 400 });

  // Generate PDF
  const pdfBuffer = await generatePdf(registerNumber, sheetDate, ttns);

  const totalCod = ttns.reduce((s, t) => s + (t.amount || 0), 0);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0F172A">
      <div style="background:#1E3A5F;color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:4px">Нова Пошта — Реєстр відправлень</div>
        <div style="font-size:22px;font-weight:800">#${registerNumber}</div>
      </div>
      <div style="padding:16px 24px;border:1px solid #E2E8F0;border-top:none;background:#F8FAFC">
        <p style="color:#64748B;font-size:13px;margin:0 0 8px">
          Підготуйте посилки до передачі кур'єру.<br>
          Реєстр для підпису — у вкладенні PDF.
        </p>
        <p style="font-size:13px;margin:0">Відправлень: <strong>${ttns.length}</strong> &nbsp;·&nbsp; COD: <strong>${totalCod.toFixed(2)} ₴</strong></p>
      </div>
    </div>`;

  const { error } = await resend.emails.send({
    from:    'FixLine <orders@fixline.com.ua>',
    to:      [toEmail],
    subject: `Реєстр НП #${registerNumber} — ${ttns.length} посилок`,
    html,
    attachments: [{
      filename:    `register-${registerNumber}.pdf`,
      content:     pdfBuffer.toString('base64'),
      type:        'application/pdf' as const,
      disposition: 'attachment' as const,
    }],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
