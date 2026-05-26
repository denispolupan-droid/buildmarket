'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Minus, Maximize2, Loader2 } from 'lucide-react';
import ProcurementDetail from './[id]/ProcurementDetail';
import AdjustmentButton from './[id]/AdjustmentButton';
import AdditionalReceiptButton from './[id]/AdditionalReceiptButton';
import DocChain from './[id]/DocChain';
import EditDraftButton from './[id]/EditDraftButton';

type PoLine = {
  id: number; sku: string; name?: string; brand?: string; qty: number;
  cost_price: number; supplier_id?: number; adj_delta?: number;
  effective_qty?: number; is_adj_new?: boolean;
};
type PoData = {
  id: string; doc_number: string; doc_date: string;
  procurement_status: string | null; status?: string | null;
  expected_date: string | null; supplier_id: number | null;
  supplier_name: string | null; supplier_email: string | null;
  order_id: string | null; total_cost: number | null;
  notes: string | null; has_receipt: boolean;
  receipt_id?: string | null; receipt_doc_number?: string | null;
  supplier_invoice_number: string | null; supplier_invoice_date: string | null;
  supplier_invoice_amount: number | null;
  supplier_bank: {
    bank_iban: string | null; bank_name: string | null;
    legal_name: string | null; edrpou: string | null; payment_days: number;
  } | null;
  lines: PoLine[];
  poLines?: { sku: string; qty: number; cost_price: number; name: string; brand: string }[];
  meta?: Record<string, unknown> | null;
};

interface Props {
  poId:    string;
  poLabel: string; // doc_number для ярлика
  onClose: () => void;
}

export default function PODrawer({ poId, poLabel, onClose }: Props) {
  const [po,        setPo]        = useState<PoData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/procurement/${poId}/detail`);
      if (!res.ok) { setError('Не вдалося завантажити'); return; }
      const data = await res.json();
      setPo(data);
    } catch {
      setError('Мережева помилка');
    } finally {
      setLoading(false);
    }
  }, [poId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Закривати по Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !minimized) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [minimized, onClose]);

  const isDraft     = po?.procurement_status === 'draft';
  const isCancelled = po?.status === 'cancelled';

  const chainButton = po ? (
    <div style={{ display: 'flex', gap: '8px' }}>
      {isDraft && (
        <EditDraftButton
          poId={po.id}
          supplierId={po.supplier_id ?? 0}
          supplierName={po.supplier_name ?? ''}
          expectedDate={po.expected_date ?? ''}
          notes={po.notes ?? ''}
          lines={(po.poLines ?? []).map(l => ({ ...l, matched: true }))}
        />
      )}
      {!isDraft && !isCancelled && (
        <AdjustmentButton poId={po.id} lines={po.poLines ?? []} />
      )}
      {!isDraft && !isCancelled && (
        <AdditionalReceiptButton poId={po.id} supplierName={po.supplier_name} />
      )}
      {!isDraft && <DocChain poId={po.id} />}
    </div>
  ) : null;

  // ── Мінімізований стан — тільки нижній ярлик ──────────────────────────────
  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed', bottom: 0, right: '24px', zIndex: 600,
          display: 'flex', alignItems: 'center', gap: '8px',
          height: '38px', padding: '0 14px',
          background: '#1E3A5F', color: '#fff',
          borderRadius: '10px 10px 0 0',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.2)',
          cursor: 'pointer', fontSize: '13px', fontWeight: 700,
          userSelect: 'none',
        }}
        onClick={() => setMinimized(false)}
      >
        <span style={{ fontSize: '14px' }}>📋</span>
        {poLabel}
        <Maximize2 size={13} style={{ opacity: 0.7, marginLeft: '4px' }} />
        <button
          onClick={e => { e.stopPropagation(); onClose(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', padding: '2px', marginLeft: '2px' }}
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  // ── Повний drawer ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Overlay */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 500 }}
        onClick={() => setMinimized(true)}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(820px, 90vw)',
        background: 'var(--bg-page, #F8FAFC)',
        zIndex: 501,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
        overflowY: 'auto',
      }}>

        {/* Sticky controls bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', justifyContent: 'flex-end', gap: '6px',
          padding: '10px 16px',
          background: 'var(--bg-page, #F8FAFC)',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Мінімізувати */}
          <button
            onClick={() => setMinimized(true)}
            title="Мінімізувати"
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              height: '30px', padding: '0 10px', borderRadius: '7px',
              border: '1px solid var(--border)', background: 'var(--bg-soft)',
              color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Minus size={13} /> Згорнути
          </button>
          {/* Закрити */}
          <button
            onClick={onClose}
            title="Закрити"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '30px', height: '30px', borderRadius: '7px',
              border: '1px solid var(--border)', background: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '80px', color: 'var(--text-muted)', fontSize: '14px' }}>
              <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...
            </div>
          )}

          {error && (
            <div style={{ margin: '40px', padding: '14px 18px', background: '#FEF2F2', color: '#DC2626', borderRadius: '10px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          {!loading && !error && po && (
            <ProcurementDetail po={po} chainButton={chainButton} compact={true} />
          )}
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
