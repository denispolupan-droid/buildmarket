import { describe, it, expect, vi, beforeEach } from 'vitest';

// redirect() у Next кидає виняток і не повертає керування — відтворюємо це,
// інакше тест не відрізнить «редіректнуло» від «пішло далі з null-юзером».
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); },
}));

let currentUser: unknown = null;
vi.mock('../lib/supabase-server', () => ({
  createSupabaseServer: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

const { requireCustomerPage } = await import('../lib/auth-guard');

/**
 * Регресія на 500-ку /cabinet: layout і page в App Router рендеряться
 * паралельно, тож перевірка в layout не рятує тіло сторінки — воно доходило
 * до `user!.id` і падало TypeError. Гейт мусить редіректити сам.
 */
describe('requireCustomerPage', () => {
  beforeEach(() => { currentUser = null; });

  it('без сесії — редірект на логін, а не падіння', async () => {
    await expect(requireCustomerPage('dropship')).rejects.toThrow('REDIRECT:/login?next=/cabinet');
  });

  it('чужа роль — редірект у свій кабінет', async () => {
    currentUser = { id: 'u1', app_metadata: { account_type: 'dealer' } };
    await expect(requireCustomerPage('dropship')).rejects.toThrow('REDIRECT:/account');
  });

  it('дропшипер проходить і отримує свого юзера', async () => {
    currentUser = { id: 'u2', app_metadata: { account_type: 'dropship' } };
    const user = await requireCustomerPage('dropship');
    expect(user.id).toBe('u2');
  });

  it('без списку ролей пускає будь-якого автентифікованого', async () => {
    currentUser = { id: 'u3', app_metadata: {} };
    const user = await requireCustomerPage();
    expect(user.id).toBe('u3');
  });
});
