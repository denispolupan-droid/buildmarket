import { describe, it, expect } from 'vitest';
import { rzErrorText, rzCodAmount } from '../lib/rz-delivery';

// Обидва випадки — з живого розбору: накладна на замовлення #26081062 (97.20 грн)
// не створювалась, а менеджер бачив у вікні «Помилка валідації даних — data:»,
// тобто причину не було видно взагалі.

describe('rzCodAmount', () => {
  it('зводить суму післяплати до цілого — API дробову не приймає', () => {
    expect(rzCodAmount(97.2)).toBe(97);
    expect(rzCodAmount(97.5)).toBe(98);
    expect(rzCodAmount(1250)).toBe(1250);
  });

  it('передоплачене замовлення лишається нулем, від\'ємного не буває', () => {
    expect(rzCodAmount(0)).toBe(0);
    expect(rzCodAmount(-5)).toBe(0);
  });
});

describe('rzErrorText', () => {
  it('дістає причину з ВКЛАДЕНИХ details — саме там вона й лежить', () => {
    const body = {
      message: 'Помилка валідації даних',
      details: [{
        property: 'data',
        children: [{
          property: 'cost',
          children: [],
          constraints: { isInt: 'Сума зворотної доставки має бути цілим числом' },
        }],
      }],
    };
    const text = rzErrorText(body, 400);
    expect(text).toContain('Помилка валідації даних');
    expect(text).toContain('data.cost');
    expect(text).toContain('має бути цілим числом');
  });

  it('збирає кілька причин одразу, включно з різних гілок', () => {
    const body = {
      message: 'Помилка валідації даних',
      details: [{
        property: 'data',
        children: [
          { property: 'insurance_cost', constraints: { isPositive: 'insurance_cost має бути додатним значенням' } },
          { property: 'sender', children: [{ property: 'phone', constraints: { matches: 'Телефон повинен мати формат 380xxxxxxxxx' } }] },
        ],
      }],
    };
    const text = rzErrorText(body, 400);
    expect(text).toContain('data.insurance_cost');
    expect(text).toContain('data.sender.phone');
  });

  it('простий текст помилки лишається як є', () => {
    expect(rzErrorText({ message: 'Експрес-накладні не знайдені: 101000000000' }, 404))
      .toBe('Експрес-накладні не знайдені: 101000000000');
  });

  it('порожня відповідь не залишає менеджера без жодної підказки', () => {
    expect(rzErrorText(null, 502)).toBe('ROZETKA Доставка: HTTP 502');
    expect(rzErrorText({ details: [{ property: 'data', children: [] }] }, 400))
      .toBe('ROZETKA Доставка: HTTP 400');
  });
});
