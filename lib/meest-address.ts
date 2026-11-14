// Чисті хелпери адреси кур'єрської доставки Meest — без мережі й Supabase:
// їх читає і кошик у браузері, і сервер (lib/meest-ship, вікно накладної).

/**
 * Адреса кур'єрської доставки Meest у замовленні: «вул. Хрещатик, буд. 12, кв. 5».
 * Формат пише кошик (formatMeestDoorAddress), читає вікно накладної (parseMeestDoorAddress).
 */
export function formatMeestDoorAddress(street: string, building: string, flat?: string | null): string {
  return [street.trim(), `буд. ${building.trim()}`, flat?.trim() ? `кв. ${flat.trim()}` : ''].filter(Boolean).join(', ');
}

export function parseMeestDoorAddress(address: string | null | undefined): { street: string; building: string; flat: string | null } | null {
  const s = String(address ?? '');
  const b = s.match(/,\s*буд\.\s*([^,]+)/i);
  if (!b) return null;
  const f = s.match(/,\s*кв\.\s*([^,]+)/i);
  return { street: s.slice(0, b.index).trim(), building: b[1].trim(), flat: f ? f[1].trim() : null };
}
