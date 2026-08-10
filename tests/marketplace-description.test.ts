import { describe, it, expect } from 'vitest';
import {
  mpDescription, mpDescriptionRu, isMpDescriptionClean, languageSlips,
} from '../lib/marketplace-description';

// Опис для маркетплейсу — окремий текст, і вибір «що саме поїде у фід» тепер
// логіка, а не поле. Тести тримають дві її властивості: пріоритет MP-тексту і
// те, що порожнього опису у фіді не буває.
describe('mpDescription', () => {
  it('MP-опис має пріоритет над сайтовим', () => {
    expect(mpDescription({ description_mp: 'для маркетплейсу', description_full: 'для сайту' }))
      .toBe('для маркетплейсу');
    expect(mpDescriptionRu({ description_mp_ru: 'для МП', description_full_ru: 'для сайта' }))
      .toBe('для МП');
  });

  it('поки MP-тексту немає — фід віддає повний опис, потім короткий', () => {
    expect(mpDescription({ description_mp: null, description_full: 'повний', description: 'короткий' }))
      .toBe('повний');
    expect(mpDescription({ description_mp: null, description_full: null, description: 'короткий' }))
      .toBe('короткий');
    expect(mpDescription({})).toBe('');
  });

  it('порожній рядок і пробіли не вважаються текстом', () => {
    expect(mpDescription({ description_mp: '   ', description_full: 'повний' })).toBe('повний');
  });
});

// Саме через ці згадки Rozetka заблокувала опис у 252 позицій — перевірка стоїть
// перед записом, щоб історія не повторилася на новому полі.
describe('isMpDescriptionClean', () => {
  it('текст без згадок магазину проходить', () => {
    expect(isMpDescriptionClean('Клей монтажний, фасування 50 г. Схоплення за 5 хвилин.')).toBe(true);
  });

  it('згадки магазину, доставки й посилання — не проходять', () => {
    expect(isMpDescriptionClean('Замовляйте в інтернет-магазині FIXLINE')).toBe(false);
    expect(isMpDescriptionClean('Доставка Новою Поштою по всій Україні')).toBe(false);
    expect(isMpDescriptionClean('Детальніше на https://fixline.com.ua')).toBe(false);
    expect(isMpDescriptionClean('Заказать в интернет-магазине')).toBe(false);
    expect(isMpDescriptionClean('www.fixline.com.ua')).toBe(false);
  });
});

// Haiku зрідка лишає в російському тексті українське слово («по металу»), а
// Sonnet — русизм в українському. Ловимо те, що видно по літерах.
describe('languageSlips', () => {
  it('українське слово в російському тексті', () => {
    expect(languageSlips('Применяется для різання металла', 'ru')).toEqual(['різання']);
  });

  it('російське слово в українському тексті', () => {
    expect(languageSlips('Застосовується для різання металлы', 'uk')).toEqual(['металлы']);
  });

  it('назва товару в російському тексті — не помилка', () => {
    expect(languageSlips('Клей Lacrysil Надміцний прозрачный', 'ru', 'Клей Lacrysil Надміцний 50 г')).toEqual([]);
  });

  it('чистий текст — жодних зауважень', () => {
    expect(languageSlips('Клей монтажний каучуковий, 50 г', 'uk')).toEqual([]);
    expect(languageSlips('Клей монтажный каучуковый, 50 г', 'ru')).toEqual([]);
  });
});
