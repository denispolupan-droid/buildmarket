import { describe, it, expect, vi, beforeEach } from 'vitest';

// Токен береться з app_settings — підміняємо клієнт Supabase цілком
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { value: 'test-token' } }) }),
      }),
    }),
  }),
}));

import { setPromTTN } from '../lib/prom-api';

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('setPromTTN — відмова Prom приходить з HTTP 200 у тілі', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('успіх без помилок у тілі — не кидає', async () => {
    stubFetch({ status: 'success' });
    await expect(setPromTTN(1, '20450000000000')).resolves.toBeUndefined();
  });

  it('валідація {"status":"error","errors":{...}} — кидає з деталями (кейс #26091055)', async () => {
    stubFetch({ status: 'error', message: 'Ошибка валидации', errors: { declaration_id: ['Неправильный номер декларации'] } });
    await expect(setPromTTN(425782942, '101670284295', 'rz_delivery'))
      .rejects.toThrow(/Неправильный номер декларации/);
  });

  it('{"error":"…"} без status — теж помилка', async () => {
    stubFetch({ error: 'В заказе указан другой способ доставки', errors: null });
    await expect(setPromTTN(1, '20450000000000')).rejects.toThrow(/другой способ доставки/);
  });

  it('rz_delivery → rozetka_delivery, nova → nova_poshta у тілі запиту', async () => {
    const fn = stubFetch({});
    await setPromTTN(7, '101670284295', 'rz_delivery');
    await setPromTTN(8, '20450000000000', 'nova');
    const bodies = fn.mock.calls.map(c => JSON.parse(((c as unknown[])[1] as RequestInit).body as string));
    expect(bodies[0]).toEqual({ order_id: 7, declaration_id: '101670284295', delivery_type: 'rozetka_delivery' });
    expect(bodies[1]).toEqual({ order_id: 8, declaration_id: '20450000000000', delivery_type: 'nova_poshta' });
  });
});
