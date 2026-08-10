import { classifyReason, type FixKind } from './rozetka-content-reasons';
import type { ContentSummary } from './rozetka-content';

/**
 * Сторож модерації Rozetka: що змінилося з учора і чи варто про це писати.
 *
 * Кабінет мовчить про долю заявок — ні листа, ні позначки. Тому крон читає стан
 * щодоби і порівнює з попереднім знімком (таблиця rozetka_moderation_state,
 * міграція 094). Порівняння тут — чиста функція: у ній уся суть сторожа, і вона
 * має бути перевіреною, а не «сподіваюсь, працює як задумано».
 */

export type StoredState = { sku: string; change_status: string | null; reasons: string[] };

export type WatchDiff = {
  /** Позиції, у яких з'явилася відмова або нова причина — про них і алерт */
  newlyRejected: { sku: string; reasons: string[]; kinds: FixKind[] }[];
  /** Заявка була в черзі, а тепер її немає і претензій теж — правку прийняли */
  approved: string[];
  /** Скільки ще чекає рішення */
  stillPending: number;
  /** Стан, який треба зберегти як «бачили востаннє» */
  next: StoredState[];
};

const isRejected = (status: string | null | undefined) =>
  (status ?? '').toLowerCase().includes('відхил');
const isPending = (status: string | null | undefined) =>
  (status ?? '').toLowerCase().includes('очіку');

/**
 * Новою вважається відмова, якої в збереженому стані не було: або статус щойно
 * став «Відхилено», або додалася причина, якої раніше не бачили. Без другої
 * умови сторож проґавив би другу відмову по тій самій позиції — а це саме той
 * випадок, коли наше виправлення не спрацювало і про це треба знати.
 */
export function diffModeration(summary: ContentSummary, stored: StoredState[]): WatchDiff {
  const before = new Map(stored.map(s => [s.sku, s]));
  const newlyRejected: WatchDiff['newlyRejected'] = [];

  for (const p of summary.problems) {
    const prev = before.get(p.sku);
    const known = new Set(prev?.reasons ?? []);
    const fresh = p.reasons.filter(r => !known.has(r));
    const becameRejected = isRejected(p.changeStatus) && !isRejected(prev?.change_status);
    // Нічого нового: ті самі претензії в тому самому статусі — мовчимо, інакше
    // сторож писав би те саме щодня, і його перестали б читати.
    if (!fresh.length && !becameRejected) continue;

    const reasons = fresh.length ? fresh : p.reasons;
    newlyRejected.push({
      sku: p.sku,
      reasons,
      kinds: [...new Set(reasons.map(classifyReason))],
    });
  }

  // Прийнято: раніше висіла заявка, тепер по цій позиції взагалі немає ні заявки,
  // ні претензій — модератор підтвердив і питання закрите.
  const nowKnown = new Map(summary.problems.map(p => [p.sku, p]));
  const approved = stored
    .filter(s => isPending(s.change_status) && !nowKnown.has(s.sku))
    .map(s => s.sku);

  const next: StoredState[] = summary.problems.map(p => ({
    sku: p.sku,
    change_status: p.changeStatus,
    reasons: p.reasons,
  }));

  return { newlyRejected, approved, stillPending: summary.pending, next };
}

/** Текст алерта в Telegram. Порожній рядок — писати нема про що. */
export function buildWatchAlert(diff: WatchDiff, siteUrl: string): string {
  if (!diff.newlyRejected.length) return '';

  const byKind = new Map<FixKind, number>();
  for (const r of diff.newlyRejected) {
    for (const k of r.kinds) byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  const label: Record<FixKind, string> = {
    text: 'текст (лікується кнопкою)',
    photo: 'фото (потрібне інше зображення)',
    chars: 'характеристики',
    other: 'інше',
  };
  const parts = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${label[k]} — ${n}`);

  return [
    `${diff.newlyRejected.length} нових відмов модерації`,
    parts.join(', '),
    diff.approved.length ? `Підтверджено за цей час: ${diff.approved.length}` : null,
    `Ще на модерації: ${diff.stillPending}`,
    `${siteUrl}/admin/rozetka/moderation`,
  ].filter(Boolean).join('\n');
}
