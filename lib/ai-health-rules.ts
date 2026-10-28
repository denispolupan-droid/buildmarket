/**
 * Класифікація збоїв Anthropic API для ШІ-агентів (чисто, під тести).
 *
 * 04.10.2026 на балансі API скінчились гроші — і агенти просто замовкли:
 * чернетки в чатах МП не створювались, а з ними не приходив і сам алерт про
 * повідомлення покупця; дайджест прийшов «без моделі» без пояснення. Тепер
 * збій поділяємо на «потрібна дія власника» (гроші, ключ) і «тимчасовий»
 * (перевантаження, ліміт), щоб на перше приходило окреме повідомлення.
 */

export type AiFailureKind = 'billing' | 'auth' | 'transient' | 'other';

export function classifyAiError(err: unknown): AiFailureKind {
  const e = err as { status?: number; message?: string; error?: { error?: { type?: string; message?: string } } } | null;
  const status = typeof e?.status === 'number' ? e.status : null;
  const text = [e?.message, e?.error?.error?.message, e?.error?.error?.type, String(err ?? '')].filter(Boolean).join(' ').toLowerCase();
  if (/credit balance|billing|purchase credits|insufficient.?funds|spend limit|usage limit/.test(text)) return 'billing';
  if (status === 401 || status === 403 || /authentication_error|permission_error|invalid x-api-key|invalid api key/.test(text)) return 'auth';
  if (status === 429 || status === 529 || (status != null && status >= 500) || /overloaded|rate_limit|timeout|econnreset|fetch failed/.test(text)) return 'transient';
  return 'other';
}

/** Чи варто будити власника: гроші й ключ — так; тимчасові збої — ні (наступний крон повторить). */
export function needsOwnerAction(kind: AiFailureKind): boolean {
  return kind === 'billing' || kind === 'auth';
}

export const AI_OUTAGE_ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

export function aiOutageMessage(kind: AiFailureKind, where: string): { title: string; detail: string } {
  const what = kind === 'billing'
    ? 'Закінчився баланс Anthropic API'
    : 'Ключ Anthropic API не приймається';
  return {
    title: `ШІ-агенти не працюють: ${what}`,
    detail: `Помітив: ${where}. Чернетки в чатах, заведення карток, «Переписати» і текст дайджесту стоять. `
      + 'Алерти про повідомлення покупців приходять і далі — без чернетки. '
      + (kind === 'billing' ? 'Поповнити: console.anthropic.com → Plans & Billing.' : 'Перевірити ANTHROPIC_API_KEY у Vercel.'),
  };
}

/** Коротка причина для людини (дайджест, панель чернетки). */
export function aiFailureShort(kind: AiFailureKind): string {
  switch (kind) {
    case 'billing': return 'закінчився баланс Anthropic API';
    case 'auth': return 'ключ Anthropic API не приймається';
    case 'transient': return 'ШІ тимчасово перевантажений';
    default: return 'ШІ не відповів';
  }
}
