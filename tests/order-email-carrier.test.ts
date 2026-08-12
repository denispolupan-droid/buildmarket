import { describe, it, expect } from 'vitest';
import { buildCustomerOrderEmail, buildCustomerStatusEmail } from '../lib/invoice-email';

// Живий баг: перше замовлення в точку видачі ROZETKA отримало лист «Накладений
// платіж (Нова Пошта)» — назва перевізника була вписана в шаблон рядком. Тести
// стережуть саме це: у листі не має бути перевізника, якого покупець не обирав.

const order = (deliveryType: string | null, paymentType = 'cod') => buildCustomerOrderEmail({
  orderNumber: 26081234,
  orderId: 'abc',
  company: '',
  contact: 'Полупан Денис',
  totalPrice: 1250,
  paymentType,
  deliveryType,
  userId: null,
  invoiceUrl: 'https://fixline.com.ua/invoice/abc',
  siteUrl: 'https://fixline.com.ua',
});

describe('лист про замовлення', () => {
  it('накладений платіж у точці видачі ROZETKA не згадує Нову Пошту', () => {
    const html = order('rz_delivery');
    expect(html).toContain('Накладений платіж (ROZETKA Доставка)');
    expect(html).toContain('у точці видачі ROZETKA');
    expect(html).not.toContain('Нова Пошта');
    expect(html).not.toContain('Нової Пошти');
  });

  it('для Нової Пошти текст лишається тим самим, що й був', () => {
    const html = order('nova');
    expect(html).toContain('Накладений платіж (Нова Пошта)');
    expect(html).toContain('у відділенні Нової Пошти');
  });

  it('тарифи доставки називають того перевізника, який везе', () => {
    expect(order('rz_delivery', 'card')).toContain('за тарифами перевізника (ROZETKA Доставка)');
    expect(order('nova', 'card')).toContain('за тарифами перевізника (Нова Пошта)');
  });
});

describe('лист про зміну статусу', () => {
  const shipped = (deliveryType: string | null) => buildCustomerStatusEmail({
    orderNumber: 26081234, contact: 'Полупан Денис', company: '',
    status: 'shipped', trackingNumber: '101000000001', deliveryType,
    siteUrl: 'https://fixline.com.ua',
  }) ?? '';

  it('відправлення веде на трекінг свого перевізника', () => {
    const rz = shipped('rz_delivery');
    expect(rz).toContain('ROZETKA Доставка');
    expect(rz).toContain('rozetka.delivery/tracking');
    expect(rz).not.toContain('novaposhta.ua');

    const np = shipped('nova');
    expect(np).toContain('Нова Пошта');
    expect(np).toContain('novaposhta.ua');
  });

  it('самовивіз не отримує посилання на чужий трекінг', () => {
    const html = shipped('pickup');
    expect(html).toContain('101000000001');
    expect(html).not.toContain('відстежуйте на');
  });
});
