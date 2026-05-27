'use client';

/**
 * РњРµРЅРµРґР¶РµСЂ С‡РµСЂРЅРµС‚РѕРє Р·Р°РјРѕРІР»РµРЅСЊ РїРѕСЃС‚Р°С‡Р°Р»СЊРЅРёРєСѓ.
 * Р–РёРІРµ РІ admin layout вЂ” РїРµСЂРµР¶РёРІР°С” РЅР°РІС–РіР°С†С–СЋ РјС–Р¶ СЃС‚РѕСЂС–РЅРєР°РјРё.
 *
 * РџРѕРІРµРґС–РЅРєР° РєР°СЂС‚ (card stack):
 *   - Р'СЃС– РЅРµР·РіРѕСЂРЅСѓС‚С– РґРѕРєСѓРјРµРЅС‚Рё = РІС–РґРєСЂРёС‚С– РїР°РЅРµР»С– (stack)
 *   - РћСЃС‚Р°РЅРЅСЏ Сѓ РјР°СЃРёРІС– = Р°РєС‚РёРІРЅР° (Р·РІРµСЂС…Сѓ)
 *   - РџРѕРїРµСЂРµРґРЅС– = РІРёРґРЅРѕ С‚С–Р»СЊРєРё РїСЂР°РІРёР№ РєСЂР°Р№ (peek strip)
 *   - РљР»С–Рє РЅР° edge в†' bringToFront
 *   - Р—РіРѕСЂРЅСѓС‚С– в†' С‚Р°Р±-Р±Р°СЂ РІРЅРёР·Сѓ
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
  dbId?:         string;   // UUID РІ acc_documents (РґР»СЏ СЂРµРґР°РіСѓРІР°РЅРЅСЏ С–СЃРЅСѓСЋС‡РѕРіРѕ PO)
  suppliers:     { id: number; name: string; email?: string | null }[];
  supplierId:    number;
  expectedDate:  string;
  notes:         string;
  lines:         PoLine[];
  minimized:     boolean;
  createdAt:     number;
  lastActivated: number;
}

const SESSION_KEY  = 'admin_po_drafts';
const SIDEBAR_W    = 220;   // С€РёСЂРёРЅР° СЃР°Р№РґР±Р°СЂСѓ
const PANEL_W      = 'min(800px, 56vw)';
const PEEK_PER_CARD = 24;   // С€РёСЂРёРЅР° РІРёРґРёРјРѕРіРѕ РєСЂР°СЋ РєРѕР¶РЅРѕС— С„РѕРЅРѕРІРѕС— РєР°СЂС‚Рё

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
  // РЈРЅС–РєР°Р»СЊРЅРёР№ РєР»СЋС‡ РјР°СЂС€СЂСѓС‚Сѓ вЂ” Р·РјС–РЅСЋС”С‚СЊСЃСЏ С– РїСЂРё pathname, С– РїСЂРё searchParams
  const routeKey     = pathname + '?' + searchParams.toString();

  useEffect(() => { setDrafts(loadDrafts()); setMounted(true); }, []);

  // РњС–РЅС–РјС–Р·СѓРІР°С‚Рё РІСЃС– Р—Рџ, РєРѕР»Рё Receipt Р°Р±Рѕ Order-РїР°РЅРµР»СЊ СЃС‚Р°С” Р°РєС‚РёРІРЅРѕСЋ
  useEffect(() => {
    function handler() {
      setDrafts(prev => prev.map(d => d.minimized ? d : { ...d, minimized: true }));
    }
    window.addEventListener('receipt-draft-activated', handler);
    window.addEventListener('order-draft-activated',   handler);
    return () => {
      window.removeEventListener('receipt-draft-activated', handler);
      window.removeEventListener('order-draft-activated',   handler);
    };
  }, []);

  // РђРІС‚РѕР·РіРѕСЂС‚Р°РЅРЅСЏ РїСЂРё Р±СѓРґСЊ-СЏРєС–Р№ РЅР°РІС–РіР°С†С–С— РїРѕР·Р° СЂРѕР·РґС–Р»РѕРј Р·Р°РєСѓРїС–РІР»С–
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

  // РќРѕРІРµ Р°Р±Рѕ РІС–РґСЂРµРґР°РіРѕРІР°РЅРµ Р·Р°РјРѕРІР»РµРЅРЅСЏ вЂ” РІС–РґРєСЂРёРІР°С”РјРѕ РїР°РЅРµР»СЊ
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{
        suppliers: { id: number; name: string; email?: string | null }[];
        prefill?: Partial<PoDraft>;  // РґР»СЏ СЂРµРґР°РіСѓРІР°РЅРЅСЏ С–СЃРЅСѓСЋС‡РѕС— С‡РµСЂРЅРµС‚РєРё
      }>).detail;
      const suppliers = detail?.suppliers ?? [];
      const prefill   = detail?.prefill;
      const now = Date.now();
      const draft: PoDraft = {
        id:            `po_${now}`,
        dbId:          prefill?.dbId,
        suppliers,
        supplierId:    prefill?.supplierId ?? suppliers[0]?.id ?? 0,
        expectedDate:  prefill?.expectedDate ?? '',
        notes:         prefill?.notes ?? '',
        lines:         prefill?.lines?.length
                         ? prefill.lines
                         : [{ sku: '', name: '', qty: 1, cost_price: 0, matched: false }],
        minimized:     false,
        createdAt:     now,
        lastActivated: now,
      };
      setDrafts(prev => {
        // РЇРєС‰Рѕ С‡РµСЂРЅРµС‚РєР° Р· С‚Р°РєРёРј dbId РІР¶Рµ РІС–РґРєСЂРёС‚Р° вЂ” РІРёРІРѕРґРёРјРѕ С—С— РІРїРµСЂРµРґ, РЅРµ РґСѓР±Р»СЋС”РјРѕ
        if (prefill?.dbId) {
          const existing = prev.find(d => d.dbId === prefill.dbId);
          if (existing) {
            return prev.map(d =>
              d.id === existing.id ? { ...d, minimized: false, lastActivated: Date.now() } : d
            );
          }
        }
        return [...prev, draft];
      });
    }
    window.addEventListener('open-po-draft', handler);
    return () => window.removeEventListener('open-po-draft', handler);
  }, []);

  // РџРµСЂРµРєР»СЋС‡РёС‚РёСЃСЊ РЅР° РєР°СЂС‚Сѓ вЂ” РјС–РЅС–РјС–Р·СѓС”РјРѕ РІСЃС– С–РЅС€С– Р—Рџ С– РІСЃС– Receipt-РїР°РЅРµР»С–
  const bringToFront = useCallback((id: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === id
        ? { ...d, minimized: false, lastActivated: Date.now() }
        : { ...d, minimized: true }
    ));
    // РџРѕРІС–РґРѕРјР»СЏС”РјРѕ ReceiptDraftManager вЂ” РІС–РЅ РјС–РЅС–РјС–Р·СѓС” СЃРІРѕС— РїР°РЅРµР»С–
    window.dispatchEvent(new CustomEvent('po-draft-activated'));
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

  // РўР°Р±Рё Р·Р°РІР¶РґРё Сѓ РїРѕСЂСЏРґРєСѓ СЃС‚РІРѕСЂРµРЅРЅСЏ (РЅРµ РїРµСЂРµРјС–С‰СѓСЋС‚СЊСЃСЏ)
  const tabOrder = [...drafts].sort((a, b) => a.createdAt - b.createdAt);

  // РЎС‚РµРє: РІС–РґРєСЂРёС‚С– РєР°СЂС‚Рё, РІС–РґСЃРѕСЂС‚РѕРІР°РЅС– РїРѕ lastActivated (РЅР°Р№РІРёС‰Р° = Р°РєС‚РёРІРЅР°)
  const stack   = [...drafts.filter(d => !d.minimized)].sort((a, b) => a.lastActivated - b.lastActivated);
  const topCard = stack[stack.length - 1];
  const bgCards = stack.slice(0, -1);

  return (
    <>
      {/* в”Ђв”Ђ Р¤РѕРЅРѕРІС– РєР°СЂС‚Рё (РІРёРґРЅРѕ С‚С–Р»СЊРєРё РїСЂР°РІРёР№ peek-РєСЂР°Р№) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      {bgCards.map((draft, idx) => {
        // depth: 1 = РѕРґСЂР°Р·Сѓ Р·Р° Р°РєС‚РёРІРЅРѕСЋ, 2 = РґР°Р»С– С– С‚.Рґ.
        const depth        = bgCards.length - idx;
        const supplierName = draft.suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
        const peekWidth    = PEEK_PER_CARD * depth;
        const topOffset    = depth * 5; // РєРѕР¶РЅР° РЅР°СЃС‚СѓРїРЅР° С‚СЂРѕС…Рё РЅРёР¶С‡Рµ

        return (
          <div
            key={draft.id}
            onClick={() => bringToFront(draft.id)}
            title={`Відкрити: ${supplierName || 'Нове замовлення'}`}
            style={{
              position: 'fixed',
              left:   `${SIDEBAR_W}px`,
              top:    `${topOffset}px`,
              bottom: '42px',
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
            {/* Р'РёРґРёРјРёР№ РїСЂР°РІРёР№ edge Р·С– СЃР»Р°Р±РєРёРј hover */}
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

      {/* в”Ђв”Ђ РђРєС‚РёРІРЅР° РєР°СЂС‚Р° (top of stack) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
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

      {/* в”Ђв”Ђ РўР°Р±-Р±Р°СЂ РІРЅРёР·Сѓ: РІСЃС– С‡РµСЂРЅРµС‚РєРё (РІС–РґРєСЂРёС‚С– + Р·РіРѕСЂРЅСѓС‚С–) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      {drafts.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: '220px', zIndex: 1010,
          display: 'flex', flexDirection: 'row', alignItems: 'stretch', gap: '2px',
        }}>
          {tabOrder.map(draft => {
            const isActive    = !draft.minimized;
            const isOpenStack = false;
            const supplierName = draft.suppliers.find(s => s.id === draft.supplierId)?.name ?? '';
            const filledLines  = draft.lines.filter(l => l.sku || l.name).length;
            const total        = draft.lines.reduce((s, l) => s + l.qty * l.cost_price, 0);

            const isConfirming = confirmClose === draft.id;

            const tabStyle: React.CSSProperties = {
              height: '42px',
              width:  '210px',
              background: '#323848',
              backdropFilter: 'blur(8px)',
              borderRadius: '10px 10px 0 0',
              border: '1px solid rgba(255,255,255,0.08)',
              borderTop: isActive ? '2px solid #4880B8' : '1px solid rgba(255,255,255,0.06)',
              borderBottom: 'none',
              display: 'flex', alignItems: 'center',
              boxShadow: isActive ? '0 -3px 14px rgba(72,128,184,0.2)' : 'none',
              opacity: isActive ? 1 : 0.8,
              transition: 'opacity 0.18s, box-shadow 0.18s, border-color 0.18s',
              flexShrink: 0,
              overflow: 'hidden',
            };

            return (
              <div key={draft.id} style={{ position: 'relative', alignSelf: 'flex-end', flexShrink: 0 }}>


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

      {/* ── Центрований діалог підтвердження закриття ───────────────────────────── */}
      {confirmClose && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1050,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px',
            padding: '28px 32px', width: '340px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Закрити без збереження?
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: 1.5 }}>
              Незбережені дані чернетки будуть видалені назавжди.
              Щоб зберегти — натисніть «Скасувати» і збережіть як чернетку.
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmClose(null)}
                style={{ flex: 1, height: '38px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Скасувати
              </button>
              <button
                onClick={() => closeDraft(confirmClose, true)}
                style={{ flex: 1, height: '38px', borderRadius: '9px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Так, закрити
              </button>
            </div>
          </div>
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
