'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Minus, Trash2, ArrowLeftRight } from 'lucide-react';
import type { StockDocDraft } from './accounting/NewStockDocModal';

const NewStockDocModal = dynamic(() => import('./accounting/NewStockDocModal'), { ssr: false });

type Warehouse = { id: number; name: string };

const SESSION_KEY    = 'admin_stockdoc_drafts';
const SIDEBAR_W      = 240;
const TAB_W          = 212; // 210px tab + 2px gap

function loadDrafts(): StockDocDraft[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]'); }
  catch { return []; }
}
function saveDrafts(d: StockDocDraft[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(d)); }
  catch { /* quota */ }
}

export default function StockDocDraftManager() {
  const [drafts,       setDrafts]       = useState<StockDocDraft[]>([]);
  const [mounted,      setMounted]      = useState(false);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);

  // Tab offset: come after PO + Receipt + Order tabs
  const [poDraftCount,      setPoDraftCount]      = useState(0);
  const [receiptDraftCount, setReceiptDraftCount] = useState(0);
  const [orderDraftCount,   setOrderDraftCount]   = useState(0);

  useEffect(() => {
    setDrafts(loadDrafts());
    setMounted(true);
    fetch('/api/admin/procurement/receipt-meta')
      .then(r => r.ok ? r.json() : { warehouses: [] })
      .then(({ warehouses: wh }) => setWarehouses(wh ?? []))
      .catch(() => {});
  }, []);

  // Minimize when another doc type panel activates
  useEffect(() => {
    function handler() {
      setDrafts(prev => prev.map(d => d.minimized ? d : { ...d, minimized: true }));
    }
    window.addEventListener('po-draft-activated',      handler);
    window.addEventListener('receipt-draft-activated', handler);
    window.addEventListener('order-draft-activated',   handler);
    return () => {
      window.removeEventListener('po-draft-activated',      handler);
      window.removeEventListener('receipt-draft-activated', handler);
      window.removeEventListener('order-draft-activated',   handler);
    };
  }, []);

  // Track sibling tab counts for horizontal offset
  useEffect(() => {
    function h(e: Event) { setPoDraftCount((e as CustomEvent<{ count: number }>).detail.count ?? 0); }
    window.addEventListener('po-drafts-changed', h);
    return () => window.removeEventListener('po-drafts-changed', h);
  }, []);
  useEffect(() => {
    function h(e: Event) { setReceiptDraftCount((e as CustomEvent<{ count: number }>).detail.count ?? 0); }
    window.addEventListener('receipt-drafts-changed', h);
    return () => window.removeEventListener('receipt-drafts-changed', h);
  }, []);
  useEffect(() => {
    function h(e: Event) { setOrderDraftCount((e as CustomEvent<{ count: number }>).detail.count ?? 0); }
    window.addEventListener('order-drafts-changed', h);
    return () => window.removeEventListener('order-drafts-changed', h);
  }, []);

  // Persist + broadcast own count
  useEffect(() => {
    if (!mounted) return;
    saveDrafts(drafts);
    window.dispatchEvent(new CustomEvent('stockdoc-drafts-changed', { detail: { count: drafts.length } }));
  }, [drafts, mounted]);

  // Open a new stockdoc draft via custom event
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ docType?: string; warehouseId?: number }>).detail ?? {};
      const docType = detail.docType === 'transfer' ? 'transfer' : 'write_off';
      const now = Date.now();
      const draft: StockDocDraft = {
        id:            `stockdoc_${now}`,
        docType,
        warehouseId:   detail.warehouseId ?? warehouses[0]?.id ?? 0,
        toWarehouseId: null,
        docDate:       new Date().toISOString().slice(0, 10),
        notes:         '',
        lines:         [],
        minimized:     false,
        createdAt:     now,
        lastActivated: now,
      };
      setDrafts(prev => [...prev.map(d => ({ ...d, minimized: true })), draft]);
      window.dispatchEvent(new CustomEvent('stockdoc-draft-activated'));
    }
    window.addEventListener('open-stockdoc-draft', handler);
    return () => window.removeEventListener('open-stockdoc-draft', handler);
  }, [warehouses]);

  const bringToFront = useCallback((id: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === id
        ? { ...d, minimized: false, lastActivated: Date.now() }
        : { ...d, minimized: true }
    ));
    window.dispatchEvent(new CustomEvent('stockdoc-draft-activated'));
  }, []);

  const updateDraft   = useCallback((id: string, data: Partial<StockDocDraft>) =>
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);

  const minimizeDraft = useCallback((id: string) =>
    updateDraft(id, { minimized: true }), [updateDraft]);

  const removeDraft   = useCallback((id: string) =>
    setDrafts(prev => prev.filter(d => d.id !== id)), []);

  const closeDraft = useCallback((id: string, force = false) => {
    if (!force) {
      const draft = drafts.find(d => d.id === id);
      if (!draft) return;
      const hasData = draft.lines.length > 0 || draft.notes.trim();
      if (hasData) { setConfirmClose(id); return; }
    }
    setConfirmClose(null);
    setDrafts(prev => prev.filter(d => d.id !== id));
  }, [drafts]);

  if (!mounted) return null;

  const tabOrder = [...drafts].sort((a, b) => a.createdAt - b.createdAt);
  const stack    = [...drafts.filter(d => !d.minimized)].sort((a, b) => a.lastActivated - b.lastActivated);
  const topCard  = stack[stack.length - 1];
  const bgCards  = stack.slice(0, -1);

  const tabLeft = SIDEBAR_W + (poDraftCount + receiptDraftCount + orderDraftCount) * TAB_W;

  return (
    <>
      {/* Background cards (peek edge) */}
      {bgCards.map((draft, idx) => {
        const depth     = bgCards.length - idx;
        const peekWidth = 24 * depth;
        const topOffset = depth * 5;
        return (
          <div
            key={draft.id}
            onClick={() => bringToFront(draft.id)}
            title={draft.docType === 'write_off' ? 'Відкрити списання' : 'Відкрити переміщення'}
            style={{
              position: 'fixed',
              left:   `${SIDEBAR_W}px`,
              top:    `${topOffset}px`,
              bottom: '42px',
              width:  `calc(min(880px, 65vw) + ${peekWidth}px)`,
              zIndex: 1000 + idx,
              background:   'var(--bg-card)',
              borderLeft:   '1px solid var(--border)',
              borderTop:    '1px solid var(--border)',
              borderRadius: '0 12px 0 0',
              boxShadow:    '6px -6px 20px rgba(0,0,0,0.18)',
              cursor:       'pointer',
              overflow:     'hidden',
              transition:   'top 0.2s ease-out, width 0.2s ease-out',
            }}
          >
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: `${peekWidth}px`,
              background: 'var(--bg-soft)', borderLeft: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 20, gap: 4,
            }}>
              <div style={{
                writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)',
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                maxHeight: 120, overflow: 'hidden',
              }}>
                {draft.docType === 'write_off' ? 'Списання' : 'Переміщення'}
              </div>
            </div>
          </div>
        );
      })}

      {/* Active card */}
      {topCard && (
        <NewStockDocModal
          key={topCard.id}
          initialData={topCard}
          warehouses={warehouses}
          zIndex={1000 + stack.length}
          onMinimize={() => minimizeDraft(topCard.id)}
          onClose={() => closeDraft(topCard.id)}
          onDraftChange={data => updateDraft(topCard.id, data)}
          onSubmitted={() => removeDraft(topCard.id)}
        />
      )}

      {/* Tab bar */}
      {drafts.length > 0 && (
        <div className="doc-tabs" style={{ left: `${tabLeft}px` }}>
          {tabOrder.map(draft => {
            const isActive    = !draft.minimized && draft.id === topCard?.id;
            const isWriteOff  = draft.docType === 'write_off';
            const label       = isWriteOff ? 'Списання' : 'Переміщення';
            const accent      = isWriteOff ? '#DC2626' : '#0EA5E9';
            const isConfirming = confirmClose === draft.id;

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>
                <div
                  className={`doc-tab${isActive ? ' active' : ''}`}
                  style={{ ['--doc-accent' as string]: accent }}
                >
                  <div
                    className="doc-tab-main"
                    onClick={() => isActive ? minimizeDraft(draft.id) : bringToFront(draft.id)}
                  >
                    <span className="doc-tab-icon">{isWriteOff ? <Trash2 size={15} /> : <ArrowLeftRight size={15} />}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="doc-tab-label">{label}</div>
                      {draft.lines.length > 0 && (
                        <div className="doc-tab-sub">{draft.lines.length} поз.</div>
                      )}
                    </div>
                  </div>
                  <div className="doc-tab-btns">
                    {!draft.minimized && (
                      <button onClick={() => minimizeDraft(draft.id)} title="Згорнути" className="doc-tab-btn">
                        <Minus size={11} />
                      </button>
                    )}
                    <button onClick={() => closeDraft(draft.id)} title="Закрити" className="doc-tab-btn">
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {isConfirming && (
                  <div style={{
                    position: 'absolute', bottom: 46, left: 0, width: 280,
                    background: 'var(--bg-card)', borderRadius: 12, padding: '16px 18px',
                    boxShadow: '0 12px 40px rgba(0,0,0,0.35)', border: '1px solid var(--border)', zIndex: 10,
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Закрити без збереження?</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.4 }}>Незбережені дані будуть видалені.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setConfirmClose(null)} style={{ flex: 1, height: 34, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Скасувати</button>
                      <button onClick={() => closeDraft(draft.id, true)} style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Закрити</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </>
  );
}
