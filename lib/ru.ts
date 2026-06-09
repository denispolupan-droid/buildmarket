/** Russian names for category slugs */
export const CATEGORY_NAMES_RU: Record<string, string> = {
  // Герметики
  'germetyky':               'Герметики',
  'sylikonovi-germetyky':    'Силиконовые герметики',
  'akrylovi-germetyky':      'Акриловые герметики',
  'poliuretanovi-germetyky': 'Полиуретановые герметики',
  'bitumni-germetyky':       'Битумные герметики',
  'ms-polymerni-hermetyky':  'МС-полимерные герметики',
  'neytralny-germetyky':     'Нейтральные герметики',
  'zharostiyki-germetyky':   'Жаростойкие герметики',
  'nytka-dlya-trub':         'Герметизирующая нить',

  // Монтажная пена
  'montazhna-pina':    'Монтажная пена',
  'pistoletna-pina':   'Пистолетная пена',
  'pobutova-pina':     'Бытовая монтажная пена',
  'vohnezakhysna-pina':'Огнезащитная пена',
  'pina-klei':         'Пена-клей',
  'ochysnyky':         'Очистители для пены',

  // Клеи
  'klei':              'Клеи',
  'montazhnyi-klei':   'Монтажный клей',
  'klei-dlya-plytky':  'Клей для плитки',
  'pva-ta-stolyarnyi': 'ПВА и столярный клей',
  'epoksydni-klei':    'Эпоксидные клеи',
  'kontaktnyi-klei':   'Контактный клей',
  'klei-dlya-shpaler': 'Клей для обоев',
  'super-klei':        'Супер клей (секундный)',

  // Грунтовки и шпаклёвки
  'gruntivky':              'Грунтовки',
  'gruntivky-gotovi':       'Готовые грунтовки',
  'gruntivky-kontsentraty': 'Грунтовки-концентраты',
  'grunty':                 'Грунты',
  'betonokontakt':          'Бетоноконтакт',
  'antygrybok':             'Антигрибковые средства',
  'shpaklivky':             'Шпаклёвки',

  // Гидроизоляция
  'hidroizolyatsiya':           'Гидроизоляция',
  'hidroizolyatsiyni-mastyky':  'Гидроизоляционные мастики',
  'bitumni-mastyky':            'Битумные мастики',
  'praimery':                   'Праймеры',

  // Защита дерева
  'zakhyst-derevyny':  'Защита дерева',
  'antyseptyki':       'Антисептики',
  'morylky':           'Морилки',
  'zakhysni-pokryttya':'Защитные покрытия',
  'laky':              'Лаки и пропитки',

  // Влагопоглотители
  'vologopoglinachi': 'Влагопоглотители',

  // Ленты
  'strichky':                   'Строительные ленты',
  'malyarna-strichka':          'Малярная лента',
  'hermetyzuyucha-strichka':    'Герметизирующая лента',
  'zvukoizolyatsiyna-strichka': 'Звукоизоляционная лента',
  'izolyatsiyni-strichky':      'Изоляционные ленты',
  'strichka-dlya-shviv':        'Лента для швов',

  // Крепёж
  'kriplennya':          'Крепёж',
  'dyubeli-ta-ankery':   'Дюбели и анкеры',
  'shurupy-ta-samorizy': 'Шурупы и саморезы',

  // Затирки
  'zamazky-dlya-shviv': 'Затирки для швов',
  'zamazky-tsementni':  'Цементные затирки',
  'zamazky-epoksydni':  'Эпоксидные затирки',

  // Пластификаторы
  'plastyfikatory':             'Пластификаторы',
  'plastyfikatory-dlya-betonu': 'Пластификаторы для бетона',

  // Инструменты
  'instrumenty':      'Инструменты',
  'pistolety':        'Пистолеты',
  'pistolety-dlya-piny': 'Пистолеты для пены',
  'shlifuvalny':      'Шлифовальный инструмент',
  'vymiriuvalny':     'Измерительный инструмент',
  'kysti-ta-valy':    'Кисти и валики',
  'shpateli':         'Шпатели и кельмы',
  'koloranty':        'Колоранты',

  // Растворители
  'rozchynnyky': 'Растворители',

  // Краски
  'farby':                    'Краски',
  'alkidni-farby':            'Алкидные краски',
  'farby-3v1':                'Краски 3 в 1',
  'farby-3v1-alkidni':        'Алкидные краски 3 в 1',
  'farby-3v1-akrylovi':       'Акриловые краски 3 в 1',
  'moltkovi-farby':           'Молотковые краски',
  'farby-dlya-pidlohy':       'Краски для пола',
  'farby-dlya-radiatoriv':    'Краски для радиаторов',
  'vodoemiulsiyni-fasadni':   'Водоэмульсионные фасадные',
  'vodoemiulsiyni-interierni':'Водоэмульсионные интерьерные',
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
