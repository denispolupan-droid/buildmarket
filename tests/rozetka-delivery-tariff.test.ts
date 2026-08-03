import { describe, it, expect } from 'vitest';
import {
  computeRozetkaDeliveryFee,
  parseRozetkaDeliveryTariff,
  DEFAULT_ROZETKA_DELIVERY_TARIFF,
} from '../lib/rozetka-delivery-tariff';

describe('computeRozetkaDeliveryFee', () => {
  it('організація видачі відправлення — 30 грн', () => {
    expect(computeRozetkaDeliveryFee()).toBe(30);
    expect(computeRozetkaDeliveryFee({})).toBe(30);
  });

  it('відправлення з відділення Meest ПОШТА — 49 грн', () => {
    expect(computeRozetkaDeliveryFee({ fromMeest: true })).toBe(49);
  });

  it('не залежить від суми замовлення — на відміну від Smart', () => {
    // збір фіксований, тож окремого аргументу суми в сигнатурі й немає
    expect(computeRozetkaDeliveryFee({ fromMeest: false })).toBe(30);
  });

  it('бере суми з переданого тарифу, а не з констант', () => {
    expect(computeRozetkaDeliveryFee({}, { perParcel: 35, perParcelFromMeest: 55 })).toBe(35);
    expect(computeRozetkaDeliveryFee({ fromMeest: true }, { perParcel: 35, perParcelFromMeest: 55 })).toBe(55);
  });
});

describe('parseRozetkaDeliveryTariff', () => {
  it('читає збережений тариф', () => {
    expect(parseRozetkaDeliveryTariff('{"perParcel":35,"perParcelFromMeest":55}'))
      .toEqual({ perParcel: 35, perParcelFromMeest: 55 });
  });

  it('на будь-якому смітті повертає дефолт, а не падає', () => {
    for (const raw of [null, undefined, '', 'не json', '{}', '{"perParcel":-1,"perParcelFromMeest":49}',
                       '{"perParcel":"тридцять","perParcelFromMeest":49}']) {
      expect(parseRozetkaDeliveryTariff(raw)).toEqual(DEFAULT_ROZETKA_DELIVERY_TARIFF);
    }
  });

  it('нуль — валідне значення: Rozetka може зробити доставку безплатною', () => {
    expect(parseRozetkaDeliveryTariff('{"perParcel":0,"perParcelFromMeest":0}'))
      .toEqual({ perParcel: 0, perParcelFromMeest: 0 });
  });
});
