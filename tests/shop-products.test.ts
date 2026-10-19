import { describe, it, expect } from 'vitest';
import { branchRoot, assembleCatalog } from '../lib/shop-products';

const CATS = [
  { slug: 'farby', parent_slug: null },
  { slug: 'farby-3v1', parent_slug: 'farby' },
  { slug: 'molotkovi', parent_slug: 'farby-3v1' },
  { slug: 'germetyky', parent_slug: null },
];

describe('branchRoot', () => {
  it('піднімається до кореня через онуків', () => {
    expect(branchRoot(CATS, 'molotkovi')).toBe('farby');
    expect(branchRoot(CATS, 'farby-3v1')).toBe('farby');
  });
  it('коренева й невідома категорія — сама собою', () => {
    expect(branchRoot(CATS, 'germetyky')).toBe('germetyky');
    expect(branchRoot(CATS, 'nema')).toBe('nema');
  });
  it('не зациклюється на битому дереві', () => {
    expect(branchRoot([{ slug: 'a', parent_slug: 'b' }, { slug: 'b', parent_slug: 'a' }], 'a')).toMatch(/^[ab]$/);
  });
});

describe('assembleCatalog', () => {
  const P = (sku: string, tag = 'x') => ({ sku, tag });

  it('без довантажених — той самий масив', () => {
    const initial = [P('b')];
    expect(assembleCatalog(['a', 'b', 'c'], initial, new Map())).toBe(initial);
  });
  it('збирає в серверному порядку, а не «стартові + хвіст»', () => {
    const out = assembleCatalog(['a', 'b', 'c'], [P('b')], new Map([['c', P('c')], ['a', P('a')]]));
    expect(out.map(p => p.sku)).toEqual(['a', 'b', 'c']);
  });
  it('стартовий товар важливіший за довантажений (той самий, що в HTML)', () => {
    const out = assembleCatalog(['a', 'b'], [P('b', 'page')], new Map([['b', P('b', 'api')], ['a', P('a')]]));
    expect(out.find(p => p.sku === 'b')?.tag).toBe('page');
  });
  it('новий товар поза списком — у кінці; зниклий — пропускається', () => {
    const out = assembleCatalog(['a', 'gone', 'b'], [P('a')], new Map([['b', P('b')], ['new', P('new')]]));
    expect(out.map(p => p.sku)).toEqual(['a', 'b', 'new']);
  });
});
