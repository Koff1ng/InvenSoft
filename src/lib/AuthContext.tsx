'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Profile, Area } from '@/lib/types';

interface Sede { id: string; name: string; }

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  areas: Area[];
  sedes: Sede[];
  loading: boolean;
  /** Re-fetch profile + areas from the server */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CACHE_KEY = 'lc_auth_cache';

function readCache(): { profile: Profile | null; areas: Area[]; sedes: Sede[] } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(profile: Profile | null, areas: Area[], sedes: Sede[]) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ profile, areas, sedes }));
  } catch { /* quota exceeded — ignore */ }
}

export function clearAuthCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);

  // Hydrate from cache immediately to avoid flash
  const cached = typeof window !== 'undefined' ? readCache() : null;

  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(cached?.profile ?? null);
  const [areas, setAreas] = useState<Area[]>(cached?.areas ?? []);
  const [sedes, setSedes] = useState<Sede[]>(cached?.sedes ?? []);
  const [loading, setLoading] = useState(!cached); // if cache exists, start non-loading

  const loadAuth = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) {
      setUser(null);
      setProfile(null);
      setAreas([]);
      setSedes([]);
      setLoading(false);
      clearAuthCache();
      return;
    }

    setUser(u as any);

    const [profRes, areasRes, sedesRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', u.id).single(),
      supabase.from('areas').select('*'),
      supabase.from('sedes').select('*'),
    ]);

    const prof = profRes.data as Profile | null;
    const areasData = (areasRes.data as Area[]) || [];
    const sedesData = (sedesRes.data as Sede[]) || [];

    setProfile(prof);
    setAreas(areasData);
    setSedes(sedesData);
    setLoading(false);

    writeCache(prof, areasData, sedesData);
  }, [supabase]);

  useEffect(() => {
    loadAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setAreas([]);
        setSedes([]);
        clearAuthCache();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadAuth();
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({
    user,
    profile,
    areas,
    sedes,
    loading,
    refresh: loadAuth,
  }), [user, profile, areas, sedes, loading, loadAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
