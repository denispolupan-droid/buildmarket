/**
 * Разовий добір історії Search Console у gsc_daily.
 *
 *   npx tsx --env-file=.env.local scripts/seo/backfill-gsc-daily.mts 180
 *
 * GSC тримає 16 місяців, тому історію можна набрати заднім числом — і вже
 * наявні записи журналу SEO-дій одразу отримують заміряний ефект «до / після».
 * Далі зріз підтримує крон /api/cron/gsc-snapshot.
 */
// tsx віддає .ts-модулі як CJS, тож іменовані імпорти з .mts не резолвляться —
// той самий обхід через namespace, що в scripts/rozetka/sla-report.mts.
import * as historyNS from '../../lib/seo/history';
const history = (historyNS as unknown as { default: typeof historyNS }).default ?? historyNS;

const days = Number(process.argv[2] ?? 180);
const res = await history.ingestGscDaily(days);
console.log(`вікно ${res.days} днів → записано ${res.rows} рядків gsc_daily`);
