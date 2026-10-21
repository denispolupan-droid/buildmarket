import { describe, it, expect } from 'vitest';
import { formatNbuAmount, buildNbuQrPayload, buildNbuQrUrl, buildNbuQrMatrix, nbuCircleModules } from '../lib/nbu-qr';

const input = {
  recipient: 'ФОП Полупан Денис Олександрович',
  iban: 'UA80 3220 0100 0002 6000 3701 17963',
  amount: 1275,
  recipientCode: '3198107136',
  purpose: 'Оплата за замовлення №26101122 від 20.10.2026. Без ПДВ.',
};

describe('nbu-qr', () => {
  it('сума: найкоротший запис, копійки — дві цифри', () => {
    expect(formatNbuAmount(1275)).toBe('UAH1275');
    expect(formatNbuAmount(1275.5)).toBe('UAH1275.50');
    expect(formatNbuAmount(0.1 + 0.2)).toBe('UAH0.30');
  });

  it('структура формату 002: 13 рядків через Lf у правильному порядку', () => {
    const lines = buildNbuQrPayload(input).split('\n');
    expect(lines).toEqual([
      'BCD', '002', '1', 'UCT', '',
      'ФОП Полупан Денис Олександрович',
      'UA803220010000026000370117963',
      'UAH1275',
      '3198107136',
      '', '',
      'Оплата за замовлення №26101122 від 20.10.2026. Без ПДВ.',
      '',
    ]);
  });

  it('без суми — поле порожнє, рядок лишається', () => {
    const lines = buildNbuQrPayload({ ...input, amount: null }).split('\n');
    expect(lines[7]).toBe('');
    expect(lines).toHaveLength(13);
  });

  it('посилання: bank.gov.ua/qr/ + Base64URL, декодується назад', () => {
    const url = buildNbuQrUrl(input);
    expect(url.startsWith('https://bank.gov.ua/qr/QkNECjAwMgox')).toBe(true); // «BCD\n002\n1»
    const encoded = url.slice('https://bank.gov.ua/qr/'.length);
    expect(encoded).not.toMatch(/[+/=]/); // Base64URL без паддінгу
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    expect(decoded).toBe(buildNbuQrPayload(input));
  });

  it('матриця: версія 10–17, коло під ₴ за таблицею', () => {
    const m = buildNbuQrMatrix(buildNbuQrUrl(input));
    expect(m.version).toBeGreaterThanOrEqual(10);
    expect(m.version).toBeLessThanOrEqual(17);
    expect(m.size).toBe(m.version * 4 + 17);
    expect(m.circle).toBe(nbuCircleModules(m.version));
    expect(nbuCircleModules(10)).toBe(17);
    expect(nbuCircleModules(13)).toBe(21);
    expect(nbuCircleModules(17)).toBe(25);
  });

  it('надто довгі дані — помилка, а не битий код', () => {
    expect(() => buildNbuQrPayload({ ...input, purpose: 'я'.repeat(400) })).toThrow();
  });
});
