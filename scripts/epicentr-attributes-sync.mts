/**
 * Довідник атрибутів Епіцентру для наших категорій → lib/data/epicentr-attributes.json.
 *
 * Джерело — Merchant API: GET /v2/pim/attribute-sets?filter[codes][]=… (набори з
 * атрибутами: код, тип, обов'язковість, назва, суфікс одиниці) і
 * GET /v2/pim/attribute-sets/{set}/attributes/{attr}/options (значення для
 * select/multiselect). Коди наборів беруться з categories.epicentr_category_code.
 * Ліміт сторінки API — 100. Файл читає фід (lib/epicentr-attributes).
 *
 *   npx tsx --env-file=.env.local scripts/epicentr-attributes-sync.mts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import * as supabaseNS from '../lib/supabase';
type Mod<T> = T & { default?: T };
const { createServiceClient } = (supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS;

const BASE = 'https://merchant-api.epicentrm.com.ua';
const db = createServiceClient();

const { data: tokenRow } = await db.from('app_settings').select('value').eq('key', 'epicentr_api_token').maybeSingle();
const token = (tokenRow?.value as string | undefined) || process.env.EPICENTR_API_TOKEN;
if (!token) throw new Error('немає ключа Епіцентру');

async function api<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}`, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

type Tr = { languageCode: string; title?: string; value?: string; suffix?: string; prefix?: string };
type ApiAttr = { code: string; type: string; isSystem: boolean; isRequired: boolean; isFilter: boolean; translations: Tr[] };
type ApiSet = { code: string; translations: Tr[]; attributes: ApiAttr[] };
type Page<T> = { page: number; pages: number; items: T[] };

const ua = (trs: Tr[] | undefined, k: 'title' | 'value' | 'suffix') =>
  (trs ?? []).find(t => t.languageCode === 'ua')?.[k] ?? (trs ?? [])[0]?.[k] ?? '';

const { data: cats } = await db.from('categories').select('epicentr_category_code').not('epicentr_category_code', 'is', null).limit(1000);
const codes = [...new Set((cats ?? []).map(c => String(c.epicentr_category_code)))].sort();
console.log('наборів:', codes.length);

const sets: ApiSet[] = [];
for (let i = 0; i < codes.length; i += 50) {
  const q = codes.slice(i, i + 50).map(c => `filter[codes][]=${c}`).join('&');
  const page = await api<Page<ApiSet>>(`/v2/pim/attribute-sets?limit=100&${q}`);
  sets.push(...page.items);
}

export type EpiOption = { code: string; ua: string };
export type EpiAttribute = {
  code: string; type: string; required: boolean; system: boolean; title: string; suffix: string;
  options?: EpiOption[];
  /** словник відкритий (тисячі значень: кольори виробника, колекції) — не тягнемо, не мапимо */
  unbounded?: boolean;
};
export type EpiAttributeSet = { code: string; title: string; attributes: EpiAttribute[] };

const out: EpiAttributeSet[] = [];
let optionCalls = 0;
for (const s of sets) {
  const attrs: EpiAttribute[] = [];
  for (const a of s.attributes) {
    const item: EpiAttribute = {
      code: a.code, type: a.type, required: a.isRequired, system: a.isSystem,
      title: ua(a.translations, 'title'), suffix: ua(a.translations, 'suffix'),
    };
    if (a.type === 'select' || a.type === 'multiselect') {
      const opts: EpiOption[] = [];
      // Понад 20 сторінок (2 000 значень) — відкритий словник, у файл не тягнемо
      let unbounded = false;
      for (let p = 1; p <= 20; p++) {
        const pg = await api<Page<{ code: string; translations: Tr[] }>>(`/v2/pim/attribute-sets/${s.code}/attributes/${a.code}/options?limit=100&page=${p}`);
        optionCalls++;
        for (const o of pg.items) {
          opts.push({ code: o.code, ua: ua(o.translations, 'value') });
        }
        if ((pg.pages || 1) > 20) { unbounded = true; break; }
        if (p >= (pg.pages || 1)) break;
        // brand — 55 тис. значень; у файл не тягнемо (є lib/epicentr-dictionaries)
        if (a.code === 'brand' && p >= 1) break;
      }
      if (unbounded) item.unbounded = true;
      else if (a.code !== 'brand') item.options = opts;
    }
    attrs.push(item);
  }
  out.push({ code: s.code, title: ua(s.translations, 'title'), attributes: attrs });
  console.log(`${s.code} ${ua(s.translations, 'title')}: ${attrs.length} атрибутів, опцій ${attrs.reduce((n, a) => n + (a.options?.length ?? 0), 0)}`);
}

mkdirSync('lib/data', { recursive: true });
writeFileSync('lib/data/epicentr-attributes.json', JSON.stringify({ generatedAt: new Date().toISOString(), sets: out }));
console.log('записано lib/data/epicentr-attributes.json; запитів опцій:', optionCalls);
