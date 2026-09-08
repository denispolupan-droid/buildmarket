import { describe, it, expect } from 'vitest';
import { planMergeTtn, mergeTtnKind, mergedDescription, type MergeTtnOrder } from '../lib/orders/merge-ttn';

let seq = 0;
const order = (over: Partial<MergeTtnOrder> = {}): MergeTtnOrder => ({
  id: `id-${++seq}`, order_number: 26090000 + seq,
  delivery_type: 'rozetka_delivery', channel_code: 'rozetka', rozetka_order_id: 900000 + seq,
  tracking_number: null, phone: '380973908644',
  delivery_address: 'Кривий Ріг, Вільної Ічкерії вул., 9', delivery_warehouse_ref: null,
  ...over,
});

describe('mergeTtnKind — який потік створює спільну накладну', () => {
  it('маркетплейсна точка Rozetka, власний договір, решта — НП; самовивіз — ніякий', () => {
    expect(mergeTtnKind('rozetka_delivery')).toBe('rozetka_delivery');
    expect(mergeTtnKind('rz_delivery')).toBe('rz_delivery');
    expect(mergeTtnKind('nova_poshta')).toBe('nova');
    expect(mergeTtnKind('nova')).toBe('nova');
    expect(mergeTtnKind(null)).toBe('nova');
    expect(mergeTtnKind('pickup')).toBeNull();
  });
});

describe('planMergeTtn — точка видачі Rozetka (Seller API)', () => {
  it('два замовлення Rozetka одного покупця на одну точку — можна (живий кейс №26091087/88)', () => {
    const plan = planMergeTtn([order(), order()]);
    expect(plan).toMatchObject({ ok: true, kind: 'rozetka_delivery' });
  });

  it('телефон з іншим форматом запису — той самий покупець', () => {
    const plan = planMergeTtn([order({ phone: '+38 (097) 390-86-44' }), order({ phone: '380973908644' })]);
    expect(plan.ok).toBe(true);
  });

  it('різні точки видачі — відмова', () => {
    const plan = planMergeTtn([order(), order({ delivery_address: 'Одеса, Адміральський пр-т., 1' })]);
    expect(plan).toMatchObject({ ok: false });
    expect((plan as { error: string }).error).toMatch(/точки видачі/);
  });

  it('різні покупці — відмова', () => {
    const plan = planMergeTtn([order(), order({ phone: '380674494721' })]);
    expect((plan as { error: string }).error).toMatch(/покупці/);
  });

  it('замовлення без rozetka_order_id (не з маркетплейсу) — відмова з номером', () => {
    const plan = planMergeTtn([order(), order({ channel_code: 'website', rozetka_order_id: null, order_number: 26099999 })]);
    expect((plan as { error: string }).error).toMatch(/26099999/);
  });

  it('уже має накладну — відмова з номером замовлення', () => {
    const plan = planMergeTtn([order(), order({ tracking_number: 'RMP-1', order_number: 26098888 })]);
    expect((plan as { error: string }).error).toMatch(/26098888/);
  });
});

describe('planMergeTtn — ROZETKA Доставка власного договору', () => {
  const own = (over: Partial<MergeTtnOrder> = {}) =>
    order({ delivery_type: 'rz_delivery', channel_code: 'website', rozetka_order_id: null, delivery_warehouse_ref: 'w-1', delivery_address: null, ...over });

  it('одна точка, один покупець — можна', () => {
    expect(planMergeTtn([own(), own()])).toMatchObject({ ok: true, kind: 'rz_delivery' });
  });

  it('різні точки або порожня точка — відмова', () => {
    expect(planMergeTtn([own(), own({ delivery_warehouse_ref: 'w-2' })]).ok).toBe(false);
    expect(planMergeTtn([own(), own({ delivery_warehouse_ref: null })]).ok).toBe(false);
  });
});

describe('planMergeTtn — загальні правила', () => {
  it('менше двох — відмова', () => {
    expect(planMergeTtn([order()]).ok).toBe(false);
  });

  it('змішані способи доставки — відмова з назвами', () => {
    const plan = planMergeTtn([order(), order({ delivery_type: 'nova_poshta' })]);
    expect((plan as { error: string }).error).toMatch(/Нова Пошта/);
  });

  it('самовивіз у виборі — відмова', () => {
    expect(planMergeTtn([order({ delivery_type: 'pickup' }), order({ delivery_type: 'pickup' })]).ok).toBe(false);
  });

  it('НП лишається без додаткових обмежень (як було)', () => {
    const plan = planMergeTtn([
      order({ delivery_type: 'nova_poshta', channel_code: 'retail', rozetka_order_id: null, phone: '1' }),
      order({ delivery_type: 'nova_poshta', channel_code: 'prom', rozetka_order_id: null, phone: '2' }),
    ]);
    expect(plan).toMatchObject({ ok: true, kind: 'nova' });
  });
});

describe('mergedDescription', () => {
  it('номери замовлень + позиції, обрізано до ліміту API', () => {
    const d = mergedDescription([
      { order_number: 1, items: [{ name: 'Клей' }] },
      { order_number: 2, items: [{ name: 'Герметик' }, { name: '' }] },
    ]);
    expect(d).toBe('№1+№2: Клей, Герметик');
    expect(mergedDescription([{ order_number: 1, items: [{ name: 'x'.repeat(300) }] }]).length).toBe(100);
  });
});
