/** Конвертує десятковий роздільник для Rozetka: "2,5 кг" → "2.5 кг" */
export function toRozetkaVolume(v: string | null | undefined): string | null {
  if (!v) return null;
  // Замінюємо кому як десятковий роздільник на крапку (між цифрами)
  return v.replace(/(\d),(\d)/g, '$1.$2');
}

/**
 * Форматує назву товару для Rozetka:
 * Тип товару Бренд Модель Розмір Колір
 *
 * Обробляє два патерни:
 *  A) "BrandLine — TypeDesc Variant, Volume"  → "TypeDesc BrandLine Variant Volume"
 *  B) "TypeDesc Brand Model, Volume, Колір"   → "TypeDesc Brand Model Volume Колір"
 *
 * Бренд у назві завжди замінюється на точне значення з поля brand (щоб співпадало з <vendor>).
 */
export function formatForRozetka(
  name: string,
  brand: string | null | undefined,
  volume: string | null | undefined,
  color: string | null | undefined,
): string {
  if (!brand) return cleanCommas(name);
  // Для виводу — крапка як десятковий роздільник; для пошуку в назві — оригінал (з комою)
  const displayVol = toRozetkaVolume(volume);

  // ── Патерн A: "BrandLine — TypeDesc ..."  ─────────────────────────────────
  // Розпізнаємо em-dash або en-dash як роздільник
  const dashIdx = indexOfDash(name);
  if (dashIdx !== -1) {
    const brandLine = name.slice(0, dashIdx).trimEnd();  // "Aura Lasur Aqua"
    let   typeRest  = name.slice(dashIdx).replace(/^[\s—–]+/, '').trimStart(); // "Декоративна акрилова лазур для дерева Дуб, 2,5 л"

    if (brandLine.toLowerCase().startsWith(brand.toLowerCase())) {
      // Замінюємо регістр бренду в brandLine на точне значення з БД (щоб співпадало з <vendor>)
      const fixedBrandLine = brand + brandLine.slice(brand.length);  // "AURA Lasur Aqua"

      // Видаляємо об'єм з правої частини (com-крапка: "2,5 л" і "2 5 л" — обидва варіанти)
      if (volume) {
        typeRest = typeRest.replace(new RegExp(',?\\s*' + escRx(volume), 'gi'), ' ');
        const volNoDot = volume.replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
        if (volNoDot !== volume)
          typeRest = typeRest.replace(new RegExp(',?\\s*' + escRx(volNoDot), 'gi'), ' ');
      }
      // Видаляємо колір (може стояти перед об'ємом у різних відмінках)
      if (color) {
        for (const part of color.toLowerCase().split(/\s+/)) {
          const stem = part.slice(0, Math.max(4, part.length - 2));
          typeRest = typeRest.replace(new RegExp(',?\\s*' + escRx(stem) + '\\S*', 'gi'), ' ');
        }
      }

      const typePart = typeRest.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
      // Порядок: Тип Бренд [Колір] [Об'єм]
      const parts = [typePart, fixedBrandLine, color ?? '', displayVol ?? ''].map(s => s.trim()).filter(Boolean);
      return parts.join(' ').replace(/\s+/g, ' ').trim();
    }
  }

  // ── Патерн B: тип стоїть до бренду  ──────────────────────────────────────
  const brandIdx = name.indexOf(brand);
  if (brandIdx === -1) {
    // Спробуємо case-insensitive пошук
    const lower = name.toLowerCase();
    const bIdx  = lower.indexOf(brand.toLowerCase());
    if (bIdx === -1) return cleanCommas(name);
    return formatPatternB(name, brand, bIdx, volume, color);
  }
  return formatPatternB(name, brand, brandIdx, volume, color);
}

function formatPatternB(
  name: string,
  brand: string,
  brandIdx: number,
  volume: string | null | undefined,
  color: string | null | undefined,
): string {
  const displayVol = toRozetkaVolume(volume);
  const type = name.slice(0, brandIdx).replace(/[,\s—–]+$/, '').trim();
  let afterBrand = name.slice(brandIdx + brand.length).trim();

  if (color) {
    for (const part of color.toLowerCase().split(/\s+/)) {
      const stem = part.slice(0, Math.max(4, part.length - 2));
      afterBrand = afterBrand.replace(new RegExp(',?\\s*' + escRx(stem) + '\\S*', 'gi'), ' ');
    }
  }
  if (volume) {
    afterBrand = afterBrand.replace(new RegExp(',?\\s*' + escRx(volume), 'gi'), ' ');
  }

  const model = cleanCommas(afterBrand).trim();
  const parts = [type, brand, model, displayVol ?? '', color ?? ''].map(s => s.trim()).filter(Boolean);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Знаходить позицію em/en dash зі спейсами ( — або  – ) */
function indexOfDash(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if ((s[i] === '—' || s[i] === '–') && i > 0 && s[i - 1] === ' ')
      return i - 1; // повертаємо початок пробілу перед тире
  }
  return -1;
}

function cleanCommas(s: string): string {
  return s.replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function escRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[,.]/g, '[,.]');
}
