import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUSES, STATUS_RANK, isOrderStatus, transitionVerdict, buildStatusPatch,
} from '../lib/orders/status';

describe('order status — єдине джерело правди (12.10.2026)', () => {
  it('список статусів і ранг збігаються з тим, що було в PATCH і AdminOrders', () => {
    expect([...ORDER_STATUSES]).toEqual(['new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered', 'cancelled']);
    expect(STATUS_RANK).toMatchObject({ new: 0, confirmed: 1, awaiting_stock: 2, picking: 3, shipped: 4, delivered: 5 });
    expect(isOrderStatus('shipped')).toBe(true);
    expect(isOrderStatus('done')).toBe(false);
  });

  describe('transitionVerdict', () => {
    it('штатний шлях — дозволено без зауважень для всіх ролей', () => {
      for (const role of ['admin', 'manager', 'system'] as const) {
        expect(transitionVerdict('new', 'confirmed', role)).toEqual({ allowed: true, unusual: null });
        expect(transitionVerdict('confirmed', 'shipped', role)).toEqual({ allowed: true, unusual: null });
        expect(transitionVerdict('shipped', 'delivered', role)).toEqual({ allowed: true, unusual: null });
        expect(transitionVerdict('confirmed', 'delivered', role)).toEqual({ allowed: true, unusual: null }); // самовивіз
      }
    });

    it('той самий статус — ні помилки, ні зауваження', () => {
      expect(transitionVerdict('shipped', 'shipped', 'manager')).toEqual({ allowed: true, unusual: null });
    });

    it('менеджер: назад не можна, скасувати можна лише нове (правила PATCH до 12.10)', () => {
      expect(transitionVerdict('shipped', 'confirmed', 'manager').allowed).toBe(false);
      expect(transitionVerdict('confirmed', 'new', 'manager').allowed).toBe(false);
      expect(transitionVerdict('confirmed', 'cancelled', 'manager').allowed).toBe(false);
      expect(transitionVerdict('new', 'cancelled', 'manager')).toEqual({ allowed: true, unusual: null });
      expect(transitionVerdict('shipped', 'cancelled', 'admin').allowed).toBe(true);
    });

    it('адмін: зворотні ходи дозволені, але позначені як незвичні', () => {
      const back = transitionVerdict('shipped', 'confirmed', 'admin');
      expect(back.allowed).toBe(true);
      expect(back.allowed && back.unusual).toContain('Рух назад');

      const fromCancelled = transitionVerdict('cancelled', 'confirmed', 'admin');
      expect(fromCancelled.allowed && fromCancelled.unusual).toContain('скасованого');

      const fromDelivered = transitionVerdict('delivered', 'shipped', 'admin');
      expect(fromDelivered.allowed && fromDelivered.unusual).toContain('доставленого');

      // скасування після вручення — штатно (повернення оформлює документ)
      expect(transitionVerdict('delivered', 'cancelled', 'admin')).toEqual({ allowed: true, unusual: null });
    });
  });

  describe('buildStatusPatch', () => {
    const now = '2026-10-12T10:00:00.000Z';

    it('ставить мітку стану і дописує історію з джерелом', () => {
      const p = buildStatusPatch({ status: 'confirmed', status_history: [{ status: 'confirmed', at: 't0', by: 'x' }] }, 'shipped', 'admin@x', 'ship', now);
      expect(p).toEqual({
        status: 'shipped', shipped_at: now,
        status_history: [{ status: 'confirmed', at: 't0', by: 'x' }, { status: 'shipped', at: now, by: 'admin@x', via: 'ship' }],
      });
    });

    it('delivered / cancelled — свої мітки; історія без масиву — починається з нуля', () => {
      expect(buildStatusPatch({ status: 'shipped', status_history: null }, 'delivered', 'cron', 'delivery-sync', now))
        .toMatchObject({ status: 'delivered', delivered_at: now, status_history: [{ status: 'delivered', at: now, by: 'cron', via: 'delivery-sync' }] });
      expect(buildStatusPatch({ status: 'new' }, 'cancelled', 'u', 'patch', now)).toMatchObject({ cancelled_at: now });
    });

    it('confirmed_at — лише коли ще порожня', () => {
      expect(buildStatusPatch({ status: 'new', confirmed_at: null }, 'confirmed', 'u', 'patch', now)).toMatchObject({ confirmed_at: now });
      expect(buildStatusPatch({ status: 'new', confirmed_at: '2026-01-01' }, 'confirmed', 'u', 'patch', now)).not.toHaveProperty('confirmed_at');
    });

    it('той самий статус — порожній патч (нічого не перезаписується)', () => {
      expect(buildStatusPatch({ status: 'shipped' }, 'shipped', 'u', 'patch', now)).toEqual({});
    });
  });
});
