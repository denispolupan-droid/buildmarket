import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ставка НоваПей за виплату накладеного платежу, % від суми наложки.
 * Єдине джерело: app_settings.novapay_cod_fee_pct, за замовчуванням 0,5 (без мінімуму) —
 * так НоваПей реально утримує з наших реєстрів (звірка виплат 06.09.2026).
 * Нею ж рахується утримання з дропшип-партнера: ТТН партнерів їдуть з нашого акаунта.
 */
export const NP_COD_FEE_KEY = 'novapay_cod_fee_pct';
export const NP_COD_FEE_DEFAULT = 0.5;

export async function getNpCodFeePct(db: SupabaseClient): Promise<number> {
  const { data } = await db.from('app_settings').select('value').eq('key', NP_COD_FEE_KEY).maybeSingle();
  const v = parseFloat(String(data?.value ?? ''));
  return Number.isFinite(v) && v >= 0 ? v : NP_COD_FEE_DEFAULT;
}
