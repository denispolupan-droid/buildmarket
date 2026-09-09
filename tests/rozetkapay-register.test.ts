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
  const lookup = (_mp: 'prom' | 'rozetka' | null, id: string, _ref: string | null) => orders[id] ?? null;

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

import { parseRzPayTransactionsCsv, refOfPurpose, splitCsvLine } from '../lib/rozetkapay-register';

describe('parseRzPayTransactionsCsv — розгорнутий експорт транзакцій RozetkaPay', () => {
  const H = '№ замовлення;№ операції;Дата замовлення;Сума платежу;Тип оплати;Платформа;Статус;Дата оплати покупцем;Дата перерахування торговцю;ID платника;ID отримувача;№ платежу;Номер картки;Картка отримувача;Сума комісії з отримувача;Сума комісії з платника;Проект;Спосіб оплати;Призначення платежу;Платіжна система;RRN;Email ініціатора замовлення;Телефон ініціатора замовлення;Ініціатор замовлення;Банк-партнер (оплата частинами);Кількість платежів (оплата частинами);TID;MID;Банк-еквайр;Код авторизації;Статус фіскалізації';
  const csv = [
    H,
    '905647656;239029106;09.09.2026/22:40:19;1230;Оплата;rozetka_market;Успіх;09.09.2026/22:41:04;;1;2;3;4255****1;;18.45;0;[FC_Acquiring] Rozetka marketplace ФОП;GooglePay;Оплата за товар згідно замовлення №905647656;VISA;1;e;p;i;;;T;M;"АТ ""Ощадбанк""";1;',
    '904933433;1;05.09.2026/15:26:09;2240;Оплата;pnfp_fr;Успіх;05.09.2026/15:26:20;07.09.2026/15:45:25;;;5;5445****2;;33.6;;ПНФП 10024;POS-термінал;Оплата за замовлення RMP-240248756;MasterCard;2;;p;;;;;;"АТ ""Ощадбанк""";;',
    '26081148;2;30.08.2026/11:00:00;356;Оплата;pnfp_fr;Успіх;30.08.2026/11:00:10;31.08.2026/15:43:20;;;6;5445****3;;5.34;;ПНФП 10024;POS-термінал;Оплата за замовлення 101807100841;MasterCard;3;;p;;;;;;"АТ ""Ощадбанк""";;',
    '425398995;3;03.09.2026/16:57:14;404;Оплата;prom;Успіх;03.09.2026/16:57:30;09.09.2026/14:00:00;;;7;4627****4;;6.87;0;[FC_Acquiring] Prom marketplace ФОП;Карта;Переказ в оплату товарів;VISA;4;e;p;i;;;T;M;"АТ ""Ощадбанк""";2;',
    '904872023;4;01.09.2026/15:30:47;8680;Оплата;rozetka_market;Успіх;01.09.2026/15:32:07;02.09.2026/14:34:31;;;8;4;;130.2;0;[FC_Acquiring] Rozetka marketplace ФОП;Карта;Оплата за товар згідно замовлення №904872023;VISA;5;e;p;i;;;T;M;"АТ ""Ощадбанк""";3;',
    '904872023;5;01.09.2026/16:12:47;8680;Повернення;rozetka_market;Успіх;01.09.2026/16:12:48;02.09.2026/14:34:31;;;9;4;;0;0;[FC_Acquiring] Rozetka marketplace ФОП;Карта;Оплата за товар згідно замовлення №904872023;VISA;6;e;p;i;;;T;M;"АТ ""Ощадбанк""";3;',
    '426451509;6;08.09.2026/19:52:06;1401;Блокування;prom;Невдало;;;;;;;;;;;;;;;;;;;;;;;;',
  ].join('\n');

  it('лапки з подвоєнням, дати, платформи, повернення зі знаком мінус, pending без дати перерахування', () => {
    expect(splitCsvLine('a;"АТ ""Ощадбанк""";b')).toEqual(['a', 'АТ "Ощадбанк"', 'b']);
    const r = parseRzPayTransactionsCsv(csv);
    expect(r.rows.map(x => [x.payoutDate, x.marketplace, x.marketplaceOrderId, x.gross, x.kind, x.ref])).toEqual([
      ['2026-09-07', 'rozetka', '904933433', 2240, 'payment', 'RMP-240248756'],
      ['2026-08-31', 'rozetka', '26081148', 356, 'payment', '101807100841'],
      ['2026-09-09', 'prom', '425398995', 404, 'payment', null],
      ['2026-09-02', 'rozetka', '904872023', 8680, 'payment', null],
      ['2026-09-02', 'rozetka', '904872023', -8680, 'refund', null],
    ]);
    expect(r.pending).toEqual([{ marketplaceOrderId: '905647656', project: 'rozetka_market · [FC_Acquiring] Rozetka marketplace ФОП', gross: 1230, paidAt: '09.09.2026/22:41:04' }]);
    expect(r.periodFrom).toBe('2026-08-31');
    expect(r.periodTo).toBe('2026-09-09');
    expect(r.rows[0].fee).toBe(33.6);
  });

  it('оплата + повернення в одному переказі дають нуль — замовлення не проводиться', () => {
    const r = parseRzPayTransactionsCsv(csv);
    const rows = r.rows.filter(x => x.payoutDate === '2026-09-02');
    const plan = planRzPayRegisterApply({ ...r, rows }, (_mp, id) => id === '904872023' ? { id: 'R', order_number: 26091001, party: 'mp:rozetka' } : null, {});
    expect(plan.post).toEqual([]);
    expect(plan.zeroed).toBe(1);
  });

  it('пошук нашого замовлення за накладною з призначення', () => {
    expect(refOfPurpose('Оплата за замовлення RMP-240248756')).toBe('RMP-240248756');
    expect(refOfPurpose('Оплата за замовлення 101807100841')).toBe('101807100841');
    expect(refOfPurpose('Оплата замовлення 904771142')).toBeNull();
    const r = parseRzPayTransactionsCsv(csv);
    const lookup = (_mp: 'prom' | 'rozetka' | null, id: string, ref: string | null) => ref === '101807100841' ? { id: 'W', order_number: 26081148, party: 'mp:rozetka' } : null;
    const plan = planRzPayRegisterApply({ ...r, rows: r.rows.filter(x => x.payoutDate === '2026-08-31') }, lookup, {});
    expect(plan.post).toEqual([{ orderId: 'W', orderNumber: 26081148, party: 'mp:rozetka', amount: 356, marketplaceOrderId: '26081148' }]);
  });

  it('чужий CSV — зрозуміла помилка', () => {
    expect(() => parseRzPayTransactionsCsv('a;b;c\n1;2;3')).toThrow(/не розгорнутий експорт/);
  });
});

describe('planRzPayRegisterApply — платіж більший за замовлення (рахунок на кілька замовлень)', () => {
  it('кейс 04.08: 6 150 на #26081008 (сума 2 050) — не проводимо і не сторнуємо підтверджений склад', () => {
    const reg = parseRzPayRegister([
      ['Договір:', 'x'], ['Період:', '03.08.2026', '03.08.2026'],
      ['№', 'Дата перерахування', 'Дата та час платежу', 'Сума платежу', 'Сума комісії з отримувача', 'Сума комісії з платника', 'Сума перерахованих коштів', 'Назва проекту', '№ замовлення'],
      ['1', '04.08.2026', '03.08.2026 10:00', 6150, -92.25, 0, 6057.75, 'Rozetka marketplace', '901'],
    ]);
    const plan = planRzPayRegisterApply(reg, () => ({ id: 'I', order_number: 26081008, party: 'mp:rozetka', total: 2050 }), { I: 2050 });
    expect(plan.post).toEqual([]);
    expect(plan.undo).toEqual([]);
    expect(plan.keep).toBe(1);
    expect(plan.overpaid).toEqual([{ orderNumber: 26081008, amount: 6150, total: 2050, leftover: 4100 }]);
    // ще не рознесене — проводимо лише суму замовлення, решта рахунку лишається на клірингу
    const fresh = planRzPayRegisterApply(reg, () => ({ id: 'I', order_number: 26081008, party: 'mp:rozetka', total: 2050 }), {});
    expect(fresh.post).toEqual([{ orderId: 'I', orderNumber: 26081008, party: 'mp:rozetka', amount: 2050, marketplaceOrderId: '901' }]);
  });
});
