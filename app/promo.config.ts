/** Акція завершена? endsAt — дата 'YYYY-MM-DD' включно; порожньо = без обмеження.
 *  Межа доби — 23:59 за київським літнім часом (UTC+3). */
export function isPromoEnded(endsAt?: string): boolean {
  if (!endsAt) return false;
  const end = Date.parse(`${endsAt}T20:59:59.999Z`);
  return Number.isFinite(end) && Date.now() > end;
}

export const PROMO = {
  topBar: {
    visible:  true,
    endsAt:   '2026-06-30',
    bgColor:  '#243F63',
    emoji:    '☀️',
    label:    'ЛІТНЯ АКЦІЯ',
    discount: '−10%',
    text:     'на герметики Ceresit',
    detail:   'до кінця червня',
    // Російська версія (порожньо → показується укр текст)
    labelRu:  'ЛЕТНЯЯ АКЦИЯ',
    textRu:   'на герметики Ceresit',
    detailRu: 'до конца июня',
  },
  banner: {
    active:       true,
    endsAt:       '2026-06-30',
    size:         'medium' as 'compact' | 'medium' | 'large',
    emoji:        '☀️',
    bgColor:      '#FFFBEB',
    borderColor:  '#FDE68A',
    textColor:    '#78350F',
    ctaBgColor:   '#F59E0B',
    bgImage:      '',
    bgOverlay:    40,
    tag:          'Літня акція',
    title:        '−10% на герметики Ceresit',
    subtitle:     'Акція діє до 30 червня 2026 · Автоматично застосовується при замовленні',
    ctaText:      'Переглянути герметики',
    // Російська версія (порожньо → показується укр текст)
    tagRu:        'Летняя акция',
    subtitleRu:   'Акция действует до 30 июня 2026 · Автоматически применяется при заказе',
    ctaTextRu:    'Смотреть герметики',
    categorySlug: 'germetyky',
    dismissKey:   'promo_summer_ceresit_june_2026',
  },
} as const;

export type PromoConfig = {
  topBar: {
    visible: boolean; bgColor: string; emoji: string;
    /** Дата завершення акції ('YYYY-MM-DD', включно); порожньо/відсутньо = показувати завжди */
    endsAt?: string;
    label: string; discount: string; text: string; detail: string;
    /** Російські варіанти; порожньо/відсутньо → фолбек на укр поле */
    labelRu?: string; textRu?: string; detailRu?: string;
  };
  banner: {
    active: boolean; size: 'compact' | 'medium' | 'large'; emoji: string;
    /** Дата завершення акції ('YYYY-MM-DD', включно); порожньо/відсутньо = показувати завжди */
    endsAt?: string;
    bgImage: string; bgOverlay: number;
    bgColor: string; borderColor: string; textColor: string; ctaBgColor: string;
    tag: string; title: string; subtitle: string; ctaText: string;
    /** Російські варіанти; порожньо/відсутньо → фолбек на укр поле */
    tagRu?: string; subtitleRu?: string; ctaTextRu?: string;
    categorySlug: string; dismissKey: string;
  };
};
