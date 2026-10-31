import { NextResponse } from 'next/server';
import { z } from 'zod';

/**
 * Перевірка тіла запиту за схемою (аудит 31.10.2026). До цього роути читали
 * `await req.json() as {...}` — каст без перевірки: рядок замість числа чи
 * дата в довільному форматі доходили до БД, і частина запису встигала лягти
 * до помилки (касовий ордер без проводки). Тепер — 400 з людським текстом
 * ДО будь-якого запису.
 */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try { raw = await req.json(); } catch { raw = {}; }
  const res = schema.safeParse(raw);
  if (res.success) return { ok: true, data: res.data };
  const issue = res.error.issues[0];
  const where = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
  return { ok: false, response: NextResponse.json({ error: `Невірні дані — ${where}${issue?.message ?? 'помилка формату'}` }, { status: 400 }) };
}

/** Сума в гривнях: число або числовий рядок, > 0, не більше 10 млн, до копійки. */
export const zMoney = z.coerce.number()
  .refine(Number.isFinite, 'має бути числом')
  .refine(n => n > 0, 'має бути більше 0')
  .refine(n => n <= 10_000_000, 'занадто велика сума')
  .transform(n => Math.round(n * 100) / 100);

/** Дата YYYY-MM-DD, що реально існує в календарі. */
export const zYmd = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'дата у форматі YYYY-MM-DD')
  .refine(s => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'такої дати немає');

/** Необовʼязковий текст: обрізаний, порожній → undefined, не довший за max. */
export const zText = (max = 500) => z.preprocess(
  v => (v === null ? undefined : v),
  z.string().trim().max(max).optional().transform(s => (s ? s : undefined)),
);

export { z };

/** Необовʼязкова дата: '' або null (очищене поле форми) → «не вказано». */
export const zYmdOpt = z.preprocess(v => (v === '' || v === null ? undefined : v), zYmd.optional());
