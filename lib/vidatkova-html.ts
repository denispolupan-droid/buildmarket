import { hryvniaInWords } from "./number-to-words";
type PrintLine = { sku: string; name: string; qty: number; price: number };

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export function buildVidatkovaHtml(params: {
  docNumber: string;
  docDate: string;
  lines: PrintLine[];
  total: number;
  sellerName: string;
  sellerEdrpou: string;
  sellerAddress: string;
  sellerCity?: string;
  sellerBank: string;
  sellerIban: string;
  buyerName: string;
  buyerPhone?: string | null;
  buyerEdrpou?: string | null;
  buyerAddress?: string | null;
  orderNumber?: number | null;
  signatoryName?: string;
  printUrl?: string;
}): string {
  const {
    docNumber, docDate, lines, total,
    sellerName, sellerEdrpou, sellerAddress, sellerCity, sellerBank, sellerIban,
    buyerName, buyerPhone, buyerEdrpou, buyerAddress, orderNumber, signatoryName = '', printUrl,
  } = params;

  const date = new Date(docDate).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
  const ibanDisplay = formatIban(sellerIban);

  const rows = lines.map((item, idx) => `
    <tr style="background:${idx % 2 === 1 ? '#F8FAFC' : '#fff'}">
      <td style="border:1px solid #ccc;padding:5px 6px;text-align:center">${idx + 1}</td>
      <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-family:monospace;font-size:10px;color:#444">${item.sku}</td>
      <td style="border:1px solid #ccc;padding:5px 8px">${item.name}</td>
      <td style="border:1px solid #ccc;padding:5px 6px;text-align:right">${item.qty}</td>
      <td style="border:1px solid #ccc;padding:5px 6px;text-align:center;color:#555">шт</td>
      <td style="border:1px solid #ccc;padding:5px 8px;text-align:right">${item.price.toFixed(2)}</td>
      <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:700">${(item.qty * item.price).toFixed(2)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Видаткова накладна ${docNumber}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;background:#E8ECF0;margin:0;padding:20px">
<div style="max-width:700px;margin:0 auto;background:#fff;padding:28px 32px;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.1)">

  <div style="font-size:17px;font-weight:700;margin-bottom:4px">
    Видаткова накладна № ${docNumber} від ${date}
  </div>
  ${sellerCity || orderNumber ? `<div style="font-size:11px;color:#555;margin-bottom:6px">${[sellerCity ? `Місце складання: ${sellerCity}` : null, orderNumber ? `Підстава: замовлення №${orderNumber}` : null].filter(Boolean).join(' · ')}</div>` : ''}
  <hr style="border:none;border-top:2px solid #1E3A5F;margin-bottom:14px">

  <table style="border-collapse:collapse;width:100%;margin-bottom:10px;font-size:12px">
    <tr>
      <td style="padding:3px 0;width:130px;font-weight:700;vertical-align:top;border:none">Постачальник:</td>
      <td style="padding:3px 0;vertical-align:top;border:none;line-height:1.75">
        <strong>${sellerName}</strong>
        ${sellerEdrpou ? `<br><span style="color:#555">ЄДРПОУ/ДРФО: ${sellerEdrpou}</span>` : ''}
        ${sellerAddress ? `<br><span style="color:#555">Адреса: ${sellerAddress}</span>` : ''}
        ${sellerBank ? `<br><span style="color:#555">Банк: ${sellerBank}</span>` : ''}
        ${sellerIban ? `<br><span style="color:#555">IBAN: <span style="font-family:monospace;color:#1E3A5F;font-weight:600">${ibanDisplay}</span></span>` : ''}
      </td>
    </tr>
    <tr><td colspan="2" style="border:none;padding:2px 0"><hr style="border:none;border-top:1px dashed #ccc"></td></tr>
    <tr>
      <td style="padding:3px 0;font-weight:700;vertical-align:top;border:none">Покупець:</td>
      <td style="padding:3px 0;vertical-align:top;border:none">
        <strong>${buyerName}</strong>
        ${buyerEdrpou ? `<br><span style="color:#555">ЄДРПОУ/ДРФО: ${buyerEdrpou}</span>` : ''}
        ${buyerAddress ? `<br><span style="color:#555">Адреса: ${buyerAddress}</span>` : ''}
        ${buyerPhone ? `<br><span style="color:#555">Тел.: ${buyerPhone}</span>` : ''}
      </td>
    </tr>
  </table>

  <table style="border-collapse:collapse;width:100%;margin-bottom:6px;font-size:11px">
    <thead>
      <tr style="background:#1E3A5F">
        <th style="border:1px solid #4B6B8F;padding:6px 6px;color:#fff;width:28px;text-align:center">№</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;width:88px;text-align:center">Код</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;text-align:left">Найменування</th>
        <th style="border:1px solid #4B6B8F;padding:6px 6px;color:#fff;width:52px;text-align:center">Кіл-сть</th>
        <th style="border:1px solid #4B6B8F;padding:6px 6px;color:#fff;width:36px;text-align:center">Од.</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;width:72px;text-align:right">Ціна</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;width:72px;text-align:right">Сума</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-size:11px;color:#555">Всього без ПДВ:</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:700">${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div style="font-size:11px;color:#333;margin-bottom:2px">
    Всього найменувань: ${lines.length}, на суму <strong>${total.toFixed(2)} грн</strong>
  </div>
  <div style="font-size:11px;color:#333;margin-bottom:24px;font-style:italic">
    ${hryvniaInWords(total)}
  </div>

  ${printUrl ? `<div style="margin-bottom:20px;padding:10px 14px;background:#EFF4FF;border-radius:6px;font-size:12px">
    Переглянути накладну онлайн: <a href="${printUrl}" style="color:#1E3A5F;font-weight:600">${printUrl}</a>
  </div>` : ''}

  <table style="border-collapse:collapse;width:100%;font-size:11px;margin-top:8px">
    <tr>
      <td style="border:1px solid #ccc;padding:6px 8px;width:80px;font-weight:700">Відпустив:</td>
      <td style="border:1px solid #ccc;padding:6px 8px;width:140px;text-align:center">
        ${signatoryName ? `<strong>${signatoryName}</strong>` : '<span style="color:#9CA3AF">(посада)</span>'}
      </td>
      <td style="border:1px solid #ccc;padding:6px 8px;width:80px;text-align:center"><span style="color:#9CA3AF">(підпис)</span></td>
      <td style="border:1px solid #ccc;padding:6px 8px;width:140px;text-align:center"><span style="color:#9CA3AF">(прізвище, ім'я)</span></td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 8px;font-weight:700">Отримав:</td>
      <td style="border:1px solid #ccc;padding:6px 8px"></td>
      <td style="border:1px solid #ccc;padding:6px 8px"></td>
      <td style="border:1px solid #ccc;padding:6px 8px"></td>
    </tr>
  </table>

</div>
</body>
</html>`;
}
