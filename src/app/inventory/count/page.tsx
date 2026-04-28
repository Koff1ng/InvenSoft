'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Profile } from '@/lib/types';
import Navbar from '@/components/Navbar';

interface CountItem {
  inventory_item_id: string;
  area_id: string;
  product_name: string;
  product_unit: string;
  system_qty: number;
  counted_qty: string;
}

interface PhysicalCount {
  id: string;
  area_id: string;
  submitted_by: string;
  reviewed_by: string | null;
  status: 'pendiente' | 'aprobado' | 'rechazado';
  items: { inventory_item_id: string; product_name: string; product_unit: string; system_qty: number; counted_qty: number }[];
  notes: string | null;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  // enriched
  area?: { name: string };
  submitter?: { full_name: string };
  reviewer?: { full_name: string };
}

export default function PhysicalCountPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Submit form state
  const [showForm, setShowForm] = useState(false);
  const [countItems, setCountItems] = useState<CountItem[]>([]);
  const [countNotes, setCountNotes] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // List state
  const [counts, setCounts] = useState<PhysicalCount[]>([]);
  const [detailCount, setDetailCount] = useState<PhysicalCount | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);

  const loadCounts = useCallback(async (prof: Profile) => {
    let query = supabase.from('physical_counts').select('*').order('created_at', { ascending: false });

    // Non-admins only see their own
    if (prof.role !== 'admin') {
      query = query.eq('submitted_by', prof.id);
    }

    const { data } = await query;
    if (!data?.length) { setCounts([]); return; }

    // Enrich
    const areaIds = [...new Set(data.map((c: any) => c.area_id).filter(Boolean))];
    const userIds = [...new Set([
      ...data.map((c: any) => c.submitted_by),
      ...data.map((c: any) => c.reviewed_by),
    ].filter(Boolean))];

    const [areasRes, usersRes] = await Promise.all([
      areaIds.length ? supabase.from('areas').select('id, name').in('id', areaIds) : { data: [] },
      userIds.length ? supabase.from('profiles').select('id, full_name').in('id', userIds) : { data: [] },
    ]);

    const areaMap = new Map((areasRes.data || []).map((a: any) => [a.id, a]));
    const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

    setCounts(data.map((c: any) => {
      const area: any = areaMap.get(c.area_id);
      const submitter: any = userMap.get(c.submitted_by);
      const reviewer: any = c.reviewed_by ? userMap.get(c.reviewed_by) : null;
      return {
        ...c,
        area: area ? { name: area.name } : undefined,
        submitter: submitter ? { full_name: submitter.full_name } : undefined,
        reviewer: reviewer ? { full_name: reviewer.full_name } : undefined,
      };
    }));
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (!prof) return;
      setProfile(prof);
      await loadCounts(prof);
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load products for the form
  const openForm = async () => {
    if (!profile) return;
    const areaId = profile.area_id;
    if (!areaId && profile.role !== 'admin') return;

    let query = supabase.from('inventory_items').select('id, area_id, quantity, product:products(name, unit), area:areas(name)');
    if (profile.role !== 'admin') query = query.eq('area_id', areaId!);

    const { data } = await query;
    if (!data?.length) { setFormError('No hay productos en tu área'); return; }

    setCountItems(data.map((item: { id: string; area_id: string; quantity: number; product?: { name?: string; unit?: string } | null }) => ({
      inventory_item_id: item.id,
      area_id: item.area_id,
      product_name: item.product?.name || '—',
      product_unit: item.product?.unit || '',
      system_qty: item.quantity,
      counted_qty: '',
    })));
    setShowForm(true);
    setFormError('');
    setCountNotes('');
  };

  const handleSubmit = async () => {
    setFormLoading(true);
    setFormError('');

    const filledItems = countItems.filter(i => i.counted_qty !== '');
    if (filledItems.length === 0) {
      setFormError('Ingresa al menos una cantidad contada');
      setFormLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setFormLoading(false); return; }

    const targetAreaId = profile?.area_id || filledItems[0]?.area_id;
    if (!targetAreaId) {
      setFormError('No hay área asignada para este conteo');
      setFormLoading(false);
      return;
    }

    const { error } = await supabase.from('physical_counts').insert({
      area_id: targetAreaId,
      submitted_by: user.id,
      notes: countNotes || null,
      items: filledItems.map(i => ({
        inventory_item_id: i.inventory_item_id,
        product_name: i.product_name,
        product_unit: i.product_unit,
        system_qty: i.system_qty,
        counted_qty: parseFloat(i.counted_qty) || 0,
      })),
    });

    if (error) { setFormError(error.message); setFormLoading(false); return; }

    setShowForm(false);
    setFormLoading(false);
    if (profile) loadCounts(profile);
  };

  // Admin: approve count
  const approveCount = async (count: PhysicalCount) => {
    setReviewLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Apply quantities
    for (const item of count.items) {
      if (item.counted_qty !== item.system_qty) {
        await supabase.from('inventory_items').update({
          quantity: item.counted_qty,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        }).eq('id', item.inventory_item_id);

        await supabase.from('inventory_updates').insert({
          inventory_item_id: item.inventory_item_id,
          previous_qty: item.system_qty,
          new_qty: item.counted_qty,
          updated_by: user.id,
          notes: `Conteo físico aprobado${reviewNotes ? ': ' + reviewNotes : ''}`,
        });
      }
    }

    // Update count status
    await supabase.from('physical_counts').update({
      status: 'aprobado',
      reviewed_by: user.id,
      review_notes: reviewNotes || null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', count.id);

    setDetailCount(null);
    setReviewNotes('');
    setReviewLoading(false);
    if (profile) loadCounts(profile);
  };

  const rejectCount = async (count: PhysicalCount) => {
    setReviewLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('physical_counts').update({
      status: 'rechazado',
      reviewed_by: user.id,
      review_notes: reviewNotes || 'Rechazado',
      reviewed_at: new Date().toISOString(),
    }).eq('id', count.id);

    setDetailCount(null);
    setReviewNotes('');
    setReviewLoading(false);
    if (profile) loadCounts(profile);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pendiente': return 'bg-yellow-500/15 text-yellow-400';
      case 'aprobado': return 'bg-green-500/15 text-green-400';
      case 'rechazado': return 'bg-red-500/15 text-red-400';
      default: return 'bg-[var(--bg-input)] text-[var(--text-muted)]';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pendiente': return 'Pendiente';
      case 'aprobado': return 'Aprobado';
      case 'rechazado': return 'Rechazado';
      default: return status;
    }
  };

  if (loading) {
    return (<><Navbar /><div className="max-w-5xl mx-auto p-6"><p className="text-[var(--text-muted)]">Cargando...</p></div></>);
  }

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Conteo Físico
            </h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {profile?.role === 'admin' ? 'Revisa y aprueba los conteos enviados' : 'Envía tu conteo para revisión del admin'}
            </p>
          </div>
          {profile?.role !== 'admin' && (
            <button onClick={openForm} className="btn-primary flex items-center gap-2 text-sm">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo conteo
            </button>
          )}
        </div>

        {/* Counts list */}
        {counts.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <p className="text-lg mb-2">Sin conteos todavía</p>
            <p className="text-sm">{profile?.role === 'admin' ? 'Los jefes de área enviarán sus conteos aquí' : 'Haz un conteo físico de tu área'}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {counts.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors cursor-pointer" onClick={() => { setDetailCount(c); setReviewNotes(''); }}>
                <div className="min-w-0">
                  <p className="font-medium text-sm">
                    {c.area?.name || 'Área'} — {c.items?.length || 0} productos
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {c.submitter?.full_name || '—'} · {new Date(c.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusBadge(c.status)}`}>
                  {statusLabel(c.status)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ─── SUBMIT FORM ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 overflow-y-auto">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
            <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl mx-4 mb-8 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <h2 className="text-lg font-semibold">Conteo Físico</h2>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-[var(--text-muted)]">Ingresa la cantidad real de cada producto. Deja vacío los que no contaste.</p>

                <div className="max-h-[50vh] overflow-y-auto space-y-2">
                  {countItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_80px_80px] gap-3 items-center p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{item.product_name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{item.product_unit}</p>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.counted_qty}
                        onChange={e => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            const copy = [...countItems];
                            copy[idx] = { ...copy[idx], counted_qty: val };
                            setCountItems(copy);
                          }
                        }}
                        className="input-field text-sm text-center"
                        placeholder="Cantidad"
                      />
                      <span className="text-xs text-[var(--text-muted)] text-center">{item.product_unit}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Notas (opcional)</label>
                  <textarea value={countNotes} onChange={e => setCountNotes(e.target.value)} className="input-field text-sm" rows={2} placeholder="Observaciones del conteo..." />
                </div>

                {formError && (
                  <div className="text-sm text-red-400 bg-red-900/15 px-4 py-3 rounded-lg">{formError}</div>
                )}

                <div className="flex gap-3">
                  <button onClick={handleSubmit} disabled={formLoading} className="btn-primary flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
                    {formLoading ? 'Enviando...' : 'Enviar conteo para revisión'}
                  </button>
                  <button onClick={() => setShowForm(false)} className="btn-secondary py-2.5 text-sm px-6">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── DETAIL / REVIEW MODAL ─── */}
        {detailCount && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 overflow-y-auto">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDetailCount(null)} />
            <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl mx-4 mb-8 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div>
                  <h2 className="text-lg font-semibold">Conteo — {detailCount.area?.name || 'Área'}</h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {detailCount.submitter?.full_name || '—'} · {new Date(detailCount.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusBadge(detailCount.status)}`}>
                    {statusLabel(detailCount.status)}
                  </span>
                  <button onClick={() => setDetailCount(null)} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Items table */}
                <div className="max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
                        <th className="py-2 pr-4">Producto</th>
                        {profile?.role === 'admin' && <th className="py-2 px-4 text-center">Sistema</th>}
                        <th className="py-2 px-4 text-center">Conteo</th>
                        {profile?.role === 'admin' && <th className="py-2 pl-4 text-center">Diferencia</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detailCount.items.map((item, i) => {
                        const diff = item.counted_qty - item.system_qty;
                        return (
                          <tr key={i} className="border-b border-[var(--border)]">
                            <td className="py-2 pr-4 font-medium">{item.product_name}</td>
                            {profile?.role === 'admin' && <td className="py-2 px-4 text-center text-[var(--text-muted)]">{item.system_qty} {item.product_unit}</td>}
                            <td className="py-2 px-4 text-center font-semibold">{item.counted_qty} {item.product_unit}</td>
                            {profile?.role === 'admin' && (
                              <td className={`py-2 pl-4 text-center font-bold ${diff < 0 ? 'text-red-400' : diff > 0 ? 'text-green-400' : 'text-[var(--text-muted)]'}`}>
                                {diff > 0 ? '+' : ''}{diff !== 0 ? diff : '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {detailCount.notes && (
                  <div className="text-sm text-[var(--text-muted)] bg-[var(--bg)] p-3 rounded-lg">
                    <span className="font-medium">Notas del jefe:</span> {detailCount.notes}
                  </div>
                )}

                {detailCount.review_notes && (
                  <div className="text-sm text-[var(--text-muted)] bg-[var(--bg)] p-3 rounded-lg">
                    <span className="font-medium">Notas del admin:</span> {detailCount.review_notes}
                    {detailCount.reviewer && <span className="ml-1">— {detailCount.reviewer.full_name}</span>}
                  </div>
                )}

                {/* Admin review actions */}
                {profile?.role === 'admin' && detailCount.status === 'pendiente' && (
                  <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Notas de revisión (opcional)</label>
                      <input type="text" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} className="input-field text-sm" placeholder="Observaciones..." />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => approveCount(detailCount)} disabled={reviewLoading} className="btn-primary flex-1 py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {reviewLoading ? 'Procesando...' : 'Aprobar y aplicar'}
                      </button>
                      <button onClick={() => rejectCount(detailCount)} disabled={reviewLoading} className="py-2.5 text-sm px-6 font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors disabled:opacity-50">
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
