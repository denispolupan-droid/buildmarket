import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('../lib/alert', () => ({ alertAdmin: vi.fn() }));
import { alertAdmin } from '../lib/alert';
import { withApi } from '../lib/api-handler';
import { log, logContext } from '../lib/log';

const req = (rid?: string) => new NextRequest('http://localhost/api/x', { headers: rid ? { 'x-vercel-id': rid } : {} });

describe('withApi — обгортка обробників app/api (03.11.2026)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('віддає відповідь обробника як є + заголовок x-request-id з x-vercel-id', async () => {
    const h = withApi('t/ok', async () => NextResponse.json({ ok: true }, { status: 201 }));
    const res = await h(req('fra1::abc'), {});
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('x-request-id')).toBe('fra1::abc');
    expect(alertAdmin).not.toHaveBeenCalled();
  });

  it('без x-vercel-id генерує uuid', async () => {
    const h = withApi('t/ok', async () => new Response('x'));
    const res = await h(req(), {});
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('необроблена помилка → 500 JSON з rid, лог api.unhandled, алерт', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = withApi('t/boom', async () => { throw new Error('kaboom'); });
    const res = await h(req('rid-1'), {});
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Внутрішня помилка сервера', rid: 'rid-1' });
    expect(res.headers.get('x-request-id')).toBe('rid-1');
    expect(alertAdmin).toHaveBeenCalledWith('API t/boom: необроблена помилка', expect.stringContaining('kaboom'));
    const line = JSON.parse(String(err.mock.calls[0][0]));
    expect(line).toMatchObject({ level: 'error', event: 'api.unhandled', rid: 'rid-1', route: 't/boom', err: { message: 'kaboom' } });
    err.mockRestore();
  });

  it('log.* усередині обробника несе rid і route; поза ним — без них', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {});
    const h = withApi('t/ctx', async () => { log.info('x.happened', { n: 1 }); expect(logContext()?.rid).toBe('rid-2'); return new Response('ok'); });
    await h(req('rid-2'), {});
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({ level: 'info', event: 'x.happened', rid: 'rid-2', route: 't/ctx', n: 1 });
    log.info('outside');
    expect(JSON.parse(String(out.mock.calls[1][0]))).not.toHaveProperty('rid');
    out.mockRestore();
  });
});
