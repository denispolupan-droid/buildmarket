export type Article = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  readTime: number;
  keywords: string[];
  image: string;
  relatedLinks?: { label: string; href: string }[];
};

export const ARTICLES: Article[] = [
  {
    slug: 'gruntivscha-navishcho-i-yaku-vybrat',
    title: 'Ґрунтовка: навіщо потрібна і яку вибрати',
    description: 'Глибокого проникнення, адгезійна чи антигрибкова — пояснюємо різницю між типами ґрунтовок і коли яку застосовувати.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 5,
    image: '/blog/covers/gruntivscha-navishcho-i-yaku-vybrat.png',
    keywords: ['ґрунтовка', 'бетоноконтакт', 'антигрибкова ґрунтовка', 'яку ґрунтовку вибрати', 'ґрунтовка глибокого проникнення', 'грунтовка', 'бетонконтакт', 'антигрибковая грунтовка', 'какую грунтовку выбрать', 'грунтовка глубокого проникновения', 'купить грунтовку', 'купити ґрунтовку'],
    relatedLinks: [
      { label: 'Ґрунтовки глибокого проникнення', href: '/shop?category=gruntivky-gotovi' },
      { label: 'Бетоноконтакт', href: '/shop?category=betonokontakt' },
      { label: 'Антигрибкові засоби', href: '/shop?category=antygrybok' },
    ],
  },
  {
    slug: 'kley-dlya-remontu-vybir',
    title: 'Клей для ремонту: монтажний, рідкі цвяхи чи епоксидний?',
    description: 'Розбираємо основні типи будівельних клеїв — коли що використовувати і на що звертати увагу при покупці.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 6,
    image: '/blog/covers/kley-dlya-remontu-vybir.png',
    keywords: ['монтажний клей', 'рідкі цвяхи', 'епоксидний клей', 'будівельний клей', 'ПВА', 'монтажный клей', 'жидкие гвозди', 'эпоксидный клей', 'строительный клей', 'купить монтажный клей', 'купити монтажний клей'],
    relatedLinks: [
      { label: 'Монтажні клеї', href: '/shop?category=montazhnyi-klei' },
      { label: 'Рідкі цвяхи', href: '/shop?category=ridki-tsvyakhy' },
      { label: 'Епоксидні клеї', href: '/shop?category=epoksydni-klei' },
      { label: 'ПВА та столярний клей', href: '/shop?category=pva-ta-stolyarnyi' },
    ],
  },
  {
    slug: 'hidroizolyatsiya-fundamentu-i-vannoyi',
    title: 'Гідроізоляція: фундамент, ванна, балкон — матеріали та технологія',
    description: 'Які матеріали використовувати для гідроізоляції різних поверхонь і як їх правильно наносити.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 7,
    image: '/blog/covers/hidroizolyatsiya-fundamentu-i-vannoyi.png',
    keywords: ['гідроізоляція фундаменту', 'гідроізоляція ванної', 'бітумна мастика', 'рідка гідроізоляція', 'гидроизоляция фундамента', 'гидроизоляция ванной', 'битумная мастика', 'жидкая гидроизоляция', 'купить гидроизоляцию', 'купити гідроізоляцію'],
    relatedLinks: [
      { label: 'Гідроізоляційні мастики', href: '/shop?category=hidroizolyatsiyni-mastyky' },
      { label: 'Бітумні мастики', href: '/shop?category=bitumni-mastyky' },
      { label: 'Бітумні праймери', href: '/shop?category=praimery' },
    ],
  },
  {
    slug: 'zakhyst-derevyny-antyseptyk-lak-oliya',
    title: 'Захист деревини: антисептик, лак, олія чи воск — що коли?',
    description: 'Як правильно захистити дерево від гниття, вологи та УФ. Порівняння засобів для внутрішніх та зовнішніх конструкцій.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 6,
    image: '/blog/covers/zakhyst-derevyny-antyseptyk-lak-oliya.png',
    keywords: ['антисептик для дерева', 'лак для дерева', 'захист деревини', 'морилка', 'просочення дерева', 'антисептик для древесины', 'лак для дерева купить', 'защита древесины', 'морилка купить', 'пропитка дерева'],
    relatedLinks: [
      { label: 'Антисептики для дерева', href: '/shop?category=antyseptyki' },
      { label: 'Морилки та тонуючі засоби', href: '/shop?category=morylky' },
      { label: 'Захисні покриття', href: '/shop?category=zakhysni-pokryttya' },
    ],
  },
  {
    slug: 'yak-vybrat-farbu',
    title: 'Як вибрати фарбу: алкідна, акрилова чи 3 в 1?',
    description: 'Порівнюємо основні типи фарб для металу, дерева та підлоги. Що вибрати для гаража, воріт, батарей і підлоги — пояснюємо без зайвих слів.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 7,
    image: '/blog/covers/yak-vybrat-farbu.png',
    keywords: ['як вибрати фарбу', 'алкідна фарба', 'акрилова фарба', 'фарба 3 в 1', 'фарба для металу', 'фарба для підлоги', 'как выбрать краску', 'алкидная краска', 'акриловая краска', 'краска 3 в 1', 'краска для металла', 'краска для пола', 'купить краску'],
    relatedLinks: [
      { label: 'Алкідні емалі', href: '/shop?category=alkidni-farby' },
      { label: 'Фарби 3 в 1', href: '/shop?category=farby-3v1' },
      { label: 'Фарби для підлоги', href: '/shop?category=farby-dlya-pidlohy' },
      { label: 'Молоткові фарби', href: '/shop?category=moltkovi-farby' },
    ],
  },
  {
    slug: 'yak-vybrat-hermetyk',
    title: 'Як вибрати герметик: повний гід для майстра та замовника',
    description: 'Силіконовий, акриловий, поліуретановий чи МС-полімерний — який герметик для яких завдань? Пояснюємо просто, без зайвого.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 7,
    image: '/blog/covers/yak-vybrat-hermetyk.png',
    keywords: ['як вибрати герметик', 'силіконовий герметик', 'акриловий герметик', 'поліуретановий герметик', 'как выбрать герметик', 'силиконовый герметик', 'акриловый герметик', 'полиуретановый герметик', 'купить герметик', 'купити герметик'],
    relatedLinks: [
      { label: 'Силіконові герметики', href: '/shop?category=sylikonovi-germetyky' },
      { label: 'Акрилові герметики', href: '/shop?category=akrylovi-germetyky' },
      { label: 'Поліуретанові герметики', href: '/shop?category=poliuretanovi-germetyky' },
      { label: 'МС-полімерні герметики', href: '/shop?category=ms-polymerni-hermetyky' },
    ],
  },
  {
    slug: 'montazhna-pina-yak-vykorystovuvaty',
    title: 'Монтажна піна: як правильно вибрати і використовувати',
    description: 'Побутова чи професійна, літня чи зимова? Розбираємо типи монтажної піни, їх відмінності та типові помилки при використанні.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 6,
    image: '/blog/covers/montazhna-pina-yak-vykorystovuvaty.png',
    keywords: ['монтажна піна', 'як використовувати монтажну піну', 'вибір монтажної піни', 'піна для вікон', 'монтажная пена', 'как использовать монтажную пену', 'выбор монтажной пены', 'пена для окон', 'купить монтажную пену', 'купити монтажну піну'],
    relatedLinks: [
      { label: 'Піна під пістолет', href: '/shop?category=pistoletna-pina' },
      { label: 'Побутова піна', href: '/shop?category=pobutova-pina' },
      { label: 'Вогнезахисна піна', href: '/shop?category=vohnezakhysna-pina' },
    ],
  },
  {
    slug: 'shpaklivka-stin-startova-finishna',
    title: 'Шпаклівка стін: стартова, фінішна, вологостійка — як вибрати',
    description: 'Чим відрізняється стартова шпаклівка від фінішної, коли потрібна вологостійка і як правильно підготувати стіни під фарбу або шпалери.',
    date: '2026-05-09',
    category: 'Поради',
    readTime: 6,
    image: '/blog/covers/shpaklivka-stin-startova-finishna.png',
    keywords: ['шпаклівка', 'стартова шпаклівка', 'фінішна шпаклівка', 'вологостійка шпаклівка', 'як шпаклювати стіни', 'шпаклевка стен', 'стартовая шпаклевка', 'финишная шпаклевка', 'как шпаклевать стены', 'купить шпаклевку', 'купити шпаклівку'],
    relatedLinks: [
      { label: 'Шпаклівки', href: '/shop?category=shpaklivky' },
      { label: 'Ґрунтовки', href: '/shop?category=gruntivky' },
    ],
  },
  {
    slug: 'zatyrka-dlya-plytky',
    title: 'Затирка для плитки: цементна чи епоксидна — що вибрати',
    description: 'Розбираємо типи затирок для швів плитки: де підходить цементна, де потрібна епоксидна і як правильно затерти шов без розлучень.',
    date: '2026-05-09',
    category: 'Поради',
    readTime: 5,
    image: '/blog/covers/zatyrka-dlya-plytky.png',
    keywords: ['затирка для плитки', 'затирка для швів', 'цементна затирка', 'епоксидна затирка', 'вибір затирки', 'затирка для плитки купити', 'затирка для плитки выбор', 'цементная затирка', 'эпоксидная затирка', 'затирка для швов плитки', 'купить затирку'],
    relatedLinks: [
      { label: 'Цементні затирки', href: '/shop?category=zamazky-tsementni' },
      { label: 'Епоксидні затирки', href: '/shop?category=zamazky-epoksydni' },
    ],
  },
  {
    slug: 'peretvoryuvach-irzhi',
    title: 'Перетворювач іржі: коли потрібен і як правильно використовувати',
    description: 'Що таке перетворювач іржі, чим він відрізняється від механічного очищення і як підготувати метал до фарбування з мінімальними зусиллями.',
    date: '2026-05-09',
    category: 'Поради',
    readTime: 5,
    image: '/blog/covers/peretvoryuvach-irzhi.png',
    keywords: ['перетворювач іржі', 'засіб від іржі', 'антикорозійний захист', 'як видалити іржу', 'преобразователь ржавчины', 'средство от ржавчины', 'антикоррозийная защита металла', 'купить преобразователь ржавчины', 'обезжириватель металла'],
    relatedLinks: [
      { label: 'Розчинники та очисники', href: '/shop?category=rozchynnyky' },
      { label: 'Фарби для металу', href: '/shop?category=alkidni-farby' },
    ],
  },
  {
    slug: 'vologopoglynych',
    title: 'Вологопоглинач: від сирості, цвілі та запаху у квартирі',
    description: 'Як вибрати вологопоглинач для квартири, підвалу або гардеробної. Порівнюємо типи, ємності та замінні картриджі.',
    date: '2026-05-09',
    category: 'Поради',
    readTime: 4,
    image: '/blog/covers/vologopoglynych.png',
    keywords: ['вологопоглинач', 'від сирості', 'засіб від вологи', 'цвіль у квартирі', 'поглотитель влаги', 'от сырости', 'средство от влаги', 'плесень в квартире', 'осушитель воздуха', 'купить поглотитель влаги'],
    relatedLinks: [
      { label: 'Вологопоглиначі', href: '/shop?category=vologopoglinachi' },
      { label: 'Антигрибкові засоби', href: '/shop?category=antygrybok' },
    ],
  },
  {
    slug: 'plastyfikator-dlya-betonu',
    title: 'Пластифікатор для бетону: навіщо потрібен і який вибрати',
    description: 'Що таке пластифікатор, як він впливає на міцність бетону і чи варто його використовувати при самостійному замішуванні розчину.',
    date: '2026-05-10',
    category: 'Поради',
    readTime: 5,
    image: '/blog/covers/plastyfikator-dlya-betonu.png',
    keywords: ['пластифікатор для бетону', 'пластифікатор для розчину', 'добавка в бетон', 'протиморозна добавка', 'пластификатор для бетона', 'пластификатор для раствора', 'добавка в бетон', 'противоморозная добавка', 'купити пластифікатор', 'купить пластификатор'],
    relatedLinks: [
      { label: 'Пластифікатори для бетону', href: '/shop?category=plastyfikatory' },
    ],
  },
  {
    slug: 'ms-polymer-vs-poliuretan',
    title: 'МС-полімерний vs поліуретановий герметик — у чому різниця',
    description: 'Два найміцніших герметики на ринку — поліуретановий і МС-полімерний. Пояснюємо чим вони відрізняються і який підійде для вашого завдання.',
    date: '2026-05-10',
    category: 'Поради',
    readTime: 5,
    image: '/blog/covers/ms-polymer-vs-poliuretan.png',
    keywords: ['МС-полімерний герметик', 'поліуретановий герметик', 'відмінність герметиків', 'який герметик міцніший', 'МС-полимерный герметик', 'полиуретановый герметик', 'отличие герметиков', 'какой герметик прочнее', 'купить МС герметик', 'купити МС герметик'],
    relatedLinks: [
      { label: 'МС-полімерні герметики', href: '/shop?category=ms-polymerni-hermetyky' },
      { label: 'Поліуретанові герметики', href: '/shop?category=poliuretanovi-germetyky' },
    ],
  },
  {
    slug: 'malyarna-strichka-yak-vybrat',
    title: 'Малярна стрічка: як вибрати і правильно використовувати',
    description: 'Чим відрізняються малярні стрічки за клейкістю, температурою та матеріалом. Як зняти стрічку без слідів і не зіпсувати фарбування.',
    date: '2026-05-10',
    category: 'Поради',
    readTime: 4,
    image: '/blog/covers/malyarna-strichka-yak-vybrat.png',
    keywords: ['малярна стрічка', 'малярний скотч', 'як вибрати малярну стрічку', 'стрічка для фарбування', 'малярная лента', 'малярный скотч', 'как выбрать малярную ленту', 'лента для покраски', 'купити малярну стрічку', 'купить малярную ленту'],
    relatedLinks: [
      { label: 'Малярна стрічка', href: '/shop?category=malyarna-strichka' },
      { label: 'Герметизуючі стрічки', href: '/shop?category=hermetyzuyucha-strichka' },
      { label: 'Звукоізоляційні стрічки', href: '/shop?category=zvukoizolyatsiyna-strichka' },
    ],
  },
];

export function getArticle(slug: string): Article | null {
  return ARTICLES.find(a => a.slug === slug) ?? null;
}
