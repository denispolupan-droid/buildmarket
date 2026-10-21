import { hryvniaInWords } from "./number-to-words";
import { shortFio, type Signer } from "./signatory";
import type { VidatkovaRenderParams } from "./vidatkova-doc";
import { formatMoney, formatQty, formatDocDate, taxIdLabel } from "./doc-format";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Блок підпису для листа — та сама схема, що й на сторінці/PDF: посада над
// лінією, лінія вільна під підпис, ПІБ праворуч, нижче М.П. (табличний HTML
// для поштових клієнтів).
function signatureBlock(label: string, signer: Signer | null | undefined) {
  const cap = (t: string) => `<div style="font-size:9.5px;color:#9CA3AF;text-align:center;margin-top:2px">${t}</div>`;
  const position = signer?.position?.trim();
  const name = signer?.name ? shortFio(signer.name) : '';
  return `
    <div style="font-weight:700;margin-bottom:6px">${label}:</div>
    ${position
      ? `<div style="margin-bottom:14px">${escapeHtml(position)}</div>`
      : `<div style="border-bottom:1px solid #000;height:16px"></div>${cap('(посада)')}<div style="height:8px"></div>`}
    <table style="border-collapse:collapse;width:100%"><tr>
      <td style="border:none;padding:0;vertical-align:bottom"><div style="border-bottom:1px solid #000;height:20px"></div>${cap('(підпис)')}</td>
      <td style="border:none;padding:0 0 0 10px;vertical-align:bottom;${name ? 'white-space:nowrap;width:1%' : 'width:45%'}">
        ${name
          ? `<div style="height:20px;line-height:20px">${escapeHtml(name)}</div>${cap('&nbsp;')}`
          : `<div style="border-bottom:1px solid #000;height:20px"></div>${cap('(прізвище, ініціали)')}`}
      </td>
    </tr></table>
    <div style="margin-top:14px;color:#555;font-size:11px;min-height:40px">М.П.</div>`;
}

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export function buildVidatkovaHtml(params: VidatkovaRenderParams & { printUrl?: string }): string {
  const {
    docNumber, docDate, lines, total,
    sellerName, sellerEdrpou, sellerAddress, sellerCity, sellerBank, sellerIban, sellerTaxStatus,
    buyerName, buyerPhone, buyerEdrpou, buyerAddress, orderNumber, contract, printUrl,
    sellerSigner, buyerSigner,
  } = params;

  const date = formatDocDate(docDate);
  const ibanDisplay = formatIban(sellerIban);
  // Таблиця як у друкованих формах 1С: тонкі чорні рамки, сіра шапка, без «зебри»
  const th = 'border:1px solid #000;padding:5px 6px;color:#111;font-weight:700;text-align:center';
  const td = 'border:1px solid #000;padding:4px 6px;color:#111';

  const rows = lines.map((item, idx) => `
    <tr>
      <td style="${td};text-align:center">${idx + 1}</td>
      <td style="${td};text-align:center;font-size:10px">${escapeHtml(item.sku)}</td>
      <td style="${td}">${escapeHtml(item.name)}</td>
      <td style="${td};text-align:right">${formatQty(item.qty)}</td>
      <td style="${td};text-align:center">${escapeHtml(item.unit)}</td>
      <td style="${td};text-align:right;white-space:nowrap">${formatMoney(item.price)}</td>
      <td style="${td};text-align:right;white-space:nowrap">${formatMoney(item.qty * item.price)}</td>
    </tr>`).join('');

  const subtitle = [
    sellerCity ? `Місце складання: ${escapeHtml(sellerCity)}` : null,
    contract ? `Договір ${escapeHtml(contract)}` : null,
    orderNumber ? `Підстава: замовлення №${orderNumber}` : null,
  ].filter(Boolean).join(' · ');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Видаткова накладна ${escapeHtml(docNumber)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;background:#E8ECF0;margin:0;padding:20px">
<div style="max-width:700px;margin:0 auto;background:#fff;padding:28px 32px;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.1)">

  <div style="font-size:17px;font-weight:700;margin-bottom:4px">
    Видаткова накладна № ${escapeHtml(docNumber)} від ${date}
  </div>
  ${subtitle ? `<div style="font-size:11px;color:#555;margin-bottom:6px">${subtitle}</div>` : ''}
  <hr style="border:none;border-top:1.5px solid #111;margin-bottom:14px">

  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;font-size:12px">
    <tr>
      <td style="padding:3px 0;width:130px;font-weight:700;vertical-align:top;border:none">Постачальник:</td>
      <td style="padding:3px 0;vertical-align:top;border:none;line-height:1.75">
        <strong>${escapeHtml(sellerName)}</strong>
        ${sellerEdrpou ? `<br><span style="color:#555">${taxIdLabel(sellerEdrpou)}: ${escapeHtml(sellerEdrpou)}</span>` : ''}
        ${sellerAddress ? `<br><span style="color:#555">Адреса: ${escapeHtml(sellerAddress)}</span>` : ''}
        ${sellerBank ? `<br><span style="color:#555">Банк: ${escapeHtml(sellerBank)}</span>` : ''}
        ${sellerIban ? `<br><span style="color:#555">IBAN: <span style="color:#111;font-weight:600">${ibanDisplay}</span></span>` : ''}
        ${sellerTaxStatus ? `<br><span style="color:#555">${escapeHtml(sellerTaxStatus)}</span>` : ''}
      </td>
    </tr>
    <tr><td colspan="2" style="border:none;padding:2px 0"><hr style="border:none;border-top:1px dashed #ccc"></td></tr>
    <tr>
      <td style="padding:3px 0;font-weight:700;vertical-align:top;border:none">Покупець:</td>
      <td style="padding:3px 0;vertical-align:top;border:none;line-height:1.75">
        <strong>${escapeHtml(buyerName)}</strong>
        ${buyerEdrpou ? `<br><span style="color:#555">${taxIdLabel(buyerEdrpou)}: ${escapeHtml(buyerEdrpou)}</span>` : ''}
        ${buyerAddress ? `<br><span style="color:#555">Адреса: ${escapeHtml(buyerAddress)}</span>` : ''}
        ${buyerPhone ? `<br><span style="color:#555">Тел.: ${escapeHtml(buyerPhone)}</span>` : ''}
      </td>
    </tr>
  </table>

  <table style="border-collapse:collapse;width:100%;margin-bottom:6px;font-size:11px;border:1px solid #000">
    <thead>
      <tr style="background:#F2F2F2">
        <th style="${th};width:28px">№</th>
        <th style="${th};width:80px">Код</th>
        <th style="${th}">Найменування товару</th>
        <th style="${th};width:60px">Кількість</th>
        <th style="${th};width:36px">Од.</th>
        <th style="${th};width:74px">Ціна, грн</th>
        <th style="${th};width:84px">Сума, грн</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="text-align:right;font-size:12px;font-weight:700;padding:4px 6px 4px 0;margin-bottom:2px">
    Разом без ПДВ:&nbsp;&nbsp;${formatMoney(total)}
  </div>

  <div style="font-size:11px;color:#111;margin-bottom:2px">
    Всього найменувань: ${lines.length}, на суму ${formatMoney(total)} грн
  </div>
  <div style="font-size:12px;color:#111;margin-bottom:24px;font-weight:700">
    ${hryvniaInWords(total)}, без ПДВ
  </div>

  ${printUrl ? `<div style="margin-bottom:20px;padding:10px 14px;background:#EFF4FF;border-radius:6px;font-size:12px">
    Переглянути накладну онлайн: <a href="${printUrl}" style="color:#1E3A5F;font-weight:600">${printUrl}</a>
  </div>` : ''}

  <table style="border-collapse:collapse;width:100%;font-size:12px;margin-top:8px">
    <tr>
      <td style="width:50%;padding:0 20px 0 0;vertical-align:top;border:none">${signatureBlock('Відпустив(ла)', sellerSigner)}</td>
      <td style="width:50%;padding:0 0 0 20px;vertical-align:top;border:none">${signatureBlock('Отримав(ла)', buyerSigner)}</td>
    </tr>
  </table>

</div>
</body>
</html>`;
}
