'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      if (data?.session) router.replace('/');
    });
  }, [supabase, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // If username doesn't contain @, append fake domain
      const authEmail = email.includes('@') ? email : `${email.toLowerCase().replace(/\s+/g, '')}@lacomitiva.local`;

      const { error, data } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (!data?.session) {
        setError('No se pudo iniciar sesión. Verifica que tu cuenta esté confirmada.');
        setLoading(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Error inesperado al iniciar sesión');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setResetSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Image src="/logo_white.svg" alt="La Comitiva" width={72} height={72} className="mx-auto mb-4" />
          <p className="text-[var(--text-muted)] text-sm">
            {forgotMode ? 'Recuperar contraseña' : 'Sistema de Inventarios'}
          </p>
        </div>

        {resetSent ? (
          <div className="p-4 rounded-lg bg-green-900/20 text-[var(--success)] text-center">
            Revisa tu correo electrónico para restablecer tu contraseña.
            <button
              onClick={() => { setForgotMode(false); setResetSent(false); }}
              className="block mt-3 text-sm text-[var(--primary)] mx-auto"
            >
              Volver al login
            </button>
          </div>
        ) : forgotMode ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="correo@ejemplo.com"
                required
              />
            </div>

            {error && (
              <div className="text-[var(--danger)] text-sm bg-red-900/20 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-center disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotMode(false); setError(''); }}
              className="text-sm text-[var(--primary)] w-full text-center"
            >
              Volver al login
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                Usuario o correo
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="usuario o correo@ejemplo.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="text-[var(--danger)] text-sm bg-red-900/20 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-accent w-full py-2.5 text-center text-sm disabled:opacity-50"
            >
              {loading ? 'Ingresando...' : 'Continuar'}
            </button>

            <button
              type="button"
              onClick={() => { setForgotMode(true); setError(''); }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] w-full text-center mt-2 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </form>
        )}

        <div className="mt-8 border-t border-[var(--border)] pt-6">
          <p className="text-[11px] text-[var(--text-subtle)] font-medium mb-2 uppercase tracking-wider">Acceso</p>
          <div className="text-xs text-[var(--text-muted)] space-y-0.5">
            <p>Ingresa tu <span className="text-[var(--text-subtle)]">usuario o correo</span> y contraseña</p>
          </div>
        </div>
      </div>
    </div>
  );
}
