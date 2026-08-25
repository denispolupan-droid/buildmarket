/**
 * Бекфіл боргу перед постачальником по посилках, які вже в дорозі.
 *
 * До міграції 103 борг виникав при ДОСТАВЦІ покупцю. Тепер — при ВІДВАНТАЖЕННІ.
 * Посилки, відвантажені до переходу, лишились без проводки: товар у дорозі,
 * постачальник уже виписав накладну, а в нас боргу немає. Скрипт доводить їх
 * заднім числом — датою відвантаження (doc_date РН), щоб звірка з постачальником
 * сходилась не лише сумою, а й датами.
 *
 * Рахує НЕ сам: кличе ту саму syncDropshipPayable, що й бойовий код, тож логіка
 * визначення постачальника і сум одна. Повторний запуск нічого не дублює —
 * функція зводить різницю, а вона після першого проходу нульова.
 *
 * ВАЖЛИВО: запускати ПІСЛЯ деплою коду. Ключ ідемпотентності спільний зі старим
 * шляхом проведення, тож якщо забекфілити раніше, старий (ще задеплоєний) код при
 * доставці пропустить борг, але спише собівартість зі складу, а не з транзиту.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/backfill-transit-payable.ts           # показати
 *   npx tsx --env-file=.env.local scripts/backfill-transit-payable.ts --apply   # провести
 */
import { createServiceClient } from '../lib/supabase';
import { syncDropshipPayable } from '../lib/accounting/dropship';

const APPLY = process.argv.includes('--apply');

type Todo = {
  id:        string;
  date:      string;
  label:     string;
  amount:    number;
  cancelled: boolean;
};

async function main() {
  const db = createServiceClient();

  const { data: drafts, error } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, order_id, tracking_number')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .order('doc_date', { ascending: true })
    .limit(2000);
  if (error) throw new Error(error.message);

  const ids = (drafts ?? []).map(d => d.id as string);
  if (!ids.length) { console.log('чернеток немає'); return; }

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('document_id, sku, qty, cost_price, fulfillment_type, supplier_id')
    .in('document_id', ids)
    .limit(10000);

  // Скільки боргу вже проведено по кожній чернетці — щоб доводити лише різницю
  const { data: posted } = await db
    .from('money_entries')
    .select('doc_id, amount')
    .in('doc_id', ids)
    .eq('account_type', 'supplier')
    .limit(10000);
  const postedByDoc = new Map<string, number>();
  for (const e of posted ?? []) {
    const k = String(e.doc_id);
    postedByDoc.set(k, (postedByDoc.get(k) ?? 0) - Number(e.amount));
  }

  const costByDoc = new Map<string, number>();
  for (const l of lines ?? []) {
    if (l.fulfillment_type !== 'dropship') continue;
    const k = String(l.document_id);
    costByDoc.set(k, (costByDoc.get(k) ?? 0) + Number(l.cost_price ?? 0) * Number(l.qty));
  }

  const orderIds = [...new Set((drafts ?? []).map(d => d.order_id).filter(Boolean))] as string[];
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, status')
    .in('id', orderIds)
    .limit(2000);
  const orderById = new Map((orders ?? []).map(o => [o.id as string, o]));

  const todo: Todo[] = [];
  for (const d of drafts ?? []) {
    const cost = costByDoc.get(d.id as string) ?? 0;
    if (cost <= 0) continue;
    const already = postedByDoc.get(d.id as string) ?? 0;
    const delta = Math.round((cost - already) * 100) / 100;
    if (Math.abs(delta) < 0.01) continue;

    const ord = d.order_id ? orderById.get(d.order_id as string) : null;
    const date = String(d.doc_date ?? '').slice(0, 10);
    const status = String(ord?.status ?? '—');
    todo.push({
      id:        d.id as string,
      date,
      label:     `${date} · ${d.doc_number ?? '—'} · замовлення #${ord?.order_number ?? '—'} (${status})`,
      amount:    delta,
      // Скасовані — посилка їде назад. Борг усе одно проводимо (постачальник її
      // відвантажив і виписав накладну), а долю товару людина вирішує окремо:
      // повернули постачальнику → борг знімається, лишили собі → лишається.
      cancelled: status === 'cancelled',
    });
  }

  const live      = todo.filter(t => !t.cancelled);
  const cancelled = todo.filter(t => t.cancelled);
  const sum = (xs: Todo[]) => xs.reduce((s, t) => s + t.amount, 0);

  for (const t of live) console.log(`  ${t.label} → ${t.amount.toFixed(2)} ₴`);
  console.log(`\nв дорозі: ${live.length} посилок на ${sum(live).toFixed(2)} ₴`);

  if (cancelled.length) {
    console.log('\nскасовані замовлення (посилка їде назад — після проведення');
    console.log('потребують рішення «повернули постачальнику / лишили собі»):');
    for (const t of cancelled) console.log(`  ${t.label} → ${t.amount.toFixed(2)} ₴`);
    console.log(`разом: ${cancelled.length} на ${sum(cancelled).toFixed(2)} ₴`);
  }

  console.log(`\nусього до проведення: ${todo.length} на ${sum(todo).toFixed(2)} ₴`);
  if (!APPLY) { console.log('\n(прогін без запису; додайте --apply)'); return; }

  let done = 0;
  for (const t of todo) {
    // business_date = дата відвантаження: саме нею постачальник датує накладну
    const { changed } = await syncDropshipPayable(t.id, {
      business_date: t.date || undefined,
      created_by:    'backfill-transit-103',
    });
    if (changed > 0) done++;
  }
  console.log(`проведено: ${done} з ${todo.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
