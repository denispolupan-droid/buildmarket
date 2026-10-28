import { describe, it, expect, vi } from 'vitest';
import {
  parseAddress, normalizeHouse, stem, significantStems, rankStreets, resolveStreet,
  structuredFromRozetka, structuredFromProm, textKeepsHouse, addressLabel,
} from '../lib/np-address';

// Реальні рядки delivery_address кур'єрських замовлень з бази (Rozetka/Prom),
// на яких старий розбір падав або знаходив не те.
describe('parseAddress — реальні адреси замовлень', () => {
  const cases: [string, string | null, { street: string; streetType: string | null; house: string; flat: string }][] = [
    ['Кременчук, просп. Полтавський, 2, кв. а', 'Кременчук', { street: 'Полтавський', streetType: 'просп.', house: '2', flat: 'а' }],
    ['Харків, Ньютона, 123Б, кв. до будинку', 'Харків', { street: 'Ньютона', streetType: null, house: '123Б', flat: '' }],
    ['Дніпро, просп. Богдана Хмельницького, 24 А, кв. 70', 'Дніпро', { street: 'Богдана Хмельницького', streetType: 'просп.', house: '24А', flat: '70' }],
    ['Харків, вул. Свинаренко Петра, 12а', 'Харків', { street: 'Свинаренко Петра', streetType: 'вул.', house: '12а', flat: '' }],
    ['Київ, вул. Полкова, 43/10', 'Київ', { street: 'Полкова', streetType: 'вул.', house: '43/10', flat: '' }],
    ['Київ, вул. Голосіївська, 9в', 'Київ', { street: 'Голосіївська', streetType: 'вул.', house: '9в', flat: '' }],
    ['Київ, просп. Відрадний, 59, кв. 216', 'Київ', { street: 'Відрадний', streetType: 'просп.', house: '59', flat: '216' }],
    ['Розкопанці, Ігоря Гамарника, 12', null, { street: 'Ігоря Гамарника', streetType: null, house: '12', flat: '' }],
    ['Княжики, вул. Антонюка, 16', 'Княжики', { street: 'Антонюка', streetType: 'вул.', house: '16', flat: '' }],
    ['Коротич, пров. Морозова, 8', 'Коротич', { street: 'Морозова', streetType: 'пров.', house: '8', flat: '' }],
    ['с. Яхни (Київська обл., Обухівський р-н.), Набережна вул., буд.3', 'с. Яхни (Київська обл., Обухівський р-н.)', { street: 'Набережна', streetType: 'вул.', house: '3', flat: '' }],
    ['Мукачево, площа Паланок, буд.27', 'Мукачево', { street: 'Паланок', streetType: 'площа', house: '27', flat: '' }],
    ['Дніпро, вул. Надії Алексєєнко, 84', 'Дніпро', { street: 'Надії Алексєєнко', streetType: 'вул.', house: '84', flat: '' }],
    ['Київ, вул. Дегтярівська, 27т', 'Київ', { street: 'Дегтярівська', streetType: 'вул.', house: '27т', flat: '' }],
  ];
  for (const [raw, city, want] of cases) {
    it(raw, () => expect(parseAddress(raw, city)).toEqual(want));
  }

  it('те, що модалка підставляє сама (без міста) — теж розбирається', () => {
    expect(parseAddress('просп. Полтавський, 2, кв. а')).toEqual({ street: 'Полтавський', streetType: 'просп.', house: '2', flat: 'а' });
    expect(parseAddress('вул. Калинова, 104, кв. 5')).toEqual({ street: 'Калинова', streetType: 'вул.', house: '104', flat: '5' });
    expect(parseAddress('вул. Калинова 104')).toEqual({ street: 'Калинова', streetType: 'вул.', house: '104', flat: '' });
    expect(parseAddress('Калинова, 104')).toEqual({ street: 'Калинова', streetType: null, house: '104', flat: '' });
  });

  it('подвоєний тип і «вул.» наприкінці', () => {
    expect(parseAddress('вул. вул. Кооперативна, 6 а').street).toBe('Кооперативна');
    expect(parseAddress('вул. вул. Кооперативна, 6 а').house).toBe('6а');
    expect(parseAddress('Набережна вул., 3')).toEqual({ street: 'Набережна', streetType: 'вул.', house: '3', flat: '' });
  });

  it('без будинку — house порожній, вулиця не губиться', () => {
    expect(parseAddress('Київ, вул. Хрещатик', 'Київ')).toEqual({ street: 'Хрещатик', streetType: 'вул.', house: '', flat: '' });
  });

  it('порожній рядок', () => {
    expect(parseAddress('')).toEqual({ street: '', streetType: null, house: '', flat: '' });
  });
});

describe('normalizeHouse', () => {
  it.each([
    ['24 А', '24А'], ['6 а', '6а'], ['буд.3', '3'], ['буд. 27', '27'], ['43 / 10', '43/10'], ['12-А', '12-А'], ['б/н', 'б/н'],
  ])('%s → %s', (raw, want) => expect(normalizeHouse(raw)).toBe(want));
});

describe('stem — основа слова для FindByString', () => {
  it.each([
    ['Хмельницького', 'хмельницьк'], ['Свинаренко', 'свинаренк'], ['Алексєєнко', 'алексєєнк'], ['Полтавський', 'полтавськ'],
    ['Богдана', 'богдан'], ['Петра', 'петр'], ['Антонюка', 'антонюк'], ['Паланок', 'паланок'], ['Надії', 'наді'], ['Садова', 'садов'],
  ])('%s → %s', (w, want) => expect(stem(w)).toBe(want));

  it('ініціали й короткі слова відкидаються, найдовше слово перше', () => {
    expect(significantStems('Б. Хмельницького')).toEqual(['хмельницьк']);
    expect(significantStems('Богдана Хмельницького')).toEqual(['хмельницьк', 'богдан']);
  });
});

// Кандидати — дослівно з живої видачі Address.getStreet 28.10.2026
describe('rankStreets', () => {
  const poltavskyi = [
    { ref: 'a', description: 'Полтавський', type: 'пров.' },
    { ref: 'b', description: 'Полтавський', type: 'просп.' },
    { ref: 'c', description: 'Полтавський Шлях', type: 'вул.' },
  ];
  it('тип вулиці вирішує між провулком і проспектом', () => {
    expect(rankStreets(poltavskyi, { street: 'Полтавський', streetType: 'просп.' })?.ref).toBe('b');
    expect(rankStreets(poltavskyi, { street: 'Полтавський', streetType: 'пров.' })?.ref).toBe('a');
  });
  it('без типу — однакова кількість слів важливіша за «Полтавський Шлях»', () => {
    expect(rankStreets(poltavskyi, { street: 'Полтавський', streetType: null })?.ref).not.toBe('c');
  });
  it('НП пише «Прізвище Ім’я» у відмінку — порядок і закінчення не заважають', () => {
    const c = [{ ref: 'x', description: 'Свинаренка Петра', type: 'вул.' }];
    expect(rankStreets(c, { street: 'Свинаренко Петра', streetType: 'вул.' })?.ref).toBe('x');
    const d = [
      { ref: 'p', description: 'Хмельницького Богдана', type: 'просп.' },
      { ref: 'v', description: 'Хмельницького Богдана', type: 'вул.' },
    ];
    expect(rankStreets(d, { street: 'Богдана Хмельницького', streetType: 'просп.' })?.ref).toBe('p');
    expect(rankStreets(d, { street: 'Богдана Хмельницького', streetType: null })?.ref).toBe('v');
  });
  it('кандидат без усіх слів запиту відкидається', () => {
    const c = [
      { ref: 'typo', description: 'Надїї Алексєєнко', type: 'вул.' },
      { ref: 'ok', description: 'Алексєєнко Надії (Чичеріна)', type: 'вул.' },
    ];
    expect(rankStreets(c, { street: 'Надії Алексєєнко', streetType: 'вул.' })?.ref).toBe('ok');
    expect(rankStreets([{ ref: 'n', description: 'Надії', type: 'пров.' }], { street: 'Надії Алексєєнко', streetType: null })).toBeNull();
  });
  it('«Ньютона» не плутається з «в’їзд Ньютона» без типу — перевага «вул.»', () => {
    const c = [{ ref: 'a', description: 'Ньютона', type: 'вул.' }, { ref: 'b', description: 'Ньютона', type: "в'їзд" }];
    expect(rankStreets(c, { street: 'Ньютона', streetType: null })?.ref).toBe('a');
  });
});

describe('resolveStreet', () => {
  it('місто: знаходить за основою найдовшого слова і повертає Ref міського довідника', async () => {
    const np = vi.fn(async (_m: string, method: string, props: Record<string, unknown>) => {
      if (method === 'getStreet' && props.FindByString === 'хмельницьк') {
        return { success: true, data: [
          { Ref: 'P', Description: 'Хмельницького Богдана', StreetsType: 'просп.' },
          { Ref: 'V', Description: 'Хмельницького Богдана', StreetsType: 'вул.' },
        ] };
      }
      return { success: true, data: [] };
    });
    const r = await resolveStreet(np, { cityRef: 'CITY', settlementRef: 'SET', parsed: { street: 'Богдана Хмельницького', streetType: 'просп.' } });
    expect(r).toEqual({ kind: 'city', ref: 'P', label: 'просп. Хмельницького Богдана' });
    expect(np).toHaveBeenCalledTimes(1);
  });

  it('село: міський довідник порожній — бере довідник населеного пункту', async () => {
    const np = vi.fn(async (_m: string, method: string) => {
      if (method === 'searchSettlementStreets') {
        return { success: true, data: [{ Addresses: [{ SettlementStreetRef: 'SS', SettlementStreetDescription: 'Антонюка', StreetsType: 'вул.', Present: 'вул. Антонюка' }] }] };
      }
      return { success: true, data: [] };
    });
    const r = await resolveStreet(np, { cityRef: 'CITY', settlementRef: 'SET', parsed: { street: 'Антонюка', streetType: 'вул.' } });
    expect(r).toEqual({ kind: 'settlement', ref: 'SS', label: 'вул. Антонюка' });
  });

  it('нічого не знайдено — підказки з того, що бачили', async () => {
    const np = vi.fn(async (_m: string, method: string) => method === 'getStreet'
      ? { success: true, data: [{ Ref: '1', Description: 'Надії', StreetsType: 'пров.' }] }
      : { success: true, data: [] });
    const r = await resolveStreet(np, { cityRef: 'CITY', settlementRef: null, parsed: { street: 'Надії Алексєєнко', streetType: null } });
    expect(r).toEqual({ kind: 'none', suggestions: ['пров. Надії'] });
  });
});

describe('структуровані дані маркетплейсів', () => {
  it('Rozetka: place_street/house/flat → розібрана адреса без регулярок по місту', () => {
    expect(structuredFromRozetka({ place_street: 'просп. Полтавський', place_house: '2', place_flat: 'а', place_number: '' }))
      .toEqual({ street: 'Полтавський', streetType: 'просп.', house: '2', flat: 'а' });
    expect(structuredFromRozetka({ place_street: 'Ньютона', place_house: '123Б', place_flat: 'до будинку' })?.flat).toBe('');
    expect(structuredFromRozetka({ place_street: '', place_house: '2' })).toBeNull();
    expect(structuredFromRozetka(null)).toBeNull();
  });

  it('Prom: готові NP-референси міста й вулиці', () => {
    const pd = { provider: 'nova_poshta', recipient_address: { city_id: 'db5c88c9-391c-11dd-90d9-001a92567626', street_id: 'd1092565-2fec-11e1-8a0e-0026b97ed48a', street_name: 'площа Паланок', building_number: '27', apartment_number: null } };
    expect(structuredFromProm(pd)).toEqual({ cityRef: 'db5c88c9-391c-11dd-90d9-001a92567626', streetRef: 'd1092565-2fec-11e1-8a0e-0026b97ed48a', streetName: 'площа Паланок', house: '27', flat: '' });
    expect(structuredFromProm({ provider: 'nova_poshta', recipient_address: { city_id: 'c', street_id: null, building_number: null } })).toBeNull();
    expect(structuredFromProm({ provider: 'ukrposhta', recipient_address: { city_id: 'c', street_id: 's', building_number: '1' } })).toBeNull();
  });

  it('textKeepsHouse: структуровані дані беремо, лише поки менеджер не змінив будинок', () => {
    expect(textKeepsHouse('просп. Полтавський, 2, кв. а', '2')).toBe(true);
    expect(textKeepsHouse('просп. Богдана Хмельницького, 24 А', '24А')).toBe(true);
    expect(textKeepsHouse('просп. Полтавський, 4', '2')).toBe(false);
    expect(textKeepsHouse('', '2')).toBe(false);
  });

  it('addressLabel', () => {
    expect(addressLabel('просп. Полтавський', '2', 'а')).toBe('просп. Полтавський, 2, кв. а');
    expect(addressLabel('вул. Садова', '14', '')).toBe('вул. Садова, 14');
  });
});
