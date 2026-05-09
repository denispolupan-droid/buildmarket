/**
 * lib/accounting/reservations.ts
 *
 * Управление резервами товара.
 *
 * Резерв — это «мягкая блокировка» qty_available без физического движения.
 * Триггер trg_stock_reserved_update автоматически обновляет stock_balance.qty_reserved.
 *
 * Жизненный цикл:
 *   createReservation  — заказ оформлен, товар зарезервирован
 *   releaseReservation — заказ отгружен или отменён, резерв снимается
 *   expireReservations — просроченные резервы (cron)
 */

import { createServiceClient } from '../supabase';
import type { CreateReservationInput, ReservationResult, ReservationItem } from './types';

// ── Создание резерва ──────────────────────────────────────────────────────────

export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationResult> {
  const db = createServiceClient();

  const skus = input.items.map(i => i.sku);

  // Проверяем доступный остаток по всем SKU
  const { data: balances } = await db
    .from('stock_balance')
    .select('sku, qty_available')
    .eq('warehouse_id', input.warehouse_id)
    .in('sku', skus);

  const availableMap = new Map(
    (balances ?? []).map(b => [b.sku, Number(b.qty_available)]),
  );

  const toReserve: ReservationItem[] = [];
  const reserved:  ReservationItem[] = [];
  const insufficient: ReservationResult['insufficient'] = [];

  for (const item of input.items) {
    const available = availableMap.get(item.sku) ?? 0;
    if (available >= item.qty) {
      toReserve.push(item);
      reserved.push({ sku: item.sku, qty: item.qty });
    } else {
      insufficient.push({ sku: item.sku, requested: item.qty, available });
    }
  }

  if (toReserve.length > 0) {
    const records = toReserve.map(item => ({
      order_id:            input.order_id,
      sku:                 item.sku,
      warehouse_id:        input.warehouse_id,
      qty:                 item.qty,
      reservation_status:  'active',
      expires_at:          input.expires_at ?? null,
    }));

    const { error } = await db.from('stock_reservations').insert(records);
    if (error) throw error;
  }

  return {
    success:      insufficient.length === 0,
    reserved,
    insufficient,
  };
}

// ── Снятие резерва ────────────────────────────────────────────────────────────

export async function releaseReservation(
  orderId: string,
  reason: 'shipped' | 'cancelled' | 'manual',
): Promise<void> {
  const db = createServiceClient();

  const { error } = await db
    .from('stock_reservations')
    .update({
      released_at:        new Date().toISOString(),
      reservation_status: 'released',
      release_reason:     reason,
    })
    .eq('order_id', orderId)
    .is('released_at', null);  // только активные резервы

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

  // Вызываем функцию из БД (атомарно обновляет и balance)
  const { data, error } = await db.rpc('expire_stock_reservations');
  if (error) throw error;

  return (data as number) ?? 0;
}
