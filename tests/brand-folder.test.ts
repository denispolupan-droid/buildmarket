import { describe, it, expect } from 'vitest';
import { brandFolder } from '../lib/seo/slug';

// Папка бренду йде в ключ R2 і далі — у публічний URL картинки, який читає
// Google Merchant. Разова міграція картинок різала бренд регуляркою без
// транслітерації, і всі кирилічні бренди перетворилися на рядки з самих
// дефісів: «Дивоцвіт» → "--------", «Титан» → "-----". Бренди однакової
// довжини при цьому склалися в одну папку.
describe('brandFolder', () => {
  it('транслітерує кирилицю, а не ріже її в дефіси', () => {
    for (const [brand, folder] of [
      ['Дивоцвіт', 'dyvotsvit'],
      ['Титан', 'tytan'],
      ['Сталь', 'stal'],
      ['Хімік', 'khimik'],
      ['Байрис', 'bairys'],
      ['Хімконтакт', 'khimkontakt'],
    ] as const) {
      expect(brandFolder(brand)).toBe(folder);
    }
  });

  it('жодна папка не складається з самих дефісів', () => {
    for (const b of ['Дивоцвіт', 'Титан', 'Сталь', 'ПОЛЯРА-ХИМ', 'СИЛА', 'ХАDО']) {
      expect(brandFolder(b)).not.toMatch(/^-+$/);
    }
  });

  it('різні кирилічні бренди однакової довжини не зливаються в одну папку', () => {
    const folders = ['Хімік', 'Сталь', 'Титан'].map(brandFolder);
    expect(new Set(folders).size).toBe(3);
  });

  it('латинські бренди лишаються як були — старі папки не переїжджають', () => {
    expect(brandFolder('Lacrysil')).toBe('lacrysil');
    expect(brandFolder('Ceresit')).toBe('ceresit');
    expect(brandFolder('Дніпро-М')).toBe('dnipro-m');
  });

  it('порожній або беззмістовний бренд дає запасну папку, а не порожній ключ', () => {
    expect(brandFolder('   ')).toBe('other');
    expect(brandFolder('!!!')).toBe('other');
  });
});
