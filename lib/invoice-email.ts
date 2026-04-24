export type Item = { sku: string; name: string; brand: string; qty: number; price: number };

export type OrderEmailData = {
  orderNumber: number;
  company: string;
  contact: string;
  phone: string;
  email: string;
  items: Item[];
  totalPrice: number;
  deliveryType: string;
  deliveryAddress: string;
  paymentType: string;
  comment?: string | null;
};

const DELIVERY_LABELS: Record<string, string> = {
  nova: 'Нова Пошта',
  kharkiv: 'Доставка по Харкову та області',
  pickup: 'Самовивіз зі складу',
};

const PAYMENT_LABELS: Record<string, string> = {
  invoice: 'Безготівковий розрахунок (рахунок-фактура)',
  cod: 'Оплата при отриманні',
};

export function buildAdminNotificationHtml(d: OrderEmailData): string {
  const date = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const rows = d.items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;">
        <div style="font-weight:600;">${item.name}</div>
        <div style="font-size:11px;color:#94A3B8;">${item.brand} · ${item.sku}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;text-align:center;">${item.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#1E3A5F;text-align:right;">${(item.price * item.qty).toFixed(2)} грн</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0;">
    <div style="background:#1E3A5F;padding:20px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#fff;font-size:18px;font-weight:800;">🛒 Нове замовлення</div>
      <div style="color:#94A3B8;font-size:12px;">№${d.orderNumber} · ${date}</div>
    </div>
    <div style="padding:20px 28px;border-bottom:1px solid #F1F5F9;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${[
          ['Клієнт', d.company ? `${d.company} / ${d.contact}` : d.contact],
          ['Телефон', `<a href="tel:${d.phone}" style="color:#1E3A5F;font-weight:700;">${d.phone}</a>`],
          ['Email', `<a href="mailto:${d.email}" style="color:#1E3A5F;">${d.email}</a>`],
          ['Доставка', DELIVERY_LABELS[d.deliveryType] ?? d.deliveryType],
          ['Адреса', d.deliveryAddress || '—'],
          ['Оплата', PAYMENT_LABELS[d.paymentType] ?? d.paymentType],
        ].map(([k, v]) => `
          <div>
            <div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-bottom:3px;">${k}</div>
            <div style="font-size:13px;color:#0F172A;">${v}</div>
          </div>
        `).join('')}
        ${d.comment ? `<div style="grid-column:1/-1"><div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-bottom:3px;">Коментар</div><div style="font-size:13px;color:#0F172A;">${d.comment}</div></div>` : ''}
      </div>
    </div>
    <div style="padding:20px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#F8FAFC;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94A3B8;text-transform:uppercase;border-bottom:2px solid #E2E8F0;">Товар</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#94A3B8;text-transform:uppercase;border-bottom:2px solid #E2E8F0;">Кіл-ть</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#94A3B8;text-transform:uppercase;border-bottom:2px solid #E2E8F0;">Сума</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:right;margin-top:12px;font-size:16px;font-weight:800;color:#1E3A5F;">
        Разом: ${d.totalPrice.toFixed(2)} грн
      </div>
    </div>
  </div>
</body></html>`;
}

export function buildCustomerConfirmationHtml(d: OrderEmailData): string {
  const date = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const rows = d.items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;">
        <div style="font-weight:600;">${item.name}</div>
        <div style="font-size:11px;color:#94A3B8;">${item.brand} · ${item.sku}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;text-align:center;">${item.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#1E3A5F;text-align:right;">${(item.price * item.qty).toFixed(2)} грн</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #E2E8F0;">
    <div style="background:#1E3A5F;padding:24px 32px;">
      <div style="color:#fff;font-size:20px;font-weight:800;margin-bottom:4px;">FIXLINE</div>
      <div style="color:#94A3B8;font-size:12px;">fixline.com.ua</div>
    </div>
    <div style="padding:28px 32px;border-bottom:1px solid #F1F5F9;">
      <div style="font-size:22px;font-weight:800;color:#0F172A;margin-bottom:8px;">✅ Замовлення прийнято!</div>
      <div style="font-size:14px;color:#64748B;line-height:1.6;">
        Дякуємо, <strong>${d.contact}</strong>! Ваше замовлення <strong>№${d.orderNumber}</strong> від ${date} успішно оформлено.<br>
        Менеджер зв'яжеться з вами найближчим часом для підтвердження та уточнення деталей доставки.
      </div>
    </div>
    <div style="padding:20px 32px;border-bottom:1px solid #F1F5F9;background:#F8FAFC;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div><div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-bottom:3px;">Доставка</div><div style="font-size:13px;color:#0F172A;">${DELIVERY_LABELS[d.deliveryType] ?? d.deliveryType}</div></div>
        <div><div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-bottom:3px;">Оплата</div><div style="font-size:13px;color:#0F172A;">${PAYMENT_LABELS[d.paymentType] ?? d.paymentType}</div></div>
        ${d.deliveryAddress ? `<div style="grid-column:1/-1"><div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-bottom:3px;">Адреса</div><div style="font-size:13px;color:#0F172A;">${d.deliveryAddress}</div></div>` : ''}
      </div>
    </div>
    <div style="padding:20px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#F8FAFC;">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#94A3B8;text-transform:uppercase;border-bottom:2px solid #E2E8F0;">Товар</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#94A3B8;text-transform:uppercase;border-bottom:2px solid #E2E8F0;">Кіл-ть</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#94A3B8;text-transform:uppercase;border-bottom:2px solid #E2E8F0;">Сума</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:right;margin-top:12px;font-size:16px;font-weight:800;color:#1E3A5F;">
        Разом: ${d.totalPrice.toFixed(2)} грн
      </div>
    </div>
    <div style="background:#F8FAFC;padding:16px 32px;text-align:center;border-top:1px solid #F1F5F9;">
      <div style="font-size:12px;color:#94A3B8;">Питання? <a href="mailto:info@fixline.com.ua" style="color:#1E3A5F;">info@fixline.com.ua</a></div>
    </div>
  </div>
</body></html>`;
}

type InvoiceData = {
  orderId: string;
  orderNumber: number;
  company: string;
  contact: string;
  phone: string;
  email: string;
  items: Item[];
  totalPrice: number;
  deliveryAddress: string;
};

export function buildInvoiceHtml(d: InvoiceData): string {
  const short = d.orderNumber;
  const date = new Date().toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const rows = d.items.map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;">
        <div style="font-weight:600;">${item.name}</div>
        <div style="font-size:11px;color:#94A3B8;margin-top:2px;">${item.brand} · ${item.sku}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;text-align:center;">${item.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;text-align:right;">${item.price.toFixed(2)} грн</td>
      <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;font-size:13px;font-weight:700;color:#1E3A5F;text-align:right;">${(item.price * item.qty).toFixed(2)} грн</td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:640px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E2E8F0;">

    <!-- Header -->
    <div style="background:#1E3A5F;padding:28px 32px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="color:#fff;font-size:20px;font-weight:800;letter-spacing:-0.5px;">FIXLINE</div>
        <div style="color:#94A3B8;font-size:12px;margin-top:2px;">B2B платформа будівельної хімії</div>
      </div>
      <div style="text-align:right;">
        <div style="color:#fff;font-size:13px;font-weight:600;">Рахунок-фактура</div>
        <div style="color:#94A3B8;font-size:12px;">№ ${short} від ${date}</div>
      </div>
    </div>

    <!-- Client info -->
    <div style="padding:24px 32px;border-bottom:1px solid #F1F5F9;display:flex;gap:32px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Платник</div>
        <div style="font-size:14px;font-weight:700;color:#0F172A;">${d.company || d.contact}</div>
        <div style="font-size:13px;color:#64748B;margin-top:2px;">${d.contact}</div>
        <div style="font-size:13px;color:#64748B;">${d.phone}</div>
        <div style="font-size:13px;color:#64748B;">${d.email}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Доставка</div>
        <div style="font-size:13px;color:#64748B;">${d.deliveryAddress || 'Уточнюється менеджером'}</div>
      </div>
    </div>

    <!-- Items table -->
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#F8FAFC;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0;">Товар</th>
            <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0;">Кіл-ть</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0;">Ціна</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0;">Сума</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <!-- Total -->
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <div style="background:#F8FAFC;border-radius:10px;padding:16px 20px;min-width:220px;">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:#64748B;margin-bottom:8px;">
            <span>Без ПДВ</span><span>${d.totalPrice.toFixed(2)} грн</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:#0F172A;border-top:1px solid #E2E8F0;padding-top:8px;">
            <span>До сплати</span><span style="color:#1E3A5F;">${d.totalPrice.toFixed(2)} грн</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bank details -->
    <div style="margin:0 32px 24px;background:#EFF4FF;border-radius:12px;padding:20px;">
      <div style="font-size:12px;font-weight:700;color:#1E3A5F;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Реквізити для оплати</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${[
          ['Отримувач', 'ФОП Buildmarket'],
          ['IBAN', 'UA00 0000 0000 0000 0000 0000 000'],
          ['Банк', 'АТ «ПриватБанк»'],
          ['ЄДРПОУ', '00000000'],
        ].map(([k, v]) => `
          <div style="font-size:11px;color:#64748B;">${k}</div>
          <div style="font-size:12px;font-weight:600;color:#0F172A;">${v}</div>
        `).join('')}
      </div>
      <div style="margin-top:12px;font-size:12px;color:#64748B;">
        Призначення платежу: <strong style="color:#0F172A;">Оплата за замовлення №${short}</strong>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#F8FAFC;padding:16px 32px;text-align:center;border-top:1px solid #F1F5F9;">
      <div style="font-size:12px;color:#94A3B8;">З питань оплати: <a href="mailto:info@fixline.com.ua" style="color:#1E3A5F;">info@fixline.com.ua</a></div>
      <div style="font-size:11px;color:#CBD5E1;margin-top:4px;">Buildmarket · fixline.com.ua</div>
    </div>
  </div>
</body>
</html>`;
}
