import { describe, it, expect } from 'vitest';
import { linkCategoriesInHtml, labelPattern, labelPatterns } from '../lib/article-links';

const links = [
  { href: '/shop/klei-dlya-shpaler', label: 'Клей для шпалер' },
  { href: '/shop/gruntivky-kontsentraty', label: 'Ґрунтовки-концентрати' },
  { href: '/shop/montazhna-pina', label: 'Монтажна піна' },
  { href: '/calculators', label: 'Калькулятори витрати' },
];

describe('labelPattern', () => {
  it('знаходить словоформи назви категорії', () => {
    expect(labelPattern('Ґрунтовки-концентрати')!.test('візьміть ґрунтовку-концентрат 1:4')).toBe(true);
    expect(labelPattern('Монтажна піна')!.test('без монтажної піни не обійтись')).toBe(true);
    expect(labelPattern('Клей для шпалер')!.test('клей для шпалер який вибрати')).toBe(true);
  });
  it('короткі однослівні назви не лінкуються, довгі — лише з коротким закінченням', () => {
    expect(labelPattern('Клеї')).toBeNull();
    expect(labelPattern('Фарби 3 в 1')).toBeNull();
    expect(labelPattern('Відрізні диски')!.test('чим відрізняються диски')).toBe(false);
    expect(labelPattern('Відрізні диски')!.test('відрізні диски по металу')).toBe(true);
    expect(labelPattern('Бітумні праймери')!.test('бітумна мастика')).toBe(false);
    expect(labelPattern('МС-полімерні герметики')!.test('час полімеризування герметика')).toBe(false);
    // довге однозначне перше слово — дозволене й окремо
    expect(labelPatterns('Пластифікатори для бетону')[1]!.test('пластифікатор у розчин')).toBe(true);
  });
});

describe('linkCategoriesInHtml', () => {
  it('перше згадування в абзаці стає посиланням, друге — ні', () => {
    const html = '<p>Питання клей для шпалер який вибрати виникає у кожного.</p><p>Клей для шпалер купують пачками.</p>';
    const out = linkCategoriesInHtml(html, links, 'uk');
    expect(out).toContain('<a href="/shop/klei-dlya-shpaler">клей для шпалер</a>');
    expect((out.match(/<a /g) ?? []).length).toBe(1);
    expect(out).toContain('<p>Клей для шпалер купують пачками.</p>');
  });

  it('не лізе в наявні посилання, заголовки й таблиці', () => {
    const html = '<h2>Монтажна піна</h2><p>Дивіться <a href="/x">монтажна піна тут</a>.</p><table><tr><td>монтажна піна</td></tr></table><p>Отже, монтажна піна потрібна.</p>';
    const out = linkCategoriesInHtml(html, links, 'uk');
    expect(out).toContain('<h2>Монтажна піна</h2>');
    expect(out).toContain('<a href="/x">монтажна піна тут</a>');
    expect(out).toContain('<td>монтажна піна</td>');
    expect(out).toContain('<a href="/shop/montazhna-pina">монтажна піна</a> потрібна');
  });

  it('не більше трьох посилань і лише на /shop/', () => {
    const many = [
      ...links,
      { href: '/shop/betonokontakt', label: 'Бетоноконтакт' },
      { href: '/shop/antygrybok', label: 'Антигрибкові засоби' },
    ];
    const html = '<p>клей для шпалер, ґрунтовка-концентрат, монтажна піна, бетоноконтакт, антигрибковий засіб, калькулятори витрати.</p>';
    const out = linkCategoriesInHtml(html, many, 'uk');
    expect((out.match(/<a /g) ?? []).length).toBe(3);
    expect(out).not.toContain('/calculators');
  });

  it('на /ru шукає російську назву категорії', () => {
    const html = '<p>Клей для обоев выбирают по типу покрытия.</p>';
    const out = linkCategoriesInHtml(html, links, 'ru');
    expect(out).toContain('<a href="/shop/klei-dlya-shpaler">Клей для обоев</a>');
  });

  it('без збігів повертає HTML без змін і не ламає сутності', () => {
    const html = '<p>Текст про &quot;щось&quot; інше &amp; ще.</p>';
    expect(linkCategoriesInHtml(html, links, 'uk')).toBe(html);
  });
});
