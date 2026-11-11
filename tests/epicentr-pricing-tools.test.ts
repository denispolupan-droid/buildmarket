import { describe, it, expect } from 'vitest';
import { compareCommissions, parseCsvLine, nodeRate, invoiceCommissionAlerts, pickChild } from '../lib/epicentr-commission-watch';
import { epicentrOfferPrices, epicentrPrice } from '../lib/marketplace-pricing';
import { mpRevertItems, mpApplyItems, mpDriftedSkus, refreshMpBefore, normalizeMpItems, isMpTarget, type MpSnapshotRow } from '../lib/mp-reprice';
import { ADJ_CHANNELS, ADJ_CHANNEL_LABEL, buildFactorMap, factorOf } from '../lib/price-adjustments';
import { targetToChannels } from '../lib/price-adjustments-db';
import { fromEpicentrId } from '../lib/epicentr-availability';
import { epicentrErrorCodes } from '../lib/epicentr-api';

describe('звірка комісій Епіцентру з тарифом', () => {
  const rates = new Map([
    ['4051', { rate: 18, path: 'Клей побутовий', exact: true }],
    ['3198', { rate: 22, path: 'Фарба', exact: true }],
    ['9999', { rate: null, path: '', exact: false }],
  ]);
  it('лише категорії з іншою ставкою; невідомий тариф і порожній код — пропускаємо', () => {
    const diffs = compareCommissions([
      { slug: 'super-klei', epicentr_category_code: '4051', epicentr_commission_pct: 18 },
      { slug: 'farby', epicentr_category_code: '3198', epicentr_commission_pct: 20 },
      { slug: 'x', epicentr_category_code: '9999', epicentr_commission_pct: 15 },
      { slug: 'y', epicentr_category_code: null, epicentr_commission_pct: null },
      { slug: 'z', epicentr_category_code: '4051', epicentr_commission_pct: null },
    ], rates);
    expect(diffs.map(d => [d.slug, d.ours, d.theirs])).toEqual([['farby', 20, 22], ['z', null, 18]]);
  });

  it('CSV з лапками й комами в назвах', () => {
    expect(parseCsvLine('4051,Будівництво та ремонт,"Клей, герметики",Клей побутовий,,,X,')).toEqual(
      ['4051', 'Будівництво та ремонт', 'Клей, герметики', 'Клей побутовий', '', '', 'X', '']);
  });

  it('вузол за назвою: точний збіг, інакше єдиний з таким початком назви', () => {
    const t = (title: string) => ({ translations: [{ languageCode: 'ua', title }] });
    const nodes = [t('Витратні матеріали для інструментів'), t('Ручний інструмент'), t('Клей'), t('Клей побутовий')];
    expect(pickChild(nodes, 'Витратні матеріали')).toBe(nodes[0]);
    expect(pickChild(nodes, 'Клей')).toBe(nodes[2]);           // точний збіг важливіший за префікс
    expect(pickChild(nodes, 'Ручн')).toBe(nodes[1]);
    expect(pickChild([t('Фарба'), t('Фарба для підлоги')], 'Фар')).toBeUndefined(); // неоднозначно
  });

  it('ставка вузла — запис без бренду', () => {
    expect(nodeRate({ commissions: [{ brandId: 'b1', value: 10 }, { brandId: null, value: 18 }] })).toBe(18);
    expect(nodeRate({ commissions: [] })).toBeNull();
  });

  it('рахунок замовлення: тривога лише коли Епіцентр бере більше за нашу ставку (58851611 — 18 = 18)', () => {
    const ours = new Map<string, number | null>([['1606-003', 18], ['1606-002', 15]]);
    const items = [
      { externalId: '1606003', title: 'Pattex Супер-гель', commissionRate: '18' },
      { externalId: '1606002', title: 'Pattex тріо', commissionRate: '18' },
      { externalId: '1606004', title: 'Без категорії', commissionRate: '17' },
    ];
    expect(invoiceCommissionAlerts(items, ours, fromEpicentrId)).toEqual([
      { sku: '1606-002', title: 'Pattex тріо', ours: 15, theirs: 18 },
      { sku: '1606-004', title: 'Без категорії', ours: null, theirs: 17 },
    ]);
  });
});

describe('ціна Епіцентру з корекціями — одне правило для фіда й пуша', () => {
  const inp = { cost: 62.51, retail: 73, productMarkupPct: 17.4, categoryMarkupPct: null, commissionPct: 18 };
  it('без корекцій — формула; стара ціна складу лише якщо вища', () => {
    // 62.51 × 1.174 ÷ (1 − 0.18 − 0.013) = 90.94 → 91
    expect(epicentrOfferPrices(inp, { regular: 1, promo: 1 }, null)).toEqual({ price: 91, oldPrice: null });
    expect(epicentrOfferPrices(inp, { regular: 1, promo: 1 }, 80)).toEqual({ price: 91, oldPrice: null });
    expect(epicentrOfferPrices(inp, { regular: 1, promo: 1 }, 99)).toEqual({ price: 91, oldPrice: 99 });
  });
  it('акція −10 %: ціна з акцією, стара — без акційного множника (перекреслена на площадці)', () => {
    const r = epicentrOfferPrices(inp, { regular: 1, promo: 0.9 }, null);
    expect(r.price).toBe(epicentrPrice({ ...inp, adjustFactor: 0.9 }));
    expect(r.oldPrice).toBe(91);
  });
  it('тимчасова зміна без акції (+5 %) — нова ціна без старої', () => {
    const r = epicentrOfferPrices(inp, { regular: 1.05, promo: 1 }, null);
    expect(r).toEqual({ price: epicentrPrice({ ...inp, adjustFactor: 1.05 }), oldPrice: null });
  });
});

describe('переоцінка й акції — канал Епіцентр', () => {
  it('канали корекцій і цілі переоцінки', () => {
    expect(ADJ_CHANNELS).toContain('epicentr');
    expect(ADJ_CHANNEL_LABEL.epicentr).toBe('Епіцентр');
    expect(targetToChannels('epicentr')).toEqual(['epicentr']);
    expect(targetToChannels('mp')).toEqual(['prom', 'rozetka', 'epicentr']);
    expect(isMpTarget('epicentr')).toBe(true);
  });

  it('множник корекцій Епіцентру окремий від Prom/Rozetka', () => {
    const map = buildFactorMap([
      { channel: 'epicentr', sku: 'A', pct: -10, is_promo: true, starts_on: '2026-11-01', ends_on: null },
      { channel: 'prom', sku: 'A', pct: 5, is_promo: false, starts_on: '2026-11-01', ends_on: null },
    ], '2026-11-11');
    expect(factorOf(map, 'epicentr', 'A')).toEqual({ regular: 1, promo: 0.9 });
    expect(factorOf(map, 'prom', 'A')).toEqual({ regular: 1.05, promo: 1 });
  });

  it('знімок: відкат/застосування/дрейф/оновлення «до» з epi_markup', () => {
    const snap: MpSnapshotRow[] = [{ sku: 'A', name: 'a', before: { epi_markup: null, epi_price: 90 }, after: { epi_markup: 20, epi_price: 93 } }];
    expect(mpRevertItems(snap)).toEqual([{ sku: 'A', epicentr_markup_pct: null }]);
    expect(mpApplyItems(snap)).toEqual([{ sku: 'A', epicentr_markup_pct: 20 }]);
    expect(mpDriftedSkus(snap, new Map([['A', { epicentr_markup_pct: 25 }]]))).toEqual(['A']);
    expect(mpDriftedSkus(snap, new Map([['A', { epicentr_markup_pct: 20 }]]))).toEqual([]);
    expect(refreshMpBefore(snap, new Map([['A', { epicentr_markup_pct: 17.4 }]]))[0].before).toEqual({ epi_markup: 17.4, epi_price: null });
    // Переоцінка лише Prom не чіпає Епіцентр
    expect(mpRevertItems([{ sku: 'B', name: 'b', before: { prom_markup: 10 }, after: { prom_markup: 12 } }])).toEqual([{ sku: 'B', prom_markup_pct: 10 }]);
  });

  it('валідація пакета приймає epicentr_markup_pct', () => {
    expect(normalizeMpItems([{ sku: 'A', epicentr_markup_pct: 17.456 }, { sku: 'B', epicentr_markup_pct: 'x' }])).toEqual({
      items: [{ sku: 'A', epicentr_markup_pct: 17.46 }],
      errors: ['B: epicentr_markup_pct = x'],
    });
  });
});

describe('коди помилок пакета /v1/offers', () => {
  it('живий формат — масив об’єктів; свагер — об’єкт', () => {
    expect(epicentrErrorCodes([{ item: ['batch_update.item.cache_noop'] }])).toEqual(['batch_update.item.cache_noop']);
    expect(epicentrErrorCodes({ price: ['too_low'], sku: ['bad'] })).toEqual(['too_low', 'bad']);
    expect(epicentrErrorCodes(undefined)).toEqual([]);
  });
});
