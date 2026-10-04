import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteFromR2 } from './r2';

const PREFIX = '/img/products/';

/**
 * Чи можна стерти з R2 старий файл фото після того, як товар перейшов на новий.
 * Чиста функція — щоб покрити тестом правила без БД:
 *  - лише наші ключі (/img/products/...), чужі чи порожні значення не чіпаємо;
 *  - шлях має реально змінитися;
 *  - на старий файл не повинен посилатися жоден інший товар (спільне фото
 *    варіантів одного товару — 1603-010/011, 1101-001/007 — так уже ламалося);
 *  - лише файли з хешем у назві: без хешу лежать оригінали міграції, обкладинки
 *    блогу, промо — їх не чіпаємо.
 */
export function oldImageKeyToDelete(
  oldImage: string | null | undefined,
  newImage: string | null | undefined,
  otherReferences: number,
): string | null {
  if (!oldImage || !oldImage.startsWith(PREFIX)) return null;
  if (oldImage === newImage) return null;
  if (otherReferences > 0) return null;
  const key = oldImage.slice(PREFIX.length);
  if (!/-[0-9a-f]{10}\.webp$/.test(key)) return null;
  return key;
}

/** Видалити старе фото товару з R2, якщо це безпечно. Помилки не фатальні: сирота в R2 краща за бите фото. */
export async function cleanupReplacedImage(
  db: SupabaseClient,
  sku: string,
  oldImage: string | null | undefined,
  newImage: string | null | undefined,
): Promise<void> {
  if (!oldImage || oldImage === newImage) return;
  try {
    const { count } = await db
      .from('products')
      .select('sku', { count: 'exact', head: true })
      .eq('image', oldImage)
      .neq('sku', sku);
    const key = oldImageKeyToDelete(oldImage, newImage, count ?? 1);
    if (key) await deleteFromR2([key]);
  } catch {
    // не ламаємо збереження картки через прибирання
  }
}
