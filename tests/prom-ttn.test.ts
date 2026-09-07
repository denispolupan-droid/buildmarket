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

import { setPromTTN, promAcceptsTtnFor, promDeliveryTypeForTtn, needsPromTtnRepush } from '../lib/prom-api';

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

  it('мережевий обрив (fetch failed / ETIMEDOUT) — повторює і доходить з третьої спроби', async () => {
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls < 3) throw new TypeError('fetch failed', { cause: Object.assign(new Error('write ETIMEDOUT'), { code: 'ETIMEDOUT' }) });
      return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
    }));
    const p = setPromTTN(1, '20450000000000');
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBeUndefined();
    expect(calls).toBe(3);
    vi.useRealTimers();
  });

  it('третій обрив підряд — кидає, не зациклюється', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const p = setPromTTN(1, '20450000000000');
    p.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow(/fetch failed/);
    vi.useRealTimers();
  });

  it('відмову Prom по суті НЕ повторює — один запит', async () => {
    const fn = stubFetch({ status: 'error', message: 'Ошибка валидации', errors: { declaration_id: ['Неправильный номер декларации'] } });
    await expect(setPromTTN(1, '101670284295', 'rz_delivery')).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
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

describe('допуш ЕН у кроні Prom — чисті правила', () => {
  it('Prom приймає через API лише НП / Укрпошту / Meest', () => {
    expect(promAcceptsTtnFor('nova_poshta')).toBe(true);
    expect(promAcceptsTtnFor('nova')).toBe(true);
    expect(promAcceptsTtnFor(null)).toBe(true);           // старі замовлення без типу — НП
    expect(promAcceptsTtnFor('ukrposhta')).toBe(true);
    expect(promAcceptsTtnFor('meest')).toBe(true);
    expect(promAcceptsTtnFor('rz_delivery')).toBe(false); // «Магазини Rozetka» веде сам Prom (PRM-…)
    expect(promAcceptsTtnFor('pickup')).toBe(false);
  });

  it('мапінг наших типів у значення Prom', () => {
    expect(promDeliveryTypeForTtn('rz_delivery')).toBe('rozetka_delivery');
    expect(promDeliveryTypeForTtn('nova')).toBe('nova_poshta');
    expect(promDeliveryTypeForTtn(undefined)).toBe('nova_poshta');
    expect(promDeliveryTypeForTtn('ukrposhta')).toBe('ukrposhta');
  });

  it('досилати треба, коли в Prom порожньо або інший номер; збіг по цифрах — не треба', () => {
    expect(needsPromTtnRepush('20451529551986', null)).toBe(true);
    expect(needsPromTtnRepush('20451529551986', '')).toBe(true);
    expect(needsPromTtnRepush('20451529551986', '20451529551986')).toBe(false);
    expect(needsPromTtnRepush('20451529551986', '2045 1529 551986')).toBe(false);
    expect(needsPromTtnRepush('20451529551986', '20451529509539')).toBe(true);
    expect(needsPromTtnRepush(null, null)).toBe(false);   // без нашого номера нічого слати
  });
});
