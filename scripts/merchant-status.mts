// Стан Google Merchant Center: джерела даних, остання виборка фіду, покриття
// каталогу і проблеми по товарах.
// Запуск: npx tsx --env-file=.env.local scripts/merchant-status.mts [--fetch]
//   --fetch — додатково запустити позачергову виборку фіду перед звітом
import { createClient } from '@supabase/supabase-js';
import * as merchantNS from '../lib/merchant';

// tsx транспілює lib/*.ts у CJS — названі експорти з .mts не видно, беремо namespace
const M = (merchantNS as unknown as { default: typeof merchantNS }).default ?? merchantNS;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function activeSkus(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let f = 0; ; f += 1000) {
    const { data } = await db.from('products').select('sku').eq('is_active', true).range(f, f + 999);
    for (const p of data ?? []) out.add(p.sku);
    if (!data || data.length < 1000) return out;
  }
}

const sources = await M.listDataSources();
console.log('## Джерела даних\n');
for (const s of sources) {
  const dest = s.primaryProductDataSource?.destinations?.map(d => `${d.destination}=${d.state}`).join(', ') ?? '—';
  console.log(`${s.dataSourceId}  ${s.displayName}`);
  console.log(`   тип ${s.input} · мова ${s.primaryProductDataSource?.contentLanguage ?? '—'} · ${dest}`);
  if (s.input === 'FILE') {
    const freq = s.fileInput?.fetchSettings?.frequency ?? '—';
    console.log(`   виборка ${freq}`);
    if (process.argv.includes('--fetch')) {
      await M.fetchNow(s.dataSourceId);
      console.log('   позачергову виборку запущено');
    }
    try {
      const u = await M.latestUpload(s.dataSourceId);
      console.log(`   остання: ${u.processingState} · всього ${u.itemsTotal ?? '—'} · створено ${u.itemsCreated ?? '—'} · оновлено ${u.itemsUpdated ?? '—'} · ${u.uploadTime ?? ''}`);
      for (const i of u.issues ?? []) console.log(`   ⚠ ${i.severity ?? ''} ${i.title}${i.count ? ` ×${i.count}` : ''}`);
    } catch (e) {
      console.log(`   виборок ще не було (${(e as Error).message.slice(0, 60)})`);
    }
  }
  console.log();
}

const rows = await M.productRows();
const tally = (pick: (r: merchantNS.ProductRow) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) { const k = pick(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`## Товари: ${rows.length}\n`);
console.log('статус:');
for (const [k, v] of tally(r => r.aggregatedReportingContextStatus ?? '—')) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('мова:');
for (const [k, v] of tally(r => r.languageCode ?? '—')) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('потенціал кліків:');
for (const [k, v] of tally(r => r.clickPotential ?? 'не оцінено')) console.log(`  ${String(v).padStart(4)}  ${k}`);

const issues = new Map<string, number>();
for (const r of rows) {
  for (const i of r.itemIssues ?? []) {
    const k = `${i.severity?.aggregatedSeverity ?? '—'} · ${i.issueType?.code ?? '—'}${i.issueType?.canonicalAttribute ? ` (${i.issueType.canonicalAttribute})` : ''}`;
    issues.set(k, (issues.get(k) ?? 0) + 1);
  }
}
console.log('\nпроблеми по товарах:');
if (!issues.size) console.log('  немає');
for (const [k, v] of [...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${String(v).padStart(4)}  ${k}`);

// Покриття: скільки активних товарів каталогу реально доїхало в україномовні картки
const skus = await activeSkus();
const inMc = new Set(rows.filter(r => r.languageCode === 'uk').map(r => r.offerId).filter(Boolean) as string[]);
const missing = [...skus].filter(s => !inMc.has(s));
console.log(`\n## Покриття каталогу\nактивних ${skus.size} · у Merchant (uk) ${inMc.size} · немає ${missing.length}`);
if (missing.length) console.log('  ' + missing.slice(0, 20).join(', ') + (missing.length > 20 ? ' …' : ''));
