import { describe, it, expect } from 'vitest';
import { shouldReprocessMail, RETRY_UNKNOWN_DAYS, type PrevMailImport } from '../lib/mail-registers-rules';

// Класифікація листів і посилання на файл — у tests/novapay-register.test.ts.

const NOW = new Date('2026-10-18T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();
const prev = (p: Partial<PrevMailImport>): PrevMailImport =>
  ({ status: 'done', result: { unknown: [] }, received_at: daysAgo(1), ...p });

describe('shouldReprocessMail — коли лист читаємо ще раз', () => {
  it('нового листа обробляємо завжди', () => {
    expect(shouldReprocessMail(undefined, 'np-register', NOW)).toBe(true);
  });

  it('виписки ще немає — повторюємо, як і раніше', () => {
    expect(shouldReprocessMail(prev({ status: 'no-doc' }), 'np-register', NOW)).toBe(true);
    expect(shouldReprocessMail(prev({ status: 'error' }), 'rzpay-register', NOW)).toBe(true);
  });

  it('усе рознесено — більше не чіпаємо', () => {
    expect(shouldReprocessMail(prev({}), 'np-register', NOW)).toBe(false);
  });

  // #26101021: ЕН перевиписали після імпорту, рядок пішов «без замовлення»,
  // 388,05 ₴ лягли сумою — і лист більше ніколи не перечитувався.
  it('реєстр із рядком без замовлення — перечитуємо, поки свіжий', () => {
    const stuck = prev({ result: { unknown: [{ ttn: '59001797934459', gross: 390 }] }, received_at: daysAgo(6) });
    expect(shouldReprocessMail(stuck, 'np-register', NOW)).toBe(true);
  });

  it('після пільгового вікна зупиняємось: ЕН уже не з’явиться', () => {
    const old = prev({ result: { unknown: [{ ttn: '59001797934459' }] }, received_at: daysAgo(RETRY_UNKNOWN_DAYS + 1) });
    expect(shouldReprocessMail(old, 'np-register', NOW)).toBe(false);
  });

  it('межа вікна включна', () => {
    const edge = prev({ result: { unknown: [{ ttn: '1' }] }, received_at: daysAgo(RETRY_UNKNOWN_DAYS) });
    expect(shouldReprocessMail(edge, 'np-register', NOW)).toBe(true);
  });

  it('RozetkaPay не перечитуємо: там інший шлях проведення', () => {
    const stuck = prev({ result: { unknown: [{ ttn: '1' }] }, received_at: daysAgo(1) });
    expect(shouldReprocessMail(stuck, 'rzpay-register', NOW)).toBe(false);
  });

  it('биті дані не змушують качати вкладення щогодини', () => {
    expect(shouldReprocessMail(prev({ result: null, received_at: daysAgo(1) }), 'np-register', NOW)).toBe(false);
    expect(shouldReprocessMail(prev({ result: { unknown: [{ ttn: '1' }] }, received_at: null }), 'np-register', NOW)).toBe(false);
  });
});

import { registerMailAuthentic } from '../lib/mail-registers-rules';

describe('registerMailAuthentic', () => {
  const genuine = [
    'Delivered-To: admin@fixline.com.ua',
    'Authentication-Results: mx.zohomail.eu; dkim=pass; spf=pass (zohomail.eu: domain of mg.epprd.rozetkapay.com designates 143.55.238.7 as permitted sender) smtp.mailfrom=bounce@mg.epprd.rozetkapay.com;',
    '\tdmarc=pass(p=quarantine dis=none) header.from=rozetkapay.com',
    'From: reports@rozetkapay.com',
  ].join('\r\n');

  it('справжній лист RozetkaPay проходить', () => {
    expect(registerMailAuthentic(genuine, 'rozetkapay.com')).toBe(true);
  });

  it('чужий домен — ні', () => {
    expect(registerMailAuthentic(genuine, 'novapay.ua')).toBe(false);
  });

  it('dmarc=fail — ні, навіть якщо From правильний', () => {
    const spoof = 'Authentication-Results: mx.zohomail.eu; dkim=none; spf=fail; dmarc=fail header.from=rozetkapay.com\r\nFrom: reports@rozetkapay.com';
    expect(registerMailAuthentic(spoof, 'rozetkapay.com')).toBe(false);
  });

  it('підроблений заголовок відправника нижче вердикту нашого MX не рятує', () => {
    const spoof = [
      'Authentication-Results: mx.zohomail.eu; dkim=none; spf=softfail; dmarc=fail header.from=rozetkapay.com',
      'Authentication-Results: mx.zohomail.eu; dkim=pass; spf=pass; dmarc=pass header.from=rozetkapay.com',
    ].join('\r\n');
    expect(registerMailAuthentic(spoof, 'rozetkapay.com')).toBe(false);
  });

  it('без вердикту Zoho — ні', () => {
    expect(registerMailAuthentic('From: reports@rozetkapay.com', 'rozetkapay.com')).toBe(false);
  });

  it('header.from з адресою в кутових дужках і піддоменом', () => {
    const h = 'Authentication-Results: mx.zohomail.eu; dmarc=pass header.from=<erp-backoffice-mailer@novapay.ua>';
    expect(registerMailAuthentic(h, 'novapay.ua')).toBe(true);
  });
});
