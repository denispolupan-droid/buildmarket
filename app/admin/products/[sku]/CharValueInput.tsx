'use client';

import { useState, useEffect, useRef } from 'react';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  style?: React.CSSProperties;
};

export default function CharValueInput({ label, value, onChange, style }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Record<string, string[]>>({});

  useEffect(() => {
    async function fetchSuggestions() {
      if (!label.trim()) {
        setSuggestions([]);
        return;
      }

      if (cacheRef.current[label]) {
        setSuggestions(cacheRef.current[label]);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/admin/products/defaults?label=${encodeURIComponent(label)}`);
        if (res.ok) {
          const data = await res.json();
          const vals = data.values ?? [];
          cacheRef.current[label] = vals;
          setSuggestions(vals);
        }
      } catch {}
      setLoading(false);
    }

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [label]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = value.trim()
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()))
    : suggestions;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 2 }}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        placeholder={loading ? 'Завантаження...' : 'Значення'}
        style={style}
      />
      {showDropdown && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50,
          maxHeight: '200px', overflowY: 'auto', marginTop: '4px',
        }}>
          {filtered.slice(0, 15).map((s, i) => (
            <div
              key={i}
              onClick={() => { onChange(s); setShowDropdown(false); }}
              style={{
                padding: '10px 14px', cursor: 'pointer', fontSize: '14px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
                background: s === value ? '#EFF6FF' : '#fff',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = s === value ? '#EFF6FF' : '#fff')}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
