/** Russian names for category slugs */
export const CATEGORY_NAMES_RU: Record<string, string> = {
  // Герметики
  'germetyky':               'Герметики',
  'sylikonovi-germetyky':    'Силиконовые герметики',
  'akrylovi-germetyky':      'Акриловые герметики',
  'poliuretanovi-germetyky': 'Полиуретановые герметики',
  'bitumni-germetyky':       'Битумные герметики',
  'ms-polymerni-hermetyky':  'МС-полимерные герметики',

  // Монтажная пена
  'montazhna-pina':    'Монтажная пена',
  'pistoletna-pina':   'Пистолетная пена',
  'pobutova-pina':     'Бытовая монтажная пена',
  'vohnezakhysna-pina':'Огнезащитная пена',

  // Клеи
  'klei':              'Клеи',
  'montazhnyi-klei':   'Монтажный клей',
  'ridki-tsvyakhy':    'Жидкие гвозди',
  'pva-ta-stolyarnyi': 'ПВА и столярный клей',
  'epoksydni-klei':    'Эпоксидные клеи',

  // Грунтовки и шпаклёвки
  'gruntivky':         'Грунтовки',
  'gruntivky-gotovi':  'Готовые грунтовки',
  'betonokontakt':     'Бетоноконтакт',
  'antygrybok':        'Антигрибковые средства',
  'shpaklivky':        'Шпаклёвки',

  // Гидроизоляция
  'hidroizolyatsiya':           'Гидроизоляция',
  'hidroizolyatsiyni-mastyky':  'Гидроизоляционные мастики',
  'bitumni-mastyky':            'Битумные мастики',
  'praimery':                   'Праймеры',

  // Защита дерева
  'zakhyst-derevyny': 'Защита дерева',
  'antyseptyki':      'Антисептики',
  'morylky':          'Морилки',
  'zakhysni-pokryttya':'Защитные покрытия',

  // Влагопоглотители
  'vologopoglinachi': 'Влагопоглотители',

  // Ленты
  'strichky':                'Строительные ленты',
  'malyarna-strichka':       'Малярная лента',
  'hermetyzuyucha-strichka': 'Герметизирующая лента',
  'zvukoizolyatsiyna-strichka': 'Звукоизоляционная лента',

  // Крепёж
  'kriplennya': 'Крепёж',

  // Затирки
  'zamazky-dlya-shviv': 'Затирки для швов',
  'zamazky-tsementni':  'Цементные затирки',
  'zamazky-epoksydni':  'Эпоксидные затирки',

  // Пластификаторы
  'plastyfikatory': 'Пластификаторы',

  // Инструменты
  'instrumenty': 'Инструменты',
  'pistolety':   'Пистолеты',

  // Растворители
  'rozchynnyky': 'Растворители',

  // Краски
  'farby':              'Краски',
  'alkidni-farby':      'Алкидные краски',
  'farby-3v1':          'Краски 3 в 1',
  'farby-3v1-alkidni':  'Алкидные краски 3 в 1',
  'farby-3v1-akrylovi': 'Акриловые краски 3 в 1',
  'moltkovi-farby':     'Молотковые краски',
  'farby-dlya-pidlohy': 'Краски для пола',
};

export function getCategoryNameRu(slug: string, fallback: string): string {
  return CATEGORY_NAMES_RU[slug] ?? fallback;
}

/** Generate a short Russian meta description for a category page */
export function getCategoryDescriptionRu(slug: string, nameRu: string): string {
  const map: Record<string, string> = {
    'germetyky': `Купить герметики оптом и в розницу. ${nameRu} — широкий ассортимент, доставка по Украине.`,
    'montazhna-pina': `Купить монтажную пену оптом. Профессиональная и бытовая, зимние варианты. Доставка по Украине.`,
    'gruntivky': `Грунтовки глубокого проникновения, бетоноконтакт, антигрибковые. Купить оптом на FIXLINE.`,
    'hidroizolyatsiya': `Гидроизоляционные материалы для ванных, фундаментов, кровли. Купить оптом с доставкой.`,
    'farby': `Краски для металла и дерева, алкидные, акриловые, 3 в 1. Купить оптом в Украине.`,
    'zakhyst-derevyny': `Антисептики, морилки, лаки для дерева. Защита от гниения и насекомых. Оптом по Украине.`,
    'klei': `Строительные клеи, жидкие гвозди, монтажный клей, ПВА. Купить оптом с доставкой.`,
    'shpaklivky': `Шпаклёвки стартовые и финишные, для влажных помещений. Купить оптом в Украине.`,
  };
  return (
    map[slug] ??
    `Купить ${nameRu.toLowerCase()} оптом и в розницу. Широкий ассортимент, низкие цены, доставка по всей Украине. FIXLINE.`
  );
}
