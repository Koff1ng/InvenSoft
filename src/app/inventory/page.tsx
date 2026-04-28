'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Profile, InventoryItem, Area } from '@/lib/types';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useToastAndConfirm } from '@/components/ui/ToastAndConfirm';

interface Sede { id: string; name: string; }

const PAGE_SIZE = 20;
type SortField = 'name' | 'quantity' | 'updated_at';
type SortDir = 'asc' | 'desc';

export default function InventoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const { askConfirm, showToast } = useToastAndConfirm();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('updated_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterSede, setFilterSede] = useState<string>('all');
  const [sedes, setSedes] = useState<Sede[]>([]);

  // Categories from loaded items
  const [categories, setCategories] = useState<string[]>([]);

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    setProfile(prof);

    if (prof?.role === 'admin') {
      const { data: areasData } = await supabase.from('areas').select('*');
      setAreas(areasData || []);
      const { data: sedesData } = await supabase.from('sedes').select('*');
      setSedes(sedesData || []);
    }

    return prof;
  }, [supabase]);

  const loadData = useCallback(async (prof?: Profile | null) => {
    const p = prof ?? profile;
    if (!p) return;

    // Use !inner join when searching or filtering category to prevent null product relations
    const needsInner = !!search.trim() || filterCategory !== 'all';
    const productJoin = needsInner ? 'product:products!inner(*)' : 'product:products(*)';

    let query = supabase
      .from('inventory_items')
      .select(`*, ${productJoin}, area:areas(*)`, { count: 'exact' });

    // Area filter
    if (p.role !== 'admin') {
      query = query.eq('area_id', p.area_id!);
    } else if (filterArea !== 'all') {
      query = query.eq('area_id', filterArea);
    }

    // Sede filter
    if (filterSede !== 'all') {
      query = query.eq('sede_id', filterSede);
    }

    // Category filter (on products table)
    if (filterCategory !== 'all') {
      query = query.eq('product.category', filterCategory);
    }


    if (search.trim()) query = query.ilike('product.name', `%${search.trim()}%`);
    if (dateFrom) query = query.gte('updated_at', new Date(dateFrom).toISOString());
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      query = query.lt('updated_at', to.toISOString());
    }

    // Sort
    if (sortField === 'name') {
      query = query.order('name', { referencedTable: 'products', ascending: sortDir === 'asc' });
    } else if (sortField === 'quantity') {
      query = query.order('quantity', { ascending: sortDir === 'asc' });
    } else {
      query = query.order('updated_at', { ascending: sortDir === 'asc' });
    }

    const from = page * PAGE_SIZE;
    query = query.range(from, from + PAGE_SIZE - 1);

    const { data, count } = await query;
    const itemsList = (data as InventoryItem[]) || [];
    setItems(itemsList);
    setTotalCount(count || 0);

    // Extract categories
    const cats = new Set<string>();
    itemsList.forEach(i => { if (i.product?.category) cats.add(i.product.category); });
    setCategories(Array.from(cats).sort());

    setLoading(false);
  }, [supabase, profile, search, sortField, sortDir, page, filterArea, filterSede, filterCategory, dateFrom, dateTo]);

  useEffect(() => {
    const init = async () => {
      const prof = await loadProfile();
      if (prof) await loadData(prof);
    };
    init();
  }, []);

  useEffect(() => {
    if (profile) loadData();
  }, [search, sortField, sortDir, page, filterArea, filterSede, filterCategory, dateFrom, dateTo]);

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('inventory-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase, loadData]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(0);
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  const startEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditQty(String(item.quantity));
    setEditNotes('');
    setEditError('');
    setTransferItem(null);
  };

  const saveEdit = async (item: InventoryItem) => {
    if (!editNotes.trim()) {
      setEditError('Debes indicar el motivo del ajuste');
      return;
    }
    setEditError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const newQty = parseFloat(editQty);
    if (isNaN(newQty) || newQty < 0) return;

    await supabase.from('inventory_items').update({
      quantity: newQty, updated_at: new Date().toISOString(), updated_by: user.id,
    }).eq('id', item.id);

    await supabase.from('inventory_updates').insert({
      inventory_item_id: item.id, previous_qty: item.quantity, new_qty: newQty,
      updated_by: user.id, notes: editNotes.trim(),
    });

    setEditingId(null);
    loadData();
  };

  // ── Transfer ──
  const [transferItem, setTransferItem] = useState<InventoryItem | null>(null);
  const [transferQty, setTransferQty] = useState('');
  const [transferSede, setTransferSede] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [transferError, setTransferError] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const openTransfer = (item: InventoryItem) => {
    setTransferItem(item);
    setTransferQty('');
    setTransferSede('');
    setTransferNotes('');
    setTransferError('');
    setEditingId(null);
  };

  const handleTransfer = async () => {
    if (!transferItem) return;
    if (!transferSede) { setTransferError('Selecciona la sede destino'); return; }
    const qty = parseFloat(transferQty);
    if (isNaN(qty) || qty <= 0) { setTransferError('Cantidad inválida'); return; }
    if (qty > transferItem.quantity) { setTransferError('Cantidad insuficiente en stock'); return; }
    if (!transferNotes.trim()) { setTransferError('Debes indicar el motivo de la transferencia'); return; }

    setTransferLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTransferLoading(false); return; }

    try {
      const now = new Date().toISOString();
      const destSedeName = sedes.find(s => s.id === transferSede)?.name || 'otra sede';
      const sourceSedeName = sedes.find(s => s.id === transferItem.sede_id)?.name || 'sede origen';

      // 1. Reduce source quantity
      const newSourceQty = transferItem.quantity - qty;
      const { error: srcErr } = await supabase.from('inventory_items').update({
        quantity: newSourceQty, updated_at: now, updated_by: user.id,
      }).eq('id', transferItem.id);

      if (srcErr) { setTransferError(srcErr.message); setTransferLoading(false); return; }

      // Log source reduction
      await supabase.from('inventory_updates').insert({
        inventory_item_id: transferItem.id,
        previous_qty: transferItem.quantity,
        new_qty: newSourceQty,
        updated_by: user.id,
        notes: `Transferencia a ${destSedeName}: -${qty} ${transferItem.product?.unit || ''} — ${transferNotes.trim()}`,
      });

      // 2. Find or create destination inventory_item
      const { data: existingDest } = await supabase
        .from('inventory_items')
        .select('id, quantity')
        .eq('product_id', transferItem.product_id)
        .eq('area_id', transferItem.area_id)
        .eq('sede_id', transferSede)
        .maybeSingle();

      if (existingDest) {
        // Add to existing
        const newDestQty = existingDest.quantity + qty;
        await supabase.from('inventory_items').update({
          quantity: newDestQty, updated_at: now, updated_by: user.id,
        }).eq('id', existingDest.id);

        await supabase.from('inventory_updates').insert({
          inventory_item_id: existingDest.id,
          previous_qty: existingDest.quantity,
          new_qty: newDestQty,
          updated_by: user.id,
          notes: `Transferencia desde ${sourceSedeName}: +${qty} ${transferItem.product?.unit || ''} — ${transferNotes.trim()}`,
        });
      } else {
        // Create new inventory_item at destination
        const { data: newItem, error: newErr } = await supabase
          .from('inventory_items')
          .insert({
            product_id: transferItem.product_id,
            area_id: transferItem.area_id,
            sede_id: transferSede,
            quantity: qty,
            updated_by: user.id,
          })
          .select('id')
          .single();

        if (newErr) { setTransferError(newErr.message); setTransferLoading(false); return; }

        await supabase.from('inventory_updates').insert({
          inventory_item_id: newItem.id,
          previous_qty: 0,
          new_qty: qty,
          updated_by: user.id,
          notes: `Transferencia desde ${sourceSedeName}: +${qty} ${transferItem.product?.unit || ''} — ${transferNotes.trim()}`,
        });
      }

      setTransferItem(null);
      setTransferLoading(false);
      loadData();
    } catch (err: any) {
      setTransferError(err.message || 'Error inesperado');
      setTransferLoading(false);
    }
  };

  const deleteItem = async (itemId: string, productId: string) => {
    const isConfirmed = await askConfirm('¿Eliminar este producto del inventario?');
    if (!isConfirmed) return;
    await supabase.from('inventory_items').delete().eq('id', itemId);
    await supabase.from('products').delete().eq('id', productId);
    showToast('Producto eliminado', 'success');
    loadData();
  };

  // Items already filtered server-side
  const displayItems = items;

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="max-w-6xl mx-auto p-4">
          <p className="text-[var(--text-muted)]">Cargando...</p>
        </div>
      </>
    );
  }

  const areaName = profile?.role === 'admin'
    ? (filterArea === 'all' ? 'Todas las áreas' : areas.find(a => a.id === filterArea)?.name || 'Área')
    : items[0]?.area?.name || 'Tu área';

  return (
    <>
      <Navbar />
      <div className="max-w-6xl mx-auto p-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 stagger-1">
          <div>
            <h1 className="text-xl font-semibold">Inventario</h1>
            <p className="text-[var(--text-muted)] text-xs mt-0.5">{areaName}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/inventory/count" className="btn-accent flex items-center gap-1.5 text-xs py-2 px-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Conteo físico
            </Link>
            <Link href="/inventory/import" className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Importar
            </Link>
            <Link href="/inventory/add" className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Nuevo producto
            </Link>
          </div>
        </div>

        {/* Filters — compact row */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="input-field pl-8 w-52 text-xs"
              placeholder="Buscar producto..."
            />
          </div>

          {/* Area */}
          {profile?.role === 'admin' && (
            <select
              value={filterArea}
              onChange={(e) => { setFilterArea(e.target.value); setPage(0); }}
              className="input-field w-auto text-xs"
            >
              <option value="all">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}

          {/* Sede */}
          {profile?.role === 'admin' && sedes.length > 0 && (
            <select
              value={filterSede}
              onChange={(e) => { setFilterSede(e.target.value); setPage(0); }}
              className="input-field w-auto text-xs"
            >
              <option value="all">Todas las sedes</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          {/* Category */}
          {categories.length > 0 && (
            <select
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
              className="input-field w-auto text-xs"
            >
              <option value="all">Categoría</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}


          {/* Date range */}
          <div className="flex items-center gap-1.5 ml-auto">
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
              className="input-field w-auto text-xs" title="Desde" />
            <span className="text-[var(--text-subtle)] text-xs">—</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
              className="input-field w-auto text-xs" title="Hasta" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
                className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded transition-colors" title="Limpiar fechas">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-end mb-2">
          <span className="text-xs text-[var(--text-subtle)]">{totalCount} producto{totalCount !== 1 ? 's' : ''}</span>
        </div>

        {displayItems.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)]">
              {search || filterArea !== 'all' || dateFrom || dateTo || filterCategory !== 'all'
                ? 'No hay resultados para estos filtros.'
                : 'No hay productos en el inventario.'}
            </p>
            {!search && filterArea === 'all' && (
              <Link href="/inventory/add" className="btn-primary inline-block mt-4">
                Agregar primer producto
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* ── MOBILE CARDS (sm and below) ── */}
            <div className="sm:hidden space-y-2">
              {displayItems.map((item) => (
                <div key={item.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{item.product?.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {profile?.role === 'admin' && item.area?.name && (
                          <span className="text-xs bg-[var(--bg-input)] px-1.5 py-0.5 rounded">{item.area.name}</span>
                        )}
                        {item.product?.category && (
                          <span className="text-xs text-[var(--text-muted)]">{item.product.category}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      {profile?.role === 'admin' ? (
                        editingId === item.id ? (
                          <input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                            className="input-field w-20 text-sm text-center" min="0" step="0.1" />
                        ) : (
                          <p className={`text-lg font-bold ${item.quantity <= 5 ? 'text-[var(--danger)]' : ''}`}>
                            {item.quantity} <span className="text-xs font-normal text-[var(--text-muted)]">{item.product?.unit}</span>
                          </p>
                        )
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">{item.product?.unit}</p>
                      )}
                    </div>
                  </div>

                  {editingId === item.id && profile?.role === 'admin' && (
                    <div className="mb-2">
                      <input type="text" value={editNotes} onChange={(e) => { setEditNotes(e.target.value); setEditError(''); }}
                        className={`input-field text-xs w-full ${editError ? 'border-red-400' : ''}`} placeholder="Motivo del ajuste *" />
                      {editError && <p className="text-xs text-red-400 mt-1">{editError}</p>}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-[var(--text-muted)]">
                      {new Date(item.updated_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <div className="flex gap-1.5">
                      {profile?.role === 'admin' && editingId === item.id ? (
                        <>
                          <button onClick={() => saveEdit(item)} className="btn-primary text-xs py-1 px-2">Guardar</button>
                          <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1 px-2">Cancelar</button>
                        </>
                      ) : profile?.role === 'admin' ? (
                        <>
                          <button onClick={() => startEdit(item)} className="p-1.5 rounded-md border border-[var(--border)] text-[var(--text-muted)]" title="Ajustar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="6" x2="16" y2="6"/></svg>
                          </button>
                          <button onClick={() => deleteItem(item.id, item.product_id)} className="p-1.5 rounded-md border border-red-400/20 text-red-400" title="Eliminar">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── DESKTOP TABLE (md+) ── */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-sm text-[var(--text-muted)]">
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                      Producto {sortIcon('name')}
                    </th>
                    {profile?.role === 'admin' && <th className="py-3 px-4">Área</th>}
                    <th className="py-3 px-4">Categoría</th>
                    {profile?.role === 'admin' && (
                      <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('quantity')}>
                        Cantidad {sortIcon('quantity')}
                      </th>
                    )}
                    <th className="py-3 px-4">Unidad</th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('updated_at')}>
                      Actualización {sortIcon('updated_at')}
                    </th>
                    <th className="py-3 px-4">Notas</th>
                    {profile?.role === 'admin' && <th className="py-3 px-4">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-input)]/30">
                      <td className="py-3 px-4 font-medium">{item.product?.name}</td>
                      {profile?.role === 'admin' && (
                        <td className="py-3 px-4">
                          <span className="text-xs bg-[var(--bg-input)] px-2 py-1 rounded">{item.area?.name}</span>
                        </td>
                      )}
                      <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                        {item.product?.category || '—'}
                      </td>
                      {profile?.role === 'admin' && (
                        <td className="py-3 px-4">
                          {editingId === item.id ? (
                            <input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)}
                              className="input-field w-24" min="0" step="0.1" />
                          ) : (
                            <span className={item.quantity <= 5 ? 'text-[var(--danger)] font-bold' : ''}>
                              {item.quantity}
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-[var(--text-muted)]">{item.product?.unit}</td>
                      <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                        {new Date(item.updated_at).toLocaleDateString('es-CO', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                        {editingId === item.id ? (
                          <div>
                            <input type="text" value={editNotes} onChange={(e) => { setEditNotes(e.target.value); setEditError(''); }}
                              className={`input-field ${editError ? 'border-red-400' : ''}`} placeholder="Motivo del ajuste (obligatorio)" />
                            {editError && <p className="text-xs text-red-400 mt-1">{editError}</p>}
                          </div>
                        ) : (item.product?.notes || '—')}
                      </td>
                      {profile?.role === 'admin' && (
                        <td className="py-3 px-4">
                          <div className="flex gap-2">
                            {editingId === item.id ? (
                              <>
                                <button onClick={() => saveEdit(item)} className="btn-primary text-xs py-1 px-2">Guardar</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1 px-2">Cancelar</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(item)} title="Ajustar cantidad" className="p-1.5 rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-colors">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="6" x2="16" y2="6"/></svg>
                                </button>
                                {sedes.length > 1 && (
                                  <button onClick={() => openTransfer(item)} title="Transferir a otra sede" className="p-1.5 rounded-md border border-blue-400/20 text-blue-400 hover:bg-blue-500/10 transition-colors">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="14" y2="10"/><polyline points="9 21 3 21 3 15"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                                  </button>
                                )}
                                <Link href={`/inventory/${item.id}/edit`} title="Editar producto" className="p-1.5 rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border-hover)] transition-colors">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </Link>
                                <button onClick={() => deleteItem(item.id, item.product_id)} title="Eliminar" className="p-1.5 rounded-md border border-red-400/20 text-red-400 hover:bg-red-500/10 transition-colors">
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                  className="btn-secondary text-sm disabled:opacity-30">← Anterior</button>
                <span className="text-sm text-[var(--text-muted)]">Página {page + 1} de {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                  className="btn-secondary text-sm disabled:opacity-30">Siguiente →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── TRANSFER MODAL ─── */}
      {transferItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setTransferItem(null)} />
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
              <h2 className="text-lg font-semibold">Transferir inventario</h2>
              <button onClick={() => setTransferItem(null)} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="bg-[var(--bg-input)] p-3 rounded-lg text-sm">
                <p className="font-medium">{transferItem.product?.name}</p>
                <p className="text-[var(--text-muted)] text-xs mt-1">
                  Stock actual: {transferItem.quantity} {transferItem.product?.unit}
                  {transferItem.sede && ` — ${transferItem.sede.name}`}
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Sede destino</label>
                <select value={transferSede} onChange={e => setTransferSede(e.target.value)} className="input-field" required>
                  <option value="">Seleccionar sede...</option>
                  {sedes.filter(s => s.id !== transferItem.sede_id).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Cantidad a transferir</label>
                <input type="number" value={transferQty} onChange={e => setTransferQty(e.target.value)}
                  className="input-field" min="0.1" max={transferItem.quantity} step="0.1" placeholder="0" required />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Motivo de la transferencia *</label>
                <input type="text" value={transferNotes} onChange={e => { setTransferNotes(e.target.value); setTransferError(''); }}
                  className={`input-field ${transferError ? 'border-red-400' : ''}`} placeholder="Ej: Reabastecimiento sede norte" required />
              </div>

              {transferError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/15 px-4 py-3 rounded-lg">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {transferError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={handleTransfer} disabled={transferLoading}
                  className="btn-primary flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
                  {transferLoading ? 'Transfiriendo...' : 'Transferir'}
                </button>
                <button onClick={() => setTransferItem(null)} className="btn-secondary py-2.5 text-sm px-6">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
