import { describe, it, expect } from 'vitest';
import {
  computeRozetkaDeliveryFee,
  resolveRozetkaDeliveryFee,
  parseRozetkaDeliveryTariff,
  DEFAULT_ROZETKA_DELIVERY_TARIFF,
} from '../lib/rozetka-delivery-tariff';

describe('resolveRozetkaDeliveryFee', () => {
  // Три живі накладні від 03.08.2026
  it('Smart-замовлення дає нуль: його збір проводить окремий блок', () => {
    // 902085570 — Smart, 410 грн, у накладній delivery_price 18 (ставка Smart 400–699).
    // Якби брали і те, і те, на замовлення лягло б 18 + 30 замість 18.
    expect(resolveRozetkaDeliveryFee({ isSmart: true, actualPrice: 18 })).toBe(0);
    expect(resolveRozetkaDeliveryFee({ isSmart: true })).toBe(0);
  });

  it('бере фактичну суму з накладної, а не тариф', () => {
    expect(resolveRozetkaDeliveryFee({ isSmart: false, actualPrice: 30 })).toBe(30);
    // якщо Rozetka колись візьме інакше — проводимо саме її суму
    expect(resolveRozetkaDeliveryFee({ isSmart: false, actualPrice: 42.5 })).toBe(42.5);
  });

  it('без накладної падає на тариф', () => {
    expect(resolveRozetkaDeliveryFee({ isSmart: false })).toBe(30);
    expect(resolveRozetkaDeliveryFee({ isSmart: false, actualPrice: null })).toBe(30);
    expect(resolveRozetkaDeliveryFee({ isSmart: false, actualPrice: NaN })).toBe(30);
    expect(resolveRozetkaDeliveryFee({ isSmart: false, fromMeest: true })).toBe(49);
  });

  it('нуль чи відʼємне у полі накладної не приймаємо за суму — падаємо на тариф', () => {
    expect(resolveRozetkaDeliveryFee({ isSmart: false, actualPrice: 0 })).toBe(30);
    expect(resolveRozetkaDeliveryFee({ isSmart: false, actualPrice: -5 })).toBe(30);
  });
});

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
