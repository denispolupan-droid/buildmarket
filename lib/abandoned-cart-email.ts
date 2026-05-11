export type AbandonedCartItem = {
  name: string;
  brand: string;
  qty: number;
  price: number;
  volume?: string | null;
};

export type AbandonedCartEmailData = {
  items: AbandonedCartItem[];
  totalPrice: number;
  restoreUrl: string;
  reminderStep: 1 | 2 | 3;
};

const SUBJECTS: Record<1 | 2 | 3, string> = {
  1: 'Ви забули завершити замовлення на FIXLINE',
  2: 'Ваш кошик все ще чекає вас — FIXLINE',
  3: 'Останній шанс: товари у вашому кошику — FIXLINE',
};

const HEADINGS: Record<1 | 2 | 3, string> = {
  1: 'Ви забули щось у кошику?',
  2: 'Ваш кошик все ще чекає',
  3: 'Не упустіть ваші товари',
};

const SUBTEXT: Record<1 | 2 | 3, string> = {
  1: 'Ви додали товари до кошика, але не завершили оформлення. Повертайтесь — оформити замовлення займе менше хвилини.',
  2: 'Минула доба, а ваш кошик досі чекає. Ціни та наявність можуть змінитись — оформіть замовлення зараз.',
  3: 'Ваш кошик зберігається ще кілька годин. Оформіть замовлення, поки товари ще є в наявності.',
};

export function getAbandonedCartSubject(step: 1 | 2 | 3): string {
  return SUBJECTS[step];
}

export function buildAbandonedCartEmail(d: AbandonedCartEmailData): string {
  const itemRows = d.items.map(item => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;">
        <div style="font-weight:600;">${item.brand} ${item.name}</div>
        ${item.volume ? `<div style="font-size:12px;color:#94A3B8;margin-top:2px;">${item.volume}</div>` : ''}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#374151;text-align:center;white-space:nowrap;">${item.qty}&nbsp;шт.</td>
      <td style="padding:12px 0;border-bottom:1px solid #F1F5F9;font-size:13px;color:#0F172A;text-align:right;font-weight:600;white-space:nowrap;">${(item.price * item.qty).toFixed(0)}&nbsp;₴</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">

  <tr><td style="background:#1E3A5F;padding:24px 32px;">
    <div style="font-size:22px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">FIXLINE</div>
    <div style="font-size:12px;color:#93C5FD;margin-top:2px;">будівельна хімія</div>
  </td></tr>

  <tr><td style="padding:32px 32px 0;">
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0F172A;line-height:1.3;">${HEADINGS[d.reminderStep]}</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#64748B;line-height:1.6;">${SUBTEXT[d.reminderStep]}</p>
  </td></tr>

  <tr><td style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <thead>
        <tr>
          <th style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;text-align:left;padding-bottom:8px;border-bottom:2px solid #E2E8F0;">Товар</th>
          <th style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;text-align:center;padding-bottom:8px;border-bottom:2px solid #E2E8F0;">Кількість</th>
          <th style="font-size:11px;font-weight:600;color:#94A3B8;text-transform:uppercase;letter-spacing:0.05em;text-align:right;padding-bottom:8px;border-bottom:2px solid #E2E8F0;">Сума</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div style="text-align:right;padding-top:16px;font-size:16px;font-weight:700;color:#0F172A;border-top:2px solid #E2E8F0;margin-top:4px;">
      Разом: ${d.totalPrice.toFixed(0)}&nbsp;₴
    </div>
  </td></tr>

  <tr><td style="padding:28px 32px 32px;text-align:center;">
    <a href="${d.restoreUrl}"
       style="display:inline-block;background:#1E3A5F;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:14px 40px;border-radius:10px;letter-spacing:0.01em;">
      Завершити замовлення →
    </a>
    <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;">
      Або перейдіть за посиланням: <a href="${d.restoreUrl}" style="color:#1E3A5F;">${d.restoreUrl}</a>
    </p>
  </td></tr>

  <tr><td style="padding:20px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;">
    <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;line-height:1.6;">
      FIXLINE — будівельна хімія оптом та в роздріб<br>
      <a href="https://fixline.com.ua" style="color:#1E3A5F;text-decoration:none;">fixline.com.ua</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
