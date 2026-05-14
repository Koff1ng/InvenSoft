'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, clearAuthCache } from '@/lib/AuthContext';
import { createClient } from '@/lib/supabase-client';

export default function Navbar() {
  const { profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on route change
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (menuOpen) {
      setMenuOpen(false);
      setMenuClosing(false);
    }
  }

  const handleLogout = useCallback(async () => {
    const supabase = createClient();
    clearAuthCache();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }, [router]);

  const closeMenu = useCallback(() => {
    setMenuClosing(true);
    setTimeout(() => {
      setMenuOpen(false);
      setMenuClosing(false);
    }, 200);
  }, []);

  const openMenu = useCallback(() => {
    setMenuClosing(false);
    setMenuOpen(true);
  }, []);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    service_manager: 'Servicio',
    kitchen_manager: 'Cocina',
    bar_manager: 'Bar',
  };

  const navLinks = [
    ...(profile?.role === 'admin' ? [
      { href: '/dashboard', label: 'Dashboard', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
    ] : []),
    { href: '/inventory', label: 'Inventario', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
    { href: '/orders', label: 'Pedidos', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
    { href: '/count', label: 'Conteo', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { href: '/history', label: 'Historial', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    ...(profile?.role === 'admin' ? [
      { href: '/users', label: 'Equipo', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    ] : []),
    { href: '/settings', label: 'Ajustes', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      <nav className="border-b border-[var(--border)] px-4 py-2.5 sticky top-0 z-40 bg-[var(--bg)]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 shrink-0">
              <Image src="/logo_white.svg" alt="La Comitiva" width={64} height={64} style={{ height: 'auto' }} className="rounded" priority />
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                    isActive(link.href)
                      ? 'text-[var(--text)] bg-[var(--bg-hover)] font-medium'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <span className="text-[11px] font-medium text-[var(--text-subtle)] bg-[var(--bg-hover)] px-2.5 py-1 rounded-full uppercase tracking-wider hidden sm:inline">
                {roleLabels[profile.role] || profile.role}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors hidden md:block"
            >
              Salir
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={menuOpen ? closeMenu : openMenu}
              className="md:hidden p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              aria-label="Menú"
            >
              {menuOpen && !menuClosing ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay — animated */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={closeMenu}>
          <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm ${menuClosing ? 'opacity-0 transition-opacity duration-200' : 'mobile-menu-overlay'}`} />
          <div
            ref={menuRef}
            className={`absolute top-0 right-0 w-64 h-full bg-[var(--bg-card)] border-l border-[var(--border)] shadow-2xl ${menuClosing ? 'mobile-menu-panel-exit' : 'mobile-menu-panel'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
              <div className="flex items-center gap-2">
                <Image src="/logo_white.svg" alt="La Comitiva" width={48} height={48} style={{ height: 'auto' }} className="rounded" />
                {profile && (
                  <span className="text-[11px] font-medium text-[var(--text-subtle)] bg-[var(--bg-hover)] px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {roleLabels[profile.role] || profile.role}
                  </span>
                )}
              </div>
              <button onClick={closeMenu} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div className="p-3 space-y-1">
              {navLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive(link.href)
                      ? 'text-[var(--text)] bg-[var(--bg-hover)] font-medium'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <span className="opacity-60">{link.icon}</span>
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-[var(--border)]">
              {profile && <p className="text-xs text-[var(--text-muted)] mb-2 truncate">{profile.full_name}</p>}
              <button onClick={handleLogout} className="w-full text-left text-sm text-red-400 hover:text-red-300 transition-colors flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
