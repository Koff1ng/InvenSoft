'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Profile } from '@/lib/types';
import Navbar from '@/components/Navbar';
import { useToastAndConfirm } from '@/components/ui/ToastAndConfirm';

interface Sede { id: string; name: string; }

export default function SettingsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { askConfirm, showToast } = useToastAndConfirm();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Sedes
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [newSede, setNewSede] = useState('');
  const [sedeLoading, setSedeLoading] = useState(false);

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    service_manager: 'Jefe de Servicio',
    kitchen_manager: 'Jefe de Cocina',
    bar_manager: 'Jefe de Bar',
  };

  const loadSedes = useCallback(async () => {
    const { data } = await supabase.from('sedes').select('*');
    setSedes(data || []);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
      await loadSedes();
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (newPassword.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    if (newPassword !== confirmPassword) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setError(error.message); } else { setSuccess('Contraseña actualizada correctamente.'); setNewPassword(''); setConfirmPassword(''); }
    setLoading(false);
  };

  const addSede = async () => {
    const name = newSede.trim();
    if (!name) return;
    setSedeLoading(true);
    await supabase.from('sedes').insert({ name });
    setNewSede('');
    await loadSedes();
    setSedeLoading(false);
  };

  const removeSede = async (id: string, name: string) => {
    const isConfirmed = await askConfirm(`¿Eliminar la sede "${name}"? Se perderán todos los productos e inventario asociados.`);
    if (!isConfirmed) return;
    const { error } = await supabase.from('sedes').delete().eq('id', id);
    if (error) showToast(error.message, 'error');
    else showToast('Sede eliminada', 'success');
    await loadSedes();
  };

  if (!profile) {
    return (
      <>
        <Navbar />
        <div className="max-w-lg mx-auto p-4">
          <p className="text-[var(--text-muted)]">Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4 space-y-6 animate-fade-in">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          Configuración
        </h1>

        {/* Profile Info */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Mi Perfil</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Nombre</span>
              <span className="font-medium">{profile.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Rol</span>
              <span className="text-xs bg-[var(--bg-hover)] text-[var(--text-muted)] px-2 py-1 rounded-full border border-[var(--border)]">
                {roleLabels[profile.role] || profile.role}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--text-muted)]">Registrado</span>
              <span className="text-sm">
                {new Date(profile.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* ── Sedes Management (admin only) ── */}
        {profile.role === 'admin' && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7"/><path d="M15 17V7"/></svg>
              Sedes
              <span className="text-xs text-[var(--text-muted)] font-normal">({sedes.length})</span>
            </h2>

            <div className="flex flex-wrap gap-2 mb-4">
              {sedes.map(s => (
                <div key={s.id} className="flex items-center gap-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm group">
                  <span className="font-medium">{s.name}</span>
                  <button
                    onClick={() => removeSede(s.id, s.name)}
                    className="p-0.5 rounded hover:bg-red-500/15 text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newSede}
                onChange={e => setNewSede(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSede()}
                className="input-field flex-1 text-sm"
                placeholder="Nueva sede..."
              />
              <button onClick={addSede} disabled={sedeLoading || !newSede.trim()} className="btn-primary text-sm px-4 disabled:opacity-50">
                {sedeLoading ? '...' : 'Agregar'}
              </button>
            </div>
          </div>
        )}

        {/* Change Password */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Cambiar Contraseña</h2>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label htmlFor="settings-new-pw" className="block text-sm font-medium mb-1">Nueva contraseña</label>
              <input id="settings-new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field" placeholder="Mínimo 6 caracteres" required minLength={6} />
            </div>
            <div>
              <label htmlFor="settings-confirm-pw" className="block text-sm font-medium mb-1">Confirmar contraseña</label>
              <input id="settings-confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field" placeholder="Repetir contraseña" required />
            </div>
            {error && <div className="text-[var(--danger)] text-sm bg-red-900/20 p-3 rounded-lg">{error}</div>}
            {success && <div className="text-[var(--success)] text-sm bg-green-900/20 p-3 rounded-lg">{success}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
              {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
