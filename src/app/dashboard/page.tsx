'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { Profile, InventoryItem, Area } from '@/lib/types';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';

const PAGE_SIZE = 20;
type SortField = 'name' | 'quantity' | 'updated_at' | 'area';
type SortDir = 'asc' | 'desc';

interface RecentUpdate {
  id: string;
  previous_qty: number;
  new_qty: number;
  updated_at: string;
  notes: string | null;
  updater: { full_name: string } | null;
  inventory_item: {
    product: { name: string } | null;
    area: { name: string } | null;
  } | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [filterArea, setFilterArea] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('area');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);


  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (prof?.role !== 'admin') { router.push('/inventory'); return; }
    setProfile(prof);

    const { data: areasData } = await supabase.from('areas').select('*');
    setAreas(areasData || []);

    const { data: itemsData } = await supabase
      .from('inventory_items')
      .select('*, product:products(*), area:areas(*)')
      .order('area_id')
      .order('updated_at', { ascending: false });
    setAllItems((itemsData as InventoryItem[]) || []);

    // Load recent activity — flat query, then enrich
    const { data: rawUpdates } = await supabase
      .from('inventory_updates')
      .select('id, previous_qty, new_qty, updated_at, notes, updated_by, inventory_item_id')
      .order('updated_at', { ascending: false })
      .limit(10);

    if (rawUpdates?.length) {
      const uIds = [...new Set(rawUpdates.map((r: any) => r.updated_by).filter(Boolean))];
      const iIds = [...new Set(rawUpdates.map((r: any) => r.inventory_item_id).filter(Boolean))];
      const [pRes, iiRes] = await Promise.all([
        uIds.length ? supabase.from('profiles').select('id, full_name').in('id', uIds) : { data: [] },
        iIds.length ? supabase.from('inventory_items').select('id, product_id, area_id').in('id', iIds) : { data: [] },
      ]);
      const pMap = new Map((pRes.data || []).map((p: any) => [p.id, p]));
      const iiMap = new Map((iiRes.data || []).map((i: any) => [i.id, i]));
      const prIds = [...new Set((iiRes.data || []).map((i: any) => i.product_id).filter(Boolean))];
      const aIds = [...new Set((iiRes.data || []).map((i: any) => i.area_id).filter(Boolean))];
      const [prRes, aRes] = await Promise.all([
        prIds.length ? supabase.from('products').select('id, name').in('id', prIds) : { data: [] },
        aIds.length ? supabase.from('areas').select('id, name').in('id', aIds) : { data: [] },
      ]);
      const prMap = new Map((prRes.data || []).map((p: any) => [p.id, p]));
      const aMap = new Map((aRes.data || []).map((a: any) => [a.id, a]));

      setRecentUpdates(rawUpdates.map((r: any) => {
        const ii: any = iiMap.get(r.inventory_item_id);
        const updater: any = pMap.get(r.updated_by);
        const prod: any = ii ? prMap.get(ii.product_id) : null;
        const area: any = ii ? aMap.get(ii.area_id) : null;
        return {
          id: r.id, previous_qty: r.previous_qty, new_qty: r.new_qty, updated_at: r.updated_at, notes: r.notes,
          updater: updater ? { full_name: updater.full_name } : null,
          inventory_item: {
            product: prod ? { name: prod.name } : null,
            area: area ? { name: area.name } : null,
          },
        };
      }));
    } else {
      setRecentUpdates([]);
    }

    setLoading(false);
  }, [supabase, router]);

  useEffect(() => { loadData(); }, []);

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_updates' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase, loadData]);

  const exportExcel = async () => {
    try {
      const res = await fetch('/api/export');
      if (!res.ok) { alert('Error al exportar'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inventario_LaComitiva_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Error al exportar el archivo');
    }
  };

  // Filters
  let filtered = allItems;
  if (filterArea !== 'all') filtered = filtered.filter(i => i.area_id === filterArea);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i => i.product?.name?.toLowerCase().includes(q));
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') cmp = (a.product?.name || '').localeCompare(b.product?.name || '');
    else if (sortField === 'quantity') cmp = a.quantity - b.quantity;
    else if (sortField === 'updated_at') cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
    else if (sortField === 'area') cmp = (a.area?.name || '').localeCompare(b.area?.name || '');
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalProducts = allItems.length;
  const lowStockCount = allItems.filter(i => i.quantity <= 5).length;
  const lowStockPct = totalProducts > 0 ? Math.round((lowStockCount / totalProducts) * 100) : 0;

  // Chart data
  const areaStockMap: Record<string, { name: string; total: number; low: number }> = {};
  allItems.forEach(item => {
    const aName = item.area?.name || 'Sin área';
    if (!areaStockMap[aName]) areaStockMap[aName] = { name: aName, total: 0, low: 0 };
    areaStockMap[aName].total += 1;
    if (item.quantity <= 5) areaStockMap[aName].low += 1;
  });
  const chartData = Object.values(areaStockMap);
  const maxTotal = Math.max(...chartData.map(d => d.total), 1);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
    setPage(0);
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDir === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (<><Navbar /><div className="max-w-6xl mx-auto p-4"><p className="text-[var(--text-muted)]">Cargando...</p></div></>);
  }

  return (
    <>
      <Navbar />
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Administrativo</h1>
            <p className="text-[var(--text-muted)] text-sm">Vista unificada del inventario</p>
          </div>
          <button onClick={exportExcel} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar Excel
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-3xl font-bold">{totalProducts}</p>
            <p className="text-sm text-[var(--text-muted)]">Productos totales</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-[var(--danger)]">{lowStockCount}</p>
            <p className="text-sm text-[var(--text-muted)]">Stock bajo (≤5)</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold" style={{ color: lowStockPct > 30 ? 'var(--danger)' : 'var(--success)' }}>
              {lowStockPct}%
            </p>
            <p className="text-sm text-[var(--text-muted)]">% Stock bajo</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-[var(--primary)]">{areas.length}</p>
            <p className="text-sm text-[var(--text-muted)]">Áreas activas</p>
          </div>
        </div>

        {/* Chart + Activity Feed side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Bar Chart */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Productos por Área</h2>
            <div className="space-y-3">
              {chartData.map((d) => (
                <div key={d.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{d.name}</span>
                    <span className="text-[var(--text-muted)]">
                      {d.total} · <span className="text-[var(--danger)]">{d.low} bajo</span>
                    </span>
                  </div>
                  <div className="w-full bg-[var(--bg)] rounded-full h-6 overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(d.total / maxTotal) * 100}%`,
                        background: `linear-gradient(90deg, var(--primary) ${((d.total - d.low) / d.total) * 100}%, var(--danger) 100%)`,
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">{d.total}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Actividad Reciente</h2>
            {recentUpdates.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm">Sin actividad reciente.</p>
            ) : (
              <div className="space-y-3">
                {recentUpdates.map((u) => {
                  const diff = u.new_qty - u.previous_qty;
                  const isPositive = diff >= 0;
                  return (
                    <div key={u.id} className="flex items-start gap-3 text-sm">
                      <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${isPositive ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`} />
                      <div className="flex-1 min-w-0">
                        <p>
                          <span className="font-medium">{u.updater?.full_name || 'Alguien'}</span>
                          {' '}cambió{' '}
                          <span className="font-medium">{u.inventory_item?.product?.name || '?'}</span>
                          {' '}
                          <span className={isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>
                            {u.previous_qty} → {u.new_qty}
                          </span>
                        </p>
                        <p className="text-[var(--text-muted)] text-xs">
                          {u.inventory_item?.area?.name} · {timeAgo(u.updated_at)}
                          {u.notes && ` · ${u.notes}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="input-field pl-8 w-52 text-xs" placeholder="Buscar producto..." />
          </div>
          <select value={filterArea} onChange={(e) => { setFilterArea(e.target.value); setPage(0); }}
            className="input-field w-auto text-xs">
            <option value="all">Todas las áreas</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-sm text-[var(--text-muted)]">
                <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  Producto {sortIcon('name')}
                </th>
                <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('area')}>
                  Área {sortIcon('area')}
                </th>
                <th className="py-3 px-4">Categoría</th>
                <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('quantity')}>
                  Cantidad {sortIcon('quantity')}
                </th>
                <th className="py-3 px-4">Unidad</th>
                <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('updated_at')}>
                  Actualización {sortIcon('updated_at')}
                </th>
                <th className="py-3 px-4">Notas</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((item) => (
                <tr key={item.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-input)]/30">
                  <td className="py-3 px-4 font-medium">{item.product?.name}</td>
                  <td className="py-3 px-4">
                    <span className="text-xs bg-[var(--bg-input)] px-2 py-1 rounded">{item.area?.name}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-muted)]">{item.product?.category || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={item.quantity <= 5 ? 'text-[var(--danger)] font-bold' : ''}>
                      {item.quantity}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-muted)]">{item.product?.unit}</td>
                  <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                    {new Date(item.updated_at).toLocaleDateString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3 px-4 text-sm text-[var(--text-muted)]">{item.product?.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paged.length === 0 && (
          <div className="card text-center py-8 mt-4">
            <p className="text-[var(--text-muted)]">No hay productos para este filtro.</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="btn-secondary text-sm disabled:opacity-30">← Anterior</button>
            <span className="text-sm text-[var(--text-muted)]">Página {page + 1} de {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="btn-secondary text-sm disabled:opacity-30">Siguiente →</button>
          </div>
        )}
      </div>
    </>
  );
}
