import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft, Package, ChevronRight, CheckCircle, AlertCircle, Clock } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SuppliersStockPage() {
  const [{ data: suppliers }, { data: syncLogs }, { data: skuCounts }] = await Promise.all([
    db.from('suppliers').select('id, name, email').order('name'),
    db.from('supplier_sync_log')
      .select('supplier_id, rows_updated, rows_unmapped, error_message, finished_at')
      .order('finished_at', { ascending: false })
      .limit(200),
    db.from('supplier_sku_map').select('supplier_id'),
  ]);

  const lastSyncMap = new Map<number, { rows_updated: number; rows_unmapped: number; error_message: string | null; finished_at: string }>();
  for (const log of syncLogs ?? []) {
    if (!lastSyncMap.has(log.supplier_id)) lastSyncMap.set(log.supplier_id, log);
  }

  const skuCountMap = new Map<number, number>();
  for (const row of skuCounts ?? []) {
    skuCountMap.set(row.supplier_id, (skuCountMap.get(row.supplier_id) ?? 0) + 1);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px' }}>
      <style>{`.supplier-row:hover { border-color: #BFDBFE !important; box-shadow: 0 2px 12px rgba(0,0,0,0.06); }`}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/accounting/stock" style={{ display: 'flex', alignItems: 'center', color: '#64748B', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <Package size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Залишки постачальників
        </h1>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {suppliers?.length ?? 0} постачальників
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(suppliers ?? []).map(supplier => {
          const sync = lastSyncMap.get(supplier.id);
          const count = skuCountMap.get(supplier.id) ?? 0;
          const hasError = sync?.error_message;

          return (
            <Link key={supplier.id} href={`/admin/accounting/stock/suppliers/${supplier.id}`}
              style={{ textDecoration: 'none' }}>
              <div className="supplier-row" style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
                cursor: 'pointer', transition: 'border-color 0.15s, box-shadow 0.15s',
              }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF4FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Package size={18} color="#1E3A5F" />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    {supplier.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {count} SKU · {supplier.email ?? 'email не вказано'}
                  </div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {!sync ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#94A3B8', fontSize: '12px' }}>
                      <Clock size={13} /> Не синхронізовано
                    </div>
                  ) : hasError ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#DC2626', fontSize: '12px' }}>
                      <AlertCircle size={13} /> Помилка синхронізації
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#15803D', fontSize: '12px' }}>
                      <CheckCircle size={13} /> {sync.rows_updated} оновлено
                    </div>
                  )}
                  {sync && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {formatDate(sync.finished_at)}
                    </div>
                  )}
                </div>

                <ChevronRight size={16} color="#94A3B8" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
