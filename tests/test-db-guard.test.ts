import { describe, it, expect } from 'vitest';
import { assertTestDatabase } from './shared/test-db-guard';

describe('assertTestDatabase — тести не пишуть у прод (21.10.2026)', () => {
  it('бойовий проєкт — зупинка', () => {
    expect(() => assertTestDatabase('https://boaztnparrdoeknajprn.supabase.co')).toThrow(/БОЙОВУ/);
  });
  it('тестовий проєкт і порожня адреса — пропускає', () => {
    expect(() => assertTestDatabase('https://mdrextghmuzkyelpqsgp.supabase.co')).not.toThrow();
    expect(() => assertTestDatabase('')).not.toThrow();
  });
});
