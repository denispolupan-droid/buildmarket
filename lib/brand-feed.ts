/**
 * Бренд для маркетплейсів — у тому написанні, яке площадки вже знають.
 *
 * 21.10.2026 бренди в каталозі зведено до єдиного вигляду (AURA → Aura,
 * ХАDО з кирилицею → XADO …). Але площадки тримають бренд за ТОЧНИМ рядком:
 * Rozetka прив'язує наш <vendor> до свого виробника (sync_source_producer,
 * «AURA» → Aura, «ХАDО» → XADO), Епіцентр шукає код бренду в
 * EPICENTR_BRAND_CODE, Prom — у PROM_UNKNOWN_BRANDS, країна — у BRAND_COUNTRY.
 * Зміна рядка у фіді = нова, неприв'язана назва виробника і модерація.
 *
 * Тому фіди віддають старе написання: ключ — бренд у БД, значення — рядок,
 * під яким бренд уже живе на площадках. Новий бренд сюди не додавати —
 * він іде у фід як є.
 */
export const FEED_VENDOR: Record<string, string> = {
  Aura:         'AURA',
  Bostik:       'BOSTIK',
  Fiberman:     'FIBERMAN',
  Haisser:      'HAISSER',
  Hardex:       'HARDEX',
  Isoflex:      'ISOFLEX',
  Works:        'WORKS',
  'Сила':       'СИЛА',
  'Поляра-Хим': 'ПОЛЯРА-ХИМ',
  XADO:         'ХАDО',
};

/** Рядок бренду для фіду / API маркетплейсу. */
export function feedVendor(brand: string): string;
export function feedVendor(brand: string | null | undefined): string | null | undefined;
export function feedVendor(brand: string | null | undefined): string | null | undefined {
  if (brand == null) return brand;
  return FEED_VENDOR[brand.trim()] ?? brand;
}
