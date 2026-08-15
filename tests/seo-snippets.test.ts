import { describe, it, expect } from 'vitest';
import { expectedCtr, findDuplicates, parseHead, type SnippetRow } from '../lib/seo/snippets';
import { costOf, totalCost, CostSink } from '../lib/ai-cost';

describe('expectedCtr', () => {
  it('спадає з позицією і не зникає в нуль', () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(5)).toBeGreaterThan(expectedCtr(15));
    expect(expectedCtr(50)).toBeGreaterThan(0);
  });

  it('дробова позиція округлюється до цілої', () => {
    expect(expectedCtr(5.4)).toBe(expectedCtr(5));
  });
});

describe('parseHead', () => {
  const html = `<!doctype html><html><head>
    <title>Ґрунтовка — купити в Україні | FIXLINE</title>
    <meta name="description" content="Опис із &quot;лапками&quot; та &amp; амперсандом">
    <link rel="canonical" href="https://fixline.com.ua/shop/grunty">
    <meta name="robots" content="noindex, follow">
  </head><body><h1>Ґрунтовки <span>для стін</span></h1></body></html>`;

  it('дістає title, description, canonical, robots і h1', () => {
    const h = parseHead(html);
    expect(h.title).toBe('Ґрунтовка — купити в Україні | FIXLINE');
    expect(h.description).toBe('Опис із "лапками" та & амперсандом');
    expect(h.canonical).toBe('https://fixline.com.ua/shop/grunty');
    expect(h.robots).toBe('noindex, follow');
    expect(h.h1).toBe('Ґрунтовки для стін');
  });

  it('відсутні теги дають null, а не падіння', () => {
    const h = parseHead('<html><head></head><body></body></html>');
    expect(h.title).toBeNull();
    expect(h.description).toBeNull();
    expect(h.canonical).toBeNull();
  });

  it('читає description і при зворотному порядку атрибутів', () => {
    const h = parseHead('<head><meta content="Текст опису" name="description"></head>');
    expect(h.description).toBe('Текст опису');
  });
});

describe('findDuplicates', () => {
  const row = (path: string, title: string, description: string) => ({
    path, title, description,
    impressions: 0, clicks: 0, ctr: 0, position: 1, lostClicks: 0,
    canonical: null, robots: null, h1: null, fetchError: null,
  }) as SnippetRow;

  it('знаходить однакові title на різних сторінках', () => {
    const dups = findDuplicates([
      row('/a', 'Один і той самий', 'опис A'),
      row('/b', 'Один і той самий', 'опис B'),
      row('/c', 'Інший', 'опис C'),
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0].field).toBe('title');
    expect(dups[0].paths).toEqual(['/a', '/b']);
  });

  it('унікальні мета-теги дублів не дають', () => {
    expect(findDuplicates([row('/a', 'A', 'a'), row('/b', 'B', 'b')])).toHaveLength(0);
  });
});

describe('costOf', () => {
  it('рахує вхідні й вихідні токени за тарифом моделі', () => {
    // opus: $5/$25 за млн → 1М входу + 1М виходу = $30
    expect(costOf('claude-opus-4-8', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(30);
  });

  it('дата в кінці ID не ламає пошук тарифу', () => {
    expect(costOf('claude-haiku-4-5-20251001', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(1);
  });

  it('читання з кешу дешевше за звичайний вхід', () => {
    const plain = costOf('claude-opus-4-8', { input_tokens: 1_000_000 });
    const cached = costOf('claude-opus-4-8', { cache_read_input_tokens: 1_000_000 });
    expect(cached).toBeLessThan(plain);
  });

  it('невідома модель дає 0, а не вигадану суму', () => {
    expect(costOf('gpt-невідомо', { input_tokens: 1_000_000 })).toBe(0);
  });

  it('CostSink підсумовує різні моделі', () => {
    const sink = new CostSink();
    sink.add('claude-opus-4-8', { output_tokens: 100_000 });   // $2.50
    sink.add('claude-haiku-4-5', { output_tokens: 100_000 });  // $0.50
    expect(sink.usd).toBe(3);
    expect(totalCost([
      { model: 'claude-opus-4-8', usage: { output_tokens: 100_000 } },
      { model: 'claude-haiku-4-5', usage: { output_tokens: 100_000 } },
    ])).toBe(3);
  });
});
