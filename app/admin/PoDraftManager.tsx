'use client';

/**
 * Менеджер чернеток замовлень постачальнику.
 * Живе в admin layout — переживає навігацію між сторінками.
 *
 * Поведінка карт (card stack):
 *   - Всі незгорнуті документи = відкриті панелі (stack)
 *   - Остання у масиві = активна (зверху)
 *   - Попередні = видно тільки правий край (peek strip)
 *   - Клік на edge → bringToFront
 *   - Згорнуті → таб-бар внизу
 */

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { X, Minus } from 'lucide-react';

const NewPOModal = dynamic(() => import('./procurement/NewPOModal'), { ssr: false });

export interface PoLine {
  sku: string; name: string; qty: number; cost_price: number;
  catalog_price?: number; matched: boolean;
}

export interface PoDraft {
  id:            string;
  suppliers:     { id: number; name: string }[];
  supplierId:    number;
  expectedDate:  string;
  notes:         string;
  lines:         PoLine[];
  minimized:     boolean;
  createdAt:     number;
  lastActivated: number; // визначає хто зверху стеку без зміни порядку масиву
}

const SESSION_KEY  = 'admin_po_drafts';
const SIDEBAR_W    = 220;   // ширина сайдбару
const PANEL_W      = 'min(800px, 56vw)';
const PEEK_PER_CARD = 24;   // ширина видимого краю кожної фонової карти

function loadDrafts(): PoDraft[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]'); }
  catch { return []; }
}
function saveDrafts(drafts: PoDraft[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(drafts)); }
  catch { /* quota */ }
}
function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default function PoDraftManager() {
  const [drafts,         setDrafts]         = useState<PoDraft[]>([]);
  const [mounted,        setMounted]        = useState(false);
  const [confirmClose,   setConfirmClose]   = useState<string | null>(null);

  const pathname     = usePathname();
  const searchParams = useSearchParams();
  // Унікальний ключ маршруту — змінюється і при pathname, і при searchParams
  const routeKey     = pathname + '?' + searchParams.toString();

  useEffect(() => { setDrafts(loadDrafts()); setMounted(true); }, []);

  // Автозгортання при будь-якій навігації поза розділом закупівлі
  useEffect(() => {
    if (!mounted) return;
    if (!pathname.startsWith('/admin/procurement')) {
      setDrafts(prev => prev.map(d => d.minimized ? d : { ...d, minimized: true }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, mounted]);

  useEffect(() => {
    if (!mounted) return;
    saveDrafts(drafts);
    window.dispatchEvent(new CustomEvent('po-drafts-changed', { detail: { count: drafts.length } }));
  }, [drafts, mounted]);

  // Нове замовлення — додаємо зверху стеку (не згортаємо існуючі)
  useEffect(() => {
    function handler(e: Event) {
      const suppliers = (e as CustomEvent<{ suppliers: { id: number; name: string }[] }>).detail?.suppliers ?? [];
      const now = Date.now();
      const draft: PoDraft = {
        id:            `po_${now}`,
        suppliers,
        supplierId:    suppliers[0]?.id ?? 0,
        expectedDate:  '',
        notes:         '',
        lines:         [{ sku: '', name: '', qty: 1, cost_price: 0, matched: false }],
        minimized:     false,
        createdAt:     now,
        lastActivated: now,
      };
      setDrafts(prev => [...prev, draft]);
    }
    window.addEventListener('open-po-draft', handler);
    return () => window.removeEventListener('open-po-draft', handler);
  }, []);

  // Принести карту вгору стеку — лише оновлюємо lastActivated, порядок масиву не міняється
  const bringToFront = useCallback((id: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === id ? { ...d, minimized: false, lastActivated: Date.now() } : d
    ));
  }, []);

  const updateDraft   = useCallback((id: string, data: Partial<PoDraft>) =>
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);

  const minimizeDraft = useCallback((id: string) =>
    updateDraft(id, { minimized: true }), [updateDraft]);

  const removeDraft   = useCallback((id: string) =>
    setDrafts(prev => prev.filter(d => d.id !== id)), []);

  const closeDraft = useCallback((id: string, force = false) => {
    if (!force) {
      const draft = drafts.find(d => d.id === id);
      if (!draft) return;
      const hasData = draft.lines.some(l => l.sku || l.name) || draft.notes.trim();
      if (hasData) { setConfirmClose(id); return; }
    }
    setConfirmClose(null);
    setDrafts(prev => prev.filter(d => d.id !== id));
  }, [drafts]);

  if (!mounted) return null;

  // Таби завжди у порядку створення (не переміщуються)
  const tabOrder = [...drafts].sort((a, b) => a.createdAt - b.createdAt);

  // Стек: відкриті карти, відсортовані по lastActivated (найвища = активна)
  const stack   = [...drafts.filter(d => !d.minimized)].sort((a, b) => a.lastActivated - b.lastActivated);
  const topCard = stack[stack.length - 1];
  const bgCards = stack.slice(0, -1);

  return (
    <>
      {/* ── Фонові карти (видно тільки правий peek-край) ─────────────────────── */}
      {bgCards.map((draft, idx) => {
        // depth: 1 = одразу за активною, 2 = далі і т.д.
        const depth        = bgCards.length - idx;
        const supplierName = draft.suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
        const peekWidth    = PEEK_PER_CARD * depth;
        const topOffset    = depth * 5; // кожна наступна трохи нижче

        return (
          <div
            key={draft.id}
            onClick={() => bringToFront(draft.id)}
            title={`Відкрити: ${supplierName || 'Нове замовлення'}`}
            style={{
              position: 'fixed',
              left:   `${SIDEBAR_W}px`,
              top:    `${topOffset}px`,
              bottom: '46px',
              width:  `calc(${PANEL_W} + ${peekWidth}px)`,
              zIndex: 1000 + idx,
              background:   'var(--bg-card)',
              borderLeft:   '1px solid var(--border)',
              borderTop:    `1px solid var(--border)`,
              borderRadius: '0 12px 0 0',
              boxShadow:    '6px -6px 20px rgba(0,0,0,0.18)',
              cursor:       'pointer',
              overflow:     'hidden',
              transition:   'top 0.2s ease-out, width 0.2s ease-out',
            }}
          >
            {/* Видимий правий edge зі слабким hover */}
            <div
              className="po-bg-edge"
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0,
                width:       `${peekWidth}px`,
                background:  'var(--bg-soft)',
                borderLeft:  '1px solid var(--border)',
                display:     'flex',
                flexDirection: 'column',
                alignItems:  'center',
                paddingTop:  '20px',
                gap:         '4px',
                transition:  'background 0.15s',
              }}
            >
              <div style={{
                writingMode:     'vertical-rl',
                textOrientation: 'mixed',
                transform:       'rotate(180deg)',
                fontSize: '11px', fontWeight: 600,
                color: 'var(--text-secondary)',
                maxHeight: '120px',
                overflow: 'hidden',
              }}>
                {supplierName || 'Замовлення'}
              </div>
            </div>
          </div>
        );
      })}

      {/* ── Активна карта (top of stack) ─────────────────────────────────────── */}
      {topCard && (
        <NewPOModal
          key={topCard.id}
          initialData={topCard}
          zIndex={1000 + stack.length}
          onMinimize={() => minimizeDraft(topCard.id)}
          onClose={() => closeDraft(topCard.id)}
          onDraftChange={data => updateDraft(topCard.id, data)}
          onSubmitted={() => removeDraft(topCard.id)}
        />
      )}

      {/* ── Таб-бар внизу: всі чернетки (відкриті + згорнуті) ───────────────── */}
      {drafts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: '220px', zIndex: 1010,
          display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: '2px',
        }}>
          {tabOrder.map(draft => {
            const isActive    = !draft.minimized && draft.id === topCard?.id;
            const isOpenStack = !draft.minimized && !isActive;
            const supplierName = draft.suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
            const filledLines  = draft.lines.filter(l => l.sku || l.name).length;
            const total        = draft.lines.reduce((s, l) => s + l.qty * l.cost_price, 0);

            const isConfirming = confirmClose === draft.id;

            const tabStyle: React.CSSProperties = {
              height: isActive ? '46px' : '38px',
              width:  '210px',
              background: isActive ? '#3a4256' : isOpenStack ? '#323848' : '#2b3040',
              backdropFilter: 'blur(8px)',
              borderRadius: '10px 10px 0 0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTop: isActive ? '2px solid #4880B8' : '1px solid rgba(255,255,255,0.06)',
              borderBottom: 'none',
              display: 'flex', alignItems: 'center',
              boxShadow: isActive ? '0 -4px 16px rgba(72,128,184,0.25)' : '0 -1px 6px rgba(0,0,0,0.15)',
              transition: 'background 0.18s, height 0.15s ease-out, box-shadow 0.18s, border-color 0.18s',
              flexShrink: 0,
              alignSelf: 'flex-end',
              overflow: 'hidden',
            };

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>

                {isConfirming && (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0,
                    background: 'var(--bg-card)', borderRadius: '10px 10px 0 0',
                    border: '1px solid var(--border)', borderBottom: 'none',
                    padding: '12px 14px', zIndex: 1020,
                    boxShadow: '0 -6px 20px rgba(0,0,0,0.3)',
                  }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>
                      Закрити без збереження?
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                      Незбережені дані будуть видалені
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => closeDraft(draft.id, true)}
                        style={{ flex: 1, height: '28px', borderRadius: '6px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                        Так, закрити
                      </button>
                      <button onClick={() => setConfirmClose(null)}
                        style={{ flex: 1, height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                        Скасувати
                      </button>
                    </div>
                  </div>
                )}

                <div className="po-tab" style={{ ...tabStyle, alignSelf: undefined }}>
                  <div
                    onClick={() => isActive ? minimizeDraft(draft.id) : bringToFront(draft.id)}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 4px 0 12px', height: '100%', cursor: 'pointer' }}
                  >
                    <span className="po-dot" style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: isActive ? '#E2E8F0' : '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {supplierName || 'Нове замовлення'}
                      </div>
                      {filledLines > 0 && (
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>
                          {filledLines} поз · {fmt(total)} ₴
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px 0 0', gap: '2px', flexShrink: 0 }}>
                    {!draft.minimized && (
                      <button onClick={() => minimizeDraft(draft.id)} title="Згорнути" className="po-close-btn"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', display: 'flex', padding: '3px', borderRadius: '4px' }}>
                        <Minus size={11} />
                      </button>
                    )}
                    <button onClick={() => closeDraft(draft.id)} title="Закрити" className="po-close-btn"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.25)', display: 'flex', padding: '3px', borderRadius: '4px' }}>
                      <X size={12} />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes po-pulse-anim { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .po-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#F59E0B; animation:po-pulse-anim 2s ease-in-out infinite; }
        .po-tab:hover { background: #424d64 !important; }
        .po-tab:hover .po-close-btn { color: rgba(255,255,255,0.6) !important; }
        .po-bg-edge:hover { background: var(--bg-card) !important; }
      `}</style>
    </>
  );
}
