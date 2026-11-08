'use client';

import { useCallback } from 'react';
import useSWR, { type SWRConfiguration } from 'swr';

/**
 * Спільний шар читання даних адмінки (етап 2, docs/ADMIN-MODERNIZATION-PLAN.md) замість
 * копій useEffect + fetch + useState(loading/error) у кожному екрані.
 */
export class AdminApiError extends Error {
  constructor(message: string, readonly status: number, readonly rid?: string) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/** GET JSON: помилка API ({ error, rid } від withApi) і збій мережі стають AdminApiError. */
export async function adminFetcher<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new AdminApiError('Мережева помилка', 0);
  }
  const body = await res.json().catch(() => null) as (T & { error?: string; rid?: string }) | null;
  if (!res.ok) throw new AdminApiError(body?.error ?? `Помилка завантаження (${res.status})`, res.status, body?.rid);
  if (body === null) throw new AdminApiError('Некоректна відповідь сервера', res.status);
  return body;
}

/**
 * Значення за замовчуванням повторюють поведінку колишніх useEffect: без автооновлення
 * при поверненні на вкладку й без автоповторів (база на nano-тарифі, бюджет IO).
 * dedupingInterval 0 — кожне відкриття екрана справді перечитує дані.
 * keepPreviousData вимкнено: у картках дані іншого контрагента не мають показуватись
 * під час завантаження; для списків із фільтрами вмикати явно.
 */
const DEFAULTS: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  shouldRetryOnError: false,
  dedupingInterval: 0,
};

/**
 * url = null — запит не виконується. `refresh()` перечитує дані й безпечний як
 * onClick: на відміну від SWR-івського mutate, не прийме подію кліку за нові дані.
 * `update(fn)` — локальна правка кешу результатом дії, без запиту.
 */
export function useAdminQuery<T>(url: string | null, config?: SWRConfiguration<T, AdminApiError>) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<T, AdminApiError>(url, adminFetcher, { ...DEFAULTS, ...config });
  const refresh = useCallback(() => mutate(), [mutate]);
  const update = useCallback((fn: (current: T | undefined) => T | undefined) => mutate(fn, { revalidate: false }), [mutate]);
  return { data, error, isLoading, isValidating, refresh, update };
}
