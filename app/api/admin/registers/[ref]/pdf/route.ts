import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { ref } = await params;
  const apiKey = await getNpApiKey();

  // Step 1: get sheet summary
  const sheetRes = await npCall(apiKey, 'ScanSheet', 'getScanSheet', { Ref: ref });
  const sheet = sheetRes.data?.[0];
  const sheetNumber   = String(sheet?.Number ?? ref.slice(0, 8));
  const sheetDateTime = String(sheet?.DateTime ?? '');
  const sheetDate     = sheetDateTime
    ? new Date(sheetDateTime).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('uk-UA');

  // Step 2: load TTNs via getDocumentList filtered by ScanSheetNumber
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
  const documents = allDocs
    .filter((d: any) => String(d.ScanSheetNumber ?? '') === sheetNumber)
    .map((d: any) => ({
      num:       String(d.IntDocNumber ?? ''),
      recipient: String(d.RecipientContactPerson ?? d.RecipientDescription ?? '').trim(),
      cod:       String(d.BackwardDeliverySum ?? d.CostOnSite ?? '0'),
    }));

  const today = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const totalCod = documents.reduce((s, d) => s + parseFloat(d.cod || '0'), 0);

  const rows = documents.length > 0
    ? documents.map((d, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td style="font-family:monospace;font-weight:bold;font-size:13px">${d.num || '—'}</td>
      <td>${d.recipient || '—'}</td>
      <td style="text-align:right">${d.cod ? d.cod + ' ₴' : '—'}</td>
    </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:#999">Немає ТТН у реєстрі</td></tr>';

  // Debug: also show raw data in HTML comment
  const debug = req.nextUrl.searchParams.has('debug')
    ? `<pre style="background:#f5f5f5;padding:12px;margin-top:20px;font-size:10px;overflow:auto">${JSON.stringify({ sheetNumber, dateForApi, docsCount: allDocs.length, filteredCount: documents.length, first: allDocs[0] }, null, 2)}</pre>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <title>Реєстр НП #${sheetNumber}</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #000; padding: 20px 24px 100px; max-width: 900px; }
    .header { display: flex; align-items: flex-start; gap: 24px; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #000; }
    .barcode-wrap { flex-shrink: 0; text-align: center; }
    .barcode-wrap svg { display: block; }
    .sheet-num { font-size: 15px; font-weight: bold; text-align: center; margin-top: 4px; letter-spacing: 1px; }
    .header-info { flex: 1; }
    .title { font-size: 20px; font-weight: bold; margin-bottom: 6px; }
    .meta { font-size: 11px; color: #555; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #e8e8e8; padding: 7px 10px; text-align: left; font-size: 11px; border: 1px solid #bbb; text-transform: uppercase; letter-spacing: .04em; }
    td { padding: 6px 10px; border: 1px solid #ddd; }
    tr:nth-child(even) td { background: #f8f8f8; }
    .totals { margin-top: 12px; display: flex; justify-content: flex-end; gap: 24px; font-size: 13px; }
    .footer { margin-top: 28px; padding-top: 14px; border-top: 1px solid #ccc; display: flex; justify-content: space-between; }
    .sign-block { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #333; }
    .sign-line { width: 220px; border-top: 1px solid #000; padding-top: 4px; margin-top: 20px; font-size: 10px; color: #666; }
    .btn-bar { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 10px; }
    .btn { padding: 12px 22px; border: none; border-radius: 10px; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.2); }
    .btn-print { background: #1E3A5F; color: #fff; }
    .btn-send  { background: #15803D; color: #fff; }
    .btn:disabled { opacity: .6; cursor: wait; }
    /* Email modal */
    .modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; align-items:center; justify-content:center; }
    .modal-bg.open { display:flex; }
    .modal { background:#fff; border-radius:14px; padding:28px; width:380px; box-shadow:0 20px 60px rgba(0,0,0,.25); }
    .modal h3 { font-size:16px; font-weight:800; margin-bottom:16px; }
    .modal input { width:100%; height:40px; padding:0 12px; border:1.5px solid #e2e8f0; border-radius:8px; font-size:14px; outline:none; box-sizing:border-box; margin-bottom:12px; }
    .modal-btns { display:flex; gap:8px; justify-content:flex-end; }
    .modal-btns button { height:36px; padding:0 18px; border-radius:8px; border:none; font-size:13px; font-weight:600; cursor:pointer; }
    .modal-btns .cancel { background:#f1f5f9; color:#374151; }
    .modal-btns .send { background:#15803D; color:#fff; }
    .status { font-size:12px; color:#64748B; margin-top:6px; min-height:18px; }
    @media print { .btn-bar,.modal-bg { display:none!important; } body { padding:8px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="barcode-wrap">
      <svg id="barcode"></svg>
      <div class="sheet-num">#${sheetNumber}</div>
    </div>
    <div class="header-info">
      <div class="title">Реєстр відправлень Нової Пошти</div>
      <div class="meta">Дата реєстру: <strong>${sheetDate}</strong></div>
      <div class="meta">Роздруковано: ${today}</div>
      <div class="meta" style="margin-top:6px">Кількість відправлень: <strong>${documents.length}</strong></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">№</th>
        <th style="width:160px">ТТН</th>
        <th>Отримувач</th>
        <th style="width:90px;text-align:right">COD</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${documents.length > 0 ? `
  <div class="totals">
    <span>Всього відправлень: <strong>${documents.length}</strong></span>
    <span>Загальний COD: <strong>${totalCod.toFixed(2)} ₴</strong></span>
  </div>` : ''}

  <div class="footer">
    <div class="sign-block">
      <div>Відправник:</div>
      <div class="sign-line">підпис / ПІБ</div>
    </div>
    <div class="sign-block">
      <div>Прийнято оператором НП:</div>
      <div class="sign-line">підпис / ПІБ / дата</div>
    </div>
  </div>

  ${debug}

  <!-- Buttons -->
  <div class="btn-bar">
    <button class="btn btn-print" onclick="window.print()">🖨 Друкувати</button>
    <button class="btn btn-send" onclick="document.querySelector('.modal-bg').classList.add('open')">📧 Відправити PDF</button>
  </div>

  <!-- Email modal -->
  <div class="modal-bg">
    <div class="modal">
      <h3>📧 Відправити реєстр PDF</h3>
      <input id="email-input" type="email" placeholder="email@постачальник.com" autofocus />
      <div id="send-status" class="status"></div>
      <div class="modal-btns">
        <button class="cancel" onclick="document.querySelector('.modal-bg').classList.remove('open')">Скасувати</button>
        <button class="send" id="send-btn" onclick="sendPdf()">Відправити</button>
      </div>
    </div>
  </div>

  <script>
    JsBarcode("#barcode", "${sheetNumber}", {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: false,
      margin: 4,
    });

    async function sendPdf() {
      const email = document.getElementById('email-input').value.trim();
      if (!email || !email.includes('@')) {
        document.getElementById('send-status').textContent = 'Введіть коректний email';
        return;
      }
      const btn = document.getElementById('send-btn');
      btn.disabled = true;
      document.getElementById('send-status').textContent = 'Генерація PDF...';

      try {
        // Hide buttons while capturing
        document.querySelector('.btn-bar').style.display = 'none';
        document.querySelector('.modal-bg').style.display = 'none';

        const { jsPDF } = window.jspdf;
        const canvas = await html2canvas(document.body, { scale: 2, useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/jpeg', 0.92);
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const w = pdf.internal.pageSize.getWidth();
        const h = (canvas.height * w) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, w, Math.min(h, 297));
        const pdfBase64 = pdf.output('datauristring').split(',')[1];

        // Restore UI
        document.querySelector('.btn-bar').style.display = 'flex';
        document.querySelector('.modal-bg').style.display = 'flex';
        document.getElementById('send-status').textContent = 'Відправка...';

        const res = await fetch('/api/admin/registers/send-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toEmail: email,
            registerNumber: '${sheetNumber}',
            pdfBase64,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          document.getElementById('send-status').textContent = 'Помилка: ' + (data.error ?? 'невідома');
        } else {
          document.getElementById('send-status').textContent = '✓ Відправлено на ' + email;
          setTimeout(() => document.querySelector('.modal-bg').classList.remove('open'), 2000);
        }
      } catch(e) {
        document.querySelector('.btn-bar').style.display = 'flex';
        document.querySelector('.modal-bg').style.display = 'flex';
        document.getElementById('send-status').textContent = 'Помилка: ' + e.message;
      }
      btn.disabled = false;
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
