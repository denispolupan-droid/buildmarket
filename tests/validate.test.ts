import { describe, it, expect } from 'vitest';
import { parseBody, zMoney, zYmd, zText, z } from '../lib/validate';

const req = (body: unknown) => new Request('http://x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('lib/validate', () => {
  const schema = z.object({ amount: zMoney, date: zYmd, note: zText(10) });

  it('приймає число й числовий рядок, округлює до копійки', async () => {
    const r = await parseBody(req({ amount: '100.456', date: '2026-10-31' }), schema);
    expect(r.ok && r.data).toEqual({ amount: 100.46, date: '2026-10-31', note: undefined });
  });

  it('відхиляє нечислову, нульову й завелику суму', async () => {
    for (const amount of ['abc', 0, -5, 20_000_000]) {
      const r = await parseBody(req({ amount, date: '2026-10-31' }), schema);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(400);
    }
  });

  it('відхиляє неіснуючу дату й чужий формат', async () => {
    for (const date of ['2026-02-30', '31.10.2026', '2026-1-1']) {
      expect((await parseBody(req({ amount: 1, date }), schema)).ok).toBe(false);
    }
  });

  it('битий JSON — 400, а не 500', async () => {
    const r = await parseBody(req('{not json'), schema);
    expect(r.ok).toBe(false);
  });

  it('текст: обрізає пробіли, порожній → undefined, довгий — помилка', async () => {
    expect((await parseBody(req({ amount: 1, date: '2026-10-31', note: '  ок  ' }), schema)).ok && true).toBe(true);
    expect((await parseBody(req({ amount: 1, date: '2026-10-31', note: 'x'.repeat(11) }), schema)).ok).toBe(false);
  });
});

describe('lib/validate — порожні поля форми', () => {
  it('null у тексті й порожня дата — «не вказано»', async () => {
    const { zYmdOpt } = await import('../lib/validate');
    const s = z.object({ note: zText(), d: zYmdOpt });
    const r = await parseBody(req({ note: null, d: '' }), s);
    expect(r.ok && r.data).toEqual({ note: undefined, d: undefined });
  });
});
