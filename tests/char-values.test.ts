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
  it('поза фарбами «Основа» не чіпається: бітум у мастиках, «Водна» у колорантів', () => {
    expect(canon('Основа', 'Бітумна емульсія на водній основі', 'bitumni-mastyky')).toBe('Бітумна емульсія на водній основі');
    expect(canon('Основа', 'Водна', 'koloranty')).toBe('Водна');
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
      .toEqual(['Санітарний', 'Фасади та шви', 'Вікна та двері']);
    expect(matchCanonicalValues('Область застосування', 'Термостійкий; Каміни, печі, димоходи, барбекю, топки', c('Область застосування')))
      .toEqual(['Печі та каміни']);
    expect(valueInDictionary('Область застосування', 'Стропила, балки', { rules, category: 'klei', parentOf: sealantParent, multiselect: true })).toBe(true);
  });
  it('Під фарбування, Форма випуску', () => {
    expect(canonicalCharValue('Під фарбування', 'так, після повного висихання', c('Під фарбування'))).toBe('Так');
    expect(canonicalCharValue('Під фарбування', 'Ні', c('Під фарбування'))).toBe('Ні');
    expect(canonicalCharValue('Форма випуску', 'картридж 280 мл', c('Форма випуску'))).toBe('Картридж');
  });
});
