import { rozetkaFetch } from './rozetka-api';
import { classifyReason, isAutoFixable, type FixKind } from './rozetka-content-reasons';

/**
 * Контент карток на Rozetka: заявки на зміну і причини блокувань.
 *
 * Ключове про механіку, бо вона неочевидна і коштувала нам місяця здогадок:
 * після заведення позиції контент (назва, опис, фото, характеристики) РЕДАГУВАТИ
 * НАПРЯМУ НЕ МОЖНА — `can_update_content_fields: false` у всіх позицій. Зміна в
 * нашому фіді не застосовується одразу, а створює ЗАЯВКУ, яку підтверджує
 * модератор Rozetka. Тобто окремого методу «подати заявку» в API немає: заявка
 * з'являється сама, наша частина — правильно наповнити фід і стежити за
 * результатом, чим цей модуль і займається.
 */

export type RozetkaChangedFields = Partial<Record<
  'name' | 'name_ua' | 'description' | 'description_ua' | 'picture' | 'params' | 'docket' | 'docket_ua',
  boolean
>>;

export type RozetkaChangeItem = {
  price_offer_id: string;          // наш SKU
  rz_item_id: number | null;
  name: string;
  url: string | null;
  photo: string[] | null;
  upload_status_title: string | null;
  blocked_reason: { reason_id: number; title: string; affected_fields?: string[] }[] | null;
  changes: {
    changed_fields: RozetkaChangedFields | null;
    status: string | null;         // «Очікує підтвердження» | «Відхилено» | …
    reasons: string[] | null;
    change_date: string | null;
  } | null;
};

// rozetkaFetch віддає вже розгорнутий json.content, тому тут — саме вміст, а не
// конверт із success/content (на цьому й вилізли нулі в першій версії розділу).
type Paged<T> = { items?: T[]; _meta?: { pageCount?: number } };

async function fetchAllPages<T>(path: string, maxPages = 30): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const c = await rozetkaFetch<Paged<T>>(`${path}${sep}page=${page}&per_page=100`);
    out.push(...(c?.items ?? []));
    if (page >= (c?._meta?.pageCount ?? 1)) break;
  }
  return out;
}

/** Заявки на зміну контенту — реєстр Rozetka (GET /goods/changes). */
export function getRozetkaContentChanges(): Promise<RozetkaChangeItem[]> {
  return fetchAllPages<RozetkaChangeItem>('/goods/changes');
}

/** Усі позиції кабінету — потрібні через blocked_reason (за що зняли поле). */
export function getRozetkaGoods(): Promise<RozetkaChangeItem[]> {
  return fetchAllPages<RozetkaChangeItem>('/goods/all');
}

// Класифікація причин — у сусідньому модулі без серверних залежностей: її
// імпортує ще й клієнтський розділ адмінки.
export { classifyReason, isAutoFixable, type FixKind } from './rozetka-content-reasons';

export type ContentProblem = {
  sku: string;
  name: string;
  url: string | null;
  reasons: string[];
  kinds: FixKind[];
  /** Останній статус заявки, якщо вона є */
  changeStatus: string | null;
  changeDate: string | null;
  /** Виправлення вже подане і чекає модератора — чіпати текст ще раз немає сенсу */
  pending: boolean;
  autoFixable: boolean;
};

export type ContentSummary = {
  pending: number;
  rejected: number;
  /** Скільки заявок міняють кожне поле — видно, що саме поїхало на модерацію */
  byField: Record<string, number>;
  /** Причини відмов і блокувань: скільки позицій під кожною */
  byReason: { title: string; count: number; kind: FixKind }[];
  problems: ContentProblem[];
  checkedAt: string;
};

/**
 * Зведення для адмінки. Джерел два і вони про різне: /goods/changes — доля наших
 * правок, /goods/all — за що Rozetka зняла поле в самої позиції. Показувати треба
 * обидва, інакше «все ок, заявки в черзі» приховає 252 картки з відхиленим описом.
 */
export function buildContentSummary(
  changes: RozetkaChangeItem[],
  goods: RozetkaChangeItem[],
  checkedAt: string,
): ContentSummary {
  const byField: Record<string, number> = {};
  let pending = 0, rejected = 0;

  for (const it of changes) {
    const st = it.changes?.status ?? '';
    if (st.toLowerCase().includes('відхил')) rejected++;
    else if (st) pending++;
    for (const [field, changed] of Object.entries(it.changes?.changed_fields ?? {})) {
      if (changed) byField[field] = (byField[field] ?? 0) + 1;
    }
  }

  // Позиції, по яких уже висить свіжа заявка: їхній текст ми щойно замінили, і
  // перегенерувати його вдруге — це витратити гроші й подати ту саму правку ще
  // раз. Тому кнопка для них не пропонується, поки модератор не відповість.
  const pendingSkus = new Set(
    changes
      .filter(it => (it.changes?.status ?? '').toLowerCase().includes('очіку'))
      .map(it => it.price_offer_id),
  );

  const problems = new Map<string, ContentProblem>();
  const add = (it: RozetkaChangeItem, reasons: string[]) => {
    if (!reasons.length) return;
    const prev = problems.get(it.price_offer_id);
    const all = [...new Set([...(prev?.reasons ?? []), ...reasons])];
    const pending = pendingSkus.has(it.price_offer_id);
    problems.set(it.price_offer_id, {
      sku: it.price_offer_id,
      name: it.name,
      url: it.url ?? prev?.url ?? null,
      reasons: all,
      kinds: [...new Set(all.map(classifyReason))],
      changeStatus: it.changes?.status ?? prev?.changeStatus ?? null,
      changeDate: it.changes?.change_date ?? prev?.changeDate ?? null,
      pending,
      autoFixable: !pending && all.some(isAutoFixable),
    });
  };

  for (const it of changes) {
    if ((it.changes?.status ?? '').toLowerCase().includes('відхил')) add(it, it.changes?.reasons ?? []);
  }
  for (const it of goods) {
    add(it, (it.blocked_reason ?? []).map(b => b.title));
  }

  const reasonCounts = new Map<string, number>();
  for (const p of problems.values()) {
    for (const r of p.reasons) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }

  return {
    pending,
    rejected,
    byField,
    byReason: [...reasonCounts.entries()]
      .map(([title, count]) => ({ title, count, kind: classifyReason(title) }))
      .sort((a, b) => b.count - a.count),
    problems: [...problems.values()].sort((a, b) => Number(b.autoFixable) - Number(a.autoFixable) || a.sku.localeCompare(b.sku)),
    checkedAt,
  };
}
