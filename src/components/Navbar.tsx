'use client';

import { createClient } from '@/lib/supabase-client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Profile } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';

export default function Navbar() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!cancelled) setProfile(data);
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const roleLabels: Record<string, string> = {
    admin: 'Admin',
    service_manager: 'Servicio',
    kitchen_manager: 'Cocina',
    bar_manager: 'Bar',
  };

  const navLinks = [
    ...(profile?.role === 'admin' ? [
      { href: '/dashboard', label: 'Dashboard' },
    ] : []),
    { href: '/inventory', label: 'Inventario' },
    { href: '/orders', label: 'Pedidos' },
    { href: '/history', label: 'Historial' },
    ...(profile?.role === 'admin' ? [
      { href: '/users', label: 'Equipo' },
    ] : []),
    { href: '/settings', label: 'Ajustes' },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="border-b border-[var(--border)] px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image src="/logo_white.svg" alt="La Comitiva" width={28} height={28} style={{ height: 'auto' }} className="rounded" />
          </Link>

          <div className="flex items-center gap-1">
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
            <span className="text-[11px] font-medium text-[var(--text-subtle)] bg-[var(--bg-hover)] px-2.5 py-1 rounded-full uppercase tracking-wider">
              {roleLabels[profile.role] || profile.role}
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            Salir
          </button>
        </div>
      </div>
    </nav>
  );
}
