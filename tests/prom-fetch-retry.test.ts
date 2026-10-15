import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Токен Prom лежить у app_settings — у тесті підміняємо клієнт Supabase,
// щоб promFetch не ходив у базу.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: 'test-token' } }) }) }) }),
  }),
}));

const { getPromOrders, setPromTTN } = await import('../lib/prom-api');

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const fail = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => '<!doctype html><title>Error</title>' }) as unknown as Response;

/**
 * 12.10.2026 Prom двічі поспіль віддав 500 на /orders/list?status=canceled —
 * крон скасувань впав алертом. Читання повторюємо, запис — ні.
 */
describe('promFetch — повтор на 5xx', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  // Очікування чіпляємо ДО прокрутки таймерів: інакше проміс встигає впасти
  // без обробника, і vitest рапортує unhandled rejection.
  const settle = async <T>(assertion: Promise<T>): Promise<T> => {
    await vi.runAllTimersAsync();
    return assertion;
  };

  it('GET: 500, потім успіх — повертає дані, а не падає', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fail(500))
      .mockResolvedValueOnce(ok({ orders: [{ id: 1 }] }));
    vi.stubGlobal('fetch', fetchMock);

    await settle(expect(getPromOrders({ status: 'canceled' })).resolves.toEqual([{ id: 1 }]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET: мережевий обрив теж повторюється', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(ok({ orders: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await settle(expect(getPromOrders({})).resolves.toEqual([]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('GET: три невдачі поспіль — помилка назовні, не нескінченний цикл', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(502));
    vi.stubGlobal('fetch', fetchMock);

    await settle(expect(getPromOrders({})).rejects.toThrow('502'));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('GET: 4xx не повторюємо — це наша помилка (токен, параметри)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(401));
    vi.stubGlobal('fetch', fetchMock);

    await settle(expect(getPromOrders({})).rejects.toThrow('401'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Прив'язка накладної не ідемпотентна: 500 не означає «не застосувалось».
  it('POST: 500 НЕ повторюємо', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fail(500));
    vi.stubGlobal('fetch', fetchMock);

    await settle(expect(setPromTTN(123, '20451234567890', 'nova_poshta')).rejects.toThrow('500'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
