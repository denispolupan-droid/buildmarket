export type Article = {
  slug: string;
  title: string;
  description: string;
  date: string;
  category: string;
  readTime: number;
  keywords: string[];
};

export const ARTICLES: Article[] = [
  {
    slug: 'yak-vybrat-hermetyk',
    title: 'Як вибрати герметик: повний гід для майстра та замовника',
    description: 'Силіконовий, акриловий, поліуретановий чи МС-полімерний — який герметик для яких завдань? Пояснюємо просто, без зайвого.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 7,
    keywords: ['як вибрати герметик', 'силіконовий герметик', 'акриловий герметик', 'поліуретановий герметик'],
  },
  {
    slug: 'montazhna-pina-yak-vykorystovuvaty',
    title: 'Монтажна піна: як правильно вибрати і використовувати',
    description: 'Побутова чи професійна, літня чи зимова? Розбираємо типи монтажної піни, їх відмінності та типові помилки при використанні.',
    date: '2026-05-07',
    category: 'Поради',
    readTime: 6,
    keywords: ['монтажна піна', 'як використовувати монтажну піну', 'вибір монтажної піни', 'піна для вікон'],
  },
];

export function getArticle(slug: string): Article | null {
  return ARTICLES.find(a => a.slug === slug) ?? null;
}
