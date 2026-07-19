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
  channel_code?: string | null;
  prom_order_id?: string | number | null;
  rozetka_order_id?: string | number | null;
};

/** Маркетплейс-джерело замовлення: назва + номер замовлення саме на маркетплейсі. */
export function orderMarketplace(order: Pick<Order, 'channel_code' | 'prom_order_id' | 'rozetka_order_id' | 'order_number'>): { name: string; num: string } | null {
  if (order.channel_code === 'rozetka') return { name: 'Rozetka', num: String(order.rozetka_order_id ?? order.order_number) };
  if (order.channel_code === 'prom')    return { name: 'Prom.ua', num: String(order.prom_order_id ?? order.order_number) };
  return null;
}

function formatIban(raw: string) {
  const s = raw.replace(/\s/g, '');
  return s.match(/.{1,4}/g)?.join(' ') ?? s;
}

// Ім'я покупця походить з форми замовлення — екрануємо перед вставкою в HTML листа.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  /** Якщо передано — лист отримує сопровідний блок (подяка) зверху та промо-блок (акції/каталог/контакти) знизу. */
  siteUrl?: string;
}): string {
  const { order, bankRecipient, bankIban, bankName, bankEdrpou,
          bankAddress = '', signatoryName = '', invoiceUrl, siteUrl } = params;

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
    const name = esc([item.brand, item.name].filter(Boolean).join(' '));
    const sum  = (item.qty * Number(item.price)).toFixed(2);
    const bg   = i % 2 === 1 ? '#F8FAFC' : '#ffffff';
    return `
      <tr style="background:${bg};">
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:center;font-size:11px;">${i + 1}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;font-family:monospace;font-size:10px;color:#444;">${esc(item.sku)}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;font-size:11px;">${name}</td>
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:right;font-size:11px;">${item.qty}</td>
        <td style="border:1px solid #ccc;padding:5px 6px;text-align:center;font-size:11px;color:#555;">шт</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-size:11px;">${Number(item.price).toFixed(2)}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;font-size:11px;font-weight:700;">${sum}</td>
      </tr>`;
  }).join('');

  // Сопровідний блок над рахунком: подяка + що робити далі.
  const coverBlock = siteUrl ? `
  <div style="max-width:736px;margin:24px auto 16px;background:#fff;border-radius:12px;overflow:hidden;
              box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="background:#1E3A5F;padding:22px 28px;">
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">
        <a href="${siteUrl}" style="text-decoration:none;"><span style="color:#93C5FD;">FIX</span><span style="color:#5EEAD4;">LINE</span></a>
      </div>
      <div style="color:#94A3B8;font-size:11px;margin-top:3px;letter-spacing:0.06em;text-transform:uppercase;">
        Цифрова платформа будівельних рішень
      </div>
    </div>
    <div style="padding:22px 28px;">
      <div style="font-size:17px;font-weight:800;color:#0F172A;margin-bottom:8px;">
        Вітаємо, ${esc(buyerName)}! 👋
      </div>
      <div style="font-size:13.5px;color:#475569;line-height:1.7;">
        ${(() => {
          const mp = orderMarketplace(order);
          return mp
            ? `Дякуємо за ваше замовлення на <strong>${mp.name}</strong> <strong>№${esc(mp.num)}</strong> від ${date}.`
            : `Дякуємо за ваше замовлення <strong>№${order.order_number}</strong> від ${date}.`;
        })()}
        Рахунок на оплату — нижче в цьому листі та у PDF-вкладенні.
      </div>
      <div style="margin-top:14px;background:#F0FDFA;border:1px solid #99F6E4;border-radius:8px;padding:12px 16px;
                  font-size:12.5px;color:#0F766E;line-height:1.65;">
        💡 Після оплати повідомте нас, будь ласка, — замовлення, оплачені до <strong>14:00</strong>,
        відправляємо Новою Поштою того ж дня.
      </div>
    </div>
  </div>` : '';

  // Промо-блок під рахунком: акції, каталог, контакти.
  const promoBlock = siteUrl ? `
  <div style="max-width:736px;margin:16px auto 0;background:#fff;border-radius:12px;overflow:hidden;
              box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <div style="padding:22px 28px;text-align:center;">
      <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:6px;">
        Поки замовлення в дорозі — загляньте до нас 🛒
      </div>
      <div style="font-size:12.5px;color:#64748B;line-height:1.6;margin-bottom:16px;">
        Щотижня оновлюємо акційні пропозиції на герметики, піни, клеї та ґрунтовки.
      </div>
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="padding:0 5px;">
            <a href="${siteUrl}/shop/sale" style="display:inline-block;background:#1E3A5F;color:#fff;
               font-size:12.5px;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
              🔥 Акції та знижки
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="${siteUrl}/shop" style="display:inline-block;background:#F1F5F9;color:#1E3A5F;
               font-size:12.5px;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
              Каталог товарів
            </a>
          </td>
          <td style="padding:0 5px;">
            <a href="${siteUrl}/blog" style="display:inline-block;background:#F1F5F9;color:#1E3A5F;
               font-size:12.5px;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;">
              Поради в блозі
            </a>
          </td>
        </tr>
      </table>
    </div>
    <div style="background:#F8FAFC;border-top:1px solid #EEF2F6;padding:16px 28px;text-align:center;">
      <div style="font-size:12px;color:#64748B;margin-bottom:4px;">
        Питання щодо замовлення чи оплати:
        <a href="tel:+380991997788" style="color:#1E3A5F;font-weight:700;text-decoration:none;">+38 (099) 199-77-88</a>
        &nbsp;·&nbsp;
        <a href="mailto:info@fixline.com.ua" style="color:#1E3A5F;font-weight:600;">info@fixline.com.ua</a>
      </div>
      <div style="font-size:11px;color:#94A3B8;margin-top:6px;font-weight:700;">Все тримається на FIXLINE</div>
      <div style="font-size:11px;color:#CBD5E1;margin-top:2px;"><a href="${siteUrl}" style="color:#CBD5E1;text-decoration:none;">fixline.com.ua</a></div>
    </div>
  </div>` : '';

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
${coverBlock}
<div style="max-width:680px;margin:${siteUrl ? '0' : '24px'} auto;background:#fff;border-radius:4px;
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
        ${esc(buyerName)}
        ${order.company && order.contact !== order.company ? `<br/>${esc(order.contact)}` : ''}
        ${order.phone ? `<br/><span style="color:#555;font-size:11px;">Тел.: ${esc(order.phone)}</span>` : ''}
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
      <td style="padding:3px 0;">${esc(deliveryAddr)}</td>
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

${promoBlock}

<!-- Email footer -->
<div style="max-width:736px;margin:0 auto;padding:10px 0;text-align:center;
            font-size:10px;color:#9CA3AF;">
  Цей документ сформовано автоматично та є дійсним без печатки та підпису
  відповідно до Закону України «Про електронні документи та електронний документообіг».
</div>
</body>
</html>`;
}
