import { describe, it, expect } from 'vitest';
import { buildValueRules, canonicalCharValue, matchCanonicalValues, categoryChain, applicableValues, valueInDictionary, type ValueContext } from '../lib/char-values';
import { charValueRows } from '../scripts/supabase/char-dictionary.mjs';

// Тести ганяються на РЕАЛЬНОМУ довіднику (CHAR_VALUES), який seed заливає в БД:
// зламане правило видно тут, а не після чистки проду.
const rules = buildValueRules(charValueRows());
const parentOf = new Map<string, string | null>([
  ['farby', null], ['farby-3v1', 'farby'], ['moltkovi-farby', 'farby-3v1'], ['farby-3v1-akrylovi', 'farby-3v1'],
  ['farby-3v1-alkidni', 'farby-3v1'], ['farby-dlya-radiatoriv', 'farby'],
  ['alkidni-farby', 'farby'], ['laky', 'farby'], ['grunty', 'farby'], ['koloranty', 'farby'], ['rozchynnyky', 'farby'],
  ['vodoemiulsiyni-interierni', 'farby'], ['bitumni-mastyky', 'hidroizolyatsiya'], ['plastyfikatory-dlya-betonu', null],
]);
const MULTI = new Set(['Поверхня', 'Ефект']);
const ctx = (label: string, category?: string | null): ValueContext =>
  ({ rules, category, parentOf, multiselect: MULTI.has(label) });
const canon = (label: string, value: string, category?: string | null) => canonicalCharValue(label, value, ctx(label, category));

describe('categoryChain', () => {
  it('лист → родина, без зациклення', () => {
    expect(categoryChain('moltkovi-farby', parentOf)).toEqual(['moltkovi-farby', 'farby-3v1', 'farby']);
    expect(categoryChain(null, parentOf)).toEqual([]);
    const loop = new Map([['a', 'b'], ['b', 'a']]);
    expect(categoryChain('a', loop)).toEqual(['a', 'b']);
  });
});

describe('Тип використання (глобальне правило)', () => {
  const USE_BOTH = 'Внутрішні та зовнішні роботи';
  it('внутрішні + зовнішні в будь-якому порядку і «універсальний» → обидва', () => {
    for (const v of [
      'Для внутрішніх і зовнішніх робіт', 'Внутрішні роботи, Зовнішні роботи', 'Всередині та зовні приміщень',
      'Зовнішнє та внутрішнє використання', 'Універсальний', "Водоемульсійна фасадна та інтер'єрна фарба",
    ]) expect(canon('Тип використання', v)).toBe(USE_BOTH);
  });
  it('лише зовнішні / лише внутрішні', () => {
    expect(canon('Тип використання', 'Для зовнішніх робіт')).toBe('Зовнішні роботи');
    expect(canon('Тип використання', 'Фасадний лак для каменю')).toBe('Зовнішні роботи');
    expect(canon('Тип використання', 'Стіни та стелі у внутрішніх приміщеннях')).toBe('Внутрішні роботи');
  });
  it('канонічне значення не змінюється; чуже — теж', () => {
    expect(canon('Тип використання', USE_BOTH)).toBe(USE_BOTH);
    expect(canon('Тип використання', 'Для дахів')).toBe('Для дахів');
  });
});

describe('Ступінь блиску', () => {
  it('глянець/напівглянець/напівмат/мат без плутанини префіксів', () => {
    expect(canon('Ступінь блиску', 'глянцевий')).toBe('Глянцевий');
    expect(canon('Ступінь блиску', 'Глянсова')).toBe('Глянцевий');
    expect(canon('Ступінь блиску', 'напівглянцевий')).toBe('Напівглянцевий');
    expect(canon('Ступінь блиску', 'Шовковисто-матова')).toBe('Напівматовий');
    expect(canon('Ступінь блиску', 'матовий / напівматовий')).toBe('Матовий');
    expect(canon('Ступінь блиску', 'Глибокоматова')).toBe('Матовий');
    expect(canon('Ступінь блиску', 'мат')).toBe('Матовий');
  });
});

describe('Основа — лише у фарбах', () => {
  it('39 формулювань зводяться до 5', () => {
    expect(canon('Основа', 'Акрилова дисперсія (водна база)', 'vodoemiulsiyni-interierni')).toBe('Акрилова');
    expect(canon('Основа', 'Водоемульсійна (акрилова)', 'vodoemiulsiyni-interierni')).toBe('Акрилова');
    expect(canon('Основа', 'Водна (латексна)', 'vodoemiulsiyni-interierni')).toBe('Латексна');
    expect(canon('Основа', 'Силіконова (водно-дисперсійна)', 'vodoemiulsiyni-interierni')).toBe('Силіконова');
    expect(canon('Основа', 'Алкідна (пентафталевий лак)', 'alkidni-farby')).toBe('Алкідна');
    expect(canon('Основа', 'Алкідний лак', 'laky')).toBe('Алкідна');
    expect(canon('Основа', 'Водоемульсійна', 'vodoemiulsiyni-interierni')).toBe('Акрилова');
    expect(canon('Основа', 'Водна (без розчинників)', 'vodoemiulsiyni-interierni')).toBe('Акрилова');
  });
  it('правило родини діє через ланцюжок предків (moltkovi → farby-3v1 → farby)', () => {
    expect(canon('Основа', 'алкідна (гліфталева смола)', 'moltkovi-farby')).toBe('Алкідна');
  });
  it('поза фарбами «Основа» не чіпається: бітум у мастиках; колоранти — акрилові', () => {
    expect(canon('Основа', 'Бітумна емульсія на водній основі', 'bitumni-mastyky')).toBe('Бітумна емульсія на водній основі');
    expect(canon('Основа', 'Водна', 'koloranty')).toBe('Акрилова');
    expect(canon('Основа', 'Акрилатна', 'koloranty')).toBe('Акрилова');
    expect(canon('Основа', 'Акрилова дисперсія', null)).toBe('Акрилова дисперсія');
  });
});

describe('Поверхня — multiselect, збираються всі збіги', () => {
  it('з «Призначення» та «Область застосування» виводяться канони у порядку довідника', () => {
    expect(matchCanonicalValues('Поверхня', 'Фарбування дерева, металу та бетону', ctx('Поверхня', 'farby-3v1-akrylovi')))
      .toEqual(['Метал', 'Дерево', 'Бетон, цегла, штукатурка']);
    expect(matchCanonicalValues('Поверхня', 'Метал, дерево, раніше пофарбовані поверхні; зовнішні роботи', ctx('Поверхня', 'farby-3v1-alkidni')))
      .toEqual(['Метал', 'Дерево']);
    expect(matchCanonicalValues('Поверхня', "Фарбування вікон, дверей та дерев'яних конструкцій", ctx('Поверхня', 'farby-3v1-akrylovi')))
      .toEqual(['Дерево']);
    expect(matchCanonicalValues('Поверхня', 'Глянсова акрилова емаль для радіаторів', ctx('Поверхня', 'farby-dlya-radiatoriv')))
      .toEqual(['Метал', 'Радіатори']);
  });
  it('строгий режим не лишає вільного тексту; канонізація — лишає нерозпізнане', () => {
    expect(matchCanonicalValues('Поверхня', 'Тонування фарб', ctx('Поверхня', 'laky'))).toEqual([]);
    expect(canon('Поверхня', 'Метал; Скло', 'alkidni-farby')).toBe('Метал; Скло');
    expect(canon('Поверхня', 'дерево; метал', 'alkidni-farby')).toBe('Метал; Дерево');
  });
  it('поза родиною фарб правил немає', () => {
    expect(matchCanonicalValues('Поверхня', 'Метал', ctx('Поверхня', 'plastyfikatory-dlya-betonu'))).toEqual([]);
  });
});

describe('Ефект, Клас зносостійкості, Розчинник', () => {
  it('«Молотковий та перламутровий» → два значення через «; »', () => {
    expect(canon('Ефект', 'Молотковий та перламутровий', 'moltkovi-farby')).toBe('Молотковий; Перламутровий');
    expect(canon('Ефект', 'Молотковий + перламутровий', 'moltkovi-farby')).toBe('Молотковий; Перламутровий');
  });
  it('пластифікатори: «Ефект» — вільний текст, не чіпаємо', () => {
    const v = 'Запобігає замерзанню розчину, підвищує міцність';
    expect(canon('Ефект', v, 'plastyfikatory-dlya-betonu')).toBe(v);
  });
  it('клас зносостійкості за EN 13300 — цифра класу, не «13300»', () => {
    expect(canon('Клас зносостійкості', '1 (EN 13300)')).toBe('Клас 1');
    expect(canon('Клас зносостійкості', '2-й клас (стійка до вологого стирання)')).toBe('Клас 2');
    expect(canon('Клас зносостійкості', '3 (за EN 13300)')).toBe('Клас 3');
    expect(canon('Клас зносостійкості', 'Клас 1 (стійка до миття)')).toBe('Клас 1');
  });
  it('розчинник', () => {
    expect(canon('Розчинник', 'вода')).toBe('Вода');
    expect(canon('Розчинник', 'Уайт-спіріт')).toBe('Уайт-спірит');
    expect(canon('Розчинник', 'Розчинник 646')).toBe('Розчинник 646');
  });
});

describe('Призначення — правила з категорій (перенесені з коду)', () => {
  it('загальні працюють без категорії', () => {
    expect(canon('Призначення', 'Захист деревини від гнилі, цвілі, синяви та комах')).toBe('Антисептичний захист деревини');
    expect(canon('Призначення', 'Тонування водоемульсійних фарб, акрилових штукатурок, ґрунтовок')).toBe('Тонування фарб, лаків і ґрунтовок');
  });
  it('категорійні — лише у своїй категорії', () => {
    expect(canon('Призначення', "Добавка для бетонних сумішей при від'ємних температурах", 'plastyfikatory-dlya-betonu')).toBe('Зимове бетонування (протиморозна добавка)');
    expect(canon('Призначення', 'Для всіх видів бетону', 'plastyfikatory-dlya-betonu')).toBe('Пластифікація бетонних і цементних розчинів');
    expect(canon('Призначення', 'Для всіх видів бетону', 'laky')).toBe('Для всіх видів бетону');
    expect(canon('Призначення', 'Перетворювач іржі для металу', 'rozchynnyky')).toBe('Перетворення іржі');
  });
  it('у фарбах «Призначення» більше не канонізується (його замінює «Поверхня»)', () => {
    expect(canon('Призначення', 'Захист металу від корозії', 'moltkovi-farby')).toBe('Захист металу від корозії');
  });
  it('інші лейбли не чіпає', () => {
    expect(canon('Колір', 'Універсальний')).toBe('Універсальний');
  });
});

describe('buildValueRules', () => {
  it('зіпсований регекс пропускається, решта правил лишаються', () => {
    const r = buildValueRules([{ label: 'X', value: 'A', match_patterns: ['(', 'a+'] }]);
    expect(r.get('X')![0].patterns).toHaveLength(1);
    expect(canonicalCharValue('X', 'aaa', { rules: r })).toBe('A');
  });
});

describe('applicableValues / valueInDictionary', () => {
  it('значення лейбла для категорії — лише ті, що діють у її родині', () => {
    expect(applicableValues('Основа', ctx('Основа', 'moltkovi-farby'))).toEqual(['Алкідна', 'Латексна', 'Силіконова', 'Акрилова']);
    expect(applicableValues('Основа', ctx('Основа', 'bitumni-mastyky'))).toEqual([]);
    expect(applicableValues('Ступінь блиску', ctx('Ступінь блиску', null))).toHaveLength(4);
  });
  it('у довіднику — канон або точний синонім; регекс-збіг НЕ рахується', () => {
    const c = ctx('Основа', 'alkidni-farby');
    expect(valueInDictionary('Основа', 'Алкідна', c)).toBe(true);
    expect(valueInDictionary('Основа', 'водоемульсійна', c)).toBe(true); // аліас Акрилової
    expect(valueInDictionary('Основа', 'Акрилова дисперсія (водна база)', c)).toBe(false);
    expect(valueInDictionary('Основа', 'Бітум', ctx('Основа', 'bitumni-mastyky'))).toBe(true); // без правил — вільний текст
  });
  it('multiselect — кожен шматок через «;» має бути в довіднику', () => {
    const c = ctx('Поверхня', 'laky');
    expect(valueInDictionary('Поверхня', 'Метал; Дерево', c)).toBe(true);
    expect(valueInDictionary('Поверхня', 'Метал; Скло', c)).toBe(false);
  });
});

describe('закритий список vs канонізатори (Призначення)', () => {
  it('глобальні правила змішаного лейбла список не закривають: диски/шпалери — вільний текст', () => {
    expect(applicableValues('Призначення', ctx('Призначення', 'vidrizni-dysky'))).toEqual([]);
    expect(valueInDictionary('Призначення', 'Різання металу', ctx('Призначення', 'vidrizni-dysky'))).toBe(true);
    // …але канонізація загальних формулювань і далі працює
    expect(canon('Призначення', 'Захист деревини від гнилі та синяви', 'vidrizni-dysky')).toBe('Антисептичний захист деревини');
  });
  it('де є правила родини — список закритий', () => {
    expect(applicableValues('Призначення', ctx('Призначення', 'plastyfikatory-dlya-betonu')).length).toBeGreaterThan(3);
    expect(valueInDictionary('Призначення', 'Для теплої підлоги', ctx('Призначення', 'plastyfikatory-dlya-betonu'))).toBe(false);
  });
});

describe('герметики (етап 4)', () => {
  const S = 'sylikonovi-germetyky';
  const sealantParent = new Map(parentOf); sealantParent.set(S, 'germetyky'); sealantParent.set('bitumni-germetyky', 'germetyky'); sealantParent.set('germetyky', null);
  const c = (label: string, cat = S): ValueContext => ({ rules, category: cat, parentOf: sealantParent, multiselect: label === 'Область застосування' });
  it('Матеріал: 21 формулювання → 7; нейтральний — окремо; поза герметиками не чіпається', () => {
    expect(canonicalCharValue('Матеріал', 'Силікон з фунгіцидними добавками', c('Матеріал'))).toBe('Силіконовий');
    expect(canonicalCharValue('Матеріал', 'Нейтральний силіконовий', c('Матеріал'))).toBe('Силіконовий нейтральний');
    expect(canonicalCharValue('Матеріал', 'Бітумно-каучуковий, на основі гермабутилу', c('Матеріал', 'bitumni-germetyky'))).toBe('Бітумний');
    expect(canonicalCharValue('Матеріал', 'МС-полімерний клей-герметик', c('Матеріал'))).toBe('MS-полімер');
    expect(canonicalCharValue('Матеріал', 'Сталь', { rules, category: 'shurupy-ta-samorizy', parentOf: sealantParent })).toBe('Сталь');
    expect(applicableValues('Матеріал', c('Матеріал'))).toEqual(['Силіконовий нейтральний', 'Силіконовий', 'Акриловий', 'Поліуретановий', 'MS-полімер', 'Бітумний', 'Силікатний']);
  });
  it('Область застосування: вільний текст → перелік канонів; у клеях лишається текстом', () => {
    expect(matchCanonicalValues('Область застосування', 'Санітарний; Герметизація швів у ванних, кухнях, на фасадах; вікна, двері, сантехніка', c('Область застосування')))
      .toEqual(['Санітарний']);
    expect(matchCanonicalValues('Область застосування', 'Герметик для монтажних швів, стики панелей', c('Область застосування'))).toEqual(['Монтажні шви']);
    expect(matchCanonicalValues('Область застосування', 'Термостійкий; Каміни, печі, димоходи, барбекю, топки', c('Область застосування')))
      .toEqual(['Печі та каміни']);
    expect(valueInDictionary('Область застосування', 'Стропила, балки', { rules, category: 'klei', parentOf: sealantParent, multiselect: true })).toBe(true);
    // нитка — окреме значення, лише для неї
    expect(applicableValues('Область застосування', { rules, category: 'nytka-dlya-trub', parentOf: sealantParent })).toEqual(["Різьбові з'єднання"]);
    expect(matchCanonicalValues('Область застосування', 'Водопостачання, опалення, газ', { rules, category: 'nytka-dlya-trub', parentOf: sealantParent, multiselect: true })).toEqual(["Різьбові з'єднання"]);
  });
  it('Під фарбування, Форма випуску', () => {
    expect(canonicalCharValue('Під фарбування', 'так, після повного висихання', c('Під фарбування'))).toBe('Так');
    expect(canonicalCharValue('Під фарбування', 'Ні', c('Під фарбування'))).toBe('Ні');
    expect(canonicalCharValue('Форма випуску', 'картридж 280 мл', c('Форма випуску'))).toBe('Картридж');
  });
});

describe('монтажна піна (етап 5)', () => {
  const foamParent = new Map(parentOf); for (const c of ['pistoletna-pina', 'pobutova-pina', 'pina-klei', 'vohnezakhysna-pina']) foamParent.set(c, 'montazhna-pina');
  const c = (label: string, cat = 'pobutova-pina'): ValueContext => ({ rules, category: cat, parentOf: foamParent });
  it('спосіб випуску, сезон', () => {
    expect(canonicalCharValue('Спосіб випуску з балона', 'Професійний пістолет', c('Спосіб випуску з балона'))).toBe('Під пістолет');
    expect(canonicalCharValue('Спосіб випуску з балона', 'трубка-адаптер', c('Спосіб випуску з балона'))).toBe('Трубка-адаптер');
    expect(canonicalCharValue('Сезон', 'всесезонний', c('Сезон'))).toBe('Всесезонна');
    expect(canonicalCharValue('Сезон', 'зима', c('Сезон'))).toBe('Зимова');
    expect(canonicalCharValue('Сезон', 'зима', { rules, category: 'klei', parentOf: foamParent })).toBe('зима'); // поза піною — вільний текст
  });
  it('вихід піни → діапазон за першим числом', () => {
    expect(canonicalCharValue('Вихід піни', 'до 30 л (залежно від умов)', c('Вихід піни'))).toBe('до 35 л');
    expect(canonicalCharValue('Вихід піни', 'до 45-50 л', c('Вихід піни'))).toBe('40–50 л');
    expect(canonicalCharValue('Вихід піни', 'до 65 л', c('Вихід піни'))).toBe('60–70 л');
    expect(canonicalCharValue('Вихід піни', '70 л', c('Вихід піни'))).toBe('60–70 л');
  });
  it('Тип піни = підкатегорія (закритий список з одного значення), у фарбах «Тип» вільний', () => {
    expect(applicableValues('Тип', c('Тип', 'pina-klei'))).toEqual(['Піна-клей']);
    expect(canonicalCharValue('Тип', 'Піна-клей монтажна', c('Тип', 'pina-klei'))).toBe('Піна-клей');
    expect(applicableValues('Тип', { rules, category: 'alkidni-farby', parentOf: foamParent })).toEqual([]);
  });
});

describe('клеї (етап 6)', () => {
  const glueParent = new Map(parentOf); for (const c of ['montazhnyi-klei', 'kontaktnyi-klei', 'pva-ta-stolyarnyi', 'super-klei', 'klei-dlya-shpaler']) glueParent.set(c, 'klei');
  const c = (label: string, cat = 'montazhnyi-klei'): ValueContext => ({ rules, category: cat, parentOf: glueParent, multiselect: label === 'Склеювані матеріали' });
  it('склеювані матеріали з переліку поверхонь — у порядку довідника, без дублів', () => {
    expect(matchCanonicalValues('Склеювані матеріали', 'Бетон, гіпсокартон, дерево, метал, пластик, камінь, кераміка', c('Склеювані матеріали')))
      .toEqual(['Дерево', 'Метал', 'Пластик', 'Кераміка та камінь', 'Бетон та штукатурка', 'Гіпсокартон']);
    expect(matchCanonicalValues('Склеювані матеріали', 'Ремонт взуття: шкіра, гума, текстиль', c('Склеювані матеріали', 'kontaktnyi-klei'))).toEqual(['Гума', 'Шкіра', 'Тканина']);
    expect(matchCanonicalValues('Склеювані матеріали', 'Для флізелінових шпалер', c('Склеювані матеріали', 'klei-dlya-shpaler'))).toEqual(['Шпалери']);
    // «акрилова основа» — не матеріал для склеювання
    expect(matchCanonicalValues('Склеювані матеріали', 'Акрилова основа, без розчинників', c('Склеювані матеріали'))).toEqual([]);
    // поза клеями правил немає
    expect(matchCanonicalValues('Склеювані матеріали', 'дерево, метал', { rules, category: 'alkidni-farby', parentOf: glueParent, multiselect: true })).toEqual([]);
  });
  it('стан, клас водостійкості, індикатор, компоненти', () => {
    expect(canonicalCharValue('Стан', 'рідкий (гель)', c('Стан', 'super-klei'))).toBe('Гель');
    expect(canonicalCharValue('Стан', 'Сухий концентрат (порошок)', c('Стан', 'klei-dlya-shpaler'))).toBe('Суха суміш');
    expect(canonicalCharValue('Стан', 'Порошок', c('Стан', 'klei-dlya-plytky'))).toBe('Суха суміш');
    expect(canonicalCharValue('Стан', 'готовий до застосування', c('Стан'))).toBe('готовий до застосування'); // не стан — лишається, скрипт бере дефолт
    expect(canonicalCharValue('Клас водостійкості', 'D3 (EN 204)', c('Клас водостійкості', 'pva-ta-stolyarnyi'))).toBe('D3');
    expect(canonicalCharValue('Клас водостійкості', 'водостійкий (для внутрішніх робіт)', c('Клас водостійкості', 'pva-ta-stolyarnyi'))).toBe('Водостійкий');
    expect(canonicalCharValue('Наявність індикатора', 'так (синій колір при нанесенні)', c('Наявність індикатора', 'klei-dlya-shpaler'))).toBe('Так');
    expect(canonicalCharValue('Наявність індикатора', 'немає', c('Наявність індикатора', 'klei-dlya-shpaler'))).toBe('Ні');
    expect(canonicalCharValue('Кількість компонентів', '2 (смола + затверджувач)', c('Кількість компонентів'))).toBe('Двокомпонентний');
    expect(canonicalCharValue('Кількість компонентів', '1 (однокомпонентний)', c('Кількість компонентів'))).toBe('Однокомпонентний');
  });
});

describe('ґрунтовки та шпаклівки (етап 7)', () => {
  const primerParent = new Map(parentOf); for (const c of ['gruntivky-gotovi', 'gruntivky-kontsentraty', 'betonokontakt', 'antygrybok', 'shpaklivky']) primerParent.set(c, 'gruntivky');
  const c = (label: string, cat = 'gruntivky-gotovi'): ValueContext => ({ rules, category: cat, parentOf: primerParent });
  it('Форма: готова/концентрат', () => {
    expect(canonicalCharValue('Форма', 'Ґрунт-концентрат', c('Форма', 'gruntivky-kontsentraty'))).toBe('Концентрат');
    expect(canonicalCharValue('Форма', 'готова до застосування', c('Форма'))).toBe('Готова до застосування');
    expect(applicableValues('Форма', { rules, category: 'klei', parentOf: primerParent })).toEqual([]);
  });
  it('Призначення — закритий список родини: адгезія, цвіль, висоли, зміцнення', () => {
    expect(canonicalCharValue('Призначення', 'Покращення адгезії основи', c('Призначення', 'betonokontakt'))).toBe('Покращення адгезії');
    expect(canonicalCharValue('Призначення', 'Знищення цвілі та грибка', c('Призначення', 'antygrybok'))).toBe('Захист від цвілі та грибка');
    expect(matchCanonicalValues('Призначення', 'Грунтовка Дивоцвіт Змивка висолів', c('Призначення'))).toEqual(['Видалення висолів']);
    expect(matchCanonicalValues('Призначення', 'Шпатлівка для дерева', { rules, category: 'shpaklivky', parentOf: primerParent })).toEqual(["Ремонт дерев'яних поверхонь"]);
    expect(canonicalCharValue('Призначення', 'Глибокопроникаюча ґрунтовка', c('Призначення'))).toBe('Ґрунтування та зміцнення поверхонь');
  });
});

describe('захист дерева (етап 8)', () => {
  const woodParent = new Map(parentOf); for (const c of ['morylky', 'antyseptyki', 'zakhysni-pokryttya']) woodParent.set(c, 'zakhyst-derevyny');
  const c = (label: string, cat = 'morylky'): ValueContext => ({ rules, category: cat, parentOf: woodParent });
  it('Призначення — закритий список родини', () => {
    expect(canonicalCharValue('Призначення', 'Декоративне тонування деревини', c('Призначення'))).toBe('Декоративне тонування деревини');
    expect(canonicalCharValue('Призначення', 'Лазур для дерева', c('Призначення'))).toBe('Декоративне тонування деревини');
    expect(canonicalCharValue('Призначення', 'Вогнебіозахисне просочення', c('Призначення', 'zakhysni-pokryttya'))).toBe('Вогнезахист деревини');
    expect(canonicalCharValue('Призначення', 'Захисне просочення деревини', c('Призначення', 'zakhysni-pokryttya'))).toBe('Захисне просочення деревини');
    expect(canonicalCharValue('Призначення', 'Захист деревини від гнилі та синяви', c('Призначення', 'antyseptyki'))).toBe('Антисептичний захист деревини');
  });
  it('Основа: водорозчинна → Акрилова у родині', () => {
    expect(canonicalCharValue('Основа', 'Водорозчинна', c('Основа', 'antyseptyki'))).toBe('Акрилова');
  });
});
