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
import DraftCloseConfirm from './DraftCloseConfirm';
import { DRAFT_KEYS, draftCount } from './draft-tab-offset';
import { X, Minus, ShoppingBag } from 'lucide-react';

const NewOrderModal = dynamic(() => import('./orders/NewOrderModal'), { ssr: false });

export interface OrderLine {
  sku: string; name: string; brand: string; qty: number; price: number; matched: boolean;
  is_bonus?: boolean;
  /** Фасування з каталогу («25 кг», «10 л») — з нього рахується вага посилки,
   *  без якої не можна показати точки видачі ROZETKA з їхніми лімітами. */
  volume?: string | null;
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

  useEffect(() => {
    setDrafts(loadDrafts());
    setPoDraftCount(draftCount(DRAFT_KEYS.po));
    setReceiptDraftCount(draftCount(DRAFT_KEYS.receipt));
    setMounted(true);
  }, []);

  // Minimize all order drafts when PO or Receipt panel activates
  useEffect(() => {
    function handler() {
      setDrafts(prev => prev.map(d => d.minimized ? d : { ...d, minimized: true }));
    }
    window.addEventListener('po-draft-activated',       handler);
    window.addEventListener('receipt-draft-activated',  handler);
    window.addEventListener('stockdoc-draft-activated', handler);
    return () => {
      window.removeEventListener('po-draft-activated',       handler);
      window.removeEventListener('receipt-draft-activated',  handler);
      window.removeEventListener('stockdoc-draft-activated', handler);
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

  // Open new order draft via event.
  // detail (необов'язковий) — заготовка полів: так відкривається копія
  // існуючого замовлення (див. AdminOrders → «Копіювати замовлення»).
  useEffect(() => {
    function handler(e: Event) {
      const preset = (e as CustomEvent<Partial<OrderDraft> | undefined>).detail;
      const now = Date.now();
      const draft: OrderDraft = {
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
        ...(preset ?? {}),
        // id і час — завжди наші: інакше копія перезаписала б чернетку-джерело
        id:            `order_${now}`,
        minimized:     false,
        createdAt:     now,
        lastActivated: now,
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
        <div className="doc-tabs" style={{ left: `${tabLeft}px`, ['--doc-accent' as string]: '#A5B4FC' }}>
          {tabOrder.map(draft => {
            const isActive    = !draft.minimized && draft.id === topCard?.id;
            const lineCount   = draft.lines.filter(l => l.sku || l.name).length;
            const total       = draft.lines.reduce((s, l) => s + l.qty * l.price, 0);
            const label       = draft.contact || 'Нове замовлення';
            const isConfirming = confirmClose === draft.id;

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>
                <div className={`doc-tab${isActive ? ' active' : ''}`}>
                  <div
                    className="doc-tab-main"
                    onClick={() => isActive ? minimizeDraft(draft.id) : bringToFront(draft.id)}
                  >
                    <span className="doc-tab-icon"><ShoppingBag size={15} /></span>
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

                {/* Confirm-close popup above tab */}
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
