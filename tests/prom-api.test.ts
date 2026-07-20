import { describe, it, expect } from 'vitest';
import { promDateParam } from '../lib/prom-api';

describe('promDateParam — нормалізація date_from для Prom /orders/list', () => {
  it('прибирає мілісекунди і Z (Date.toISOString) — інакше Prom повертає 0 замовлень', () => {
    expect(promDateParam('2026-07-20T18:10:44.174Z')).toBe('2026-07-20T18:10:44');
    expect(promDateParam('2026-07-20T18:10:44.000Z')).toBe('2026-07-20T18:10:44');
  });

  it('ISO без мілісекунд лишає як є', () => {
    expect(promDateParam('2026-07-20T18:10:44')).toBe('2026-07-20T18:10:44');
  });

  it('date-only лишає як є', () => {
    expect(promDateParam('2026-07-20')).toBe('2026-07-20');
  });
});
