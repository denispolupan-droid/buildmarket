import { describe, it, expect } from 'vitest';
import { modeFromSources, type ItemSource } from '../lib/orders/fulfillment-mode';

const m = (pairs: [string, ItemSource][]) => new Map(pairs);

describe('modeFromSources', () => {
  it('усе від постачальника — supplier', () => {
    expect(modeFromSources(m([['a', 'dropship'], ['b', 'dropship']]))).toBe('supplier');
  });

  it('усе зі свого складу — own', () => {
    expect(modeFromSources(m([['a', 'own']]))).toBe('own');
  });

  it('хоч одна позиція звідти й звідти — mixed', () => {
    // Саме цей випадок журнал показував як «Пост.» (замовлення #26081151):
    // лист постачальнику через це йшов із зайвою позицією.
    expect(modeFromSources(m([['a', 'dropship'], ['b', 'own']]))).toBe('mixed');
  });

  it('порожнє замовлення не вважається змішаним', () => {
    expect(modeFromSources(m([]))).toBe('supplier');
  });
});
