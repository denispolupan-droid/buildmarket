'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { hint, TONE, type Tone } from './ui';

// Інструкція живе на самому екрані, а не лише в окремому документі: рішення
// «товар чи стаття», пороги довжин і попередження про перезапис потрібні саме
// в мить, коли рука вже на кнопці. Згорнутий стан памʼятається — щоденному
// користувачеві блок не заважає, новому все видно з першого заходу.
//
// Ті самі константи рендерить вкладка «Довідник» (HelpBody) — тому текст
// існує в одному екземплярі й не може розійтися між екраном і довідником.

export type HelpSection = { title: string; items: string[] };
export type HelpNote = { tone: 'stop' | 'care' | 'tip'; title: string; text: string };
export type HelpTable = { head: string[]; rows: string[][] };

export type HelpContent = {
  /** ключ у localStorage — свій на кожну вкладку */
  id: string;
  /** назва вкладки й адреса — потрібні довіднику */
  label: string;
  route: string;
  /** як часто сюди заходити */
  cadence: string;
  priority: 'hot' | 'warm' | 'cool' | 'idle';
  /** одне правило, з якого випливає решта; видно навіть у згорнутому стані */
  rule: string;
  sections: HelpSection[];
  table?: HelpTable;
  notes?: HelpNote[];
};

const NOTE_TONE: Record<HelpNote['tone'], Tone> = { stop: 'danger', care: 'warn', tip: 'ok' };

const mono = 'ui-monospace, monospace';

const eyebrow: React.CSSProperties = {
  fontFamily: mono, fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: 8,
};

/**
 * Мінімальна розмітка всередині рядків: **жирний** і `код`.
 * Рендеримо React-вузлами, не innerHTML — тексти хоч і свої, але правило
 * «не вставляти рядок у HTML» тут теж діє.
 */
function rich(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**')) {
      return <b key={key} style={{ color: 'var(--text-primary)', fontWeight: 650 }}>{part.slice(2, -2)}</b>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} style={{
          fontFamily: mono, fontSize: '0.9em',
          background: 'var(--bg-soft)', padding: '1px 5px', borderRadius: 4,
          color: 'var(--text-primary)',
        }}>{part.slice(1, -1)}</code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

/** Таблиця рішень — окремо, бо довідник показує її один раз нагорі. */
export function HelpTableView({ table }: { table: HelpTable }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
        <thead>
          <tr>
            {table.head.map(h => (
              <th key={h} style={{
                textAlign: 'left', padding: '0 12px 7px 0',
                fontFamily: mono, fontSize: 10.5, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.07em',
                color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '9px 12px 9px 0', verticalAlign: 'top',
                  borderBottom: '1px solid var(--border-light)',
                  color: ci === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                  lineHeight: 1.45,
                }}>{rich(cell, `t${ri}${ci}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Начинка довідки без обгортки — використовують і згорнутий блок, і довідник. */
export function HelpBody({ content, showRule = true, showTable = true }: {
  content: HelpContent;
  showRule?: boolean;
  showTable?: boolean;
}) {
  return (
    <>
      {showRule && (
        <p style={{
          margin: '0 0 16px', padding: '10px 14px', borderRadius: 8,
          background: 'var(--bg-soft)', fontSize: 13.5, lineHeight: 1.55,
          color: 'var(--text-secondary)',
        }}>
          {rich(content.rule, `${content.id}-rule`)}
        </p>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: content.sections.length > 1 ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
        gap: 20,
      }}>
        {content.sections.map(s => (
          <div key={s.title}>
            <div style={eyebrow}>{s.title}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.items.map((it, i) => (
                <li key={i} style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  {rich(it, `${content.id}-s${i}`)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {showTable && content.table && (
        <div style={{ marginTop: 18 }}><HelpTableView table={content.table} /></div>
      )}

      {content.notes?.map((n, i) => (
        <div key={i} style={{
          marginTop: 14, padding: '11px 14px', borderRadius: 8,
          border: `1px solid ${TONE[NOTE_TONE[n.tone]]}`,
          background: 'var(--bg-soft)', fontSize: 13.5, lineHeight: 1.5,
          color: 'var(--text-secondary)',
        }}>
          <b style={{ display: 'block', marginBottom: 3, color: TONE[NOTE_TONE[n.tone]] }}>{n.title}</b>
          {rich(n.text, `${content.id}-n${i}`)}
        </div>
      ))}
    </>
  );
}

export default function HelpBox({ content }: { content: HelpContent }) {
  const storageKey = `seo-help:${content.id}`;
  const [open, setOpen] = useState(true);

  // localStorage читаємо після монтування — інакше SSR і клієнт розійдуться
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === 'closed') setOpen(false);
    } catch { /* приватний режим — лишаємо відкритим */ }
  }, [storageKey]);

  function toggle() {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? 'open' : 'closed'); } catch { /* не критично */ }
      return next;
    });
  }

  return (
    <section style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--brand-blue)',
      borderRadius: 10,
      marginBottom: 18,
    }}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit',
        }}
      >
        <span style={{
          fontFamily: mono, fontSize: 10.5, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--brand-blue)',
        }}>
          Як користуватись
        </span>
        {!open && (
          <span style={{ ...hint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {content.rule.replace(/[*`]/g, '')}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <HelpBody content={content} />
        </div>
      )}
    </section>
  );
}
