import { describe, it, expect } from 'vitest';
import { cwvCategory, cwvOverall, trendState, diffReading, type Reading } from '../lib/metric-watch-rules';

describe('cwvCategory — пороги Google', () => {
  it('межі включно: 2500 мс ще «добре», 4000 — ще «потребує покращення»', () => {
    expect(cwvCategory('largest_contentful_paint', 2500)).toBe('good');
    expect(cwvCategory('largest_contentful_paint', 2501)).toBe('needs_improvement');
    expect(cwvCategory('largest_contentful_paint', 4000)).toBe('needs_improvement');
    expect(cwvCategory('largest_contentful_paint', 4001)).toBe('poor');
    expect(cwvCategory('cumulative_layout_shift', 0.1)).toBe('good');
    expect(cwvCategory('cumulative_layout_shift', 0.26)).toBe('poor');
    expect(cwvCategory('interaction_to_next_paint', 350)).toBe('needs_improvement');
  });
});

describe('cwvOverall — за найгіршою метрикою', () => {
  it('один «поганий» CLS робить загальну оцінку «погано»', () => {
    const r = cwvOverall({ largest_contentful_paint: 1800, interaction_to_next_paint: 120, cumulative_layout_shift: 0.3 });
    expect(r?.overall).toBe('poor');
    expect(r?.parts).toHaveLength(3);
    expect(r?.parts[2]).toContain('CLS 0.30');
  });
  it('без жодної метрики — null (немає даних)', () => {
    expect(cwvOverall({})).toBeNull();
  });
  it('відсутні метрики пропускає', () => {
    expect(cwvOverall({ largest_contentful_paint: 3000 })?.overall).toBe('needs_improvement');
  });
});

describe('trendState — тиждень проти середнього за 4', () => {
  const opts = { dropPct: 30, growPct: 40, minBase: 20 };
  it('падіння на 30 % і більше', () => {
    expect(trendState(70, 400, opts)).toMatchObject({ state: 'drop', changePct: -30, base: 100 });
  });
  it('звичайні коливання — stable', () => {
    expect(trendState(76, 400, opts).state).toBe('stable');
    expect(trendState(125, 664, opts)).toMatchObject({ state: 'stable', changePct: -25 });
  });
  it('зростання', () => {
    expect(trendState(140, 400, opts).state).toBe('growth');
  });
  it('малі обсяги — low_data, відсотки не рахуємо', () => {
    expect(trendState(3, 40, opts).state).toBe('low_data');
  });
  it('поява трафіку з нуля — зростання, а не ділення на нуль', () => {
    expect(trendState(25, 0, opts)).toMatchObject({ state: 'growth', changePct: 100 });
  });
});

describe('diffReading — коли писати', () => {
  const r = (state: string, set?: string[]): Reading => ({ state, level: 'info', text: '', set });
  it('перша перевірка не є зміною', () => {
    expect(diffReading(undefined, r('ok'))).toBeNull();
  });
  it('той самий стан і набір — мовчимо', () => {
    expect(diffReading({ state: 'some', set: ['a', 'b'] }, r('some', ['b', 'a']))).toBeNull();
  });
  it('зміна стану', () => {
    expect(diffReading({ state: 'no_data' }, r('poor'))).toEqual({ added: [], removed: [], stateChanged: true });
  });
  it('у наборі зʼявилось і зникло', () => {
    expect(diffReading({ state: 'some', set: ['a', 'b'] }, r('some', ['b', 'c']))).toEqual({ added: ['c'], removed: ['a'], stateChanged: false });
  });
});
