import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../../../lib/db-paginate';
import { getCategoryNameRu } from '../../../../../../lib/ru';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * «Невидимий попит» для вкладки «Попит»: фрази з автопідказок Google
 * (search_demand, крон demand-crawl) згруповані по категоріях-темах.
 * Для кожної фрази — чи показуємось ми в GSC (покази/позиція) і чи є в нас
 * сторінка, що на неї відповідає (covered_path). Фрази без того й іншого —
 * і є список тем для статей.
 */
export type HiddenPhrase = {
  phrase: string; lang: 'uk' | 'ru'; modifier: string; seen: number;
  impressions: number | null; position: number | null; covered: string | null; kind: 'info' | 'buy' | 'other';
};
export type HiddenCluster = {
  slug: string; name: string; nameRu: string;
  total: number; uncovered: number; invisible: number;
  phrases: HiddenPhrase[];
};

// Межі слова — через p{L}:  у JS не знає кирилиці
const INFO = /^(як|який|яка|які|яку|скільки|чим|чи|чому|навіщо|коли|как|какой|какая|какие|какую|сколько|чем|можно ли|почему|зачем|когда)(?!\p{L})|(?<!\p{L})(як|как|скільки|сколько|чим|чем|відгук|отзыв|різниц|отлич|витрат|расход|сохне|сохнет|пропорц|нанос|вибрат|выбрать|краще|лучше|своїми|своими|чому|почему|навіщо|зачем|можна|можно)/iu;
const BUY = /(?<!\p{L})(купити|купить|ціна|цена|вартість|стоимость|оптом|недорого|дешево|прайс|магазин)(?!\p{L})/iu;

export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const [rows, cats, last] = await Promise.all([
    fetchAllRows<{ phrase: string; lang: 'uk' | 'ru'; category_slug: string; modifier: string; seen: number; gsc_impressions: number | null; gsc_position: number | null; covered_path: string | null; last_seen: string }>((f, t) =>
      db.from('search_demand').select('phrase, lang, category_slug, modifier, seen, gsc_impressions, gsc_position, covered_path, last_seen').range(f, t)),
    fetchAllRows<{ slug: string; name: string }>((f, t) => db.from('categories').select('slug, name').range(f, t)),
    db.from('search_demand').select('last_seen').order('last_seen', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const byCat = new Map<string, HiddenPhrase[]>();
  for (const r of rows) {
    const kind: HiddenPhrase['kind'] = BUY.test(r.phrase) ? 'buy' : INFO.test(r.phrase) ? 'info' : 'other';
    byCat.set(r.category_slug, [...(byCat.get(r.category_slug) ?? []), { phrase: r.phrase, lang: r.lang, modifier: r.modifier, seen: r.seen, impressions: r.gsc_impressions, position: r.gsc_position, covered: r.covered_path, kind }]);
  }
  const clusters: HiddenCluster[] = [];
  for (const [slug, phrases] of byCat) {
    const c = cats.find(x => x.slug === slug);
    // спершу невидимі інформаційні (стаття), потім комерційні без покриття, потім решта
    phrases.sort((a, b) => Number(!!a.covered) - Number(!!b.covered) || Number(a.impressions != null) - Number(b.impressions != null) || (a.kind === 'info' ? 0 : 1) - (b.kind === 'info' ? 0 : 1) || b.seen - a.seen);
    clusters.push({
      slug, name: c?.name ?? slug, nameRu: c ? getCategoryNameRu(c.slug, c.name) : slug,
      total: phrases.length,
      uncovered: phrases.filter(p => !p.covered).length,
      invisible: phrases.filter(p => !p.covered && p.impressions == null).length,
      phrases,
    });
  }
  clusters.sort((a, b) => b.invisible - a.invisible || b.total - a.total);
  const totals = { phrases: rows.length, uncovered: rows.filter(r => !r.covered_path).length, invisible: rows.filter(r => !r.covered_path && r.gsc_impressions == null).length, info: rows.filter(r => INFO.test(r.phrase)).length };
  return NextResponse.json({ clusters, totals, lastCrawl: (last.data as { last_seen: string } | null)?.last_seen ?? null });
}
