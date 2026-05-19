'use client';

/**
 * Глобальний менеджер чернеток замовлень постачальнику.
 * Живе в admin layout — не зникає при навігації між сторінками.
 * Зберігає стан у sessionStorage для відновлення після переходів.
 *
 * Взаємодія з сторінками:
 *   window.dispatchEvent(new CustomEvent('open-po-draft', { detail: { suppliers } }))
 */

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';

const NewPOModal = dynamic(() => import('./procurement/NewPOModal'), { ssr: false });

export interface PoLine {
  sku: string; name: string; qty: number; cost_price: number;
  catalog_price?: number; matched: boolean;
}

export interface PoDraft {
  id:           string;
  suppliers:    { id: number; name: string }[];
  supplierId:   number;
  expectedDate: string;
  notes:        string;
  lines:        PoLine[];
  minimized:    boolean;
  createdAt:    number;
}

const SESSION_KEY = 'admin_po_drafts';

function loadDrafts(): PoDraft[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '[]'); }
  catch { return []; }
}

function saveDrafts(drafts: PoDraft[]) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(drafts)); }
  catch { /* quota exceeded — ignore */ }
}

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default function PoDraftManager() {
  const [drafts,  setDrafts]  = useState<PoDraft[]>([]);
  const [mounted, setMounted] = useState(false);

  // Читаємо з sessionStorage після монтування (уникаємо гідратаційних помилок)
  useEffect(() => {
    setDrafts(loadDrafts());
    setMounted(true);
  }, []);

  // Зберігаємо в sessionStorage і повідомляємо sidebar при кожній зміні
  useEffect(() => {
    if (!mounted) return;
    saveDrafts(drafts);
    window.dispatchEvent(new CustomEvent('po-drafts-changed', { detail: { count: drafts.length } }));
  }, [drafts, mounted]);

  // Слухаємо подію від кнопок "Нове замовлення"
  useEffect(() => {
    function handler(e: Event) {
      const suppliers = (e as CustomEvent<{ suppliers: { id: number; name: string }[] }>).detail?.suppliers ?? [];

      const draft: PoDraft = {
        id:           `po_${Date.now()}`,
        suppliers,
        supplierId:   suppliers[0]?.id ?? 0,
        expectedDate: '',
        notes:        '',
        lines:        [{ sku: '', name: '', qty: 1, cost_price: 0, matched: false }],
        minimized:    false,
        createdAt:    Date.now(),
      };

      setDrafts(prev => [
        // Згортаємо всі розгорнуті
        ...prev.map(d => d.minimized ? d : { ...d, minimized: true }),
        draft,
      ]);
    }

    window.addEventListener('open-po-draft', handler);
    return () => window.removeEventListener('open-po-draft', handler);
  }, []);

  const updateDraft  = useCallback((id: string, data: Partial<PoDraft>) =>
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...data } : d)), []);

  const removeDraft  = useCallback((id: string) =>
    setDrafts(prev => prev.filter(d => d.id !== id)), []);

  const minimizeDraft = useCallback((id: string) =>
    updateDraft(id, { minimized: true }), [updateDraft]);

  const restoreDraft  = useCallback((id: string) =>
    setDrafts(prev => prev.map(d =>
      d.id === id ? { ...d, minimized: false } : { ...d, minimized: true }
    )), []);

  const closeDraft = useCallback((id: string) => {
    setDrafts(prev => {
      const draft = prev.find(d => d.id === id);
      if (!draft) return prev;
      const hasData = draft.lines.some(l => l.sku || l.name) || draft.notes.trim();
      if (hasData && !window.confirm('Документ не збережено. Закрити?')) return prev;
      return prev.filter(d => d.id !== id);
    });
  }, []);

  if (!mounted) return null;

  const expanded     = drafts.find(d => !d.minimized);
  const minimized    = drafts.filter(d => d.minimized);

  return (
    <>
      {/* Розгорнутий модал */}
      {expanded && (
        <NewPOModal
          key={expanded.id}
          initialData={expanded}
          onMinimize={() => minimizeDraft(expanded.id)}
          onClose={() => closeDraft(expanded.id)}
          onDraftChange={data => updateDraft(expanded.id, data)}
          onSubmitted={() => removeDraft(expanded.id)}
        />
      )}

      {/* Таби чернеток — flex-рядок, прилягають до правого краю */}
      {minimized.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, right: '84px', zIndex: 1001,
          display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: '2px',
        }}>
          {minimized.map(draft => {
            const supplierName = draft.suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
            const filledLines  = draft.lines.filter(l => l.sku || l.name).length;
            const total        = draft.lines.reduce((s, l) => s + l.qty * l.cost_price, 0);

            return (
              <div
                key={draft.id}
                onClick={() => restoreDraft(draft.id)}
                style={{
                  height: '40px', width: '220px',
                  background: 'rgba(20, 35, 60, 0.96)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '10px 10px 0 0',
                  border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '0 10px 0 12px',
                  cursor: 'pointer',
                  boxShadow: '0 -3px 14px rgba(0,0,0,0.25)',
                  transition: 'background 0.15s',
                  flexShrink: 0,
                }}
                className="po-tab"
              >
                {/* Пульсуюча точка */}
                <span className="po-dot" style={{ flexShrink: 0 }} />

                {/* Назва + деталі */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#CBD5E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {supplierName || 'Нове замовлення'}
                  </div>
                  {filledLines > 0 && (
                    <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>
                      {filledLines} поз · {fmt(total)} ₴
                    </div>
                  )}
                </div>

                {/* Закрити */}
                <button
                  onClick={e => { e.stopPropagation(); closeDraft(draft.id); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.3)', display: 'flex', padding: '4px',
                    borderRadius: '4px', flexShrink: 0,
                    transition: 'color 0.15s',
                  }}
                  className="po-close-btn"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes po-pulse-anim { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .po-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#F59E0B; animation:po-pulse-anim 2s ease-in-out infinite; }
        .po-tab:hover { background: rgba(30,50,85,0.98) !important; }
        .po-tab:hover .po-close-btn { color: rgba(255,255,255,0.65) !important; }
      `}</style>
    </>
  );
}
