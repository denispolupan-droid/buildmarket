import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Токен беремо з app_settings — підміняємо клієнт, щоб тест не ходив у базу.
vi.mock('@supabase/supabase-js', () => {
  const settings: Record<string, string> = {
    rozetka_token: 'test-token',
    rozetka_token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  };
  return {
    createClient: () => ({
      from: () => ({
        select: () => ({
          eq: (_col: string, key: string) => ({
            maybeSingle: async () => ({ data: { value: settings[key] } }),
          }),
        }),
        upsert: async () => ({}),
      }),
    }),
  };
});

const { setRozetkaOrderStatusChained } = await import('../lib/rozetka-api');

/**
 * Кабінет Rozetka в мініатюрі — з тими правилами, які ми вивчили дорого:
 *  • перехід у 61/3 дозволений лише з 26 (з 15 «Некоректна ТТН» — ні);
 *  • перехід у 26 стирає ТТН;
 *  • PUT без зміни статусу повертає success: true, але ТТН НЕ міняє.
 * Останнє — найгірше: пуш «проходив», а номер у покупця лишався старий.
 */
function fakeCabinet(initial: { status: number; ttn: string | null }) {
  const state = { ...initial };
  const calls: { status?: number; ttn?: string }[] = [];

  const fetchMock = vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

    if (!init?.method || init.method === 'GET') {
      return json({ success: true, content: { id: 1, status: state.status, ttn: state.ttn, status_data: { title: 'x' } } });
    }
    const body = JSON.parse(init.body ?? '{}') as { status?: number; ttn?: string };
    calls.push(body);

    if (body.status === undefined) {
      // Мовчазний no-op живого кабінету: відповідь успішна, стан не змінився.
      return json({ success: true, content: { id: 1, status: state.status, ttn: state.ttn } });
    }
    const allowed = body.status === 26 || (state.status === 26 && (body.status === 61 || body.status === 3));
    if (!allowed) {
      return json({
        success: false,
        errors: { code: 1005, message: 'check_correctness_of_data',
          details: { status: [`Неможливо змінити статус. З ${state.status} на ${body.status}. Наступний статус недоступний.`] } },
      });
    }
    state.status = body.status;
    state.ttn = body.status === 26 ? null : (body.ttn ?? state.ttn);
    return json({ success: true, content: { id: 1, status: state.status, ttn: state.ttn } });
  });

  return { state, calls, fetchMock };
}

describe('setRozetkaOrderStatusChained', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });
  beforeEach(() => vi.clearAllMocks());

  it('заміна ТТН доходить, навіть коли кабінет уже на цільовому статусі', async () => {
    // Найтихіший збій: статус той самий, номер новий. Без forceTtn пуш просто
    // не відбувався, і покупець бачив стару накладну.
    const cab = fakeCabinet({ status: 61, ttn: 'OLD' });
    global.fetch = cab.fetchMock as unknown as typeof fetch;

    await setRozetkaOrderStatusChained(1, 61, { ttn: 'NEW', currentStatus: 61, forceTtn: true });

    expect(cab.state).toEqual({ status: 61, ttn: 'NEW' });
    expect(cab.calls.map(c => c.status)).toEqual([26, 61]);   // вийшли і повернулись
  });

  it('збережений статус застарів — драбина будується від живого', async () => {
    // Накладну видалили, Rozetka сама перевела замовлення в «Некоректна ТТН» (15),
    // а в rozetka_data лишилось 26. Саме через це пуш падав, хоча шлях існував.
    const cab = fakeCabinet({ status: 15, ttn: 'OLD' });
    global.fetch = cab.fetchMock as unknown as typeof fetch;

    await setRozetkaOrderStatusChained(1, 61, { ttn: 'NEW', currentStatus: 26, forceTtn: true });

    expect(cab.state).toEqual({ status: 61, ttn: 'NEW' });
  });

  it('повторний пуш того самого статусу без заміни ТТН не чіпає кабінет', async () => {
    // Захист від зворотного перекосу: драбина через 26 показала б покупцю, що
    // замовлення повернулося в обробку.
    const cab = fakeCabinet({ status: 61, ttn: 'SAME' });
    global.fetch = cab.fetchMock as unknown as typeof fetch;

    await setRozetkaOrderStatusChained(1, 61, { ttn: 'SAME', currentStatus: 61 });

    expect(cab.calls).toEqual([]);
    expect(cab.state).toEqual({ status: 61, ttn: 'SAME' });
  });

  it('звичайний дозволений перехід іде одним запитом', async () => {
    const cab = fakeCabinet({ status: 26, ttn: null });
    global.fetch = cab.fetchMock as unknown as typeof fetch;

    await setRozetkaOrderStatusChained(1, 61, { ttn: 'NEW', currentStatus: 26 });

    expect(cab.calls).toEqual([{ status: 61, ttn: 'NEW', seller_comment: undefined }]);
    expect(cab.state).toEqual({ status: 61, ttn: 'NEW' });
  });
});
