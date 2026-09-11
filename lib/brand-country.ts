/**
 * Країна виробника за брендом — fallback, коли в характеристиках товару немає
 * «Країна виробника». Спільний довідник для фідів маркетплейсів (Prom, Епіцентр):
 * копія в кожному фіді вже розходилась.
 */
export const BRAND_COUNTRY: Record<string, string> = {
  'AURA':        'Україна',
  'Polifarb':    'Україна',
  'Lacrysil':    'Україна',
  'Дивоцвіт':   'Україна',
  'Lotus':       'Україна',
  'Сталь':       'Україна',
  'Siltek':      'Україна',
  'Ataman':      'Україна',
  'Титан':       'Україна',
  'Байрис':      'Україна',
  'БАЙРИС':      'Україна',
  'Masterplast': 'Україна',
  'Aqua Protect':'Україна',
  'Aqua-protect':'Україна',
  'Sprut-A':     'Україна',
  'Хімік':       'Україна',
  'Хімконтакт':  'Україна',
  'Weco':        'Україна',
  'Werk':        'Україна',
  'ХАDО':        'Україна',
  'Spitce':      'Україна',
  'Budmonster':  'Україна',
  'Krumix':      'Україна',
  'ЗИП':         'Україна',
  'ПОЛЯРА-ХИМ':  'Україна',
  'Bitugum':     'Україна',
  'BITUGUM':     'Україна',
  'Ceresit':     'Німеччина',
  'Pattex':      'Німеччина',
  'Knauf':       'Німеччина',
  'Pufas':       'Німеччина',
  'Henkel':      'Німеччина',
  'Rigips':      'Німеччина',
  'Eskaro':      'Естонія',
  'Wkret-met':   'Польща',
  'Quelyd':      'Франція',
  'HARDEX':      'Китай',
  'Soudal':      'Бельгія',
};

/** Країна з характеристик товару або з довідника брендів. */
export function resolveCountry(
  chars: { label: string; value: string }[] | null | undefined,
  brand: string | null | undefined,
): string | null {
  const c = (chars ?? []).find(x => x.label === 'Країна виробника' || x.label === 'Країна виробник');
  const v = c?.value?.trim();
  if (v) return v;
  return brand ? BRAND_COUNTRY[brand] ?? null : null;
}
