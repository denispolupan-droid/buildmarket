'use client';

import { useState, useEffect, useRef } from 'react';

type Props = {
  categorySlug: string;
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
};

// Кеш ярликів по категорії — спільний між усіма рядками характеристик,
// щоб не смикати API на кожен інпут.
const labelCache: Record<string, string[]> = {};

export default function CharLabelInput({ categorySlug, value, onChange, style }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const key = categorySlug || '_';
      if (labelCache[key]) { setSuggestions(labelCache[key]); return; }
      try {
        const res = await fetch(`/api/admin/products/defaults?labels=1&category=${encodeURIComponent(categorySlug)}`);
        if (res.ok) {
          const data = await res.json();
          const labels: string[] = data.labels ?? [];
          labelCache[key] = labels;
          if (!cancelled) setSuggestions(labels);
        }
      } catch { /* мовчки — просто без підказок */ }
    }
    load();
    return () => { cancelled = true; };
  }, [categorySlug]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = value.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase())
    : suggestions;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1 }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        placeholder="Назва характеристики"
        style={{ ...style, width: '100%', boxSizing: 'border-box' }}
      />
      {showDropdown && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50,
          maxHeight: '220px', overflowY: 'auto', marginTop: '4px',
        }}>
          {filtered.slice(0, 20).map((s, i) => (
            <div
              key={i}
              onClick={() => { onChange(s); setShowDropdown(false); }}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: '14px',
                borderBottom: i < Math.min(filtered.length, 20) - 1 ? '1px solid var(--border-light)' : 'none',
                background: '#fff',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
