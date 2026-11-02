import { rozetkaStatusLabel, isRozetkaAhead } from '../../../lib/rozetka-status';
import type { Order } from './types';

// Спільний вигляд міток рядка (SMART, ТОЧКА, ⛓, повернення…). Раніше кожна
// несла власний копіпаст зі стилями, і нова мітка щоразу трохи з'їжджала.
export const fmtMoney = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Назва позиції з брендом — без дубля, якщо бренд уже є в назві («Tangit Tangit Нитка…»). */
export function itemTitle(item: { brand?: string | null; name: string }): string {
  const brand = (item.brand ?? '').trim();
  return brand && !item.name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${item.name}` : item.name;
}

export function rozetkaCabinet(order: Order): { label: string; ahead: boolean; at: string | null } | null {
  if (order.channel_code !== 'rozetka') return null;
  const raw = order.rozetka_data?.status;
  const id = typeof raw === 'number' ? raw : null;
  const label = rozetkaStatusLabel(id);
  if (!label) return null;
  const seen = order.rozetka_data?._status_synced_at;
  return { label, ahead: isRozetkaAhead(id, order.status), at: typeof seen === 'string' ? seen : null };
}

// Читабельний формат телефону: +380 (95) 172-76-41. Для tel: використовуємо сирий номер.
export function formatPhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '');
  const parts = (op: string, a: string, b: string, c: string) => `+380 (${op}) ${a}-${b}-${c}`;
  if (d.length === 12 && d.startsWith('380')) return parts(d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12));
  if (d.length === 10 && d.startsWith('0'))   return parts(d.slice(1, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10));
  return raw;
}
