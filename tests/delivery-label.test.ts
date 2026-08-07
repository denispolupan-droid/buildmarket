import { describe, it, expect } from 'vitest';
import { deliveryPlace, shortenWarehouse, stripCityPrefix } from '../lib/delivery-label';

describe('shortenWarehouse', () => {
  it('відсікає вулицю й ліміт ваги з назви відділення', () => {
    expect(shortenWarehouse('№7 (до 30 кг на одне місце): вул. Шевченка, 3')).toBe('Відділення №7');
  });

  it('лишає слово, коли воно вже є в назві', () => {
    expect(shortenWarehouse('Відділення №27 (до 200 кг на одне місце): вул. Шевченка, 317')).toBe('Відділення №27');
    expect(shortenWarehouse('Поштомат №35963: вул. Лесі Українки, 2')).toBe('Поштомат №35963');
  });

  it('кур\'єрську адресу не чіпає — там вулиця і є сенсом', () => {
    expect(shortenWarehouse('вул. Калинова, 104, кв. 5', true)).toBe('вул. Калинова, 104, кв. 5');
  });

  it('не залишає порожнечі, якщо дужки — це вся назва', () => {
    expect(shortenWarehouse('(до 30 кг)')).toBe('(до 30 кг)');
  });
});

describe('deliveryPlace', () => {
  it('місто + коротке відділення, без вулиці й повтору міста', () => {
    expect(deliveryPlace({
      delivery_city_name: 'Ізмаїл',
      delivery_address: 'Ізмаїл, №7 (до 30 кг на одне місце): вул. Шевченка, 3',
    })).toBe('Ізмаїл · Відділення №7');
  });

  it('для кур\'єра лишає адресу повністю', () => {
    expect(deliveryPlace({
      delivery_city_name: 'Київ', delivery_subtype: 'courier',
      delivery_address: 'вул. Калинова, 104',
    })).toBe('Київ · вул. Калинова, 104');
  });

  it('самовивіз', () => {
    expect(deliveryPlace({ delivery_type: 'pickup' })).toBe('Самовивіз');
  });
});

describe('stripCityPrefix', () => {
  it('зрізає місто, яке маркетплейс продублював в адресі', () => {
    expect(stripCityPrefix('Немішаєве, Поштомат №1', 'Немішаєве')).toBe('Поштомат №1');
  });

  it('розуміє префікси «м.» / «смт»', () => {
    expect(stripCityPrefix('м. Харків, Відділення №27', 'Харків')).toBe('Відділення №27');
    expect(stripCityPrefix('смт Гостомель · Відділення №2', 'Гостомель')).toBe('Відділення №2');
  });

  it('не чіпає адресу, якщо міста в ній немає', () => {
    expect(stripCityPrefix('Відділення №455', 'Київ')).toBe('Відділення №455');
  });

  it('лишає адресу як є, коли вона дорівнює місту', () => {
    expect(stripCityPrefix('Київ', 'Київ')).toBe('Київ');
  });

  it('не ламається на регулярочних символах у назві', () => {
    expect(stripCityPrefix('Кам\'янське, Відділення №5', 'Кам\'янське')).toBe('Відділення №5');
  });
});
