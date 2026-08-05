import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RU_PREFIXES, localizeHref, switchLangUrl, getLang } from '../lib/lang';

// Забутий у RU_PREFIXES маршрут ламає не тільки власне посилання. Користувач
// іде на українську сторінку, getLang бачить шлях без /ru і перемикає ВСЮ шапку
// на українську — далі всі кліки ведуть не туди. Саме так «Опт» на /ru витягував
// людину з російської версії, і наступний клік по «Блог» відкривав українську.
// Тому список звіряємо з файловою системою, а не тримаємо в голові.

const RU_DIR = path.join(process.cwd(), 'app', 'ru');

function ruRouteDirs(): string[] {
  return fs.readdirSync(RU_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('[') && !e.name.startsWith('('))
    .map(e => e.name);
}

describe('RU_PREFIXES', () => {
  it('покриває кожну теку-маршрут в app/ru', () => {
    const missing = ruRouteDirs().filter(name => !RU_PREFIXES.includes(`/${name}`));
    expect(missing, `у app/ru є маршрути, яких немає в RU_PREFIXES: ${missing.join(', ')}`).toEqual([]);
  });

  it('не містить шляхів без російської версії', () => {
    const dirs = new Set(ruRouteDirs());
    const stale = RU_PREFIXES.filter(p => p !== '/' && !dirs.has(p.slice(1)));
    expect(stale, `у RU_PREFIXES є шляхи без теки в app/ru: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('localizeHref', () => {
  it('українською лишає шлях як є', () => {
    expect(localizeHref('/opt', 'uk')).toBe('/opt');
    expect(localizeHref('/blog', 'uk')).toBe('/blog');
  });

  it('російською додає префікс відомим шляхам', () => {
    expect(localizeHref('/opt', 'ru')).toBe('/ru/opt');
    expect(localizeHref('/blog', 'ru')).toBe('/ru/blog');
    expect(localizeHref('/shop/germetyky', 'ru')).toBe('/ru/shop/germetyky');
    expect(localizeHref('/', 'ru')).toBe('/ru');
  });

  it('не чіпає шляхи без російської версії', () => {
    expect(localizeHref('/admin', 'ru')).toBe('/admin');
    expect(localizeHref('/register', 'ru')).toBe('/register');
  });
});

describe('switchLangUrl', () => {
  it('веде на дзеркало тієї самої сторінки, а не на головну', () => {
    expect(switchLangUrl('/opt')).toBe('/ru/opt');
    expect(switchLangUrl('/blog')).toBe('/ru/blog');
    expect(switchLangUrl('/blog/betonokontakt')).toBe('/ru/blog/betonokontakt');
  });

  it('знімає префікс у зворотний бік', () => {
    expect(switchLangUrl('/ru/opt')).toBe('/opt');
    expect(switchLangUrl('/ru')).toBe('/');
  });

  it('для сторінок без дзеркала веде на російську головну', () => {
    expect(switchLangUrl('/register')).toBe('/ru');
  });
});

describe('getLang', () => {
  it('визначає мову за префіксом', () => {
    expect(getLang('/ru/blog')).toBe('ru');
    expect(getLang('/blog')).toBe('uk');
    expect(getLang('/')).toBe('uk');
  });
});
