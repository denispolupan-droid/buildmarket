import { describe, it, expect } from 'vitest';
import { buildMessage, smsSegments } from '../lib/notify/templates';

describe('buildMessage', () => {
  it('відправлення — з номером накладної й перевізником', () => {
    expect(buildMessage('shipped', { orderNumber: 26081039, trackingNumber: '20451504982066', carrier: 'nova' }))
      .toBe('FIXLINE: замовлення №26081039 відправлено. Нова Пошта, ТТН 20451504982066');
  });

  it('точка видачі Rozetka називається своїм імʼям', () => {
    expect(buildMessage('shipped', { orderNumber: 1, trackingNumber: 'RMP-614673528', carrier: 'rozetka' }))
      .toContain('Rozetka Доставка');
  });

  it('без ТТН повідомлення про відправлення не має сенсу — не шлемо', () => {
    expect(buildMessage('shipped', { orderNumber: 1, trackingNumber: null })).toBeNull();
  });

  it('нагадування рахує дні, а без них не бреше цифрою', () => {
    expect(buildMessage('pickup_reminder', { orderNumber: 7, daysLeft: 3 })).toContain('ще 3 дн');
    expect(buildMessage('pickup_reminder', { orderNumber: 7, daysLeft: 0 })).toContain('поїде назад');
  });
});

describe('smsSegments', () => {
  // Кирилиця тарифікується по 70 символів на сегмент — від цього залежить ціна
  // кожного замовлення, тож рахунок має бути чесним.
  it('короткий текст — один сегмент', () => {
    expect(smsSegments('FIXLINE: посилка чекає')).toBe(1);
  });

  it('на межі 70 символів сегмент іще один', () => {
    expect(smsSegments('я'.repeat(70))).toBe(1);
    expect(smsSegments('я'.repeat(71))).toBe(2);
  });

  it('повідомлення з ТТН свідомо вилазить у два сегменти', () => {
    const text = buildMessage('shipped', { orderNumber: 26081039, trackingNumber: '20451504982066', carrier: 'nova' })!;
    expect(smsSegments(text)).toBe(2);
  });
});
