import { describe, it, expect } from 'vitest';
import { normalizePhone, isSendablePhone } from '../lib/notify/phone';

// Формати взяті з реальної бази: Rozetka пише «380…», Prom «+380…», сайт —
// «+38 (066) 828-22-90». Провайдеру потрібен один формат, і кожна помилка тут —
// недоставлене повідомлення про посилку.
describe('normalizePhone', () => {
  it('усі три реальні формати зводяться до одного', () => {
    expect(normalizePhone('380675967845')).toBe('380675967845');
    expect(normalizePhone('+380509860657')).toBe('380509860657');
    expect(normalizePhone('+38 (066) 828-22-90')).toBe('380668282290');
  });

  it('національний формат і запис без нуля', () => {
    expect(normalizePhone('0671234567')).toBe('380671234567');
    expect(normalizePhone('671234567')).toBe('380671234567');
  });

  it('старий формат із вісімкою', () => {
    expect(normalizePhone('80671234567')).toBe('380671234567');
  });

  it('сміття не перетворюється на «майже номер»', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('телефон уточнити')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+1 415 555 2671')).toBeNull();   // не український
  });

  it('isSendablePhone — те саме рішення одним прапорцем', () => {
    expect(isSendablePhone('+38 (050) 444-98-75')).toBe(true);
    expect(isSendablePhone('—')).toBe(false);
  });
});
