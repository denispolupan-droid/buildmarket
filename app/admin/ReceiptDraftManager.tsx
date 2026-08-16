'use client';

/**
 * РњРµРЅРµРґР¶РµСЂ С‡РµСЂРЅРµС‚РѕРє РїСЂРёС…РѕРґС–РІ С‚РѕРІР°СЂСѓ.
 * РџРѕРІРµРґС–РЅРєР° Р°РЅР°Р»РѕРіС–С‡РЅР° PoDraftManager:
 *   - РљР°СЂС‚Рё СЃС‚РµРєСѓСЋС‚СЊСЃСЏ Р»С–РІРѕСЂСѓС‡ РІС–Рґ edge sidebar
 *   - РњС–РЅС–РјС–Р·РѕРІР°РЅС– в†' С‚Р°Р±-Р±Р°СЂ РІРЅРёР·Сѓ (РїРѕР·РёС†С–РѕРЅСѓС”С‚СЊСЃСЏ РїС–СЃР»СЏ PO-С‚Р°Р±С–РІ)
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import DraftCloseConfirm from './DraftCloseConfirm';
import { X, Minus, PackagePlus } from 'lucide-react';

export type ReceiptLine = {
  sku: string; name: string; qty: number;
  cost_price: number;
  is_bonus: boolean;
  matched?: boolean;
  ordered_qty?: number;
};

export type ReceiptDraft = {
  id:              string;
  poId?:           string;       // linked PO id (receipt from PO flow)
  poDocNumber?:    string;       // e.g. "ЗП-2026-0012"
  draftReceiptId?: string | null; // existing draft acc_document id (for edit mode)
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
    window.addEventListener('po-draft-activated',      handler);
    window.addEventListener('order-draft-activated',   handler);
    window.addEventListener('stockdoc-draft-activated', handler);
    return () => {
      window.removeEventListener('po-draft-activated',      handler);
      window.removeEventListener('order-draft-activated',   handler);
      window.removeEventListener('stockdoc-draft-activated', handler);
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

  // Open receipt pre-filled from PO ("Прийняти товар" button)
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{
        poId: string; poDocNumber: string;
        draftReceiptId?: string | null;
        supplierId: number | null; warehouseId: number | null;
        supplierInvNum: string; supplierInvDate: string; supplierInvAmount: number | '';
        lines: ReceiptLine[];
      }>).detail;

      // If draft for same PO already open — bring to front and refresh invoice fields
      setDrafts(prev => {
        const existing = prev.find(d => d.poId === detail.poId);
        if (existing) {
          window.dispatchEvent(new CustomEvent('receipt-draft-activated'));
          return prev.map(d => d.id === existing.id
            ? {
                ...d,
                minimized:         false,
                lastActivated:     Date.now(),
                // Оновлюємо рахункові дані якщо вони з'явились у ЗП після відкриття чернетки
                supplierInvNum:    detail.supplierInvNum   || d.supplierInvNum,
                supplierInvDate:   detail.supplierInvDate  || d.supplierInvDate,
                supplierInvAmount: detail.supplierInvAmount !== '' ? detail.supplierInvAmount : d.supplierInvAmount,
              }
            : { ...d, minimized: true });
        }
        const now = Date.now();
        const draft: ReceiptDraft = {
          id:               `receipt_po_${detail.poId}_${now}`,
          poId:             detail.poId,
          poDocNumber:      detail.poDocNumber,
          draftReceiptId:   detail.draftReceiptId ?? null,
          warehouseId:      detail.warehouseId || warehouses[0]?.id || 0,
          supplierId:       detail.supplierId ?? null,
          docDate:          new Date().toISOString().slice(0, 10),
          supplierInvNum:   detail.supplierInvNum ?? '',
          supplierInvDate:  detail.supplierInvDate ?? '',
          supplierInvAmount: detail.supplierInvAmount ?? '',
          notes:            '',
          lines:            detail.lines ?? [],
          minimized:        false,
          createdAt:        now,
          lastActivated:    now,
        };
        window.dispatchEvent(new CustomEvent('receipt-draft-activated'));
        return [...prev.map(d => ({ ...d, minimized: true })), draft];
      });
    }
    window.addEventListener('open-po-receipt-draft', handler);
    return () => window.removeEventListener('open-po-receipt-draft', handler);
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
            title="Відкрити прихід"
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
                Прихід
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
        <div className="doc-tabs" style={{ left: `${tabLeft}px`, ['--doc-accent' as string]: '#15803D' }}>
          {tabOrder.map(draft => {
            const isActive   = !draft.minimized && draft.id === topCard?.id;
            const lineCount  = draft.lines.length;
            const total      = draft.lines.reduce((s, l) => s + l.qty * (l.is_bonus ? 0 : l.cost_price), 0);

            const isConfirming = confirmClose === draft.id;

            const supplierLabel = suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
            const label = supplierLabel || 'Новий прихід';

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>
                <div className={`doc-tab${isActive ? ' active' : ''}`}>
                  <div
                    className="doc-tab-main"
                    onClick={() => isActive ? minimizeDraft(draft.id) : bringToFront(draft.id)}
                  >
                    <span className="doc-tab-icon"><PackagePlus size={15} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div className="doc-tab-label">{label}</div>
                      {lineCount > 0 && (
                        <div className="doc-tab-sub">{lineCount} поз · {fmt(total)} ₴</div>
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

                {/* Confirm close dialog (inline, above tab) */}
                {isConfirming && (
                  <DraftCloseConfirm
                    onCancel={() => setConfirmClose(null)}
                    onConfirm={() => closeDraft(draft.id, true)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

    </>
  );
}
