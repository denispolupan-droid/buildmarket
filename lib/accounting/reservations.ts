/**
 * lib/accounting/reservations.ts
 *
 * Управление резервами товара.
 *
 * Резерв — «мягкая блокировка» qty_available без физического движения.
 * Триггер trg_stock_reserved_update автоматически обновляет stock_balance.qty_reserved.
 *
 * Жизненный цикл:
 *   createReservation  — заказ оформлен, товар зарезервирован
 *   releaseReservation — заказ отгружен или отменён, резерв снимается
 *   expireReservations — просроченные резервы (cron)
 *
 * Атомарность:
 *   createReservation вызывает SQL-функцию reserve_order_items(), которая
 *   блокирует строки stock_balance через SELECT FOR UPDATE перед проверкой
 *   доступного остатка. Параллельные вызовы для одного склада/SKU
 *   выполняются последовательно — oversell невозможен.
 */

import { createServiceClient } from '../supabase';
import type { CreateReservationInput, ReservationResult } from './types';

// ── Создание резерва (атомарное, через SQL-функцию) ───────────────────────────

export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationResult> {
  const db = createServiceClient();

  const { data, error } = await db.rpc('reserve_order_items', {
    p_order_id:     input.order_id,
    p_warehouse_id: input.warehouse_id,
    p_items:        input.items,  // [{sku, qty}]
  });

  if (error) throw error;

  const result = data as {
    success:      boolean;
    reserved:     { sku: string; qty: number }[];
    insufficient: { sku: string; requested: number; available: number }[];
  };

  return {
    success:      result.success,
    reserved:     result.reserved     ?? [],
    insufficient: result.insufficient ?? [],
  };
}

// ── Снятие резерва (атомарное, через SQL-функцию) ────────────────────────────

export async function releaseReservation(
  orderId: string,
  reason: 'shipped' | 'cancelled' | 'manual',
): Promise<void> {
  const db = createServiceClient();

  const { error } = await db.rpc('release_order_reservations', {
    p_order_id: orderId,
    p_reason:   reason,
  });

  if (error) throw error;
}

// ── Текущий резерв заказа ─────────────────────────────────────────────────────

export async function getOrderReservations(orderId: string) {
  const db = createServiceClient();

  const { data, error } = await db
    .from('stock_reservations')
    .select('sku, qty, warehouse_id, reserved_at, expires_at, reservation_status')
    .eq('order_id', orderId)
    .is('released_at', null);

  if (error) throw error;
  return data ?? [];
}

// ── Проверка: есть ли активный резерв для заказа ─────────────────────────────

export async function hasActiveReservation(orderId: string): Promise<boolean> {
  const db = createServiceClient();

  const { count, error } = await db
    .from('stock_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', orderId)
    .eq('reservation_status', 'active');

  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Истечение просроченных резервов (вызывать из cron) ────────────────────────

export async function expireReservations(): Promise<number> {
  const db = createServiceClient();

  const { data, error } = await db.rpc('expire_stock_reservations');
  if (error) throw error;

  return (data as number) ?? 0;
}
