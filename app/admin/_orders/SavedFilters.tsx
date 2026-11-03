'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, ChevronDown, X } from 'lucide-react';
import { useOrdersCtx } from './OrdersContext';

/**
 * Збережені фільтри журналу (аудит 31.10, п. 18). Зріз = вкладка статусу +
 * пошук + канал/перевізник/оплата/постачальник/повернення + період. Живе в
 * localStorage цього браузера — це особисті закладки менеджера, не дані.
 * Період «Сьогодні / 7 днів / Місяць» зберігається як пресет і рахується
 * заново при застосуванні, інакше закладка «за сьогодні» застаріла б завтра.
 */
const STORAGE_KEY = 'admin_orders_saved_filters_v1';
const FILTER_KEYS = ['status', 'q', 'channel', 'carrier', 'pay', 'ret', 'sent', 'dateFrom', 'dateTo'] as const;
type FilterKey = typeof FILTER_KEYS[number];
type DatePreset = 'today' | 'week' | 'month';
type Saved = { id: string; name: string; params: Partial<Record<FilterKey, string>>; datePreset?: DatePreset };

const kyivYmd = (ms: number) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
function presetDates(p: DatePreset): { dateFrom: string; dateTo: string } {
  const today = kyivYmd(Date.now());
  if (p === 'today') return { dateFrom: today, dateTo: today };
  if (p === 'week')  return { dateFrom: kyivYmd(Date.now() - 7 * 86400000), dateTo: today };
  return { dateFrom: `${today.slice(0, 7)}-01`, dateTo: today };
}
function detectPreset(from?: string, to?: string): DatePreset | undefined {
  if (!from || !to) return undefined;
  for (const p of ['today', 'week', 'month'] as DatePreset[]) {
    const d = presetDates(p);
    if (d.dateFrom === from && d.dateTo === to) return p;
  }
  return undefined;
}

function load(): Saved[] {
  try { const raw = localStorage.getItem(STORAGE_KEY); const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; }
}
function store(list: Saved[]) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {} }

function useSaved() {
  const [list, setList] = useState<Saved[]>([]);
  useEffect(() => { setList(load()); }, []);
  const update = (next: Saved[]) => { setList(next); store(next); };
  return { list, update };
}

/** Поточний зріз у вигляді параметрів URL (порожні — не пишемо). */
function useCurrentParams(): Partial<Record<FilterKey, string>> {
  const { currentStatus, initialSearch, channelFilter, carrierFilter, payFilter, retFilter, sentFilter, dateFrom, dateTo } = useOrdersCtx();
  const p: Partial<Record<FilterKey, string>> = {
    status: currentStatus, q: initialSearch, channel: channelFilter, carrier: carrierFilter,
    pay: payFilter, ret: retFilter, sent: sentFilter, dateFrom: dateFrom ?? '', dateTo: dateTo ?? '',
  };
  for (const k of FILTER_KEYS) if (!p[k]) delete p[k];
  return p;
}

/** Кнопка «Зберегти зріз…» у рядку «Обрано:» — інлайн-поле для назви. */
export function SaveFilterButton() {
  const { list, update } = useSaved();
  const params = useCurrentParams();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function save() {
    const n = name.trim();
    if (!n) { setEditing(false); return; }
    const datePreset = detectPreset(params.dateFrom, params.dateTo);
    const entry: Saved = { id: `${Date.now()}`, name: n, params: datePreset ? { ...params, dateFrom: undefined, dateTo: undefined } : params, datePreset };
    update([...list.filter(s => s.name !== n), entry]);
    setName(''); setEditing(false);
    window.dispatchEvent(new Event('admin-saved-filters-changed'));
  }

  if (!editing) {
    return (
      <button type="button" className="oc-active-filters-clear" onClick={() => setEditing(true)} title="Запамʼятати цей зріз під назвою">
        <Bookmark size={12} style={{ verticalAlign: '-2px', marginRight: '3px' }} />Зберегти зріз…
      </button>
    );
  }
  return (
    <span className="oc-saved-name">
      <input ref={inputRef} value={name} onChange={e => setName(e.target.value)} placeholder="Назва зрізу"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setName(''); } }} />
      <button type="button" onClick={save} className="oc-saved-ok" title="Зберегти">OK</button>
      <button type="button" onClick={() => { setEditing(false); setName(''); }} className="oc-saved-cancel" aria-label="Скасувати"><X size={12} /></button>
    </span>
  );
}

/** Меню збережених зрізів — поруч із періодом; зникає, коли нічого не збережено. */
export function SavedFiltersMenu() {
  const { list, update } = useSaved();
  const { pushFilters } = useOrdersCtx();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Після збереження з іншого компонента — перечитати
  useEffect(() => {
    const h = () => update(load());
    window.addEventListener('admin-saved-filters-changed', h);
    return () => window.removeEventListener('admin-saved-filters-changed', h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  if (!list.length) return null;

  function apply(s: Saved) {
    const patch: Record<string, string> = {};
    for (const k of FILTER_KEYS) patch[k] = s.params[k] ?? '';
    if (s.datePreset) Object.assign(patch, presetDates(s.datePreset));
    setOpen(false);
    pushFilters(patch);
  }

  return (
    <div className="oc-saved" ref={ref}>
      <button type="button" className={`oc-period-btn${open ? ' active' : ''}`} onClick={() => setOpen(v => !v)} aria-expanded={open} title="Збережені зрізи">
        <Bookmark size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />Зрізи<ChevronDown size={12} style={{ verticalAlign: '-2px', marginLeft: '2px' }} />
      </button>
      {open && (
        <div className="oc-saved-menu" role="menu">
          {list.map(s => (
            <div key={s.id} className="oc-saved-item">
              <button type="button" role="menuitem" onClick={() => apply(s)} title={describe(s)}>{s.name}</button>
              <button type="button" aria-label={`Видалити зріз ${s.name}`} title="Видалити" onClick={() => update(list.filter(x => x.id !== s.id))}><X size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function describe(s: Saved): string {
  const parts: string[] = [];
  if (s.params.status) parts.push(`статус: ${s.params.status}`);
  if (s.params.q) parts.push(`пошук: ${s.params.q}`);
  if (s.params.channel) parts.push(`канал: ${s.params.channel}`);
  if (s.params.carrier) parts.push(`доставка: ${s.params.carrier}`);
  if (s.params.pay) parts.push(`оплата: ${s.params.pay}`);
  if (s.params.sent) parts.push(`постачальнику: ${s.params.sent}`);
  if (s.params.ret) parts.push('повернення без рішення');
  if (s.datePreset) parts.push({ today: 'сьогодні', week: '7 днів', month: 'місяць' }[s.datePreset]);
  else if (s.params.dateFrom || s.params.dateTo) parts.push(`${s.params.dateFrom ?? '…'} — ${s.params.dateTo ?? '…'}`);
  return parts.join(' · ') || 'без фільтрів';
}
