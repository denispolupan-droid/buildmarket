import { describe, it, expect } from 'vitest';
import { estimateMarketplaceDeliveryFee, splitFeeByRevenue } from '../lib/marketplace-delivery-fee';

describe('splitFeeByRevenue', () => {
  it('один постачальник забирає збір цілком — щоб підсумок збігся з «Економікою»', () => {
    // живий кейс: валовий 255 − комісія 84 − доставка 30 = 141, як у блоці «Фінанси»
    expect(splitFeeByRevenue(30, [1555])).toEqual([30]);
  });

  it('між постачальниками ділить пропорційно виручці', () => {
    expect(splitFeeByRevenue(30, [700, 300])).toEqual([21, 9]);
  });

  it('сума часток дорівнює збору навіть на неділимих пропорціях', () => {
    const shares = splitFeeByRevenue(10, [100, 100, 100]);
    expect(shares.reduce((s, v) => s + v, 0)).toBe(10);
    expect(shares).toEqual([3.33, 3.33, 3.34]);
  });

  it('без збору всі частки нульові', () => {
    expect(splitFeeByRevenue(0, [100, 200])).toEqual([0, 0]);
  });

  it('нульова виручка не дає ділення на нуль — збір вішаємо на останнього', () => {
    expect(splitFeeByRevenue(30, [0, 0])).toEqual([0, 30]);
  });

  it('порожній список постачальників — порожній результат', () => {
    expect(splitFeeByRevenue(30, [])).toEqual([]);
  });
});

describe('estimateMarketplaceDeliveryFee', () => {
  describe('Rozetka Smart', () => {
    it('бере компенсацію за порогом суми замовлення', () => {
      // тариф за замовчуванням: до 399 — 12, 400–699 — 18, від 700 — 30
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'rozetka', total_price: 410, rozetka_data: { is_smart: true },
      })?.amount).toBe(18);
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'rozetka', total_price: 1200, rozetka_data: { is_smart: true },
      })?.amount).toBe(30);
    });

    it('Smart ВИТІСНЯЄ збір за видачу, а не додається до нього', () => {
      // живий кейс 902085570: Smart на 410 ₴ у точку видачі — у накладній 18, не 18+30
      const fee = estimateMarketplaceDeliveryFee({
        channel_code: 'rozetka', delivery_type: 'rozetka_delivery', total_price: 410,
        rozetka_data: { is_smart: true, _rz_delivery_price: 18 },
      });
      expect(fee?.amount).toBe(18);
      expect(fee?.label).toContain('Smart');
    });

    it('поважає переданий тариф, а не константи', () => {
      expect(estimateMarketplaceDeliveryFee(
        { channel_code: 'rozetka', total_price: 100, rozetka_data: { is_smart: true } },
        { smart: [{ upTo: null, fee: 25 }] },
      )?.amount).toBe(25);
    });
  });

  describe('точка видачі Rozetka', () => {
    it('бере фактичну суму з накладної', () => {
      const fee = estimateMarketplaceDeliveryFee({
        channel_code: 'rozetka', delivery_type: 'rozetka_delivery', total_price: 900,
        rozetka_data: { _rz_delivery_price: 30 },
      });
      expect(fee?.amount).toBe(30);
      expect(fee?.hint).toContain('Фактична');
    });

    it('без накладної падає на тариф і каже, що сума попередня', () => {
      const fee = estimateMarketplaceDeliveryFee({
        channel_code: 'rozetka', delivery_type: 'rozetka_delivery', total_price: 900, rozetka_data: {},
      });
      expect(fee?.amount).toBe(30);
      expect(fee?.hint).toContain('попередня');
    });

    it('звичайна доставка Rozetka (НП) збору за видачу не має', () => {
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'rozetka', delivery_type: 'nova_poshta', total_price: 900, rozetka_data: {},
      })).toBeNull();
    });
  });

  describe('«Дешева доставка» Prom', () => {
    it('визначає акцію за ps_promotion і рахує за порогом', () => {
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'prom', total_price: 1713, prom_data: { ps_promotion: { name: 'Дешевая доставка' } },
      })?.amount).toBe(30);
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'prom', total_price: 456, prom_data: { ps_promotion: { name: 'Дешева доставка' } },
      })?.amount).toBe(10);
    });

    it('нижче мінімального порогу збору немає', () => {
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'prom', total_price: 150, prom_data: { ps_promotion: { name: 'Дешева доставка' } },
      })).toBeNull();
    });

    it('замовлення Prom без акції — без збору', () => {
      expect(estimateMarketplaceDeliveryFee({
        channel_code: 'prom', total_price: 1713, prom_data: {},
      })).toBeNull();
    });
  });

  it('власний сайт і дропшип збору маркетплейсу не мають', () => {
    expect(estimateMarketplaceDeliveryFee({ channel_code: 'website', total_price: 5000 })).toBeNull();
    expect(estimateMarketplaceDeliveryFee({ channel_code: 'dropship', total_price: 5000 })).toBeNull();
  });

  it('на порожньому замовленні не падає', () => {
    expect(estimateMarketplaceDeliveryFee({})).toBeNull();
    expect(estimateMarketplaceDeliveryFee({ channel_code: 'rozetka', rozetka_data: null })).toBeNull();
  });
});
