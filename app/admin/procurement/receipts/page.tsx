import { createClient } from '@supabase/supabase-js';
import NewReceiptButton from './NewReceiptButton';
import ReceiptsWrapper from './ReceiptsWrapper';
import SectionBar, { plural } from '../SectionBar';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);


// Гейт — у layout розділу (requireStaffPage)
export default async function ReceiptsPage() {
  const { data: receipts } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, status, total_cost, notes, parent_doc_id, landed_cost_total, meta, warehouse:warehouse_id(name), supplier:supplier_id(id, name), parent_doc:parent_doc_id(meta)')
    .in('doc_type', ['receipt', 'stock_in'])
    .eq('status', 'confirmed')
    .order('doc_date', { ascending: false })
    .limit(300);

  const rows = receipts ?? [];
  const n = rows.length;

  return (
    <div style={{ maxWidth: '1200px' }}>
      {/* Заголовок і вкладки — в layout розділу */}
      <SectionBar count={`${n} ${plural(n, 'прихід', 'приходи', 'приходів')}`}>
        <NewReceiptButton />
      </SectionBar>

      <ReceiptsWrapper rows={rows as unknown as Parameters<typeof ReceiptsWrapper>[0]['rows']} />
    </div>
  );
}
