export const PROMO = {
  topBar: {
    visible:  true,
    bgColor:  '#243F63',
    emoji:    '☀️',
    label:    'ЛІТНЯ АКЦІЯ',
    discount: '−10%',
    text:     'на герметики Ceresit',
    detail:   'до кінця червня',
  },
  banner: {
    active:       true,
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
    categorySlug: 'germetyky',
    dismissKey:   'promo_summer_ceresit_june_2026',
  },
} as const;

export type PromoConfig = {
  topBar: {
    visible: boolean; bgColor: string; emoji: string;
    label: string; discount: string; text: string; detail: string;
  };
  banner: {
    active: boolean; size: 'compact' | 'medium' | 'large'; emoji: string;
    bgImage: string; bgOverlay: number;
    bgColor: string; borderColor: string; textColor: string; ctaBgColor: string;
    tag: string; title: string; subtitle: string; ctaText: string;
    categorySlug: string; dismissKey: string;
  };
};
