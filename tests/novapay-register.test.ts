import { describe, it, expect } from 'vitest';
import { parseNpRegisterSheet, parseNpMoney, planNpRegisterApply, nextSeqKey } from '../lib/novapay-register-rules';
import { classifyRegisterMail, extractRzPayRegisterLink } from '../lib/mail-registers-rules';

// Живий файл з пошти: «Реєстр платежів контрагента Полупан Д.О. ФОП № 17739656 від 26 вересня 2026 р.XLSX»
const HEADER = ['№', 'Дата перерахунку коштів', 'Сума принятих коштів', 'Сума утриманої винагороди', 'Сума перерахованих коштів', 'Тариф', 'ПІБ Покупця', '№ ЕН НП', 'Номер замовлення', 'Унікальний номер платіжного засобу платника (Покупця)', 'Номер рахунку отримувача', 'Унікальний обліковий номер фінансової операції', 'Оплачено'];
const sheet = (): unknown[][] => [
  ['РЕЄСТР ПЕРЕКАЗІВ №17739656'],
  ['Одержувач:', null, 'Фізична особа-підприємець Полупан Денис Олександрович'],
  ['П\\р в банку:', null, 'UA429358710000067320000106641 ТОВ "НоваПей"'],
  ['Дата:', null, '26.09.2026'],
  HEADER,
  ['1', '26.09.2026', '660.00', '3.30', '656.70', 'Безготівковий 2', 'Руденко Василь Костянтинович', '20451541620716', null, '4149****6391', 'UA42…', '2903173048', 'Ні'],
  ['2', '26.09.2026', '630.00', '3.15', '626.85', 'Безготівковий 3', 'Півкач Крістіна Володимирівна', '20451543029880', null, '4547****75хх', 'UA42…', '2899101671', 'Ні'],
  ['3', '26.09.2026', '4,760.00', '23.80', '4,736.20', 'Безготівковий 1', 'Чабан Ніна Володимирівна  ', '59001786325424', null, null, 'UA42…', '2903655375', 'Ні'],
  [null, 'Всього:', '6,050.00', '30.25', '6,019.75'],
];

describe('parseNpRegisterSheet — реєстр переказів НоваПей з пошти', () => {
  it('номер, дата, рядки; «5,840.00» — кома тисячна; 59… — платіж НоваПей, не ЕН', () => {
    const r = parseNpRegisterSheet(sheet());
    expect(r.registerNo).toBe('17739656');
    expect(r.date).toBe('2026-09-26');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ ttn: '20451541620716', gross: 660, fee: 3.3, net: 656.7, isNpPayment: false });
    expect(r.rows[2]).toMatchObject({ ttn: '59001786325424', gross: 4760, net: 4736.2, buyer: 'Чабан Ніна Володимирівна', isNpPayment: true });
    expect(r.totalGross).toBe(6050);
    expect(r.totalNet).toBe(6019.75);
    expect(parseNpMoney('5,840.00')).toBe(5840);
    expect(parseNpMoney('5 840,00')).toBe(5840);
    expect(parseNpMoney(465.66)).toBe(465.66);
  });
  it('чужий файл — зрозуміла помилка', () => {
    expect(() => parseNpRegisterSheet([['Реєстр переказів'], ['№', 'Дата', 'Сума']])).toThrow(/не реєстр/);
  });
});

describe('planNpRegisterApply — доводимо проводки до реєстру', () => {
  const orders: Record<string, { id: string; order_number: number }> = { '20451541620716': { id: 'A', order_number: 26091199 }, '20451543029880': { id: 'B', order_number: 26091206 } };
  const lookup = (row: { ttn: string; buyer: string; gross: number }) => orders[row.ttn] ?? (row.buyer.startsWith('Чабан') ? { id: 'C', order_number: 26091174 } : null);

  it('нічого не проведено — проводимо всі три', () => {
    const plan = planNpRegisterApply(parseNpRegisterSheet(sheet()), lookup, {});
    expect(plan.post.map(p => [p.orderId, p.net])).toEqual([['A', 656.7], ['B', 626.85], ['C', 4736.2]]);
    expect(plan.undo).toEqual([]);
    expect(plan.unknown).toEqual([]);
  });
  it('копійчана різниця комісії — keep; чуже замовлення на документі — сторно (кейс 27.09: 660 не на тому замовленні)', () => {
    const plan = planNpRegisterApply(parseNpRegisterSheet(sheet()), lookup, { A: 656.71, B: 626.85, X: 656.7 });
    expect(plan.keep).toBe(2);
    expect(plan.undo).toEqual([{ orderId: 'X', net: 656.7 }]);
    expect(plan.post.map(p => p.orderId)).toEqual(['C']);
  });
  it('рядок без нашого замовлення — у список unknown, решта проводиться', () => {
    const plan = planNpRegisterApply(parseNpRegisterSheet(sheet()), row => orders[row.ttn] ?? null, {});
    expect(plan.unknown.map(u => u.ttn)).toEqual(['59001786325424']);
    expect(plan.post).toHaveLength(2);
  });
});

describe('nextSeqKey — повторна проводка по тій самій парі (документ, замовлення)', () => {
  it('ключ вільний — без суфікса', () => {
    expect(nextSeqKey('np-payout:52556653:B', [])).toBe('np-payout:52556653:B');
    expect(nextSeqKey('np-payout:52556653:B', ['np-payout:52556653:A', 'np-payout-undo:52556653:B'])).toBe('np-payout:52556653:B');
  });
  it('ключ зайнятий — :2, далі за максимальним суфіксом (кейс 01.10: реєстр 15092123 переписував #26081076)', () => {
    expect(nextSeqKey('np-payout:52556653:B', ['np-payout:52556653:B'])).toBe('np-payout:52556653:B:2');
    expect(nextSeqKey('np-payout:52556653:B', ['np-payout:52556653:B', 'np-payout:52556653:B:2', 'np-payout:52556653:B:3'])).toBe('np-payout:52556653:B:4');
    expect(nextSeqKey('np-payout:52556653:B', ['np-payout:52556653:B:2'])).toBe('np-payout:52556653:B:3');
  });
  it('чужі ключі з тим самим префіксом не рахуються', () => {
    expect(nextSeqKey('np-payout:1:agg', ['np-payout:1:agg-rest', 'np-payout:1:agg-rest:2'])).toBe('np-payout:1:agg');
  });
});

describe('листи з реєстрами', () => {
  it('класифікація за відправником і темою', () => {
    expect(classifyRegisterMail('erp-backoffice-mailer@novapay.ua', 'Реєстр платежів контрагента Полупан Д.О. ФОП № 17484341 від 23 вересня 2026 р')).toEqual({ source: 'novapay', kind: 'np-register', registerNo: '17484341' });
    expect(classifyRegisterMail('reports@rozetkapay.com', 'Реєстр платежів ФОП Полупан Денис Олександрович_2026-09-29')).toEqual({ source: 'rozetkapay', kind: 'rzpay-register', registerNo: '2026-09-29' });
    expect(classifyRegisterMail('reports@rozetkapay.com', 'Взаєморозрахунки з ФОП … за період з 2026-08-01 по 2026-08-31.').kind).toBe('rzpay-act');
    expect(classifyRegisterMail('novaposhta@novaposhta.ua', 'Терміново: сплатіть заборгованість').kind).toBe('other');
  });
  it('посилання на XLSX з листа RozetkaPay, &amp; → &', () => {
    const html = '<a href="https://storage.googleapis.com/settlements-service-registers-epprd/settlements2/%D0%A0.xlsx?Expires=1&amp;GoogleAccessId=x&amp;Signature=y">Завантажити реєстр</a><a href="https://www.youtube.com/watch?v=1">відео</a>';
    expect(extractRzPayRegisterLink(html)).toBe('https://storage.googleapis.com/settlements-service-registers-epprd/settlements2/%D0%A0.xlsx?Expires=1&GoogleAccessId=x&Signature=y');
    expect(extractRzPayRegisterLink('<p>нема</p>')).toBeNull();
  });
});
