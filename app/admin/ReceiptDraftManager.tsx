'use client';

/**
 * РњРµРЅРµРґР¶РµСЂ С‡РµСЂРЅРµС‚РѕРє РїСЂРёС…РѕРґС–РІ С‚РѕРІР°СЂСѓ.
 * РџРѕРІРµРґС–РЅРєР° Р°РЅР°Р»РѕРіС–С‡РЅР° PoDraftManager:
 *   - РљР°СЂС‚Рё СЃС‚РµРєСѓСЋС‚СЊСЃСЏ Р»С–РІРѕСЂСѓС‡ РІС–Рґ edge sidebar
 *   - РњС–РЅС–РјС–Р·РѕРІР°РЅС– в†’ С‚Р°Р±-Р±Р°СЂ РІРЅРёР·Сѓ (РїРѕР·РёС†С–РѕРЅСѓС”С‚СЊСЃСЏ РїС–СЃР»СЏ PO-С‚Р°Р±С–РІ)
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Minus } from 'lucide-react';

export type ReceiptLine = {
  sku: string; name: string; qty: number;
  cost_price: number; sale_price: number; is_bonus: boolean;
  matched?: boolean;
};

export type ReceiptDraft = {
  id:              string;
  warehouseId:     number;
  supplierId:      number | null;
  docDate:         string;
  supplierInvNum:  string;
  supplierInvDate: string;
  supplierInvAmount: number | '';
  notes:           string;
  lines:           ReceiptLine[];
  minimized:       boolean;
  createdAt:       number;
  lastActivated:   number;
};

type Warehouse = { id: number; name: string };
type Supplier  = { id: number; name: string };

const NewReceiptModal = dynamic(() => import('./procurement/NewReceiptModal'), { ssr: false });

const SESSION_KEY   = 'admin_receipt_drafts';
const SIDEBAR_W     = 240;  // AdminSidebar width
const PANEL_W       = 'min(960px, 74vw)';
const PEEK_PER_CARD = 24;
const PO_TAB_W      = 212; // 210px + 2px gap

function loadDrafts(): ReceiptDraft[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]'); }
  catch { return []; }
}
function saveDrafts(d: ReceiptDraft[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(d)); }
  catch { /* quota */ }
}
function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default function ReceiptDraftManager() {
  const [drafts,       setDrafts]       = useState<ReceiptDraft[]>([]);
  const [mounted,      setMounted]      = useState(false);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);

  // How many PO draft tabs are visible (to offset receipt tabs)
  const [poDraftCount, setPoDraftCount] = useState(0);

  useEffect(() => {
    setDrafts(loadDrafts());
    setMounted(true);

    // Load warehouses & suppliers via admin API (needs service role)
    fetch('/api/admin/procurement/receipt-meta')
      .then(r => r.ok ? r.json() : { warehouses: [], suppliers: [] })
      .then(({ warehouses: wh, suppliers: sup }) => {
        setWarehouses(wh ?? []);
        setSuppliers(sup ?? []);
      })
      .catch(() => { /* ignore */ });
  }, []);

  // РњС–РЅС–РјС–Р·СѓРІР°С‚Рё РІСЃС– Receipt, РєРѕР»Рё PO Р°Р±Рѕ Order-РїР°РЅРµР»СЊ СЃС‚Р°С” Р°РєС‚РёРІРЅРѕСЋ
  useEffect(() => {
    function handler() {
      setDrafts(prev => prev.map(d => d.minimized ? d : { ...d, minimized: true }));
    }
    window.addEventListener('po-draft-activated',    handler);
    window.addEventListener('order-draft-activated', handler);
    return () => {
      window.removeEventListener('po-draft-activated',    handler);
      window.removeEventListener('order-draft-activated', handler);
    };
  }, []);

  // Listen for PO draft count changes to offset tab bar
  useEffect(() => {
    function handler(e: Event) {
      setPoDraftCount((e as CustomEvent<{ count: number }>).detail.count ?? 0);
    }
    window.addEventListener('po-drafts-changed', handler);
    return () => window.removeEventListener('po-drafts-changed', handler);
  }, []);

  // Persist drafts + notify OrderDraftManager for tab offset
  useEffect(() => {
    if (!mounted) return;
    saveDrafts(drafts);
    window.dispatchEvent(new CustomEvent('receipt-drafts-changed', { detail: { count: drafts.length } }));
  }, [drafts, mounted]);

  // Open receipt draft from "РќРѕРІРёР№ РїСЂРёС…С–Рґ" button
  useEffect(() => {
    function handler() {
      const now = Date.now();
      const draft: ReceiptDraft = {
        id:              `receipt_${now}`,
        warehouseId:     warehouses[0]?.id ?? 0,
        supplierId:      null,
        docDate:         new Date().toISOString().slice(0, 10),
        supplierInvNum:  '',
        supplierInvDate: '',
        supplierInvAmount: '',
        notes:           '',
        lines:           [],
        minimized:       false,
        createdAt:       now,
        lastActivated:   now,
      };
      setDrafts(prev => [...prev, draft]);
    }
    window.addEventListener('open-receipt-draft', handler);
    return () => window.removeEventListener('open-receipt-draft', handler);
  }, [warehouses]);

  const bringToFront = useCallback((id: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === id
        ? { ...d, minimized: false, lastActivated: Date.now() }
        : { ...d, minimized: true }
    ));
    // РџРѕРІС–РґРѕРјР»СЏС”РјРѕ PoDraftManager вЂ” РІС–РЅ РјС–РЅС–РјС–Р·СѓС” СЃРІРѕС— РїР°РЅРµР»С–
    window.dispatchEvent(new CustomEvent('receipt-draft-activated'));
  }, []);

  const updateDraft   = useCallback((id: string, data: Partial<ReceiptDraft>) =>
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);

  const minimizeDraft = useCallback((id: string) =>
    updateDraft(id, { minimized: true }), [updateDraft]);

  const removeDraft   = useCallback((id: string) =>
    setDrafts(prev => prev.filter(d => d.id !== id)), []);

  const closeDraft = useCallback((id: string, force = false) => {
    if (!force) {
      const draft = drafts.find(d => d.id === id);
      if (!draft) return;
      const hasData = draft.lines.length > 0 || draft.notes.trim() || draft.supplierInvNum.trim();
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

  // Tab bar starts after PO tabs
  const tabLeft = SIDEBAR_W + poDraftCount * PO_TAB_W;

  return (
    <>
      {/* Background cards вЂ” peek edge visible */}
      {bgCards.map((draft, idx) => {
        const depth      = bgCards.length - idx;
        const peekWidth  = PEEK_PER_CARD * depth;
        const topOffset  = depth * 5;
        return (
          <div
            key={draft.id}
            onClick={() => bringToFront(draft.id)}
            title="Р’С–РґРєСЂРёС‚Рё РїСЂРёС…С–Рґ"
            style={{
              position: 'fixed',
              left:   `${SIDEBAR_W}px`,
              top:    `${topOffset}px`,
              bottom: '42px',
              width:  `calc(${PANEL_W} + ${peekWidth}px)`,
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
            <div
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width: `${peekWidth}px`,
                background: 'var(--bg-soft)',
                borderLeft: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', paddingTop: '20px', gap: '4px',
              }}
            >
              <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', maxHeight: '120px', overflow: 'hidden' }}>
                РџСЂРёС…С–Рґ
              </div>
            </div>
          </div>
        );
      })}

      {/* Active card */}
      {topCard && (
        <NewReceiptModal
          key={topCard.id}
          initialData={topCard}
          warehouses={warehouses}
          suppliers={suppliers}
          zIndex={1000 + stack.length}
          onMinimize={() => minimizeDraft(topCard.id)}
          onClose={() => closeDraft(topCard.id)}
          onDraftChange={data => updateDraft(topCard.id, data)}
          onSubmitted={() => removeDraft(topCard.id)}
        />
      )}

      {/* Tab bar */}
      {drafts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: `${tabLeft}px`, zIndex: 1010,
          display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: '2px',
        }}>
          {tabOrder.map(draft => {
            const isActive   = !draft.minimized && draft.id === topCard?.id;
            const lineCount  = draft.lines.length;
            const total      = draft.lines.reduce((s, l) => s + l.qty * (l.is_bonus ? 0 : l.cost_price), 0);

            const isConfirming = confirmClose === draft.id;

            const supplierLabel = suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
            const label = supplierLabel || 'РќРѕРІРёР№ РїСЂРёС…С–Рґ';

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>
                <div
                  className="receipt-tab"
                  style={{
                    height: '42px', width: '210px',
                    background: '#1a3a2a',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '10px 10px 0 0',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderTop: isActive ? '2px solid #15803D' : '1px solid rgba(255,255,255,0.06)',
                    borderBottom: 'none',
                    display: 'flex', alignItems: 'center',
                    boxShadow: isActive ? '0 -3px 14px rgba(21,128,61,0.2)' : 'none',
                    opacity: isActive ? 1 : 0.8,
                    transition: 'opacity 0.18s, box-shadow 0.18s, border-color 0.18s',
                    flexShrink: 0, overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => isActive ? minimizeDraft(draft.id) : bringToFront(draft.id)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px 0 12px', height: '100%', cursor: 'pointer' }}
                  >
                    <span style={{ display: 'inline-block', fontSize: '14px', flexShrink: 0 }}>рџ“¦</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: isActive ? '#E2E8F0' : '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </div>
                      {lineCount > 0 && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>
                          {lineCount} РїРѕР· В· {fmt(total)} в‚ґ
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 0 0', gap: '2px', flexShrink: 0 }}>
                    {!draft.minimized && (
                      <button
                        onClick={() => minimizeDraft(draft.id)}
                        title="Р—РіРѕСЂРЅСѓС‚Рё"
                        className="receipt-close-btn"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: '3px', borderRadius: '4px' }}
                      >
                        <Minus size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => closeDraft(draft.id)}
                      title="Р—Р°РєСЂРёС‚Рё"
                      className="receipt-close-btn"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex', padding: '3px', borderRadius: '4px' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Confirm close dialog (inline, above tab) */}
                {isConfirming && (
                  <div style={{ position: 'absolute', bottom: '46px', left: 0, width: '280px', background: 'var(--bg-card)', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', border: '1px solid var(--border)', zIndex: 10 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Р—Р°РєСЂРёС‚Рё Р±РµР· Р·Р±РµСЂРµР¶РµРЅРЅСЏ?</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>РќРµР·Р±РµСЂРµР¶РµРЅС– РґР°РЅС– Р±СѓРґСѓС‚СЊ РІРёРґР°Р»РµРЅС–.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setConfirmClose(null)} style={{ flex: 1, height: '34px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>РЎРєР°СЃСѓРІР°С‚Рё</button>
                      <button onClick={() => closeDraft(draft.id, true)} style={{ flex: 1, height: '34px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Р—Р°РєСЂРёС‚Рё</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .receipt-tab:hover { background: #22472e !important; }
        .receipt-tab:hover .receipt-close-btn { color: rgba(255,255,255,0.6) !important; }
      `}</style>
    </>
  );
}
