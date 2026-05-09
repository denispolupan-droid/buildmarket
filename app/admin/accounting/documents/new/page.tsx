import { createClient } from '@supabase/supabase-js';
import NewDocumentClient from './NewDocumentClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function NewDocumentPage() {
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
    />
  );
}
