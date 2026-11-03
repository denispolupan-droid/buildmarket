/**
 * Повтори доставки події (рішення власника 03.11.2026): 1, 5, 15, 30 хв — разом
 * ≈ година, після 5-ї невдачі подія стає failed і йде ОДИН алерт. Чисті функції
 * під тестами.
 */
export const RETRY_DELAYS_MIN = [1, 5, 15, 30] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1; // 5

/** attempts — скільки спроб уже зроблено (включно з поточною, яка впала). */
export function isExhausted(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS;
}

/** Пауза перед наступною спробою після attempts невдач; null — спроб більше немає. */
export function nextDelayMinutes(attempts: number): number | null {
  if (isExhausted(attempts)) return null;
  return RETRY_DELAYS_MIN[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MIN.length) - 1];
}

export function nextAttemptAt(attempts: number, now = Date.now()): string | null {
  const m = nextDelayMinutes(attempts);
  return m == null ? null : new Date(now + m * 60_000).toISOString();
}
