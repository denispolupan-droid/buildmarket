import { describe, it, expect } from 'vitest';
import { unsettledNpCod, formatUnsettledAlert, COD_GRACE_DAYS, type NpCodOrder } from '../lib/novapay-cod-watch';

const NOW = new Date('2026-10-17T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();

const order = (p: Partial<NpCodOrder> & { orderNumber: number }): NpCodOrder =>
  ({ deliveredAt: daysAgo(5), total: 500, balance: 0, ...p });

describe('unsettledNpCod — яка наложка справді зависла', () => {
  it('погашена наложка не тривожить, скільки б днів не минуло', () => {
    expect(unsettledNpCod([order({ orderNumber: 1, deliveredAt: daysAgo(30) })], NOW)).toEqual([]);
  });

  // Реальні #26101021 (390 ₴, 11.10) і #26101056 (220 ₴ з 330, 10.10) — саме їх
  // стара перевірка не бачила, бо дивилась «чи були виплати взагалі».
  it('ненульовий залишок після пільгового строку — у список', () => {
    const list = unsettledNpCod([
      order({ orderNumber: 26101021, deliveredAt: daysAgo(6), total: 390, balance: 390 }),
      order({ orderNumber: 26101056, deliveredAt: daysAgo(7), total: 330, balance: 220 }),
    ], NOW);
    expect(list.map(o => o.orderNumber)).toEqual([26101056, 26101021]);  // старіші першими
  });

  // 15–17.10: вручень НП не було, а алерт усе одно спрацьовував 13 разів.
  it('свіже вручення в межах пільгового строку — тиші не порушує', () => {
    const list = unsettledNpCod([
      order({ orderNumber: 26101075, deliveredAt: daysAgo(0), total: 470, balance: 470 }),
      order({ orderNumber: 26101081, deliveredAt: daysAgo(1), total: 314, balance: 314 }),
    ], NOW);
    expect(list).toEqual([]);
  });

  it('межа пільгового строку включна', () => {
    const atEdge = order({ orderNumber: 7, deliveredAt: daysAgo(COD_GRACE_DAYS), balance: 100 });
    expect(unsettledNpCod([atEdge], NOW)).toHaveLength(1);
  });

  it('копійчаний хвіст від округлення комісії — не борг', () => {
    expect(unsettledNpCod([order({ orderNumber: 8, deliveredAt: daysAgo(9), balance: 0.004 })], NOW)).toEqual([]);
  });

  it('відʼємний залишок (переплата) не тривожить', () => {
    expect(unsettledNpCod([order({ orderNumber: 9, deliveredAt: daysAgo(9), balance: -50 })], NOW)).toEqual([]);
  });

  it('порожній вхід — порожній вихід', () => {
    expect(unsettledNpCod([], NOW)).toEqual([]);
  });
});

describe('formatUnsettledAlert — текст, з яким можна йти в кабінет НП', () => {
  it('називає замовлення, суму і вік', () => {
    const { title, body } = formatUnsettledAlert([
      order({ orderNumber: 26101056, deliveredAt: daysAgo(7), total: 330, balance: 220 }),
      order({ orderNumber: 26101021, deliveredAt: daysAgo(6), total: 390, balance: 390 }),
    ], NOW);
    expect(title).toContain('2 шт.');
    expect(title).toContain('610.00');
    expect(body).toContain('#26101056 — 220.00 ₴, вручено 7 дн. тому');
    expect(body).toContain('#26101021 — 390.00 ₴, вручено 6 дн. тому');
  });
});
