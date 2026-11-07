// Ті самі кольори каналів, що в журналі замовлень (упізнаваність важливіша
// за палітру: Prom скрізь теракотовий, Rozetka скрізь зелений). Спільне для
// каруселі «Динаміка» (клієнт) і панелі «Підсумок» (сервер) — тому окремий модуль.
export const SOURCE_META: Record<string, { label: string; color: string }> = {
  website:  { label: 'Магазин',  color: '#1E5AA8' },
  b2b:      { label: 'Опт',      color: '#6B21A8' },
  dropship: { label: 'Дроп',     color: '#0E7490' },
  retail:   { label: 'Роздріб',  color: '#B45309' },
  phone:    { label: 'Телефон',  color: '#334155' },
  prom:     { label: 'Prom',     color: '#C2410C' },
  rozetka:  { label: 'Rozetka',  color: '#15803D' },
  epicentr: { label: 'Епіцентр', color: '#BE123C' },
  other:    { label: 'Інше',     color: '#94A3B8' },
};
