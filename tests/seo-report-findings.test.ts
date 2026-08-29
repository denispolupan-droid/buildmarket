import { describe, it, expect } from 'vitest';
import { buildFindings, pageKind, type KindRow, type PageRow, type QueryRow, type Metrics } from '../lib/seo/report-findings';

// Висновки звіту рахуються правилами, а не пишуться текстом — саме тому їх треба
// закріпити: мовчазний зсув порогу перетворив би звіт на впевнену брехню
// («трафік росте», коли він упав).

const m = (clicks: number, impressions: number, position: number): Metrics => ({
  clicks, impressions, ctr: impressions ? (clicks / impressions) * 100 : 0, position,
});

const kind = (k: string, impressions: number, clicks: number, total: number): KindRow => ({
  kind: k, impressions, clicks, prevImpressions: 0, prevClicks: 0,
  ctr: impressions ? (clicks / impressions) * 100 : 0,
  clickShare: total ? (clicks / total) * 100 : 0,
});

const page = (path: string, impressions: number, delta: number, prevImpressions = 0): PageRow => ({
  path, kind: pageKind(path), impressions, clicks: 0, position: 5, prevImpressions, delta,
});

const query = (q: string, impressions: number, position: number): QueryRow => ({
  query: q, impressions, clicks: 0, position, prevImpressions: 0,
});

const base = { growth: [], decline: [], zeroClick: [], pages: [], days: 28 };

const titles = (f: { title: string }[]) => f.map(x => x.title);

describe('висновки звіту', () => {
  it('зростання і падіння розрізняються за порогом, а не «на око»', () => {
    const up = buildFindings({ ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2), kinds: [] });
    expect(up[0].tone).toBe('good');
    expect(up[0].text).toContain('у 2,9 раза');

    const down = buildFindings({ ...base, cur: m(50, 5000, 20), prev: m(100, 9000, 18), kinds: [] });
    expect(down[0].tone).toBe('warn');

    const flat = buildFindings({ ...base, cur: m(100, 9000, 18), prev: m(95, 8800, 18), kinds: [] });
    expect(flat[0].tone).toBe('info');
    expect(flat[0].title).toContain('тримається');
  });

  it('відрізняє зростання позицій від зростання клікабельності', () => {
    // CTR той самий, позиція покращилась — виріс показ, а не сніпет
    const byPosition = buildFindings({ ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2), kinds: [] });
    expect(titles(byPosition).some(t => t.includes('не клікабельність'))).toBe(true);

    // Покази ті самі, кліків удвічі більше — це вже сніпети
    const byCtr = buildFindings({ ...base, cur: m(200, 10000, 18), prev: m(100, 10000, 18), kinds: [] });
    expect(titles(byCtr).some(t => t.includes('клікабельніш'))).toBe(true);
  });

  it('ловить тип сторінок із попитом, але без кліків', () => {
    const f = buildFindings({
      ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2),
      kinds: [kind('Категорії', 2745, 2, 200), kind('Статті', 8708, 122, 200)],
    });
    const warn = f.find(x => x.title.startsWith('Категорії'));
    expect(warn, 'категорії з CTR 0,07% мають потрапити у висновки').toBeTruthy();
    expect(warn!.text).toContain('0,07%');
    expect(warn!.text).toContain('2 переходи');            // не «2 переходів»

    // Той самий CTR, але мало показів — це ще не сигнал, а шум
    const quiet = buildFindings({
      ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2),
      kinds: [kind('Інші', 120, 0, 200)],
    });
    expect(quiet.some(x => x.title.startsWith('Інші'))).toBe(false);
  });

  it('називає резерв, коли запити з показами не дають кліків', () => {
    const f = buildFindings({
      ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2), kinds: [],
      zeroClick: [query('клей для мозаїки', 130, 40.7), query('грунтовка ceresit ct 17', 100, 48.5), query('купити пластифікатор', 69, 45.9)],
    });
    const reserve = f.find(x => x.title.includes('резерв'));
    expect(reserve).toBeTruthy();
    expect(reserve!.text).toContain('«клей для мозаїки»');
    expect(reserve!.text).toContain('3 запити');           // не «3 запитів»

    // Два запити — ще не закономірність
    const few = buildFindings({
      ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2), kinds: [],
      zeroClick: [query('a', 130, 40), query('b', 100, 48)],
    });
    expect(few.some(x => x.title.includes('резерв'))).toBe(false);
  });

  it('бачить відставання російської версії тієї самої статті', () => {
    const uk = page('/blog/rozrakhunok', 1690, 1690);
    const ru = { ...page('/ru/blog/rozrakhunok', 513, 252), position: 9.4 };
    const f = buildFindings({
      ...base, cur: m(200, 16719, 15.7), prev: m(70, 5850, 20.2), kinds: [], pages: [uk, ru],
    });
    expect(titles(f).some(t => t.includes('Російська версія'))).toBe(true);
  });

  it('мовчить там, де сказати нічого', () => {
    const f = buildFindings({ ...base, cur: m(0, 0, 0), prev: m(0, 0, 0), kinds: [] });
    expect(f).toHaveLength(0);
  });
});
