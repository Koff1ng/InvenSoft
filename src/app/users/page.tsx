'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Area, UserRole } from '@/lib/types';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';

interface UserEntry {
  id: string;
  full_name: string;
  role: UserRole;
  area_id: string | null;
  area?: { name: string } | null;
  username?: string;
  created_at: string;
}

const ROLES: { value: UserRole; label: string; icon: string; color: string }[] = [
  { value: 'admin', label: 'Administrador', icon: 'A', color: '#E8A838' },
  { value: 'service_manager', label: 'Servicio', icon: 'S', color: '#4EA8DE' },
  { value: 'kitchen_manager', label: 'Cocina', icon: 'C', color: '#F87171' },
  { value: 'bar_manager', label: 'Bar', icon: 'B', color: '#A78BFA' },
];

function getRoleMeta(role: string) {
  return ROLES.find(r => r.value === role) || { label: role, icon: '?', color: '#888' };
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function UsersPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserEntry | null>(null);

  // Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('service_manager');
  const [areaId, setAreaId] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<UserEntry | null>(null);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*, area:areas(name)')
      .order('created_at', { ascending: true });
    if (data) {
      setUsers(data.map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        area_id: p.area_id,
        area: p.area,
        username: p.username || '',
        created_at: p.created_at,
      })));
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/inventory'); return; }
      const { data: areasData } = await supabase.from('areas').select('*');
      setAreas(areasData || []);
      await loadUsers();
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetForm = () => {
    setUsername(''); setPassword(''); setFullName('');
    setRole('service_manager'); setAreaId(''); setFormError('');
    setEditingUser(null); setModalOpen(false);
  };

  const openCreate = () => { resetForm(); setModalOpen(true); };

  const openEdit = (u: UserEntry) => {
    setEditingUser(u);
    setUsername(u.username || '');
    setPassword('');
    setFullName(u.full_name);
    setRole(u.role);
    setAreaId(u.area_id || '');
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');

    if (editingUser) {
      // Update profile
      const updates: Record<string, unknown> = {
        full_name: fullName,
        role,
        area_id: role === 'admin' ? null : areaId || null,
      };
      if (username.trim()) updates.username = username.trim();
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', editingUser.id);
      if (error) { setFormError(error.message); setFormLoading(false); return; }
    } else {
      // Create via server API (no session hijack)
      if (!username.trim()) { setFormError('Ingresa un usuario o correo'); setFormLoading(false); return; }
      if (!password || password.length < 6) { setFormError('La contraseña debe tener al menos 6 caracteres'); setFormLoading(false); return; }

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          full_name: fullName || username.trim(),
          role,
          area_id: role === 'admin' ? null : areaId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Error al crear usuario'); setFormLoading(false); return; }
    }

    resetForm();
    setFormLoading(false);
    loadUsers();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) { alert(error.message); }
    else { loadUsers(); }
    setDeleteTarget(null);
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="max-w-5xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[var(--bg-input)] rounded w-48" />
            <div className="h-12 bg-[var(--bg-input)] rounded" />
            <div className="h-12 bg-[var(--bg-input)] rounded" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Equipo
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {users.length} {users.length === 1 ? 'miembro' : 'miembros'} del equipo
            </p>
          </div>
          <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo miembro
          </button>
        </div>

        {/* Users Grid */}
        <div className="space-y-2">
          {/* Table header — desktop only */}
          <div className="hidden md:grid grid-cols-[1fr_120px_100px_100px_80px] gap-3 px-4 py-2 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
            <span>Miembro</span>
            <span>Rol</span>
            <span>Área</span>
            <span>Desde</span>
            <span></span>
          </div>

          {users.map(u => {
            const rm = getRoleMeta(u.role);
            return (
              <div
                key={u.id}
                className="flex flex-col sm:grid sm:grid-cols-[1fr_120px_100px_100px_80px] gap-2 sm:gap-3 sm:items-center px-4 py-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors group"
              >
                {/* Avatar + info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
                    style={{ backgroundColor: `${rm.color}22`, color: rm.color }}
                  >
                    {getInitials(u.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{u.full_name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">
                      {u.username || '—'}
                    </p>
                  </div>
                  {/* Mobile actions */}
                  <div className="flex items-center gap-1 sm:hidden">
                    <button onClick={() => openEdit(u)} className="p-1.5 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]" title="Editar">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400" title="Eliminar">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>

                {/* Mobile: role + area inline */}
                <div className="flex items-center gap-2 sm:hidden pl-12">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${rm.color}18`, color: rm.color }}>
                    {rm.icon} {rm.label}
                  </span>
                  {u.area?.name && <span className="text-xs text-[var(--text-muted)]">{u.area.name}</span>}
                </div>

                {/* Desktop: Role badge */}
                <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full w-fit" style={{ backgroundColor: `${rm.color}18`, color: rm.color }}>
                  {rm.icon} {rm.label}
                </span>

                {/* Desktop: Area */}
                <span className="hidden sm:inline text-sm text-[var(--text-muted)]">{u.area?.name || '—'}</span>

                {/* Desktop: Date */}
                <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
                  {new Date(u.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                </span>

                {/* Desktop: Actions */}
                <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(u)} className="p-1.5 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Editar">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400" title="Eliminar">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            );
          })}

          {users.length === 0 && (
            <div className="text-center py-16 text-[var(--text-muted)]">
              <p className="text-lg mb-2">Sin miembros todavía</p>
              <p className="text-sm">Agrega un miembro del equipo para empezar</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── CREATE/EDIT MODAL ─── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={resetForm} />
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">
                {editingUser ? 'Editar miembro' : 'Nuevo miembro'}
              </h2>
              <button onClick={resetForm} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Username + Password */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    Usuario o correo
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="input-field"
                    placeholder="ej: juanperez o juan@email.com"
                    required={!editingUser}
                    autoFocus={!editingUser}
                  />
                  {!editingUser && (
                    <p className="text-xs text-[var(--text-muted)] mt-1">Puede ser un nombre de usuario simple o un correo</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    {editingUser ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="input-field"
                    placeholder={editingUser ? '••••••' : 'Mínimo 6 caracteres'}
                    required={!editingUser}
                    minLength={editingUser ? 0 : 6}
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="input-field"
                  placeholder="Nombre del miembro"
                  required
                  autoFocus={!!editingUser}
                />
              </div>

              {/* Role selector — Notion style pills */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-2">
                  Rol
                </label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border"
                      style={{
                        backgroundColor: role === r.value ? `${r.color}22` : 'transparent',
                        borderColor: role === r.value ? r.color : 'var(--border)',
                        color: role === r.value ? r.color : 'var(--text-muted)',
                      }}
                    >
                      <span>{r.icon}</span> {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Area (if not admin) */}
              {role !== 'admin' && (
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    Área asignada
                  </label>
                  <select
                    value={areaId}
                    onChange={e => setAreaId(e.target.value)}
                    className="input-field"
                    required
                  >
                    <option value="">Seleccionar área...</option>
                    {areas.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Error */}
              {formError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/15 px-4 py-3 rounded-lg">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={formLoading}
                  className="btn-primary flex-1 py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  {formLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Guardando...
                    </span>
                  ) : editingUser ? 'Guardar cambios' : 'Crear miembro'}
                </button>
                <button type="button" onClick={resetForm} className="btn-secondary py-2.5 text-sm px-6">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRM MODAL ─── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/15 mx-auto mb-4 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">Eliminar miembro</h3>
              <p className="text-sm text-[var(--text-muted)] mb-6">
                ¿Estás seguro de eliminar a <strong className="text-[var(--text)]">{deleteTarget.full_name}</strong>? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                  Cancelar
                </button>
                <button onClick={confirmDelete} className="flex-1 py-2.5 text-sm font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
