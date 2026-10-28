import { describe, it, expect } from 'vitest';
import { parseNpRegisterSheet, parseNpMoney, planNpRegisterApply, nextSeqKey, personNamesMatch, splitRowAcrossOrders, type NpRegisterRow } from '../lib/novapay-register-rules';
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
  const one = (o: { id: string; order_number: number } | undefined, row: { gross: number; net: number }) =>
    o ? [{ ...o, gross: row.gross, net: row.net }] : [];
  const lookup = (row: NpRegisterRow) =>
    one(orders[row.ttn] ?? (row.buyer.startsWith('Чабан') ? { id: 'C', order_number: 26091174 } : undefined), row);

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
    const plan = planNpRegisterApply(parseNpRegisterSheet(sheet()), row => one(orders[row.ttn], row), {});
    expect(plan.unknown.map(u => u.ttn)).toEqual(['59001786325424']);
    expect(plan.post).toHaveLength(2);
  });

  // Одна ЕН на двох замовленнях: рядок має лягти на обидва, а не на одне з них.
  it('посилка на два замовлення — рядок ділиться між ними', () => {
    const split = (row: NpRegisterRow) => row.ttn === '20451541620716'
      ? splitRowAcrossOrders(row, [{ id: 'A', order_number: 26091199, total: 200 }, { id: 'D', order_number: 26091200, total: 460 }])
      : one(orders[row.ttn], row);
    const plan = planNpRegisterApply(parseNpRegisterSheet(sheet()), split, {});
    expect(plan.post.map(p => [p.orderId, p.gross, p.net])).toEqual([['A', 200, 199], ['D', 460, 457.7], ['B', 630, 626.85]]);
  });
});

describe('splitRowAcrossOrders — одна ЕН, кілька замовлень', () => {
  const row = { gross: 420, net: 417.9 };   // #26081005 (100) + #26081006 (320), серпень
  it('суми замовлень дають брутто — ділимо пропорційно, як воно й стоїть у книгах', () => {
    expect(splitRowAcrossOrders(row, [
      { id: 'a', order_number: 26081005, total: 100 },
      { id: 'b', order_number: 26081006, total: 320 },
    ])).toEqual([
      { id: 'a', order_number: 26081005, gross: 100, net: 99.5 },
      { id: 'b', order_number: 26081006, gross: 320, net: 318.4 },
    ]);
  });
  it('одне замовлення — весь рядок йому', () => {
    expect(splitRowAcrossOrders(row, [{ id: 'a', order_number: 1, total: 420 }]))
      .toEqual([{ id: 'a', order_number: 1, gross: 420, net: 417.9 }]);
  });
  it('суми не сходяться — це збіг ЕН, а не посилка на двох: беремо те, що дорівнює рядку', () => {
    expect(splitRowAcrossOrders(row, [
      { id: 'a', order_number: 1, total: 999 },
      { id: 'b', order_number: 2, total: 420 },
    ])).toEqual([{ id: 'b', order_number: 2, gross: 420, net: 417.9 }]);
  });
  it('суми не сходяться і рівного немає — перше за рангом, рядок не дробимо', () => {
    const r = splitRowAcrossOrders(row, [
      { id: 'a', order_number: 1, total: 999 },
      { id: 'b', order_number: 2, total: 888 },
    ]);
    expect(r).toEqual([{ id: 'a', order_number: 1, gross: 420, net: 417.9 }]);
  });
  it('копійки заокруглення дістаються останньому — сума часток дорівнює рядку', () => {
    const r = splitRowAcrossOrders({ gross: 300, net: 298.5 }, [
      { id: 'a', order_number: 1, total: 100 },
      { id: 'b', order_number: 2, total: 100 },
      { id: 'c', order_number: 3, total: 100 },
    ]);
    expect(r.reduce((s, x) => s + x.net, 0)).toBeCloseTo(298.5, 10);
    expect(r.reduce((s, x) => s + x.gross, 0)).toBe(300);
  });
  it('кандидатів немає — рядок невпізнаний', () => {
    expect(splitRowAcrossOrders(row, [])).toEqual([]);
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

describe('personNamesMatch — ПІБ з реєстру проти контакту в замовленні', () => {
  // 11.10.2026: «Помінчук Володимир Іванович» у реєстрі проти «Володимир Помінчук»
  // у замовленні — порівняння за першим словом не знаходило нікого.
  it('інший порядок слів і по-батькові зверху — це та сама людина', () => {
    expect(personNamesMatch('Володимир Помінчук', 'Помінчук Володимир Іванович')).toBe(true);
  });

  it('регістр і зайві пробіли не заважають', () => {
    expect(personNamesMatch('  чабан   ніна ', 'Чабан Ніна Володимирівна')).toBe(true);
  });

  // 22.10.2026: платіж 485 ₴ від «Стельмах Олександр Михайлович» не знайшов
  // #26101097 («Стельмах Александр») — порівняння йшло буквально
  it('українське й російське написання імені — та сама людина', () => {
    expect(personNamesMatch('Стельмах Александр', 'Стельмах Олександр Михайлович')).toBe(true);
    expect(personNamesMatch('Лысенко Николай', 'Лисенко Микола Петрович')).toBe(true);
  });

  it('зведення імені не зчіплює різні прізвища', () => {
    expect(personNamesMatch('Стельмах Александр', 'Коваль Олександр Михайлович')).toBe(false);
  });

  it('спільне лише прізвище — не зчіплюємо різних людей', () => {
    expect(personNamesMatch('Петров Іван', 'Петров Сергій Миколайович')).toBe(false);
  });

  it('спільне лише імʼя — теж ні', () => {
    expect(personNamesMatch('Іван Коваль', 'Іван Шевченко')).toBe(false);
  });

  it('одне слово ні з чим не зіставляємо', () => {
    expect(personNamesMatch('Помінчук', 'Помінчук Володимир Іванович')).toBe(false);
    expect(personNamesMatch('', 'Помінчук Володимир')).toBe(false);
  });

  it('апостроф і дефіс — частина прізвища', () => {
    expect(personNamesMatch("Мар'яненко-Білик Ольга", "Мар'яненко-Білик Ольга Петрівна")).toBe(true);
  });
});
