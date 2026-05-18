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
import { ChevronUp, X } from 'lucide-react';

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

      {/* Згорнуті панелі (стекуються справа) */}
      {minimized.map((draft, idx) => {
        const supplierName = draft.suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
        const filledLines  = draft.lines.filter(l => l.sku || l.name).length;
        const total        = draft.lines.reduce((s, l) => s + l.qty * l.cost_price, 0);
        const right        = 88 + idx * 352; // стек зліва від кнопки чату

        return (
          <div key={draft.id} style={{
            position: 'fixed', bottom: 0, right: `${right}px`, zIndex: 1001,
            background: '#1E3A5F', borderRadius: '10px 10px 0 0',
            display: 'flex', alignItems: 'stretch',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.35)', minWidth: '320px',
            border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none',
          }}>
            {/* Пульсуючий акцент */}
            <div style={{ width: '4px', background: '#F59E0B', borderRadius: '10px 0 0 0', flexShrink: 0 }} className="po-pulse" />

            {/* Інфо */}
            <div style={{ flex: 1, padding: '10px 14px', minWidth: 0, overflow: 'hidden' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                <span className="po-dot" />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Замовлення{supplierName ? ` · ${supplierName}` : ''}
                </span>
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>
                {filledLines > 0 ? `${filledLines} поз. · ${fmt(total)} ₴ · ` : ''}чернетка
              </div>
            </div>

            {/* Відновити */}
            <button onClick={() => restoreDraft(draft.id)} style={{
              padding: '10px 12px', background: 'none', border: 'none',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', color: 'rgba(255,255,255,0.8)',
              display: 'flex', alignItems: 'center', gap: '4px',
              fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              <ChevronUp size={13} /> Відкрити
            </button>

            {/* Закрити */}
            <button onClick={() => closeDraft(draft.id)} style={{
              padding: '10px 10px', background: 'none', border: 'none',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
              display: 'flex', alignItems: 'center', borderRadius: '0 10px 0 0',
            }}>
              <X size={13} />
            </button>
          </div>
        );
      })}

      <style>{`
        @keyframes po-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
        .po-pulse { animation: po-pulse 2s ease-in-out infinite; }
        .po-dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:#F59E0B; flex-shrink:0; animation: po-pulse 2s ease-in-out infinite; }
      `}</style>
    </>
  );
}
