'use client';

/**
 * Менеджер чернеток замовлень покупців.
 * Поведінка аналогічна PoDraftManager та ReceiptDraftManager:
 *   - Панель розкривається ліворуч від контенту (після sidebar 220px)
 *   - Мінімізовані → таб-бар внизу (після PO + Receipt табів)
 *   - Кілька відкритих — stack з peek-edge
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Minus } from 'lucide-react';

const NewOrderModal = dynamic(() => import('./orders/NewOrderModal'), { ssr: false });

export interface OrderLine {
  sku: string; name: string; brand: string; qty: number; price: number; matched: boolean;
  is_bonus?: boolean;
}

export interface OrderDraft {
  id:               string;
  customerId:       string | null;  // FK → customers.id
  contact:          string;
  phone:            string;
  email:            string;
  company:          string;
  channelCode:      string;
  priceTier:        string;         // 'retail' | 'wholesale' | 'drop' | 'cost'
  delivery:         string;
  novaSubtype:      string;
  novaCityRef:      string;
  novaCityName:     string;
  novaWarehouseRef: string;
  address:          string;
  payment:          string;
  comment:          string;
  lines:            OrderLine[];
  minimized:        boolean;
  createdAt:        number;
  lastActivated:    number;
}

const SESSION_KEY   = 'admin_order_drafts';
const SIDEBAR_W     = 240;  // AdminSidebar width
const PANEL_W       = 'min(980px, 72vw)';
const PEEK_PER_CARD = 24;
const TAB_W         = 212; // 210px tab + 2px gap

function loadDrafts(): OrderDraft[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]'); }
  catch { return []; }
}
function saveDrafts(drafts: OrderDraft[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(drafts)); }
  catch { /* quota */ }
}
function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default function OrderDraftManager() {
  const [drafts,       setDrafts]       = useState<OrderDraft[]>([]);
  const [mounted,      setMounted]      = useState(false);
  const [confirmClose, setConfirmClose] = useState<string | null>(null);

  // Offsets for tab bar (PO tabs + Receipt tabs come first)
  const [poDraftCount,      setPoDraftCount]      = useState(0);
  const [receiptDraftCount, setReceiptDraftCount] = useState(0);

  useEffect(() => { setDrafts(loadDrafts()); setMounted(true); }, []);

  // Minimize all order drafts when PO or Receipt panel activates
  useEffect(() => {
    function handler() {
      setDrafts(prev => prev.map(d => d.minimized ? d : { ...d, minimized: true }));
    }
    window.addEventListener('po-draft-activated',      handler);
    window.addEventListener('receipt-draft-activated', handler);
    return () => {
      window.removeEventListener('po-draft-activated',      handler);
      window.removeEventListener('receipt-draft-activated', handler);
    };
  }, []);

  // Track PO count for tab offset
  useEffect(() => {
    function handler(e: Event) {
      setPoDraftCount((e as CustomEvent<{ count: number }>).detail.count ?? 0);
    }
    window.addEventListener('po-drafts-changed', handler);
    return () => window.removeEventListener('po-drafts-changed', handler);
  }, []);

  // Track Receipt count for tab offset
  useEffect(() => {
    function handler(e: Event) {
      setReceiptDraftCount((e as CustomEvent<{ count: number }>).detail.count ?? 0);
    }
    window.addEventListener('receipt-drafts-changed', handler);
    return () => window.removeEventListener('receipt-drafts-changed', handler);
  }, []);

  // Persist + notify siblings
  useEffect(() => {
    if (!mounted) return;
    saveDrafts(drafts);
    window.dispatchEvent(new CustomEvent('order-drafts-changed', { detail: { count: drafts.length } }));
  }, [drafts, mounted]);

  // Open new order draft via event
  useEffect(() => {
    function handler() {
      const now = Date.now();
      const draft: OrderDraft = {
        id:               `order_${now}`,
        customerId:       null,
        contact:          '',
        phone:            '',
        email:            '',
        company:          '',
        channelCode:      'retail',
        priceTier:        'retail',
        delivery:         'pickup',
        novaSubtype:      '',
        novaCityRef:      '',
        novaCityName:     '',
        novaWarehouseRef: '',
        address:          '',
        payment:          'cash',
        comment:          '',
        lines:            [{ sku: '', name: '', brand: '', qty: 1, price: 0, matched: false }],
        minimized:        false,
        createdAt:        now,
        lastActivated:    now,
      };
      setDrafts(prev => [...prev, draft]);
    }
    window.addEventListener('open-order-draft', handler);
    return () => window.removeEventListener('open-order-draft', handler);
  }, []);

  const bringToFront = useCallback((id: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === id
        ? { ...d, minimized: false, lastActivated: Date.now() }
        : { ...d, minimized: true }
    ));
    window.dispatchEvent(new CustomEvent('order-draft-activated'));
  }, []);

  const updateDraft   = useCallback((id: string, data: Partial<OrderDraft>) =>
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);

  const minimizeDraft = useCallback((id: string) =>
    updateDraft(id, { minimized: true }), [updateDraft]);

  const removeDraft   = useCallback((id: string) =>
    setDrafts(prev => prev.filter(d => d.id !== id)), []);

  const closeDraft = useCallback((id: string, force = false) => {
    if (!force) {
      const draft = drafts.find(d => d.id === id);
      if (!draft) return;
      const hasData = draft.lines.some(l => l.sku || l.name)
        || draft.contact.trim()
        || draft.comment.trim();
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

  // Tabs start after all PO + Receipt tabs
  const tabLeft = SIDEBAR_W + (poDraftCount + receiptDraftCount) * TAB_W;

  return (
    <>
      {/* ── Background cards (peek edge) ────────────────────────────────────── */}
      {bgCards.map((draft, idx) => {
        const depth     = bgCards.length - idx;
        const peekWidth = PEEK_PER_CARD * depth;
        const topOffset = depth * 5;
        return (
          <div
            key={draft.id}
            onClick={() => bringToFront(draft.id)}
            title={`Відкрити: ${draft.contact || 'Нове замовлення'}`}
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
            <div style={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              width: `${peekWidth}px`,
              background: 'var(--bg-soft)',
              borderLeft: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', paddingTop: '20px', gap: '4px',
            }}>
              <div style={{
                writingMode: 'vertical-rl', textOrientation: 'mixed',
                transform: 'rotate(180deg)',
                fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)',
                maxHeight: '120px', overflow: 'hidden',
              }}>
                {draft.contact || 'Замовлення'}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Active card (top of stack) ───────────────────────────────────────── */}
      {topCard && (
        <NewOrderModal
          key={topCard.id}
          initialData={topCard}
          zIndex={1000 + stack.length}
          onMinimize={() => minimizeDraft(topCard.id)}
          onClose={() => closeDraft(topCard.id)}
          onDraftChange={data => updateDraft(topCard.id, data)}
          onSubmitted={() => removeDraft(topCard.id)}
        />
      )}

      {/* ── Tab bar (bottom) ─────────────────────────────────────────────────── */}
      {drafts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: `${tabLeft}px`, zIndex: 1010,
          display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: '2px',
        }}>
          {tabOrder.map(draft => {
            const isActive    = !draft.minimized && draft.id === topCard?.id;
            const lineCount   = draft.lines.filter(l => l.sku || l.name).length;
            const total       = draft.lines.reduce((s, l) => s + l.qty * l.price, 0);
            const label       = draft.contact || 'Нове замовлення';
            const isConfirming = confirmClose === draft.id;

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>
                <div
                  className="order-tab"
                  style={{
                    height: '42px', width: '210px',
                    background: '#1c2a3d',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '10px 10px 0 0',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderTop: isActive ? '2px solid #2563EB' : '1px solid rgba(255,255,255,0.06)',
                    borderBottom: 'none',
                    display: 'flex', alignItems: 'center',
                    boxShadow: isActive ? '0 -3px 14px rgba(37,99,235,0.22)' : 'none',
                    opacity: isActive ? 1 : 0.8,
                    transition: 'opacity 0.18s, box-shadow 0.18s, border-color 0.18s',
                    flexShrink: 0, overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => isActive ? minimizeDraft(draft.id) : bringToFront(draft.id)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px 0 12px', height: '100%', cursor: 'pointer' }}
                  >
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>🛍️</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: isActive ? '#E2E8F0' : '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </div>
                      {lineCount > 0 && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>
                          {lineCount} поз · {fmt(total)} ₴
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 0 0', gap: '2px', flexShrink: 0 }}>
                    {!draft.minimized && (
                      <button
                        onClick={() => minimizeDraft(draft.id)}
                        title="Згорнути"
                        className="order-close-btn"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: '3px', borderRadius: '4px' }}>
                        <Minus size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => closeDraft(draft.id)}
                      title="Закрити"
                      className="order-close-btn"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex', padding: '3px', borderRadius: '4px' }}>
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Confirm-close popup above tab */}
                {isConfirming && (
                  <div style={{ position: 'absolute', bottom: '46px', left: 0, width: '280px', background: 'var(--bg-card)', borderRadius: '12px', padding: '16px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.35)', border: '1px solid var(--border)', zIndex: 10 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>Закрити без збереження?</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', lineHeight: 1.4 }}>Незбережені дані будуть видалені.</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => setConfirmClose(null)} style={{ flex: 1, height: '34px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Скасувати</button>
                      <button onClick={() => closeDraft(draft.id, true)} style={{ flex: 1, height: '34px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>Закрити</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        .order-tab:hover { background: #243550 !important; }
        .order-tab:hover .order-close-btn { color: rgba(255,255,255,0.6) !important; }
      `}</style>
    </>
  );
}
