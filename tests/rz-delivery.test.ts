import { describe, it, expect } from 'vitest';
import {
  rzPhone, rzSplitName, rzPhase, rzCarrierAccepted,
  rzFitsWeight, rzWeightLimitKg, rzDepartmentLabel, rzDepartmentAddress,
  type RzDepartment,
} from '../lib/rz-delivery';
import { parseWeightKg, cartWeightKg, unweighedCount } from '../lib/parcel-weight';

const dep = (over: Partial<RzDepartment> = {}): RzDepartment => ({
  id: 'x', name: 'м. Харків, Б.Хмельницького вул., 32 А', public_name: 'Б.Хмельницького, 32 А',
  limitations: { weight: 30, volumeWeight: 40, length: null, cost: null },
  ...over,
});

describe('rzPhone', () => {
  it('зводить будь-який український запис до 380XXXXXXXXX', () => {
    expect(rzPhone('+38 (099) 199-77-88')).toBe('380991997788');
    expect(rzPhone('0991997788')).toBe('380991997788');
    expect(rzPhone('380991997788')).toBe('380991997788');
    expect(rzPhone('80991997788')).toBe('380991997788');
    expect(rzPhone('991997788')).toBe('380991997788');
  });

  it('порожнє на сміття — щоб викликач показав зрозумілу помилку, а не отримав 400 від API', () => {
    expect(rzPhone('12345')).toBe('');
    expect(rzPhone(null)).toBe('');
    expect(rzPhone('+1 202 555 0143')).toBe('');
  });
});

describe('rzSplitName', () => {
  it('наш contact — «Прізвище Ім\'я По батькові»', () => {
    expect(rzSplitName('Полупан Денис Олександрович'))
      .toEqual({ last_name: 'Полупан', first_name: 'Денис', middle_name: 'Олександрович' });
  });

  it('двох слів достатньо, по батькові не вигадуємо', () => {
    expect(rzSplitName('Шевченко Тарас')).toEqual({ last_name: 'Шевченко', first_name: 'Тарас' });
  });

  it('одне слово дублюємо: обидва поля обов\'язкові в API', () => {
    expect(rzSplitName('Тарас')).toEqual({ last_name: 'Тарас', first_name: 'Тарас' });
  });

  it('порожнє лишається порожнім — це помилка даних, а не привід вигадувати ПІБ', () => {
    expect(rzSplitName('   ')).toEqual({ last_name: '', first_name: '' });
  });
});

describe('rzPhase', () => {
  it('розкладає ключові коди по фазах', () => {
    expect(rzPhase('planned')).toBe('created');
    expect(rzPhase('acceptedByCarrier')).toBe('accepted');
    expect(rzPhase('readyToIssueOctopus')).toBe('at_point');
    expect(rzPhase('gaveOut')).toBe('delivered');
    expect(rzPhase('storageDateExpired')).toBe('returning');
    expect(rzPhase('senderCanceled')).toBe('cancelled');
  });

  it('живий трекінг шле ЧИСЛОВІ id (спека бреше про строковий enum) — '
   + 'на них фаза теж має працювати (живий випадок: ЕН 101720876706, код 10030)', () => {
    expect(rzPhase(10010)).toBe('created');     // Заплановано
    expect(rzPhase(10030)).toBe('accepted');    // Прийнято на доставку
    expect(rzPhase('10030')).toBe('accepted');  // і рядком теж
    expect(rzPhase(40040)).toBe('at_point');    // Готово до видачі
    expect(rzPhase(60030)).toBe('delivered');   // Видано
    expect(rzPhase(40070)).toBe('returning');   // Вийшов термін зберігання
    expect(rzPhase(60010)).toBe('cancelled');   // Скасовано
    expect(rzCarrierAccepted(10030)).toBe(true);
    expect(rzCarrierAccepted(10020)).toBe(false);
  });

  it('невідомий код — «unknown», а не «в дорозі»: інакше новий статус Rozetka '
   + 'мовчки провів би продаж або оголосив повернення', () => {
    expect(rzPhase('somethingNew')).toBe('unknown');
    expect(rzPhase(10080)).toBe('unknown');     // «Посилку втрачено» — нічого не проводимо
    expect(rzPhase(null)).toBe('unknown');
  });

  it('carrier_accepted ставиться з моменту приймання і вже не знімається', () => {
    expect(rzCarrierAccepted('planned')).toBe(false);
    expect(rzCarrierAccepted('acceptedFromMerchant')).toBe(true);
    expect(rzCarrierAccepted('gaveOut')).toBe(true);
    expect(rzCarrierAccepted('returned')).toBe(true);
    expect(rzCarrierAccepted('somethingNew')).toBe(false);
  });
});

describe('ліміти точок', () => {
  it('вага в лімітах — кілограми, попри «грами» в доці', () => {
    expect(rzWeightLimitKg(dep())).toBe(30);
    expect(rzFitsWeight(dep(), 29.9)).toBe(true);
    expect(rzFitsWeight(dep(), 30)).toBe(true);
    expect(rzFitsWeight(dep(), 30.1)).toBe(false);
  });

  it('без ліміту точка приймає будь-що', () => {
    const noLimit = dep({ limitations: { weight: null, volumeWeight: null, length: null, cost: null } });
    expect(rzWeightLimitKg(noLimit)).toBeNull();
    expect(rzFitsWeight(noLimit, 500)).toBe(true);
    expect(rzFitsWeight(undefined, 500)).toBe(true);
  });
});

describe('назва точки', () => {
  it('бере public_name і не дублює місто', () => {
    expect(rzDepartmentLabel(dep())).toBe('Б.Хмельницького, 32 А');
    expect(rzDepartmentAddress(dep(), 'м. Харків')).toBe('м. Харків, Б.Хмельницького, 32 А');
  });

  it('зрізає місто з name, коли public_name порожній', () => {
    expect(rzDepartmentLabel(dep({ public_name: null }))).toBe('Б.Хмельницького вул., 32 А');
  });
});

describe('вага замовлення', () => {
  it('розбирає фасування в кілограми', () => {
    expect(parseWeightKg('5 кг')).toBe(5);
    expect(parseWeightKg('750 г')).toBe(0.75);
    expect(parseWeightKg('10 л')).toBe(10);
    expect(parseWeightKg('0,5 кг')).toBe(0.5);
  });

  it('нерозпізнане фасування — нуль, замовлення важливіше за точність', () => {
    expect(parseWeightKg('відро')).toBe(0);
    expect(parseWeightKg(null)).toBe(0);
  });

  it('множить на кількість і рахує невідомі позиції', () => {
    const items = [{ volume: '5 кг', qty: 3 }, { volume: '750 г', qty: 2 }, { volume: 'шт', qty: 1 }];
    expect(cartWeightKg(items)).toBe(16.5);
    expect(unweighedCount(items)).toBe(1);
  });
});
