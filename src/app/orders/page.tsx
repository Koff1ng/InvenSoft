'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Profile, Area } from '@/lib/types';
import Navbar from '@/components/Navbar';

interface Sede { id: string; name: string; }

interface OrderItem {
  product_name: string;
  quantity: string;
  unit: string;
  notes: string;
}

interface OrderBlock {
  category: string;
  items: OrderItem[];
}

interface Order {
  id: string;
  area_id: string;
  sede_id: string | null;
  status: string;
  category: string | null;
  notes: string | null;
  created_at: string;
  area: { name: string };
  sede: { name: string } | null;
  creator: { full_name: string };
  item_count: number;
  items?: { product_name: string; quantity: number; unit: string; notes: string | null; category?: string }[];
}

const UNITS = ['unidades', 'kg', 'lb', 'litros', 'paquetes', 'cajas', 'botellas', 'gramos', 'onzas'];
const DEFAULT_CATEGORIES = ['Abarrotes', 'Fruver', 'Cárnicos', 'Lácteos', 'Bebidas', 'Limpieza', 'Desechables'];

function emptyItem(): OrderItem {
  return { product_name: '', quantity: '', unit: 'unidades', notes: '' };
}

export default function OrdersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [orderArea, setOrderArea] = useState('');
  const [orderSede, setOrderSede] = useState('');
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [blocks, setBlocks] = useState<OrderBlock[]>([
    { category: '', items: [emptyItem()] },
  ]);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Detail view
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const lastItemRef = useRef<HTMLInputElement>(null);

  const loadOrders = useCallback(async () => {
    const { data: rawOrders } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (!rawOrders?.length) { setOrders([]); return; }

    // Enrich with areas, sedes, profiles
    const areaIds = [...new Set(rawOrders.map((o: any) => o.area_id).filter(Boolean))];
    const sedeIds = [...new Set(rawOrders.map((o: any) => o.sede_id).filter(Boolean))];
    const creatorIds = [...new Set(rawOrders.map((o: any) => o.created_by).filter(Boolean))];

    const [areasRes, sedesRes, creatorsRes] = await Promise.all([
      areaIds.length ? supabase.from('areas').select('id, name').in('id', areaIds) : { data: [] },
      sedeIds.length ? supabase.from('sedes').select('id, name').in('id', sedeIds) : { data: [] },
      creatorIds.length ? supabase.from('profiles').select('id, full_name').in('id', creatorIds) : { data: [] },
    ]);

    const areaMap = new Map((areasRes.data || []).map((a: any) => [a.id, a]));
    const sedeMap = new Map((sedesRes.data || []).map((s: any) => [s.id, s]));
    const creatorMap = new Map((creatorsRes.data || []).map((p: any) => [p.id, p]));

    setOrders(rawOrders.map((o: any) => {
      const area: any = areaMap.get(o.area_id);
      const sede: any = sedeMap.get(o.sede_id);
      const creator: any = creatorMap.get(o.created_by);
      return {
        ...o,
        area: area ? { name: area.name } : null,
        sede: sede ? { name: sede.name } : null,
        creator: creator ? { full_name: creator.full_name } : null,
        item_count: Array.isArray(o.items) ? o.items.length : 0,
      };
    }));
  }, [supabase]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);

      const { data: areasData } = await supabase.from('areas').select('*');
      setAreas(areasData || []);
      const { data: sedesData } = await supabase.from('sedes').select('*');
      setSedes(sedesData || []);

      if (prof?.area_id) setOrderArea(prof.area_id);

      await loadOrders();
      setLoading(false);
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredOrders = profile?.role === 'admin'
    ? orders
    : orders.filter(o => o.area_id === profile?.area_id);

  // ── Block helpers ──
  const addBlock = () => {
    setBlocks([...blocks, { category: '', items: [emptyItem()] }]);
  };

  const removeBlock = (bIdx: number) => {
    if (blocks.length <= 1) return;
    setBlocks(blocks.filter((_, i) => i !== bIdx));
  };

  const updateBlockCategory = (bIdx: number, cat: string) => {
    const copy = [...blocks];
    copy[bIdx] = { ...copy[bIdx], category: cat };
    setBlocks(copy);
  };

  const addItemToBlock = (bIdx: number) => {
    const copy = [...blocks];
    copy[bIdx] = { ...copy[bIdx], items: [...copy[bIdx].items, emptyItem()] };
    setBlocks(copy);
    setTimeout(() => lastItemRef.current?.focus(), 50);
  };

  const removeItemFromBlock = (bIdx: number, iIdx: number) => {
    const copy = [...blocks];
    if (copy[bIdx].items.length <= 1) return;
    copy[bIdx] = { ...copy[bIdx], items: copy[bIdx].items.filter((_, i) => i !== iIdx) };
    setBlocks(copy);
  };

  const updateItemInBlock = (bIdx: number, iIdx: number, field: keyof OrderItem, value: string) => {
    const copy = [...blocks];
    const items = [...copy[bIdx].items];
    items[iIdx] = { ...items[iIdx], [field]: value };
    copy[bIdx] = { ...copy[bIdx], items };
    setBlocks(copy);
  };

  // ── Reset form ──
  const resetForm = () => {
    setShowCreate(false);
    setBlocks([{ category: '', items: [emptyItem()] }]);
    setOrderNotes('');
    setOrderArea(profile?.area_id || '');
    setOrderSede('');
    setFormError('');
  };

  // ── Create order ──
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !profile) return;

    const areaId = orderArea || profile.area_id;
    if (!areaId) { setFormError('Selecciona un área'); setFormLoading(false); return; }

    // Flatten blocks into items with category
    const allItems: { product_name: string; quantity: number; unit: string; notes: string | null; category: string }[] = [];
    for (const block of blocks) {
      const cat = block.category.trim() || 'General';
      for (const item of block.items) {
        if (!item.product_name.trim()) continue;
        allItems.push({
          product_name: item.product_name.trim(),
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit,
          notes: item.notes.trim() || null,
          category: cat,
        });
      }
    }

    if (allItems.length === 0) { setFormError('Agrega al menos un producto'); setFormLoading(false); return; }

    // Get unique categories for the order-level label
    const cats = [...new Set(allItems.map(i => i.category))];
    const categoryLabel = cats.join(', ');

    const { error } = await supabase.from('orders').insert({
      area_id: areaId,
      sede_id: orderSede || null,
      created_by: user.id,
      category: categoryLabel,
      notes: orderNotes || null,
      items: allItems,
    });

    if (error) { setFormError(error.message); setFormLoading(false); return; }

    resetForm();
    setFormLoading(false);
    loadOrders();
  };

  // ── Send order ──
  const sendOrder = async (id: string) => {
    await supabase.from('orders').update({ status: 'enviado' }).eq('id', id);
    loadOrders();
    if (detailOrder?.id === id) setDetailOrder({ ...detailOrder, status: 'enviado' });
  };

  // ── Delete order ──
  const deleteOrder = async (id: string) => {
    if (!confirm('¿Eliminar este pedido?')) return;
    await supabase.from('orders').delete().eq('id', id);
    loadOrders();
    if (detailOrder?.id === id) setDetailOrder(null);
  };

  // ── View detail ──
  const viewOrder = async (id: string) => {
    const { data } = await supabase.from('orders').select('*').eq('id', id).single();
    setDetailOrder(data as Order);
  };

  // ── Export ──
  const exportOrder = async (id: string) => {
    try {
      const res = await fetch(`/api/export-order?id=${id}`);
      if (!res.ok) { alert('Error al exportar'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pedido_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { alert('Error al exportar'); }
  };

  // Group items by category for detail view
  const groupItemsByCategory = (items: Order['items']) => {
    if (!items) return {};
    const groups: Record<string, typeof items> = {};
    for (const item of items) {
      const cat = item.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    return groups;
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="max-w-5xl mx-auto p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[var(--bg-input)] rounded w-48" />
            <div className="h-16 bg-[var(--bg-input)] rounded" />
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              Pedidos
            </h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Nuevo pedido
          </button>
        </div>

        {/* Orders list */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 text-[var(--text-muted)]">
            <p className="text-lg mb-2">Sin pedidos todavía</p>
            <p className="text-sm">Crea un pedido para empezar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(o => (
              <div key={o.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0">
                    {o.status === 'enviado'
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {o.category ? `${o.category}` : 'Pedido'} — {o.area?.name || '—'}
                      {o.sede && <span className="text-xs text-[var(--text-muted)] ml-1">({o.sede.name})</span>}
                      <span className="ml-2 text-xs text-[var(--text-muted)]">({Array.isArray(o.items) ? o.items.length : 0} productos)</span>
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {o.creator?.full_name || '—'} · {new Date(o.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pl-11 sm:pl-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${o.status === 'enviado' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    {o.status === 'enviado' ? 'Enviado' : 'Borrador'}
                  </span>

                  <button onClick={() => viewOrder(o.id)} className="p-1.5 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Ver detalle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>

                  <button onClick={() => exportOrder(o.id)} className="p-1.5 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Exportar Excel">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>

                  {o.status === 'borrador' && (
                    <>
                      <button onClick={() => sendOrder(o.id)} className="p-1.5 rounded-md hover:bg-green-500/10 text-[var(--text-muted)] hover:text-green-400" title="Marcar como enviado">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button onClick={() => deleteOrder(o.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400" title="Eliminar">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── CREATE FORM ─── */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 overflow-y-auto">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={resetForm} />
            <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-2xl mx-4 mb-8 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <h2 className="text-lg font-semibold">Nuevo pedido</h2>
                <button onClick={resetForm} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <form onSubmit={handleCreate} className="p-6 space-y-5">
                {/* Area */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Área</label>
                  <select value={orderArea} onChange={e => setOrderArea(e.target.value)} className="input-field text-sm" required>
                    <option value="">Seleccionar área...</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>

                {/* Sede */}
                {sedes.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Sede</label>
                    <select value={orderSede} onChange={e => setOrderSede(e.target.value)} className="input-field text-sm">
                      <option value="">Sin sede</option>
                      {sedes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {/* ── BLOCKS ── */}
                <div className="space-y-4">
                  {blocks.map((block, bIdx) => (
                    <div key={bIdx} className="border border-[var(--border)] rounded-xl overflow-hidden">
                      {/* Block header */}
                      <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg)] border-b border-[var(--border)]">
                        <select
                          value={block.category}
                          onChange={e => updateBlockCategory(bIdx, e.target.value)}
                          className="input-field text-sm flex-1 py-1.5"
                        >
                          <option value="">Seleccionar categoría...</option>
                          {DEFAULT_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__custom">— Escribir otra —</option>
                        </select>
                        {block.category === '__custom' && (
                          <input
                            type="text"
                            className="input-field text-sm flex-1 py-1.5"
                            placeholder="Categoría personalizada"
                            autoFocus
                            onChange={e => {
                              const copy = [...blocks];
                              copy[bIdx] = { ...copy[bIdx], category: e.target.value };
                              setBlocks(copy);
                            }}
                          />
                        )}
                        {blocks.length > 1 && (
                          <button type="button" onClick={() => removeBlock(bIdx)} className="p-1.5 rounded-md hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400" title="Eliminar bloque">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        )}
                      </div>

                      {/* Block items */}
                      <div className="p-3 space-y-2">
                        {block.items.map((item, iIdx) => (
                          <div key={iIdx} className="bg-[var(--bg)] rounded-lg p-3 border border-[var(--border)]">
                            <div className="grid grid-cols-[1fr_70px_90px_28px] gap-2 items-end">
                              <div>
                                {iIdx === 0 && <label className="block text-xs text-[var(--text-muted)] mb-1">Producto</label>}
                                <input
                                  ref={bIdx === blocks.length - 1 && iIdx === block.items.length - 1 ? lastItemRef : undefined}
                                  type="text"
                                  value={item.product_name}
                                  onChange={e => updateItemInBlock(bIdx, iIdx, 'product_name', e.target.value)}
                                  className="input-field text-sm"
                                  placeholder="Nombre"
                                />
                              </div>
                              <div>
                                {iIdx === 0 && <label className="block text-xs text-[var(--text-muted)] mb-1">Cant.</label>}
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.quantity}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d*\.?\d*$/.test(val)) updateItemInBlock(bIdx, iIdx, 'quantity', val);
                                  }}
                                  className="input-field text-sm text-center"
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                {iIdx === 0 && <label className="block text-xs text-[var(--text-muted)] mb-1">Unidad</label>}
                                <select value={item.unit} onChange={e => updateItemInBlock(bIdx, iIdx, 'unit', e.target.value)} className="input-field text-sm">
                                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItemFromBlock(bIdx, iIdx)}
                                className="p-1 rounded-md hover:bg-red-500/10 text-[var(--text-muted)] hover:text-red-400 self-end mb-1"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                            <input
                              type="text"
                              value={item.notes}
                              onChange={e => updateItemInBlock(bIdx, iIdx, 'notes', e.target.value)}
                              className="input-field text-xs mt-2"
                              placeholder="Notas (opcional)"
                            />
                          </div>
                        ))}

                        <button type="button" onClick={() => addItemToBlock(bIdx)} className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1 mt-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Agregar producto
                        </button>
                      </div>
                    </div>
                  ))}

                  <button type="button" onClick={addBlock} className="w-full py-2.5 border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] rounded-xl text-sm text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors flex items-center justify-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Agregar bloque de categoría
                  </button>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Notas generales (opcional)</label>
                  <textarea
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value)}
                    className="input-field text-sm"
                    rows={2}
                    placeholder="Notas para este pedido..."
                  />
                </div>

                {formError && (
                  <div className="flex items-center gap-2 text-sm text-red-400 bg-red-900/15 px-4 py-3 rounded-lg">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {formError}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" disabled={formLoading} className="btn-primary flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
                    {formLoading ? 'Creando...' : 'Crear pedido'}
                  </button>
                  <button type="button" onClick={resetForm} className="btn-secondary py-2.5 text-sm px-6">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── DETAIL MODAL ─── */}
        {detailOrder && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 overflow-y-auto">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDetailOrder(null)} />
            <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-lg mx-4 mb-8 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div>
                  <h2 className="text-lg font-semibold">
                    Pedido — {detailOrder.area?.name || '—'}
                  </h2>
                  <p className="text-xs text-[var(--text-muted)]">
                    {detailOrder.creator?.full_name || '—'} · {new Date(detailOrder.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${detailOrder.status === 'enviado' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                    {detailOrder.status === 'enviado' ? 'Enviado' : 'Borrador'}
                  </span>
                  <button onClick={() => setDetailOrder(null)} className="p-1 rounded-md hover:bg-[var(--bg-input)] text-[var(--text-muted)]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>

              {/* Items grouped by category */}
              <div className="p-6 space-y-4">
                {Object.entries(groupItemsByCategory(detailOrder.items)).map(([cat, items]) => (
                  <div key={cat}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[var(--primary)]/15 text-[var(--primary)] uppercase tracking-wider">
                        {cat}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{items!.length} productos</span>
                    </div>
                    <div className="space-y-1.5">
                      {items!.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{item.product_name}</p>
                            {item.notes && <p className="text-xs text-[var(--text-muted)]">{item.notes}</p>}
                          </div>
                          <div className="text-sm text-[var(--text-muted)] shrink-0 ml-4">
                            <span className="font-semibold text-[var(--text)]">{item.quantity}</span> {item.unit}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {detailOrder.notes && (
                  <div className="mt-4 text-sm text-[var(--text-muted)] bg-[var(--bg)] p-3 rounded-lg">
                    {detailOrder.notes}
                  </div>
                )}

                <div className="flex gap-3 mt-6">
                  <button onClick={() => exportOrder(detailOrder.id)} className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Exportar Excel
                  </button>
                  {detailOrder.status === 'borrador' && (
                    <button onClick={() => sendOrder(detailOrder.id)} className="btn-secondary py-2.5 text-sm px-6 flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Enviar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
