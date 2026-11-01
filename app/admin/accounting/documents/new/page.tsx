import NewDocumentClient from './NewDocumentClient';
import { requireStaffPage } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';

const db = createServiceClient();

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string; from?: string }> }) {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const { type: initialType, from: returnTo } = await searchParams;

  const [{ data: warehouses }, { data: suppliers }, { data: docTypes }] = await Promise.all([
    db.from('warehouses').select('id, name, warehouse_type').eq('is_active', true).order('sort_order'),
    db.from('suppliers').select('id, name').eq('is_active', true).order('name'),
    db.from('acc_doc_types').select('code, name, direction').order('sort_order'),
  ]);

  return (
    <NewDocumentClient
      warehouses={warehouses ?? []}
      suppliers={suppliers ?? []}
      docTypes={docTypes ?? []}
      initialType={initialType}
      returnTo={returnTo}
    />
  );
}
