import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../lib/secrets', () => ({ readSetting: async () => 'mp_test' }));
vi.mock('../lib/supabase-service', () => ({ createServiceClient: () => ({}) }));

import { advanceEpicentrOrder, cancelEpicentrOrder, ourStatusToEpicentrStatus, ensureEpicentrTTN } from '../lib/epicentr-api';

/**
 * Імітація кабінету Епіцентру: процес з листа менеджера 11.11.2026 —
 * new → confirmed_by_merchant → confirmed → (ТТН) → sent; з new скасування лише canceled.
 */
const NEXT: Record<string, string[]> = {
  new:                   ['confirmed_by_merchant', 'canceled'],
  confirmed_by_merchant: ['confirmed', 'canceled_by_merchant'],
  confirmed:             ['canceled_by_merchant'],   // «Відправлено» Епіцентр ставить сам після ТТН
  sent:                  [],
};

let state: { status: string; ttn: string | null; calls: string[]; autoSentOnTtn: boolean };

function fakeFetch(url: string, init?: RequestInit): Promise<Response> {
  const path = new URL(url).pathname;
  const method = init?.method ?? 'GET';
  state.calls.push(`${method} ${path.replace(/^\/v\d\/oms\/orders\/E1/, '')}`);
  const json = (b: unknown, s = 200) => Promise.resolve(new Response(JSON.stringify(b), { status: s }));
  if (method === 'GET' && /\/v6\/oms\/orders\/E1$/.test(path)) {
    return json({ id: 'E1', number: '1', statusCode: state.status, address: { shipment: { number: state.ttn } } });
  }
  if (/allowed-statuses$/.test(path)) return json({ total: 0, items: (NEXT[state.status] ?? []).map(code => ({ code })) });
  const m = path.match(/change-status\/to\/(\w+)$/);
  if (m) {
    if (!(NEXT[state.status] ?? []).includes(m[1])) return Promise.resolve(new Response('{"error":"not allowed"}', { status: 400 }));
    state.status = m[1];
    return Promise.resolve(new Response(null, { status: 202 }));
  }
  if (/shipment-number$/.test(path)) {
    // Як живий Епіцентр (13.11, №26111077): номер — лише з «Підтверджено» і далі
    if (['new', 'confirmed_by_merchant'].includes(state.status)) return json({ code: 400, errors: { number: ['validation.invalid_status'] } }, 400);
    state.ttn = JSON.parse(String(init?.body)).number;
    if (state.autoSentOnTtn && state.status === 'confirmed') state.status = 'sent';
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(new Response('not found', { status: 404 }));
}

beforeEach(() => {
  state = { status: 'new', ttn: null, calls: [], autoSentOnTtn: true };
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('advanceEpicentrOrder — покроково, як вимагає Епіцентр', () => {
  it('наше «Підтверджено» → лише «Підтверджено продавцем» (контакти), не далі', async () => {
    expect(await advanceEpicentrOrder('E1', 'confirmed_by_merchant')).toBe('confirmed_by_merchant');
    expect(state.status).toBe('confirmed_by_merchant');
  });

  it('відвантаження з «Нове»: через confirmed_by_merchant і confirmed, потім ТТН → sent сам', async () => {
    expect(await advanceEpicentrOrder('E1', 'sent', { ttn: '20450000000001' })).toBe('sent');
    expect(state.ttn).toBe('20450000000001');
    expect(state.calls.filter(c => c.includes('change-status'))).toEqual([
      'POST /change-status/to/confirmed_by_merchant', 'POST /change-status/to/confirmed',
    ]);
  });

  it('уже «Відправлено» — нічого не робимо; без ТТН відправку не пробуємо', async () => {
    state.status = 'sent';
    expect(await advanceEpicentrOrder('E1', 'sent', { ttn: 'X' })).toBe('sent');
    expect(state.calls.some(c => c.startsWith('POST') || c.startsWith('PATCH'))).toBe(false);
    state.status = 'confirmed';
    await expect(advanceEpicentrOrder('E1', 'sent')).rejects.toThrow(/без ЕН/);
  });

  it('недозволений крок — зрозуміла помилка зі списком дозволених', async () => {
    state.status = 'confirmed';
    NEXT.confirmed_by_merchant = ['canceled_by_merchant'];
    state.status = 'confirmed_by_merchant';
    await expect(advanceEpicentrOrder('E1', 'confirmed')).rejects.toThrow(/confirmed_by_merchant → confirmed/);
    NEXT.confirmed_by_merchant = ['confirmed', 'canceled_by_merchant'];
  });
});

describe('cancelEpicentrOrder', () => {
  it('з «Нове» — canceled (без комісії), після підтвердження — canceled_by_merchant', async () => {
    expect(await cancelEpicentrOrder('E1')).toBe('canceled');
    state.status = 'confirmed_by_merchant';
    expect(await cancelEpicentrOrder('E1')).toBe('canceled_by_merchant');
  });
});

describe('ourStatusToEpicentrStatus', () => {
  it('confirmed/awaiting_stock → confirmed_by_merchant; picking → confirmed; shipped → sent', () => {
    expect(ourStatusToEpicentrStatus('confirmed')).toBe('confirmed_by_merchant');
    expect(ourStatusToEpicentrStatus('awaiting_stock')).toBe('confirmed_by_merchant');
    expect(ourStatusToEpicentrStatus('picking')).toBe('confirmed');
    expect(ourStatusToEpicentrStatus('shipped')).toBe('sent');
  });
});

describe("ensureEpicentrTTN — номер лише з «Підтверджено»", () => {
  it("№26111077: «Підтверджено продавцем» (у нас «Очікує оплати») → спершу confirmed, потім номер", async () => {
    state.status = "confirmed_by_merchant"; state.autoSentOnTtn = false;
    await ensureEpicentrTTN("E1", "20451586527521");
    expect(state.status).toBe("confirmed");
    expect(state.ttn).toBe("20451586527521");
  });
  it("уже «Підтверджено» — лише номер, статус не чіпаємо", async () => {
    state.status = "confirmed"; state.autoSentOnTtn = false;
    await ensureEpicentrTTN("E1", "X1");
    expect(state.calls.some(c => c.includes("change-status"))).toBe(false);
    expect(state.ttn).toBe("X1");
  });
  it("той самий номер уже в картці — нічого не робимо", async () => {
    state.status = "sent"; state.ttn = "X1";
    await ensureEpicentrTTN("E1", "X1");
    expect(state.calls.some(c => c.startsWith("POST") || c.startsWith("PATCH"))).toBe(false);
  });
});
