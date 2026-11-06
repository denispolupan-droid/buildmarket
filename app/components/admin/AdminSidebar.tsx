'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';

const MOBILE_MQ = '(max-width: 768px)';
function subscribeMobile(onChange: () => void) {
  const mq = window.matchMedia(MOBILE_MQ);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { Store, ExternalLink, ChevronLeft, ChevronRight, Menu, X, Search } from 'lucide-react';
import { NAV_GROUPS, isNavActive } from './admin-nav';
import CommandPalette from './CommandPalette';

const T = {
  textIdle:   '#CBD5E1',
  textActive: '#3DBFB8',
  bgActive:   'rgba(61,191,184,0.13)',
  divider:    'rgba(255,255,255,0.07)',
  iconActive: '#3DBFB8',
} as const;

const W_FULL      = 240;
const W_COLLAPSED = 64;

type Props = { newOrdersCount: number; chatUnreadCount?: number; userLabel?: string };

function SidebarInner({ newOrdersCount, chatUnreadCount = 0, userLabel = 'Панель менеджера' }: Props) {
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(false);
  const [mounted,   setMounted]   = useState(false);
  const [poDraftCount, setPoDraftCount] = useState(0);
  const [mailUnread,   setMailUnread]   = useState(0);
  const [mpChatUnread, setMpChatUnread] = useState(0);
  // Стартове значення — з сервера (layout), далі — з опитування: інакше бейдж
  // чату гас лише після переходу на іншу сторінку, бо layout рахує його один
  // раз на рендер, паралельно зі сторінкою, яка щойно обнулила лічильник.
  const [siteChatUnread, setSiteChatUnread] = useState(chatUnreadCount);
  useEffect(() => { setSiteChatUnread(chatUnreadCount); }, [chatUnreadCount]);
  // Below this width the sidebar becomes an off-canvas drawer instead of
  // squeezing every admin page's content into a sliver — that's what made
  // the admin panel unusable on phones. Lazy-initialized (matching the same
  // pattern in CatalogClient.tsx) so mobile doesn't flash the desktop layout
  // before the effect below can run.
  //
  // 06.11.2026: лінива ініціалізація з window давала hydration mismatch —
  // сервер малював десктопний <aside>, клієнт одразу кнопку меню, і React
  // перемальовував дерево. useSyncExternalStore під час гідратації бере
  // серверний знімок (false), одразу після — реальний; «спалах» десктопного
  // меню на телефоні до гідратації гасить CSS (aside[data-admin-sidebar] у globals.css).
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_MQ).matches, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K / ⌘K на будь-якій сторінці адмінки відкриває палітру
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(v => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (localStorage.getItem('admin_sidebar_collapsed') === '1') setCollapsed(true);
    setMounted(true);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('admin_sidebar_collapsed', next ? '1' : '0');
  }

  useEffect(() => {
    function fetchUnread() {
      fetch('/api/admin/mail/unread')
        .then(r => r.json())
        .then(d => setMailUnread(d?.count ?? 0))
        .catch(() => {});
      fetch('/api/admin/marketplace-chats/unread')
        .then(r => r.json())
        .then(d => {
          setMpChatUnread(d?.mp ?? d?.count ?? 0);
          if (typeof d?.site === 'number') setSiteChatUnread(d.site);
        })
        .catch(() => {});
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    // Відкрили чат або відповіли — екрани чатів шлють цю подію, щоб бейдж
    // погас одразу, а не за хвилину
    window.addEventListener('admin-unread-refresh', fetchUnread);
    return () => { clearInterval(interval); window.removeEventListener('admin-unread-refresh', fetchUnread); };
  }, []);

  useEffect(() => {
    function readCount() {
      try {
        const drafts = JSON.parse(sessionStorage.getItem('admin_po_drafts') ?? '[]');
        setPoDraftCount(Array.isArray(drafts) ? drafts.length : 0);
      } catch { setPoDraftCount(0); }
    }
    readCount();
    const handler = (e: Event) => {
      setPoDraftCount((e as CustomEvent<{ count: number }>).detail?.count ?? 0);
    };
    window.addEventListener('po-drafts-changed', handler);
    return () => window.removeEventListener('po-drafts-changed', handler);
  }, []);

  const w = isMobile ? W_FULL : (collapsed ? W_COLLAPSED : W_FULL);
  // On mobile the sidebar is a temporary overlay drawer, not a permanent rail —
  // collapsing it to icon-only doesn't save anything useful there, so ignore
  // the desktop collapse preference while mobile.
  const effectiveCollapsed = collapsed && !isMobile;

  return (
    <>
      {/* Backdrop — closes the drawer on tap outside it */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 290 }}
        />
      )}

      {/* Floating menu button — only when the drawer is closed on mobile */}
      {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Відкрити меню адміністратора"
          style={{
            position: 'fixed', bottom: '20px', left: '20px', zIndex: 280,
            width: '48px', height: '48px', borderRadius: '50%',
            background: '#1A3357', color: '#fff', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)', cursor: 'pointer',
          }}
        >
          <Menu size={22} />
        </button>
      )}

      <aside data-admin-sidebar data-mobile={isMobile ? '1' : '0'} style={{
        width:      `${w}px`,
        flexShrink: 0,
        background: 'linear-gradient(180deg, #142844 0%, #1A3357 100%)',
        display:    'flex',
        flexDirection: 'column',
        height:     '100vh',
        position:   isMobile ? 'fixed' : 'sticky',
        top:        0,
        left:       0,
        zIndex:     isMobile ? 300 : undefined,
        borderRight: `1px solid ${T.divider}`,
        boxShadow:  '4px 0 24px rgba(0,0,0,0.25)',
        overflow:   'hidden',
        transition: mounted ? (isMobile ? 'transform 0.25s ease' : 'width 0.2s ease') : 'none',
        transform:  isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
      }}>

      {/* ── Logo / user label ─────────────────────────────────────── */}
      <div style={{
        padding:      collapsed && !isMobile ? '20px 0' : '22px 18px 18px',
        borderBottom: `1px solid ${T.divider}`,
        display:      'flex',
        alignItems:   'center',
        justifyContent: collapsed && !isMobile ? 'center' : 'space-between',
        gap:          '10px',
        minHeight:    '64px',
        transition:   mounted ? 'padding 0.2s ease' : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
          <Store size={20} color="#3DBFB8" style={{ flexShrink: 0 }} />
          {!(collapsed && !isMobile) && (
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', letterSpacing: '0.01em', whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {userLabel}
            </div>
          )}
        </div>
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Закрити меню"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '6px', flexShrink: 0,
              background: 'rgba(255,255,255,0.07)', border: `1px solid ${T.divider}`,
              color: T.textIdle, cursor: 'pointer',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav
        className="admin-sidebar-nav"
        style={{ flex: 1, padding: effectiveCollapsed ? '0 8px' : '0 10px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', overflowX: 'hidden' }}
      >
        <button
          type="button"
          className={effectiveCollapsed ? 'admin-search-btn is-collapsed' : 'admin-search-btn'}
          title={effectiveCollapsed ? 'Пошук (Ctrl+K)' : undefined}
          onClick={() => setPaletteOpen(true)}
        >
          <Search size={14} />
          {!effectiveCollapsed && <><span>Пошук…</span><kbd className="admin-search-kbd">Ctrl K</kbd></>}
        </button>

        {NAV_GROUPS.map(group => (
          <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div className={effectiveCollapsed ? 'admin-nav-group is-collapsed' : 'admin-nav-group'} aria-hidden={effectiveCollapsed}>
              {!effectiveCollapsed && group.title}
            </div>
        {group.items.map(item => {
          const { href, label, icon: Icon } = item;
          const active = isNavActive(item, pathname);

          const badgeCount =
            href === '/admin'             && newOrdersCount > 0  ? newOrdersCount  :
            href === '/admin/procurement' && poDraftCount > 0    ? poDraftCount    :
            href === '/admin/chat'        && siteChatUnread + mpChatUnread > 0 ? siteChatUnread + mpChatUnread :
            href === '/admin/mail'        && mailUnread > 0      ? mailUnread      :
            0;
          const badgeColor = href === '/admin/procurement' ? '#F59E0B' : '#EF4444';

          return (
            <Link
              key={href}
              href={href}
              title={effectiveCollapsed ? label : undefined}
              className="admin-nav-btn"
              style={{
                position:   'relative',
                display:    'flex',
                alignItems: 'center',
                justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
                gap:        '10px',
                padding:    effectiveCollapsed ? '10px 0' : '9px 12px',
                borderRadius: '8px',
                textDecoration: 'none',
                background: active ? T.bgActive : 'transparent',
                color:      active ? T.textActive : T.textIdle,
                fontSize:   '13.5px',
                fontWeight: active ? 600 : 400,
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 1.75} color={active ? T.iconActive : T.textIdle} style={{ flexShrink: 0 }} />

              {!effectiveCollapsed && (
                <>
                  <span style={{ flex: 1 }}>{label}</span>
                  {badgeCount > 0 && (
                    <span style={{
                      background: badgeColor, color: '#fff',
                      fontSize: '10px', fontWeight: 700,
                      borderRadius: '6px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
                    }}>
                      {badgeCount}
                    </span>
                  )}
                </>
              )}

              {/* Collapsed badge — small dot top-right of icon */}
              {effectiveCollapsed && badgeCount > 0 && (
                <span style={{
                  position: 'absolute', top: '6px', right: '6px',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: badgeColor,
                  border: '1.5px solid #142844',
                }} />
              )}
            </Link>
          );
        })}
          </div>
        ))}
      </nav>

      {/* ── Collapse toggle — desktop only, meaningless for a mobile drawer ── */}
      {!isMobile && (
        <div style={{ padding: collapsed ? '8px 0' : '8px 10px', borderTop: `1px solid ${T.divider}`, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
          <button
            onClick={toggle}
            title={collapsed ? 'Розгорнути меню' : 'Згорнути меню'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '6px',
              background: 'rgba(255,255,255,0.07)',
              border: `1px solid ${T.divider}`,
              color: T.textIdle, cursor: 'pointer',
            }}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      )}

      {/* ── Back to site ─────────────────────────────────────────── */}
      <div style={{ padding: effectiveCollapsed ? '8px 0 12px' : '4px 10px 12px', borderTop: `1px solid ${T.divider}`, display: 'flex', justifyContent: effectiveCollapsed ? 'center' : 'flex-start' }}>
        <Link
          href="/"
          title={effectiveCollapsed ? 'На сайт' : undefined}
          className="admin-nav-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: effectiveCollapsed ? '8px 0' : '8px 12px',
            borderRadius: '8px', textDecoration: 'none',
            color: 'rgba(148,163,184,0.4)', fontSize: '13px',
            justifyContent: effectiveCollapsed ? 'center' : 'flex-start',
          }}
        >
          <ExternalLink size={13} />
          {!effectiveCollapsed && 'На сайт'}
        </Link>
      </div>
      </aside>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

export default function AdminSidebar(props: Props) {
  return (
    <Suspense fallback={null}>
      <SidebarInner newOrdersCount={props.newOrdersCount} chatUnreadCount={props.chatUnreadCount} userLabel={props.userLabel} />
    </Suspense>
  );
}
