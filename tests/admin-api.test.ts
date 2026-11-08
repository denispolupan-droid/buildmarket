import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminFetcher, AdminApiError } from '../lib/admin/api';

const respond = (status: number, body: string) => vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status })));

describe('adminFetcher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('повертає JSON успішної відповіді', async () => {
    respond(200, '{"months":[1]}');
    await expect(adminFetcher('/x')).resolves.toEqual({ months: [1] });
  });
  it('помилка API — текст, статус і rid із відповіді withApi', async () => {
    respond(500, '{"error":"Збій","rid":"r1"}');
    await expect(adminFetcher('/x')).rejects.toMatchObject({ message: 'Збій', status: 500, rid: 'r1' });
  });
  it('помилка без JSON — зрозумілий текст зі статусом', async () => {
    respond(502, '<html>');
    await expect(adminFetcher('/x')).rejects.toMatchObject({ message: 'Помилка завантаження (502)', status: 502 });
  });
  it('200 без JSON — помилка, а не undefined у екрані', async () => {
    respond(200, '<html>');
    await expect(adminFetcher('/x')).rejects.toBeInstanceOf(AdminApiError);
  });
  it('збій мережі — «Мережева помилка»', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed'); }));
    await expect(adminFetcher('/x')).rejects.toMatchObject({ message: 'Мережева помилка', status: 0 });
  });
});
