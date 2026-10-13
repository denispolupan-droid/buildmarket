'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Search, MessagesSquare } from 'lucide-react';

/**
 * Спільні елементи розділу «Чати» для обох вкладок (сайт і маркетплейси):
 * двопанельна «пошта» — список зліва, листування справа — з єдиним рядком
 * списку, чіпом стану, бульбашками й полем відповіді. Стилі — .inbox-* у
 * globals.css, у тій самій манері, що й fin-* («Фінанси»/«SEO»).
 */

export type InboxSource = 'site' | 'rozetka' | 'prom';
export type InboxState = 'waiting' | 'answered' | 'resolved' | 'ai';

export const SOURCE_LABEL: Record<InboxSource, string> = { site: 'Сайт', rozetka: 'Rozetka', prom: 'Prom' };

const STATE_LABEL: Record<InboxState, string> = {
  waiting: 'Чекає відповіді', answered: 'Відповіли', resolved: 'Вирішено', ai: 'Веде ШІ',
};

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000);
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год`;
  return `${Math.floor(diff / 86400)} дн`;
}

export function formatClock(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** Ініціали для аватара: «Романов Микола» → «РМ», порожнє → «?» */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('');
}

export function SourceBadge({ source }: { source: InboxSource }) {
  return <span className={`inbox-src ${source}`}>{SOURCE_LABEL[source]}</span>;
}

export function StateChip({ state }: { state: InboxState }) {
  const dot = state === 'waiting' ? 'orange' : state === 'answered' ? 'green' : null;
  return (
    <span className={`inbox-state ${state}`}>
      {dot && <span className={`fin-dot ${dot}`} />}
      {STATE_LABEL[state]}
    </span>
  );
}

export function InboxShell({ hasSelected, list, thread }: { hasSelected: boolean; list: ReactNode; thread: ReactNode }) {
  return (
    <div className={'inbox' + (hasSelected ? ' has-selected' : '')}>
      <div className="inbox-list">{list}</div>
      <div className="inbox-thread">{thread}</div>
    </div>
  );
}

export function InboxToolbar<K extends string>({ pills, active, onPill, search, onSearch, right }: {
  pills: { key: K; label: string; count?: number }[];
  active: K;
  onPill: (k: K) => void;
  search: string;
  onSearch: (v: string) => void;
  right?: ReactNode;
}) {
  return (
    <div className="inbox-toolbar">
      <div className="inbox-search">
        <Search size={13} />
        <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Імʼя, замовлення, текст…" />
      </div>
      <div className="inbox-pills">
        {pills.map(p => (
          <button key={p.key} type="button" className={'inbox-pill' + (active === p.key ? ' active' : '')} onClick={() => onPill(p.key)}>
            {p.label}{typeof p.count === 'number' && p.count > 0 && <span className="inbox-pill-count">{p.count}</span>}
          </button>
        ))}
        {right && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '6px' }}>{right}</span>}
      </div>
    </div>
  );
}

export function InboxRow({ active, unread, source, title, preview, time, state, extra, onClick, avatar }: {
  active: boolean;
  unread: boolean;
  source: InboxSource;
  title: string;
  preview: string;
  time: string;
  state: InboxState;
  /** Рядок дрібним після стану: «№26101040» тощо */
  extra?: string | null;
  onClick: () => void;
  avatar: string;
}) {
  return (
    <button type="button" className={'inbox-row' + (active ? ' active' : '') + (unread ? ' unread' : '')} onClick={onClick}>
      <span className={`inbox-avatar ${source}`}>{avatar}</span>
      <span className="inbox-row-main">
        <span className="inbox-row-top">
          <span className="inbox-row-title">{title}</span>
          {unread && <span className="inbox-unread-dot" />}
          <span className="inbox-row-time">{time}</span>
        </span>
        <span className="inbox-row-preview">{preview || '—'}</span>
        <span className="inbox-row-meta">
          <SourceBadge source={source} />
          <StateChip state={state} />
          {extra && <span className="inbox-row-extra">{extra}</span>}
        </span>
      </span>
    </button>
  );
}

export function ThreadHead({ onBack, title, subtitle, actions }: {
  onBack: () => void; title: string; subtitle: string; actions?: ReactNode;
}) {
  return (
    <div className="inbox-thread-head">
      <button type="button" className="inbox-back" onClick={onBack} aria-label="Назад до списку"><ArrowLeft size={16} /></button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="inbox-thread-title">{title}</div>
        <div className="inbox-thread-sub">{subtitle}</div>
      </div>
      {actions && <div className="inbox-thread-actions">{actions}</div>}
    </div>
  );
}

export function Bubble({ ours, kind = 'default', author, text, at }: {
  ours: boolean; kind?: 'default' | 'system' | 'ai'; author?: string | null; text: string; at: string | null | undefined;
}) {
  return (
    <div className="inbox-bubble-row" style={{ justifyContent: ours ? 'flex-end' : 'flex-start' }}>
      <div className={'inbox-bubble' + (ours ? ' ours' : '') + (kind === 'system' ? ' system' : '') + (kind === 'ai' ? ' ai' : '')}>
        {!ours && author && <div className="inbox-bubble-author">{author}</div>}
        {text}
        <div className="inbox-bubble-time">{formatClock(at)}</div>
      </div>
    </div>
  );
}

export function EmptyThread({ text = 'Оберіть діалог зліва' }: { text?: string }) {
  return (
    <div className="inbox-empty">
      <MessagesSquare size={22} style={{ opacity: 0.5 }} />
      <span>{text}</span>
    </div>
  );
}

export function EmptyList({ text }: { text: string }) {
  return <div className="inbox-empty" style={{ padding: '32px 16px' }}>{text}</div>;
}
