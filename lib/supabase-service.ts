import { createClient } from '@supabase/supabase-js';
import type { Database as GeneratedDatabase } from '../types/database.types';

// Service-role клієнт і типи схеми — окремим легким модулем, без lib/env
// (той валідує змінні ще при імпорті) і без next/cache. Його тягнуть ~200
// роутів, кронів і lib-модулів маркетплейсів; раніше кожен створював клієнт
// сам через createClient(URL, SERVICE_ROLE_KEY) без типів. lib/supabase
// реекспортує все звідси — старі імпорти працюють.

/**
 * Схема БД для клієнта — згенерована, з однією поправкою: генератор Supabase
 * описує аргументи SQL-функцій як не-null, хоча функції приймають NULL
 * (record_money_txn: p_debit_party, p_order_id, p_doc_id …). Без поправки
 * кожен виклик потребував би касту. Поправка лише розширює тип аргументів —
 * таблиці, рядки й результати функцій лишаються точними. jsonb-поля приводяться
 * явно через asJson (нижче).
 */
type NullableArgs<F> = {
  [K in keyof F]: F[K] extends { Args: infer A }
    ? Omit<F[K], 'Args'> & { Args: { [P in keyof A]: A[P] | null } }
    : F[K];
};
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Functions'> & {
    Functions: NullableArgs<GeneratedDatabase['public']['Functions']>;
  };
};
export type { Json } from '../types/database.types';

/**
 * Обʼєкт → Json для запису в jsonb. Наші meta — Record<string, unknown>, а
 * згенерований Json рекурсивний і unknown не приймає; JSON.stringify однаково
 * відкине undefined/функції, тож приведення безпечне для даних, які ми пишемо.
 */
export function asJson(value: unknown): import('../types/database.types').Json {
  return value as import('../types/database.types').Json;
}

/** Тип patch-обʼєкта для `.update()` / `.insert()` конкретної таблиці (замість Record<string, unknown>). */
export type TableUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type TableInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];

// ── Клієнт з service role — тільки для сервера ────────────────────────────────
// Ніколи не використовувати на клієнті!
// Без власних перевірок змінних: порожній URL/ключ supabase-js відхиляє сам
// («supabaseUrl is required»), а юніт-тести підміняють createClient моком і
// змінних не задають — як і з колишніми локальними createClient(...).
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
