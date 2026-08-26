import { describe, it, expect } from 'vitest';
import { jwtSecondsLeft } from '../lib/novapay-jwt';

// NovaPay видає jwt рівно на хвилину — саме через це «кешований jwt» не рятував
// від ротації одноразового refresh-токена, а вона й рве ланцюжок сесії.
function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(payload)}.signature`;
}

describe('jwtSecondsLeft', () => {
  const now = Date.UTC(2026, 7, 26, 12, 0, 0);

  it('рахує залишок за exp', () => {
    expect(jwtSecondsLeft(makeJwt({ exp: now / 1000 + 45 }), now)).toBe(45);
  });

  it('протухлий дає 0, а не від\'ємне', () => {
    expect(jwtSecondsLeft(makeJwt({ exp: now / 1000 - 600 }), now)).toBe(0);
  });

  it('реальний строк життя NovaPay — 60 секунд', () => {
    const issued = Date.UTC(2026, 7, 25, 18, 1, 10);
    const jwt = makeJwt({ exp: Date.UTC(2026, 7, 25, 18, 2, 10) / 1000 });
    expect(jwtSecondsLeft(jwt, issued)).toBe(60);
  });

  it('порожнє, побите й без exp — 0, а не виняток', () => {
    expect(jwtSecondsLeft(null)).toBe(0);
    expect(jwtSecondsLeft('')).toBe(0);
    expect(jwtSecondsLeft('не-jwt')).toBe(0);
    expect(jwtSecondsLeft('a.b.c')).toBe(0);
    expect(jwtSecondsLeft(makeJwt({ sub: 'без exp' }), now)).toBe(0);
  });
});
