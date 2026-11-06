import { describe, it, expect } from 'vitest';
import { buildRegisterViews, openRegister, type OrderByTtn } from '../lib/np-registers';

const sheets = [
  { Ref: 'r-old', Number: '105-1', DateTime: '2026-11-02 16:58:43', Count: '2', Printed: '1' },
  { Ref: 'r-new', Number: '105-2', DateTime: '2026-11-03 12:57:14', Count: '2', Printed: '0' },
  { Ref: 'r-empty', Number: '105-3', DateTime: '2026-10-20 10:00:00', Count: '5' },
];

const docs = [
  // посилку створено ДЕНЬ ДО реєстру — раніше не знаходилась
  { IntDocNumber: '204501', ScanSheetNumber: '105-1', RecipientContactPerson: 'НП Ім’я', BackwardDeliverySum: '0' },
  { IntDocNumber: '204502', ScanSheetNumber: '105-1', BackwardDeliverySum: '350' },
  { IntDocNumber: '204503', ScanSheetNumber: '105-2', RecipientDescription: 'Покупець' },
  { IntDocNumber: '204504', ScanSheetNumber: '105-2' },
  { IntDocNumber: '204505', ScanSheetNumber: '' },          // не в реєстрі
  { IntDocNumber: '204503', ScanSheetNumber: '105-2' },     // дубль сторінки НП
];

const orders = new Map<string, OrderByTtn>([
  ['204501', { id: 'o1', order_number: 26111001, contact: 'Іван', total_price: 395.5, carrier_accepted_at: '2026-11-02T18:00:00Z' }],
  ['204502', { id: 'o2', order_number: 26111002, contact: 'Петро', total_price: '260', carrier_accepted_at: '2026-11-02T18:00:00Z' }],
  ['204503', { id: 'o3', order_number: 26111003, contact: null, total_price: 100, carrier_accepted_at: null }],
]);

describe('buildRegisterViews — реєстри НП списком (06.11.2026)', () => {
  const views = buildRegisterViews(sheets, docs, orders);

  it('найновіші зверху', () => {
    expect(views.map(v => v.number)).toEqual(['105-2', '105-1', '105-3']);
  });

  it('посилки розкладено за номером реєстру, без дублів', () => {
    expect(views[0].ttns.map(t => t.ttn)).toEqual(['204503', '204504']);
    expect(views[1].ttns.map(t => t.ttn)).toEqual(['204501', '204502']);
    expect(views[2].ttns).toEqual([]);
  });

  it('сума й номер — з нашого замовлення; без замовлення — з НП', () => {
    const t1 = views[1].ttns[0];
    expect(t1).toMatchObject({ amount: 395.5, orderNumber: 26111001, contact: 'Іван', accepted: true });
    expect(views[1].total).toBe(655.5);
    // замовлення без контакту → ім'я з НП; документ без замовлення → 0, без номера
    expect(views[0].ttns[0].contact).toBe('Покупець');
    expect(views[0].ttns[1]).toMatchObject({ orderNumber: null, amount: 0, accepted: false });
  });

  it('«передано» — лише коли всі посилки прийняті; порожній реєстр не вважається переданим', () => {
    expect(views[1].handedOver).toBe(true);
    expect(views[0].handedOver).toBe(false);
    expect(views[2].handedOver).toBe(false);
  });

  it('ТТН без нашого замовлення не тримає реєстр відкритим', () => {
    const v = buildRegisterViews([sheets[0]], [...docs, { IntDocNumber: '204599', ScanSheetNumber: '105-1' }], orders);
    expect(v[0].ttns).toHaveLength(3);
    expect(v[0].handedOver).toBe(true);
    // лише ТТН без замовлень — стану не знаємо, не «передано»
    expect(buildRegisterViews([sheets[0]], [{ IntDocNumber: '204599', ScanSheetNumber: '105-1' }], orders)[0].handedOver).toBe(false);
  });

  it('npCount і printed з НП', () => {
    expect(views[1]).toMatchObject({ npCount: 2, printed: true });
    expect(views[0].printed).toBe(false);
  });

  it('відкритий реєстр — найновіший не переданий', () => {
    expect(openRegister(views)?.number).toBe('105-2');
    expect(openRegister([views[1]])).toBeNull();
  });
});
