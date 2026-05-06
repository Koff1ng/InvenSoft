'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import type { InventoryItem } from '@/lib/types';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';
import { useToastAndConfirm } from '@/components/ui/ToastAndConfirm';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const PAGE_SIZE = 20;
type SortField = 'name' | 'quantity' | 'updated_at' | 'area';
type SortDir = 'asc' | 'desc';

interface ActivityItem {
  id: string;
  type: 'inventory_update' | 'order' | 'physical_count';
  timestamp: string;
  actor: string;
  title: string;
  detail: string;
  area: string;
  color: string;
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
  const { showToast } = useToastAndConfirm();
  const { profile, areas, loading: authLoading } = useAuth();
  const [allItems, setAllItems] = useState<InventoryItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [filterArea, setFilterArea] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('area');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

  // Stat counters
  const [orderCount, setOrderCount] = useState(0);
  const [pendingCounts, setPendingCounts] = useState(0);

  const loadData = useCallback(async () => {
    if (!profile) return;
    if (profile.role !== 'admin') { router.push('/inventory'); return; }

    const { data: itemsData } = await supabase
      .from('inventory_items')
      .select('*, product:products(*), area:areas(*)')
      .order('area_id')
      .order('updated_at', { ascending: false });
    setAllItems((itemsData as InventoryItem[]) || []);

    // ── Load unified activity feed ──
    const feedItems: ActivityItem[] = [];

    // 1. Inventory updates (last 15)
    const { data: rawUpdates } = await supabase
      .from('inventory_updates')
      .select('id, previous_qty, new_qty, updated_at, notes, updated_by, inventory_item_id')
      .order('updated_at', { ascending: false })
      .limit(15);

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

      rawUpdates.forEach((r: any) => {
        const ii: any = iiMap.get(r.inventory_item_id);
        const updater: any = pMap.get(r.updated_by);
        const prod: any = ii ? prMap.get(ii.product_id) : null;
        const area: any = ii ? aMap.get(ii.area_id) : null;
        const diff = r.new_qty - r.previous_qty;
        feedItems.push({
          id: `upd-${r.id}`,
          type: 'inventory_update',
          timestamp: r.updated_at,
          actor: updater?.full_name || 'Alguien',
          title: `${prod?.name || '?'}: ${r.previous_qty} → ${r.new_qty}`,
          detail: r.notes || '',
          area: area?.name || '',
          color: diff >= 0 ? 'var(--success)' : 'var(--danger)',
        });
      });
    }

    // 2. Orders (last 15)
    let ordersQuery = supabase
      .from('orders')
      .select('id, category, status, created_at, created_by, area_id, items')
      .order('created_at', { ascending: false });

    if (profile.role !== 'admin' && profile.area_id) {
      ordersQuery = ordersQuery.eq('area_id', profile.area_id);
    } else if (profile.role === 'admin') {
      ordersQuery = ordersQuery.neq('status', 'borrador');
    }

    const { data: rawOrders } = await ordersQuery.limit(15);

    if (rawOrders?.length) {
      const creatorIds = [...new Set(rawOrders.map((o: any) => o.created_by).filter(Boolean))];
      const oAreaIds = [...new Set(rawOrders.map((o: any) => o.area_id).filter(Boolean))];
      const [cRes, oaRes] = await Promise.all([
        creatorIds.length ? supabase.from('profiles').select('id, full_name').in('id', creatorIds) : { data: [] },
        oAreaIds.length ? supabase.from('areas').select('id, name').in('id', oAreaIds) : { data: [] },
      ]);
      const cMap = new Map((cRes.data || []).map((c: any) => [c.id, c]));
      const oaMap = new Map((oaRes.data || []).map((a: any) => [a.id, a]));

      rawOrders.forEach((o: any) => {
        const creator: any = cMap.get(o.created_by);
        const area: any = oaMap.get(o.area_id);
        const itemCount = Array.isArray(o.items) ? o.items.length : 0;
        const statusLabel = o.status === 'aprobado' ? '✅ Aprobado' : o.status === 'enviado' ? '✓ Enviado' : '⏳ Borrador';
        feedItems.push({
          id: `ord-${o.id}`,
          type: 'order',
          timestamp: o.created_at,
          actor: creator?.full_name || 'Alguien',
          title: `Pedido: ${o.category || 'General'} (${itemCount} productos)`,
          detail: statusLabel,
          area: area?.name || '',
          color: o.status === 'aprobado' ? '#3b82f6' : o.status === 'enviado' ? '#22c55e' : '#eab308',
        });
      });
      setOrderCount(rawOrders.length);
    }

    // 3. Physical counts (last 15)
    try {
      const { data: rawCounts } = await supabase
        .from('physical_counts')
        .select('id, status, created_at, submitted_by, area_id, items, notes')
        .order('created_at', { ascending: false })
        .limit(15);

      if (rawCounts?.length) {
        const subIds = [...new Set(rawCounts.map((c: any) => c.submitted_by).filter(Boolean))];
        const cAreaIds = [...new Set(rawCounts.map((c: any) => c.area_id).filter(Boolean))];
        const [sRes, caRes] = await Promise.all([
          subIds.length ? supabase.from('profiles').select('id, full_name').in('id', subIds) : { data: [] },
          cAreaIds.length ? supabase.from('areas').select('id, name').in('id', cAreaIds) : { data: [] },
        ]);
        const sMap = new Map((sRes.data || []).map((s: any) => [s.id, s]));
        const caMap = new Map((caRes.data || []).map((a: any) => [a.id, a]));

        rawCounts.forEach((c: any) => {
          const submitter: any = sMap.get(c.submitted_by);
          const area: any = caMap.get(c.area_id);
          const itemCount = Array.isArray(c.items) ? c.items.length : 0;
          const statusMap: Record<string, string> = { pendiente: '⏳ Pendiente', aprobado: '✓ Aprobado', rechazado: '✗ Rechazado' };
          const colorMap: Record<string, string> = { pendiente: '#eab308', aprobado: '#22c55e', rechazado: '#ef4444' };
          feedItems.push({
            id: `cnt-${c.id}`,
            type: 'physical_count',
            timestamp: c.created_at,
            actor: submitter?.full_name || 'Alguien',
            title: `Conteo físico (${itemCount} productos)`,
            detail: statusMap[c.status] || c.status,
            area: area?.name || '',
            color: colorMap[c.status] || '#eab308',
          });
        });
        setPendingCounts(rawCounts.filter((c: any) => c.status === 'pendiente').length);
      }
    } catch {
      // physical_counts table might not exist yet
    }

    // Sort all by timestamp desc, take top 20
    feedItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setActivity(feedItems.slice(0, 20));

    setLoading(false);
  }, [supabase, router]);

  useEffect(() => {
    if (!authLoading && profile) { loadData(); }
  }, [authLoading, profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => loadData())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'inventory_updates' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'physical_counts' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, supabase, loadData]);

  const [exporting, setExporting] = useState(false);
  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const queryParams = new URLSearchParams();
      if (filterArea !== 'all') queryParams.set('area', filterArea);
      if (filterCategory !== 'all') queryParams.set('category', filterCategory);
      if (search.trim()) queryParams.set('search', search.trim());

      const res = await fetch(`/api/export?${queryParams.toString()}`, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';

      if (!res.ok || !contentType.includes('spreadsheetml')) {
        let message = 'Error al exportar';
        if (contentType.includes('application/json')) {
          try {
            const data = await res.json();
            if (data?.error) message = data.error;
          } catch { /* ignore JSON parse errors */ }
        }
        showToast(message, res.status === 404 ? 'info' : 'error');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Inventario_LaComitiva_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Exportación lista', 'success');
    } catch {
      showToast('Error al exportar el archivo', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Filters
  let filtered = allItems;
  if (filterArea !== 'all') filtered = filtered.filter(i => i.area_id === filterArea);
  if (filterCategory !== 'all') filtered = filtered.filter(i => i.product?.category === filterCategory);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i => i.product?.name?.toLowerCase().includes(q));
  }

  // Categories
  const categories = Array.from(new Set(allItems.map(i => i.product?.category).filter(Boolean))) as string[];
  categories.sort();

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

  const typeIcon = (type: string) => {
    switch (type) {
      case 'inventory_update':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>;
      case 'order':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
      case 'physical_count':
        return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
      default: return null;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'inventory_update': return 'Ajuste';
      case 'order': return 'Pedido';
      case 'physical_count': return 'Conteo';
      default: return '';
    }
  };

  if (loading || authLoading) {
    return (
      <>
        <Navbar />
        <div className="max-w-6xl mx-auto p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="skeleton h-8 w-56 mb-1" />
              <div className="skeleton h-4 w-40" />
            </div>
            <div className="skeleton h-9 w-32 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="skeleton h-48 rounded-xl" />
            <div className="skeleton h-48 rounded-xl" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-6xl mx-auto p-4 animate-fade-in">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">Dashboard Administrativo</h1>
            <p className="text-[var(--text-muted)] text-sm">Vista unificada del inventario</p>
          </div>
          <button onClick={exportExcel} disabled={exporting} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3 disabled:opacity-60 disabled:cursor-not-allowed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {exporting ? 'Generando…' : 'Exportar Excel'}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <div className="card text-center py-4">
            <p className="text-2xl font-bold">{totalProducts}</p>
            <p className="text-xs text-[var(--text-muted)]">Productos</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-[var(--danger)]">{lowStockCount}</p>
            <p className="text-xs text-[var(--text-muted)]">Stock bajo</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold" style={{ color: lowStockPct > 30 ? 'var(--danger)' : 'var(--success)' }}>
              {lowStockPct}%
            </p>
            <p className="text-xs text-[var(--text-muted)]">% Bajo</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold text-[var(--primary)]">{areas.length}</p>
            <p className="text-xs text-[var(--text-muted)]">Áreas</p>
          </div>
          <div className="card text-center py-4">
            <p className="text-2xl font-bold" style={{ color: '#3b82f6' }}>{orderCount}</p>
            <p className="text-xs text-[var(--text-muted)]">Pedidos</p>
          </div>
          <Link href="/inventory/count" className="card text-center py-4 hover:border-[var(--primary)] transition-colors">
            <p className="text-2xl font-bold" style={{ color: pendingCounts > 0 ? '#eab308' : 'var(--success)' }}>
              {pendingCounts}
            </p>
            <p className="text-xs text-[var(--text-muted)]">Conteos pend.</p>
          </Link>
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

          {/* Unified Activity Feed */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Actividad Reciente</h2>
            {activity.length === 0 ? (
              <p className="text-[var(--text-muted)] text-sm">Sin actividad reciente.</p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 text-sm">
                    <div className="mt-0.5 shrink-0" style={{ color: a.color }}>
                      {typeIcon(a.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p>
                        <span className="font-medium">{a.actor}</span>{' '}
                        <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-input)] text-[var(--text-muted)]">{typeLabel(a.type)}</span>
                      </p>
                      <p className="text-sm">{a.title}</p>
                      <p className="text-[var(--text-muted)] text-xs">
                        {a.area && `${a.area} · `}{timeAgo(a.timestamp)}
                        {a.detail && ` · ${a.detail}`}
                      </p>
                    </div>
                  </div>
                ))}
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
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(0); }}
            className="input-field w-auto text-xs">
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs text-[var(--text-muted)] ml-auto">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── MOBILE CARDS ── */}
        <div className="sm:hidden space-y-2">
          {paged.map((item) => (
            <div key={item.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
              <div className="flex items-start justify-between mb-1">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{item.product?.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs bg-[var(--bg-input)] px-1.5 py-0.5 rounded">{item.area?.name}</span>
                    {item.product?.category && <span className="text-xs text-[var(--text-muted)]">{item.product.category}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span className={`text-base font-bold ${item.quantity <= 5 ? 'text-[var(--danger)]' : ''}`}>
                    {item.quantity}
                  </span>
                  <p className="text-xs text-[var(--text-muted)]">{item.product?.unit}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>{new Date(item.updated_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {item.product?.notes && <span className="truncate max-w-[50%]">📝 {item.product.notes}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ── DESKTOP TABLE ── */}
        <div className="overflow-x-auto hidden sm:block">
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

