import { hryvniaInWords } from "./number-to-words";
type Item = { sku: string; name: string; brand?: string | null; qty: number; price: number };

type Order = {
  order_number: number;
  created_at: string;
  company?: string | null;
  contact: string;
  phone?: string | null;
  email?: string | null;
  delivery_address?: string | null;
  delivery_city_name?: string | null;
  items: Item[];
  total_price: number;
  payment_due_date?: string | null;
};

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

export function buildInvoiceHtml(params: {
  order: Order;
  bankRecipient: string;
  bankIban: string;
  bankName: string;
  bankEdrpou: string;
  bankAddress?: string;
  signatoryName?: string;
  invoiceUrl?: string;
}): string {
  const { order, bankRecipient, bankIban, bankName, bankEdrpou,
          bankAddress = '', signatoryName = '', invoiceUrl } = params;

  const date = new Date(order.created_at).toLocaleDateString('uk-UA', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const ibanDisplay = formatIban(bankIban);
  const buyerName   = order.company || order.contact;
  const total       = Number(order.total_price);
  const items       = order.items as Item[];

  const dueDateStr = order.payment_due_date
    ? new Date(order.payment_due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' })
    : null;

  const deliveryAddr = [order.delivery_city_name, order.delivery_address].filter(Boolean).join(', ');

  const itemRows = items.map((item, i) => {
    const name = [item.brand, item.name].filter(Boolean).join(' ');
    const sum  = (item.qty * Number(item.price)).toFixed(2);
    const bg   = i % 2 === 1 ? '#F8FAFC' : '#ffffff';
    return `
      <tr style="background:${bg};">
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:center;font-size:11px;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-family:monospace;font-size:10px;color:#444;">${item.sku}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;font-size:11px;">${name}</td>
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:right;font-size:11px;">${item.qty}</td>
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:center;font-size:11px;color:#555;">шт</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-size:11px;">${Number(item.price).toFixed(2)}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-size:11px;font-weight:700;">${sum}</td>
      </tr>`;
  }).join('');

  const printBtn = invoiceUrl
    ? `<div style="text-align:center;margin:24px 0 8px;">
        <a href="${invoiceUrl}" style="display:inline-block;background:#1E3A5F;color:#fff;
           font-size:13px;font-weight:700;padding:11px 26px;border-radius:7px;
           text-decoration:none;letter-spacing:0.02em;">
          Переглянути та роздрукувати рахунок →
        </a>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Рахунок на оплату №${order.order_number}</title>
</head>
<body style="margin:0;padding:0;background:#E8ECF0;font-family:Arial,Helvetica,sans-serif;color:#111;">
<div style="max-width:680px;margin:24px auto;background:#fff;border-radius:4px;
            box-shadow:0 2px 16px rgba(0,0,0,0.1);padding:24px 28px 28px;">

  <!-- Warning -->
  <div style="border:1px solid #CBD5E1;border-radius:4px;padding:7px 14px;margin-bottom:14px;
              font-size:10px;color:#4A5568;line-height:1.55;text-align:center;background:#FAFBFC;">
    <strong style="color:#1a1a1a;">Увага!</strong> Сплата даного рахунку означає згоду з умовами постачання товару.
    Повідомлення про сплату обов'язкове, інакше не гарантується наявність товару на складі.
    Товар відпускається за фактом приходу грошей на п/р Постачальника.
  </div>

  <!-- Payment order sample -->
  <div style="border:1px solid #C5D5E8;border-radius:5px;margin-bottom:18px;overflow:hidden;">
    <div style="background:#DCE8F5;padding:5px 14px;font-size:9.5px;color:#3D5A80;
                font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">
      Зразок заповнення платіжного доручення
    </div>
    <div style="background:#F4F8FD;padding:10px 14px 12px;">
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
        <tr>
          <td style="padding-right:32px;vertical-align:top;">
            <div style="font-size:9px;color:#6B7E99;margin-bottom:2px;letter-spacing:0.04em;">ОДЕРЖУВАЧ</div>
            <div style="font-size:12px;font-weight:700;color:#111;">${bankRecipient}</div>
          </td>
          ${bankEdrpou ? `<td style="vertical-align:top;">
            <div style="font-size:9px;color:#6B7E99;margin-bottom:2px;letter-spacing:0.04em;">ЄДРПОУ / ДРФО</div>
            <div style="font-size:12px;font-weight:700;color:#111;">${bankEdrpou}</div>
          </td>` : ''}
        </tr>
      </table>
      <div style="margin-bottom:8px;">
        <div style="font-size:9px;color:#6B7E99;margin-bottom:2px;letter-spacing:0.04em;">БАНК ОДЕРЖУВАЧА</div>
        <div style="font-size:11.5px;color:#222;">${bankName}</div>
      </div>
      <div>
        <div style="font-size:9px;color:#6B7E99;margin-bottom:3px;letter-spacing:0.04em;">РАХУНОК (IBAN)</div>
        <div style="font-family:'Menlo','Monaco','Consolas','Lucida Console',monospace;font-size:15px;font-weight:700;
                    color:#1E3A5F;letter-spacing:0.08em;">${ibanDisplay}</div>
      </div>
    </div>
  </div>

  <!-- Title -->
  <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:6px;">
    Рахунок на оплату № ${order.order_number} від ${date}
  </div>
  <hr style="border:none;border-top:2px solid #1E3A5F;margin-bottom:14px;"/>

  <!-- Parties -->
  <table cellpadding="0" cellspacing="0" width="100%"
         style="border-collapse:collapse;font-size:12px;margin-bottom:12px;">
    <tr>
      <td style="padding:3px 0;width:120px;font-weight:700;vertical-align:top;">Постачальник:</td>
      <td style="padding:3px 0;vertical-align:top;line-height:1.75;">
        <strong>${bankRecipient}</strong>
        ${bankEdrpou ? `<br/><span style="color:#555;font-size:11px;">ЄДРПОУ/ДРФО: ${bankEdrpou}</span>` : ''}
        ${bankAddress ? `<br/><span style="color:#555;font-size:11px;">Адреса: ${bankAddress}</span>` : ''}
        ${bankName ? `<br/><span style="color:#555;font-size:11px;">Банк: ${bankName}</span>` : ''}
        ${bankIban ? `<br/><span style="color:#555;font-size:11px;">IBAN: <span style="font-family:'Menlo','Monaco','Consolas','Lucida Console',monospace;color:#1E3A5F;font-weight:600;">${ibanDisplay}</span></span>` : ''}
      </td>
    </tr>
    <tr><td colspan="2" style="padding:3px 0;"><hr style="border:none;border-top:1px dashed #ccc;"/></td></tr>
    <tr>
      <td style="padding:3px 0;font-weight:700;vertical-align:top;">Покупець:</td>
      <td style="padding:3px 0;vertical-align:top;">
        ${buyerName}
        ${order.company && order.contact !== order.company ? `<br/>${order.contact}` : ''}
        ${order.phone ? `<br/><span style="color:#555;font-size:11px;">Тел.: ${order.phone}</span>` : ''}
      </td>
    </tr>
    ${dueDateStr ? `
    <tr><td colspan="2" style="padding:3px 0;"><hr style="border:none;border-top:1px dashed #ccc;"/></td></tr>
    <tr>
      <td style="padding:3px 0;font-weight:700;">Строк оплати:</td>
      <td style="padding:3px 0;color:#B45309;font-weight:600;">до ${dueDateStr}</td>
    </tr>` : ''}
    ${deliveryAddr ? `
    <tr><td colspan="2" style="padding:3px 0;"><hr style="border:none;border-top:1px dashed #ccc;"/></td></tr>
    <tr>
      <td style="padding:3px 0;font-weight:700;">Адреса доставки:</td>
      <td style="padding:3px 0;">${deliveryAddr}</td>
    </tr>` : ''}
  </table>

  <!-- Items -->
  <table cellpadding="0" cellspacing="0" width="100%"
         style="border-collapse:collapse;margin-bottom:8px;border:1px solid #999;">
    <thead>
      <tr style="background:#1E3A5F;">
        <th style="border:1px solid #4B6B8F;padding:6px;color:#fff;width:28px;text-align:center;font-size:11px;white-space:nowrap;">№</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;width:88px;text-align:center;font-size:11px;white-space:nowrap;">Код</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;text-align:left;font-size:11px;">Найменування товару</th>
        <th style="border:1px solid #4B6B8F;padding:6px;color:#fff;width:56px;text-align:center;font-size:11px;white-space:nowrap;">Кількість</th>
        <th style="border:1px solid #4B6B8F;padding:6px;color:#fff;width:34px;text-align:center;font-size:11px;white-space:nowrap;">Од.</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;width:70px;text-align:right;font-size:11px;white-space:nowrap;">Ціна</th>
        <th style="border:1px solid #4B6B8F;padding:6px 8px;color:#fff;width:70px;text-align:right;font-size:11px;white-space:nowrap;">Сума</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-size:11px;color:#555;">Всього без ПДВ:</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-weight:700;font-size:11px;">${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Sum summary -->
  <div style="font-size:11px;color:#333;margin-bottom:2px;">
    Всього найменувань: ${items.length}, на суму <strong>${total.toFixed(2)} грн</strong>
  </div>
  <div style="font-size:11px;color:#333;margin-bottom:18px;font-style:italic;">
    ${hryvniaInWords(total)}
  </div>

  <!-- Payment purpose -->
  <div style="font-size:11px;padding:7px 10px;border:1px solid #D1D5DB;border-radius:3px;
              background:#F9FAFB;margin-bottom:20px;color:#333;">
    <strong>Призначення платежу:</strong>
    Оплата за замовлення №${order.order_number} від ${date}. Без ПДВ.
  </div>

  <!-- Signature -->
  <div style="display:flex;justify-content:flex-end;font-size:12px;">
    <div>
      <span>Виписав(ла):&nbsp;&nbsp;</span>
      <span style="border-bottom:1px solid #000;display:inline-block;min-width:150px;text-align:center;padding-bottom:1px;">
        ${signatoryName || '&nbsp;'}
      </span>
      ${!signatoryName ? `<div style="font-size:10px;color:#9CA3AF;text-align:right;margin-top:2px;">(підпис, прізвище)</div>` : ''}
    </div>
  </div>

  ${printBtn}

</div>

<!-- Email footer -->
<div style="max-width:680px;margin:0 auto;padding:10px 0;text-align:center;
            font-size:10px;color:#9CA3AF;">
  Цей документ сформовано автоматично та є дійсним без печатки та підпису
  відповідно до Закону України «Про електронні документи та електронний документообіг».
</div>
</body>
</html>`;
}
