/**
 * Реквізити підприємства за кодом — безкоштовно (13.11.2026).
 *
 * Запити «виставте рахунок на підприємство» приходять часто, а код ЄДРПОУ
 * покупець пише в коментарі (№26111088: «ТОВ «ОФІС-КОМФОРТ СЕРВІС» 44994768»).
 * Платні реєстри (Opendatabot API ≈ 7 600 ₴/міс) для наших обсягів не варті
 * грошей; Нова Пошта ж безкоштовно й лише на читання віддає офіційну назву
 * юрособи за ЄДРПОУ (Counterparty.getCounterpartyByEDRPOU) — для рахунку
 * цього достатньо. Адреси й керівника НП не дає (дописують руками).
 */

import { npCall, getNpApiKey } from './np-api';
import { normalizeCompanyCode } from './company-code';

export { extractTaxCode, normalizeCompanyCode, type TaxCodeHit } from './company-code';

export type CompanyInfo = { code: string; fullName: string; shortName: string; source: 'nova_poshta' };

/** Офіційна назва юрособи за кодом через Нову Пошту; не знайдено — null. */
export async function lookupCompanyByCode(rawCode: string): Promise<CompanyInfo | null> {
  const code = normalizeCompanyCode(rawCode);
  if (!code) return null;
  const apiKey = await getNpApiKey();
  const r = await npCall<{ EDRPOU?: string; FullName?: string; Description?: string }>(apiKey, 'Counterparty', 'getCounterpartyByEDRPOU', { EDRPOU: code });
  const row = r.success ? (r.data ?? []).find(d => String(d.EDRPOU ?? '') === code) ?? r.data?.[0] : null;
  const fullName = (row?.FullName ?? '').trim();
  const shortName = (row?.Description ?? '').trim();
  if (!fullName && !shortName) return null;
  return { code, fullName: fullName || shortName, shortName: shortName || fullName, source: 'nova_poshta' };
}
