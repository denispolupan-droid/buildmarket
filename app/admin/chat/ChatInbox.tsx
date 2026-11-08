'use client';

import { useCallback, useState } from 'react';
import { useAdminQuery } from '../../../lib/admin/api';
import MarketplaceChatsClient, { type ChatItem } from '../marketplace-chats/MarketplaceChatsClient';
import SiteChatsPane, { type SiteChatRow } from './SiteChatsPane';

/**
 * Розділ «Чати»: шапка й вкладки як у «Фінансах» (fin-tabs), під ними одна
 * двопанельна «пошта» для обох джерел. «Сайт» — власний чат-віджет
 * (chat_sessions, ШІ-автопілот, перехоплення), «Маркетплейси» — живі діалоги
 * Rozetka/Prom. Механіки різні, тому вкладки, а не спільна стрічка; список
 * маркетплейсів вантажиться одразу, щоб у вкладці була цифра «чекають».
 */

type Tab = 'site' | 'mp';

const NO_ITEMS: ChatItem[] = [];
const NO_ERRORS: string[] = [];

export default function ChatInbox({ rows, initialTab, autoOpenSiteId, autoOpenOrderId, autoOpenChatKey }: {
  rows: SiteChatRow[];
  initialTab: Tab;
  autoOpenSiteId?: string | null;
  autoOpenOrderId?: string | null;
  autoOpenChatKey?: string | null;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const list = useAdminQuery<{ items?: ChatItem[]; errors?: string[] }>('/api/admin/marketplace-chats');
  const items = list.data?.items ?? NO_ITEMS;
  const listLoading = list.isValidating;
  const listErrors = list.error ? [list.error.message] : (list.data?.errors ?? NO_ERRORS);
  const updateList = list.update;
  const setItems = useCallback((fn: (prev: ChatItem[]) => ChatItem[]) => {
    void updateList(cur => cur && { ...cur, items: fn(cur.items ?? NO_ITEMS) });
  }, [updateList]);

  // Вкладка — в адресі, щоб посилання з Telegram і закладки відкривали потрібну
  const switchTab = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'mp') url.searchParams.set('tab', 'mp'); else url.searchParams.delete('tab');
    url.searchParams.delete('chat'); url.searchParams.delete('order');
    window.history.replaceState(null, '', url.toString());
  };

  const siteWaiting = rows.filter(r => r.unread_count > 0 || r.state === 'waiting').length;
  const mpWaiting = items.filter(i => i.unread > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: '24px 32px 24px' }}>
      <div style={{ marginBottom: '12px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Чати</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Листування з покупцями: чат сайту і діалоги Rozetka та Prom — відповідайте, не заходячи в кабінети
        </p>
      </div>

      <nav className="fin-tabs" aria-label="Джерела чатів" style={{ marginBottom: '16px' }}>
        {([['site', 'Сайт', siteWaiting], ['mp', 'Маркетплейси', mpWaiting]] as const).map(([key, label, n]) => (
          <button key={key} type="button" className={'fin-tab' + (tab === key ? ' active' : '')} onClick={() => switchTab(key)}
            style={{ background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none', fontFamily: 'inherit' }}>
            {label}
            {n > 0 && <span className="inbox-tab-count hot">{n}</span>}
          </button>
        ))}
      </nav>

      {tab === 'mp' ? (
        <MarketplaceChatsClient
          items={items} setItems={setItems} listLoading={listLoading} listErrors={listErrors} reload={list.refresh}
          autoOpenOrderId={autoOpenOrderId} autoOpenChatKey={autoOpenChatKey}
        />
      ) : (
        <SiteChatsPane rows={rows} autoOpenId={autoOpenSiteId} />
      )}
    </div>
  );
}
