import { describe, it, expect } from 'vitest';
import { isNpRateLimited, withNpRetry } from '../lib/np-retry';

const limited = { success: false, errors: ['To many requests'] };
const ok = { success: true, errors: [], data: [{ Number: '57517' }] };
const bad = { success: false, errors: ['City not found'] };

describe('isNpRateLimited', () => {
  it('розпізнає помилку ліміту в написанні НП і звичайному', () => {
    expect(isNpRateLimited(limited)).toBe(true);
    expect(isNpRateLimited({ success: false, errors: ['Too many requests'] })).toBe(true);
  });
  it('успіх, інша помилка, порожня відповідь — не ліміт', () => {
    expect(isNpRateLimited(ok)).toBe(false);
    expect(isNpRateLimited(bad)).toBe(false);
    expect(isNpRateLimited(null)).toBe(false);
    expect(isNpRateLimited({ success: false, errors: null })).toBe(false);
  });
});

describe('withNpRetry', () => {
  const noSleep = async () => {};

  it('повторює після ліміту і віддає перший успіх', async () => {
    const answers = [limited, limited, ok];
    let calls = 0;
    const res = await withNpRetry(async () => answers[calls++], { sleep: noSleep });
    expect(res).toBe(ok);
    expect(calls).toBe(3);
  });

  it('змістовну помилку не повторює', async () => {
    let calls = 0;
    const res = await withNpRetry(async () => { calls++; return bad; }, { sleep: noSleep });
    expect(res).toBe(bad);
    expect(calls).toBe(1);
  });

  it('після вичерпання спроб віддає останню відповідь із лімітом', async () => {
    let calls = 0;
    const res = await withNpRetry(async () => { calls++; return limited; }, { attempts: 3, sleep: noSleep });
    expect(res).toBe(limited);
    expect(calls).toBe(3);
  });

  it('пауза подвоюється: 350, 700, 1400', async () => {
    const waits: number[] = [];
    let calls = 0;
    await withNpRetry(async () => { calls++; return limited; }, { attempts: 4, baseDelayMs: 350, sleep: async ms => { waits.push(ms); } });
    expect(waits).toEqual([350, 700, 1400]);
  });
});
