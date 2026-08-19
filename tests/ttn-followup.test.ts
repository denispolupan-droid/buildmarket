import { describe, it, expect } from 'vitest';
import { ttnFollowUpAction, type TtnFollowUpOrder } from '../lib/orders/ttn-followup';

const order = (over: Partial<TtnFollowUpOrder> = {}): TtnFollowUpOrder => ({
  status: 'confirmed', fulfillment_mode: 'supplier', channel_code: 'retail', delivery_type: 'nova', ...over,
});

describe('ttnFollowUpAction', () => {
  it('дропшип у робочому статусі — відвантажуємо', () => {
    expect(ttnFollowUpAction(order({ status: 'confirmed' }))).toBe('ship');
    expect(ttnFollowUpAction(order({ status: 'picking' }))).toBe('ship');
    expect(ttnFollowUpAction(order({ status: 'awaiting_stock' }))).toBe('ship');
  });

  it('нове замовлення не відвантажуємо — немає ні резервів, ні замовлення постачальнику', () => {
    expect(ttnFollowUpAction(order({ status: 'new' }))).toBe('none');
  });

  it('саме через це ТТН до підтвердження нічого не робила, а після підтвердження — відвантажує', () => {
    const beforeConfirm = order({ status: 'new', fulfillment_mode: null, delivery_type: 'rz_delivery' });
    expect(ttnFollowUpAction(beforeConfirm)).toBe('none');
    const afterConfirm = { ...beforeConfirm, status: 'confirmed', fulfillment_mode: 'supplier' };
    expect(ttnFollowUpAction(afterConfirm)).toBe('ship');
  });

  it('уже відвантажене повторно не відвантажуємо — лише доносимо номер', () => {
    expect(ttnFollowUpAction(order({ status: 'shipped', channel_code: 'rozetka' }))).toBe('push-rozetka');
    expect(ttnFollowUpAction(order({ status: 'shipped', channel_code: 'prom' }))).toBe('push-prom');
    expect(ttnFollowUpAction(order({ status: 'shipped', channel_code: 'retail' }))).toBe('none');
  });

  it('свій склад — не відвантажуємо автоматично (кількості підтверджує менеджер)', () => {
    expect(ttnFollowUpAction(order({ fulfillment_mode: 'own' }))).toBe('none');
    expect(ttnFollowUpAction(order({ fulfillment_mode: 'mixed', channel_code: 'prom' }))).toBe('push-prom');
  });

  it('точка видачі Rozetka: номер назад у Rozetka не пушимо', () => {
    expect(ttnFollowUpAction(order({
      fulfillment_mode: 'own', channel_code: 'rozetka', delivery_type: 'rozetka_delivery', status: 'shipped',
    }))).toBe('none');
  });

  it('нове замовлення маркетплейсу: номер не пушимо, поки не підтверджене', () => {
    expect(ttnFollowUpAction(order({ status: 'new', fulfillment_mode: 'own', channel_code: 'rozetka' }))).toBe('none');
    expect(ttnFollowUpAction(order({ status: 'new', fulfillment_mode: 'own', channel_code: 'prom' }))).toBe('none');
  });
});
