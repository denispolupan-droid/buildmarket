import { describe, it, expect } from 'vitest';
import { parseRzPayRegister, planRzPayRegisterApply, marketplaceOfProject } from '../lib/rozetkapay-register';

// Живий файл 09.09.2026 (реєстр за операції 07–08.09), суми як у кабінеті
const HEADER = ['№', 'Дата перерахування', 'Дата та час платежу', 'Сума платежу', 'Сума комісії з отримувача', 'Сума комісії з платника', 'Сума перерахованих коштів', 'Назва проекту', '№ замовлення', 'Електронний платіжний засіб (або токен)', 'Призначення платежу', 'Тип оплати', 'Спосіб оплати', 'Унікальний номер фінансової операції FC ID'];
const sheet = (): unknown[][] => [
  ['Реєстр переказів'],
  ['Отримувач:', 'ФОП Полупан Денис Олександрович'],
  ['Договір:', '3198107136-П'],
  ['Період:', '07.09.2026', '08.09.2026'],
  ['Дата формування:', '09.09.2026'],
  [], [],
  HEADER,
  ['1', '09.09.2026', '08.09.2026 00:48:15', 404, -6.87, 0, 397.13, '[FC_Acquiring] Prom marketplace ФОП Полупан', '425398995', '4627****4128', 'Переказ…', 'Оплата', 'Карта', '237262260'],
  ['2', '09.09.2026', '08.09.2026 14:43:12', 498, -8.47, 0, 489.53, '[FC_Acquiring] Prom marketplace ФОП Полупан', '425194204', '4441****4363', 'Переказ…', 'Оплата', 'Карта', '236982230'],
  ['', '', 'Всього:', 902, -15.34, 0, 886.66],
];

describe('parseRzPayRegister — реєстр переказів RozetkaPay з кабінету', () => {
  it('шапка, період, договір і рядки з id замовлення площадки', () => {
    const r = parseRzPayRegister(sheet());
    expect(r.contract).toBe('3198107136-П');
    expect(r.periodFrom).toBe('2026-09-07');
    expect(r.periodTo).toBe('2026-09-08');
    expect(r.generatedAt).toBe('2026-09-09');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ n: 1, payoutDate: '2026-09-09', gross: 404, fee: 6.87, net: 397.13, marketplace: 'prom', marketplaceOrderId: '425398995' });
    expect(r.totalGross).toBe(902);
    expect(r.totalNet).toBe(886.66);
  });

  it('рядок «Всього» не стає платежем; чужий файл — зрозуміла помилка', () => {
    expect(parseRzPayRegister(sheet()).rows.every(r => r.n > 0)).toBe(true);
    expect(() => parseRzPayRegister([['Реєстр платежів'], ['щось'], ['№', 'Дата', 'Сума']])).toThrow(/не реєстр/);
  });

  it('площадка з назви проекту', () => {
    expect(marketplaceOfProject('[FC_Acquiring] Prom marketplace ФОП …')).toBe('prom');
    expect(marketplaceOfProject('Rozetka Pay ФОП …')).toBe('rozetka');
    expect(marketplaceOfProject('Щось інше')).toBeNull();
  });
});

describe('planRzPayRegisterApply — склад виплати за фактом переписує підбір', () => {
  const orders: Record<string, { id: string; order_number: number; party: string }> = {
    '425398995': { id: 'A', order_number: 26091039, party: 'mp:prom' },
    '425194204': { id: 'B', order_number: 26091026, party: 'mp:prom' },
  };
  const lookup = (_mp: 'prom' | 'rozetka' | null, id: string) => orders[id] ?? null;

  it('кейс 09.09: підбір поклав #26081071 + #26081165 (502 + 400 = 902) — сторно обох, проводка двох із реєстру', () => {
    const plan = planRzPayRegisterApply(parseRzPayRegister(sheet()), lookup, { X: 502, Y: 400 });
    expect(plan.undo.map(u => [u.orderId, u.amount])).toEqual([['X', 502], ['Y', 400]]);
    expect(plan.post.map(p => [p.orderId, p.amount])).toEqual([['A', 404], ['B', 498]]);
    expect(plan.unknown).toEqual([]);
    expect(plan.keep).toBe(0);
  });

  it('уже правильно рознесене — не чіпаємо', () => {
    const plan = planRzPayRegisterApply(parseRzPayRegister(sheet()), lookup, { A: 404, B: 498 });
    expect(plan.post).toEqual([]);
    expect(plan.undo).toEqual([]);
    expect(plan.keep).toBe(2);
  });

  it('сума на замовленні інша — сторно і проводка заново; невідомий id площадки — у список', () => {
    const s = sheet();
    (s[9] as unknown[])[8] = '999';   // другий рядок — чуже замовлення
    const plan = planRzPayRegisterApply(parseRzPayRegister(s), lookup, { A: 400 });
    expect(plan.undo).toEqual([{ orderId: 'A', orderNumber: 26091039, party: 'mp:prom', amount: 400 }]);
    expect(plan.post.map(p => [p.orderId, p.amount])).toEqual([['A', 404]]);
    expect(plan.unknown).toEqual([{ marketplaceOrderId: '999', project: '[FC_Acquiring] Prom marketplace ФОП Полупан', gross: 498 }]);
  });

  it('два платежі одного замовлення в реєстрі — сума складається', () => {
    const s = sheet();
    (s[9] as unknown[])[8] = '425398995';
    const plan = planRzPayRegisterApply(parseRzPayRegister(s), lookup, {});
    expect(plan.post).toEqual([{ orderId: 'A', orderNumber: 26091039, party: 'mp:prom', amount: 902, marketplaceOrderId: '425398995' }]);
  });
});
