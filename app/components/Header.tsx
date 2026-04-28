'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LayoutGrid, Phone, User, ShoppingCart, LogOut, ChevronDown, Menu, X, Heart, Sun, Moon, Store, PackageCheck } from 'lucide-react';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import { useTheme } from '../../lib/theme';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const NAV = [
  { href: '/',          icon: Home,         label: 'Головна'    },
  { href: '/shop',      icon: Store,        label: 'Магазин'    },
  { href: '/catalog',   icon: LayoutGrid,   label: 'Опт'        },
  { href: '/dropship',  icon: PackageCheck, label: 'Дропшипінг' },
  { href: '/contacts',  icon: Phone,        label: 'Контакти'   },
];

export default function Header() {
  const pathname = usePathname();
  const router   = useRouter();
  const [user,       setUser]       = useState<SupabaseUser | null>(null);
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data }: { data: { user: SupabaseUser | null } }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: { user: SupabaseUser } | null) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Close mobile menu on route change
  useEffect(() => { setMobileOpen(false); setMenuOpen(false); }, [pathname]);

  async function handleLogout() {
    await getSupabaseBrowser().auth.signOut();
    setMenuOpen(false);
    setMobileOpen(false);
    router.push('/');
    router.refresh();
  }

  function handleNavClick(e: React.MouseEvent, href: string) {
    if (href === '/' && pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const { totalItems } = useCart();
  const { skus: wishSkus } = useWishlist();
  const totalWish = wishSkus.size;
  const { theme, toggle: toggleTheme } = useTheme();
  const companyName = user?.user_metadata?.company_name as string | undefined;
  const initials    = companyName ? companyName.charAt(0).toUpperCase() : '?';

  return (
    <>
      <header style={{
        background: 'var(--bg-card)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{
          maxWidth: '1280px', margin: '0 auto', padding: '0 32px',
          height: '52px',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
        }} className="header-inner">

          {/* Logo */}
          <Link href="/" onClick={e => handleNavClick(e, '/')} style={{ justifySelf: 'start', flexShrink: 0 }}>
            <Image src="/fixline-logo.png" alt="FIXLINE" width={216} height={54} priority style={{ width: 'auto', height: '40px', display: 'block' }} />
          </Link>

          {/* Desktop nav */}
          <nav className="desktop-nav" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {NAV.map(({ href, icon: Icon, label }) => {
              const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
              return (
                <Link key={href} href={href} onClick={e => handleNavClick(e, href)} className="btn-nav" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '7px 14px', borderRadius: '8px',
                  fontSize: '14px', fontWeight: active ? 600 : 500,
                  color: active ? '#1E3A5F' : 'var(--text-secondary)',
                  background: active ? '#E8EEF5' : 'transparent',
                }}>
                  <Icon size={15} strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '8px' }}>

            {/* Desktop user menu */}
            <div className="desktop-nav" style={{ position: 'relative' }}>
              {user ? (
                <>
                  <button
                    onClick={() => setMenuOpen(o => !o)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '8px',
                      height: '38px', padding: '0 12px 0 8px', borderRadius: '8px',
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <span style={{
                      width: '26px', height: '26px', borderRadius: '50%',
                      background: '#1E3A5F', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '12px', fontWeight: 700, flexShrink: 0,
                    }}>
                      {initials}
                    </span>
                    <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {companyName ?? user.email}
                    </span>
                    <ChevronDown size={14} strokeWidth={2} />
                  </button>

                  {menuOpen && (
                    <div style={{
                      position: 'absolute', top: '44px', right: 0, minWidth: '200px',
                      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 200, padding: '6px',
                    }}>
                      <Link href="/account" onClick={() => setMenuOpen(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '7px', fontSize: '14px', color: 'var(--text-primary)',
                      }}>
                        <User size={15} strokeWidth={2} />Особистий кабінет
                      </Link>
                      <Link href="/account/wishlist" onClick={() => setMenuOpen(false)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '7px', fontSize: '14px', color: 'var(--text-primary)',
                      }}>
                        <Heart size={15} strokeWidth={2} />Обране
                      </Link>
                      {user.user_metadata?.role === 'admin' && (
                        <Link href="/admin" onClick={() => setMenuOpen(false)} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 12px', borderRadius: '7px', fontSize: '14px', color: 'var(--text-primary)',
                        }}>
                          <LayoutGrid size={15} strokeWidth={2} />Панель менеджера
                        </Link>
                      )}
                      <hr style={{ border: 'none', borderTop: '1px solid #F1F5F9', margin: '4px 0' }} />
                      <button onClick={handleLogout} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', borderRadius: '7px', fontSize: '14px',
                        color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer',
                      }}>
                        <LogOut size={15} strokeWidth={2} />Вийти
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <Link href="/login" className="btn-dark" style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  height: '38px', padding: '0 18px', borderRadius: '8px',
                  background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
                }}>
                  <User size={15} strokeWidth={2} />Вхід
                </Link>
              )}
            </div>

            {/* Wishlist */}
            <Link href="/account/wishlist" aria-label="Обране" className="btn-icon" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '38px', height: '38px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)',
              position: 'relative',
            }}>
              <Heart size={15} strokeWidth={2} />
              {totalWish > 0 && (
                <span style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  minWidth: '18px', height: '18px', borderRadius: '9px',
                  background: '#EF4444', color: '#fff',
                  fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {totalWish}
                </span>
              )}
            </Link>

            {/* Cart */}
            <Link href="/cart" className="btn-icon" style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              height: '38px', padding: '0 18px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
              position: 'relative',
            }}>
              <ShoppingCart size={15} strokeWidth={2} />
              <span className="desktop-nav">Кошик</span>
              {totalItems > 0 && (
                <span style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  minWidth: '18px', height: '18px', borderRadius: '9px',
                  background: '#1E3A5F', color: '#fff',
                  fontSize: '11px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}>
                  {totalItems}
                </span>
              )}
            </Link>

            {/* Hamburger */}
            <button
              className="hamburger-btn"
              aria-label={mobileOpen ? 'Закрити меню' : 'Відкрити меню'}
              onClick={() => setMobileOpen(o => !o)}
              style={{
                display: 'none',
                width: '38px', height: '38px', borderRadius: '8px',
                border: '1px solid #E2E8F0', background: '#fff',
                alignItems: 'center', justifyContent: 'center', color: '#475569',
              }}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div style={{
          position: 'fixed', top: '64px', left: 0, right: 0, bottom: 0,
          background: 'var(--bg-card)', zIndex: 99, overflowY: 'auto',
          borderTop: '1px solid var(--border)',
          padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '4px',
        }}>
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} onClick={e => handleNavClick(e, href)} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 16px', borderRadius: '10px',
                fontSize: '15px', fontWeight: active ? 600 : 500,
                color: active ? '#1E3A5F' : '#374151',
                background: active ? '#E8EEF5' : 'transparent',
              }}>
                <Icon size={18} strokeWidth={2} />{label}
              </Link>
            );
          })}

          <div style={{ borderTop: '1px solid #F1F5F9', marginTop: '8px', paddingTop: '8px' }}>
            {user ? (
              <>
                <div style={{ padding: '10px 16px', fontSize: '13px', color: '#94A3B8' }}>
                  {companyName ?? user.email}
                </div>
                <Link href="/account" style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderRadius: '10px', fontSize: '15px', color: '#374151',
                }}>
                  <User size={18} strokeWidth={2} />Особистий кабінет
                </Link>
                {user.user_metadata?.role === 'admin' && (
                  <Link href="/admin" style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', borderRadius: '10px', fontSize: '15px', color: '#374151',
                  }}>
                    <LayoutGrid size={18} strokeWidth={2} />Панель менеджера
                  </Link>
                )}
                <button onClick={handleLogout} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderRadius: '10px', fontSize: '15px',
                  color: '#EF4444', background: 'none', border: 'none', cursor: 'pointer',
                }}>
                  <LogOut size={18} strokeWidth={2} />Вийти
                </button>
              </>
            ) : (
              <Link href="/login" className="btn-dark" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                height: '48px', borderRadius: '10px', background: '#1E3A5F',
                color: '#fff', fontSize: '15px', fontWeight: 700, margin: '4px 0',
              }}>
                <User size={16} />Вхід
              </Link>
            )}
          </div>
        </div>
      )}
      {/* Theme toggle — fixed bottom-right */}
      <button
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Перемкнути на світлу тему' : 'Перемкнути на темну тему'}
        title={theme === 'dark' ? 'Світла тема' : 'Темна тема'}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 999,
          width: '44px', height: '44px', borderRadius: '50%',
          background: theme === 'dark' ? '#1E293B' : '#0F172A',
          border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#F1F5F9', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        }}
      >
        {theme === 'dark' ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
      </button>
    </>
  );
}
