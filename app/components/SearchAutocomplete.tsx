'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';

type Suggestion = { sku: string; name: string; brand: string; volume: string | null };

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wrapperClassName?: string;
  iconClassName?: string;
};

export default function SearchAutocomplete({ value, onChange, placeholder, wrapperClassName, iconClassName }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const fetchSuggestions = useCallback((q: string) => {
    clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return undefined; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        const results: Suggestion[] = data.results ?? [];
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIdx(-1);
      } catch {}
    }, 300);
  }, []);

  useEffect(() => { fetchSuggestions(value); }, [value, fetchSuggestions]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  function select(s: Suggestion) {
    onChange(`${s.brand} ${s.name}`);
    setSuggestions([]); setOpen(false); setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || !suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); select(suggestions[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); setActiveIdx(-1); }
  }

  return (
    <div ref={wrapperRef} className={wrapperClassName} style={{ position: 'relative' }}>
      <Search size={16} className={iconClassName} />
      <input
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-card, #fff)',
          border: '1px solid var(--border, #E2E8F0)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          overflow: 'hidden',
        }}>
          {suggestions.map((s, i) => (
            <div
              key={s.sku}
              onMouseDown={() => select(s)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                background: i === activeIdx ? 'var(--bg-soft, #F8FAFC)' : 'transparent',
                borderBottom: i < suggestions.length - 1 ? '1px solid var(--border, #F1F5F9)' : 'none',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #0F172A)', lineHeight: 1.3 }}>
                {s.brand} {s.name}
              </div>
              {s.volume && (
                <div style={{ fontSize: '11px', color: 'var(--text-muted, #94A3B8)', marginTop: '2px' }}>{s.volume}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
