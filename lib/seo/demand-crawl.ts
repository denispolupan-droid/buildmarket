import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../db-paginate';
import { getCategoryNameRu } from '../ru';
import { queryAll } from '../gsc';

/**
 * Обхід автопідказок Google по темах категорій — джерело «невидимого попиту»
 * для вкладки «Попит» (search_demand). Для кожної категорії беремо її назву
 * uk і ru як насіння, дописуємо модифікатори питань і покупки, і збираємо все,
 * що Google пропонує. Це не частотність (її Google не віддає), а факт: фразу
 * набирають достатньо часто, щоб потрапити в підказки.
 *
 * Фільтр по темі обов'язковий: на «рідке скло» підказки приносять «для авто»
 * й «для волосся» — тримаємо лише фрази, у яких є основа насіння, і без
 * стоп-слів чужих ніш.
 *
 * Покриття рахуємо тут же, у момент обходу: покази/позиція з GSC за 90 днів
 * (є — значить, ми вже показуємось) і найближча наша сторінка за словами
 * (заголовки статей, питання FAQ статей і категорій, назви категорій).
 */

export const MODIFIERS: Record<'uk' | 'ru', string[]> = {
  uk: ['', ' як', ' який', ' яка', ' скільки', ' чим', ' для', ' чи', ' відгуки', ' ціна', ' купити'],
  ru: ['', ' как', ' какой', ' какая', ' сколько', ' чем', ' для', ' можно ли', ' отзывы', ' цена', ' купить'],
};

/**
 * Назви-омоніми: «Інструменти» приносять оркестр, «Пістолети» — поліцію, «Антисептики» — горло.
 * Для них насіння — конкретне будівельне формулювання, а не назва категорії.
 */
export const SEED_OVERRIDE: Record<string, { uk: string; ru: string }> = {
  instrumenty: { uk: 'будівельний інструмент', ru: 'строительный инструмент' },
  farby: { uk: 'фарба для стін', ru: 'краска для стен' },
  pistolety: { uk: 'пістолет для герметика', ru: 'пистолет для герметика' },
  antyseptyki: { uk: 'антисептик для дерева', ru: 'антисептик для дерева' },
  grunty: { uk: 'ґрунт для фарбування', ru: 'грунт под покраску' },
  rozchynnyky: { uk: 'розчинник для фарби', ru: 'растворитель для краски' },
  kriplennya: { uk: 'дюбелі та шурупи', ru: 'дюбеля и саморезы' },
  'vytratni-materialy': { uk: 'витратні матеріали для ремонту', ru: 'расходные материалы для ремонта' },
  klei: { uk: 'будівельний клей', ru: 'строительный клей' },
  laky: { uk: 'лак для дерева', ru: 'лак для дерева' },
};

// Межі слова — через p{L}:  у JS не знає кирилиці й ніколи не спрацьовує між пробілом і літерою
const STOP = /(?<!\p{L})(авто|автомоб|машин|волос|ногт|нігт|зуб|обув|взутт|одяг|одежд|тату|макіяж|макияж|кулінар|рецепт|игр|гра(?!\p{L})|фільм|фильм|аліекспрес|aliexpress|олх|olx|музич|музык|оркестр|поліц|полиц|стріля|стреля|орбиз|бухобл|рахунок|счет(?!\p{L})|склонен|перенес|слово|слайм|картин|номерам|горла|рота|кожи|беремен|антибіот|антибиот|спектр|лікар|больниц|компʼют|комп'ют|компьют|оргтехн|шиномонт|салон|якут|бизнес|бізнес|англійськ|автокріс|якір|якор|пучинист|просадоч|насыпн|водоупор|слабы|неслежав|індії|джаз|естрад|фломастер|нарисова|смешать чтобы|коричнев)/iu;

type Row = { phrase: string; lang: 'uk' | 'ru'; category_slug: string; modifier: string };

/** Основи слів (5 літер) — щоб «ґрунтовка» ловила «ґрунтовки», «герметик» — «герметика». */
export const stems = (s: string) => s.toLowerCase().replace(/[’ʼ`']/g, '').split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4).map(w => w.slice(0, 5));

export async function suggest(q: string, hl: 'uk' | 'ru'): Promise<string[]> {
  const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl}&gl=ua&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return [];
  const cs = /charset=([\w-]+)/i.exec(r.headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  const buf = new Uint8Array(await r.arrayBuffer());
  let text: string;
  try { text = new TextDecoder(cs).decode(buf); } catch { text = new TextDecoder('utf-8').decode(buf); }
  try { return (JSON.parse(text)[1] as string[]) ?? []; } catch { return []; }
}

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

/** Насіння категорії: назва в однині-ключі — «Силіконові герметики» → «силіконовий герметик» Google і так підкаже. Беремо назву як є, нижнім регістром. */
function seedOf(name: string): string {
  return name.toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export type CrawlResult = { categories: number; requests: number; phrases: number; newPhrases: number; seconds: number };

export async function crawlDemand(opts: { onlySlugs?: string[]; delayMs?: number } = {}): Promise<CrawlResult> {
  const t0 = Date.now();
  const client = db();
  const [cats, posts, content] = await Promise.all([
    fetchAllRows<{ slug: string; name: string; parent_slug: string | null }>((f, t) => client.from('categories').select('slug, name, parent_slug').range(f, t)),
    fetchAllRows<{ slug: string; title: string; title_ru: string | null; faq: { q: string }[] | null; faq_ru: { q: string }[] | null }>((f, t) => client.from('blog_posts').select('slug, title, title_ru, faq, faq_ru').eq('is_published', true).range(f, t)),
    fetchAllRows<{ slug: string; lang: string; faq: { q: string }[] | null; guide: { title: string; sections: { h: string }[] } | null }>((f, t) => client.from('category_content').select('slug, lang, faq, guide').range(f, t)),
  ]);
  const targets = opts.onlySlugs ? cats.filter(c => opts.onlySlugs!.includes(c.slug)) : cats;

  // Індекс нашого контенту: набір основ → шлях
  const docs: { path: string; stems: Set<string> }[] = [];
  for (const p of posts) {
    const text = [p.title, p.title_ru ?? '', ...(p.faq ?? []).map(f => f.q), ...(p.faq_ru ?? []).map(f => f.q)].join(' ');
    docs.push({ path: `/blog/${p.slug}`, stems: new Set(stems(text)) });
  }
  for (const c of cats) {
    const cc = content.filter(x => x.slug === c.slug);
    const text = [c.name, getCategoryNameRu(c.slug, c.name), ...cc.flatMap(x => [...(x.faq ?? []).map(f => f.q), x.guide?.title ?? '', ...(x.guide?.sections ?? []).map(s => s.h)])].join(' ');
    docs.push({ path: `/shop/${c.slug}`, stems: new Set(stems(text)) });
  }
  const coveredBy = (phrase: string): string | null => {
    const ps = stems(phrase); if (ps.length < 2) return null;
    let best: { path: string; hit: number } | null = null;
    for (const d of docs) { const hit = ps.filter(s => d.stems.has(s)).length; if (hit / ps.length >= 0.75 && (!best || hit > best.hit)) best = { path: d.path, hit }; }
    return best?.path ?? null;
  };

  // GSC: де ми вже показуємось
  const gsc = new Map<string, { i: number; p: number }>();
  try {
    for (const r of await queryAll({ dimensions: ['query'], days: 90 })) gsc.set(r.keys[0].toLowerCase(), { i: r.impressions, p: r.position });
  } catch { /* без GSC — покриття лише за контентом */ }

  const found = new Map<string, Row>();
  let requests = 0;
  const delay = opts.delayMs ?? 120;
  for (const c of targets) {
    for (const lang of ['uk', 'ru'] as const) {
      const seed = SEED_OVERRIDE[c.slug]?.[lang] ?? seedOf(lang === 'ru' ? getCategoryNameRu(c.slug, c.name) : c.name);
      const seedStems = stems(seed);
      for (const mod of MODIFIERS[lang]) {
        let list: string[] = [];
        try { list = await suggest(seed + mod, lang); } catch { /* пропускаємо */ }
        requests++;
        for (const raw of list) {
          const phrase = raw.toLowerCase().replace(/\s+/g, ' ').trim();
          if (!phrase || STOP.test(phrase)) continue;
          const ps = stems(phrase);
          // фраза має містити хоча б одну основу насіння — інакше це чужа тема
          if (!seedStems.some(s => ps.includes(s))) continue;
          const key = `${phrase}|${lang}`;
          if (!found.has(key)) found.set(key, { phrase, lang, category_slug: c.slug, modifier: mod.trim() });
        }
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Що вже є в таблиці — щоб порахувати нові й накопичити seen
  const existing = new Map<string, { seen: number }>();
  for (const r of await fetchAllRows<{ phrase: string; lang: string; seen: number }>((f, t) => client.from('search_demand').select('phrase, lang, seen').range(f, t))) existing.set(`${r.phrase}|${r.lang}`, { seen: r.seen });

  const today = new Date().toISOString().slice(0, 10);
  const rows = [...found.values()].map(r => {
    const g = gsc.get(r.phrase); const ex = existing.get(`${r.phrase}|${r.lang}`);
    return { ...r, last_seen: today, seen: (ex?.seen ?? 0) + 1, gsc_impressions: g?.i ?? null, gsc_position: g ? Math.round(g.p * 10) / 10 : null, covered_path: coveredBy(r.phrase) };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await client.from('search_demand').upsert(rows.slice(i, i + 200), { onConflict: 'phrase,lang' });
    if (error) throw error;
  }
  return { categories: targets.length, requests, phrases: rows.length, newPhrases: rows.filter(r => !existing.has(`${r.phrase}|${r.lang}`)).length, seconds: Math.round((Date.now() - t0) / 1000) };
}
