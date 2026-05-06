'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

interface HistoryEntry {
  id: string;
  previous_qty: number;
  new_qty: number;
  updated_at: string;
  notes: string | null;
  updater: { full_name: string } | null;
  inventory_item: {
    product: { name: string; unit: string } | null;
    area: { name: string } | null;
  } | null;
}

interface RawUpdate {
  id: string;
  previous_qty: number;
  new_qty: number;
  updated_at: string;
  notes: string | null;
  updated_by: string | null;
  inventory_item_id: string | null;
}

interface RawProfile { id: string; full_name: string }
interface RawItem { id: string; product_id: string | null; area_id: string | null }
interface RawProduct { id: string; name: string; unit: string }
interface RawArea { id: string; name: string }

const PAGE_SIZE = 25;

export default function HistoryPage() {
  const supabase = useMemo(() => createClient(), []);
  const { profile, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(async () => {
    if (!profile) return;

    let query = supabase
      .from('inventory_updates')
      .select(
        'id, previous_qty, new_qty, updated_at, notes, updated_by, inventory_item_id, inventory_items!inner(area_id)',
        { count: 'exact' }
      )
      .order('updated_at', { ascending: false });

    if (profile.role !== 'admin' && profile.area_id) {
      query = query.eq('inventory_items.area_id', profile.area_id);
    }

    if (dateFrom) query = query.gte('updated_at', new Date(dateFrom).toISOString());
    if (dateTo) {
      const to = new Date(dateTo);
      to.setDate(to.getDate() + 1);
      query = query.lt('updated_at', to.toISOString());
    }

    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data: rawData, count } = await query;
    const updates = (rawData as RawUpdate[] | null) || [];
    if (!updates.length) {
      setEntries([]);
      setTotalCount(count || 0);
      return;
    }

    const updaterIds = [...new Set(updates.map(r => r.updated_by).filter((v): v is string => !!v))];
    const itemIds = [...new Set(updates.map(r => r.inventory_item_id).filter((v): v is string => !!v))];

    const [profilesRes, itemsRes] = await Promise.all([
      updaterIds.length ? supabase.from('profiles').select('id, full_name').in('id', updaterIds) : { data: [] },
      itemIds.length ? supabase.from('inventory_items').select('id, product_id, area_id').in('id', itemIds) : { data: [] },
    ]);

    const profiles = (profilesRes.data as RawProfile[] | null) || [];
    const items = (itemsRes.data as RawItem[] | null) || [];

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const itemMap = new Map(items.map(i => [i.id, i]));

    const productIds = [...new Set(items.map(i => i.product_id).filter((v): v is string => !!v))];
    const areaIds = [...new Set(items.map(i => i.area_id).filter((v): v is string => !!v))];

    const [productsRes, areasRes] = await Promise.all([
      productIds.length ? supabase.from('products').select('id, name, unit').in('id', productIds) : { data: [] },
      areaIds.length ? supabase.from('areas').select('id, name').in('id', areaIds) : { data: [] },
    ]);

    const productMap = new Map(((productsRes.data as RawProduct[] | null) || []).map(p => [p.id, p]));
    const areaMap = new Map(((areasRes.data as RawArea[] | null) || []).map(a => [a.id, a]));

    const enriched: HistoryEntry[] = updates.map(r => {
      const invItem = r.inventory_item_id ? itemMap.get(r.inventory_item_id) : undefined;
      const product = invItem?.product_id ? productMap.get(invItem.product_id) : undefined;
      const area = invItem?.area_id ? areaMap.get(invItem.area_id) : undefined;
      const updater = r.updated_by ? profileMap.get(r.updated_by) : undefined;

      return {
        id: r.id,
        previous_qty: r.previous_qty,
        new_qty: r.new_qty,
        updated_at: r.updated_at,
        notes: r.notes,
        updater: updater ? { full_name: updater.full_name } : null,
        inventory_item: {
          product: product ? { name: product.name, unit: product.unit } : null,
          area: area ? { name: area.name } : null,
        },
      };
    });

    setEntries(enriched);
    setTotalCount(count || 0);
  }, [supabase, profile, page, dateFrom, dateTo]);

  useEffect(() => {
    if (!authLoading && profile) { loadData(); }
  }, [authLoading, profile, loadData]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (authLoading) {
    return (
      <>
        <Navbar />
        <div className="max-w-6xl mx-auto p-4 animate-fade-in">
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-4 w-32 mb-6" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}
          </div>
        </div>
      </>
    );
  }



  return (
    <>
      <Navbar />
      <div className="max-w-6xl mx-auto p-4">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Historial de Cambios</h1>
          <p className="text-[var(--text-muted)] text-sm">
            {totalCount} registro{totalCount !== 1 ? 's' : ''} de auditoría
          </p>
        </div>

        {/* Date range filter */}
        <div className="flex gap-3 mb-4 flex-wrap items-center">
          <label className="text-sm text-[var(--text-muted)]">Desde:</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="input-field w-auto"
          />
          <label className="text-sm text-[var(--text-muted)]">Hasta:</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="input-field w-auto"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(0); }}
              className="text-xs text-[var(--primary)] underline"
            >
              Limpiar fechas
            </button>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-[var(--text-muted)]">
              {dateFrom || dateTo ? 'No hay registros en este rango de fechas.' : 'No hay registros de cambios aún.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── MOBILE CARDS ── */}
            <div className="sm:hidden space-y-2">
              {entries.map((e) => {
                const diff = e.new_qty - e.previous_qty;
                const isPositive = diff >= 0;
                return (
                  <div key={e.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{e.inventory_item?.product?.name || '—'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs bg-[var(--bg-input)] px-1.5 py-0.5 rounded">{e.inventory_item?.area?.name || '—'}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className={`text-base font-bold ${isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                          {isPositive ? '+' : ''}{diff}
                        </span>
                        <p className="text-xs text-[var(--text-muted)]">{e.previous_qty} → {e.new_qty}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                      <span>{e.updater?.full_name || '—'}</span>
                      <span>{new Date(e.updated_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {e.notes && <p className="text-xs text-[var(--text-muted)] mt-1 truncate">📝 {e.notes}</p>}
                  </div>
                );
              })}
            </div>

            {/* ── DESKTOP TABLE ── */}
            <div className="overflow-x-auto hidden sm:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-sm text-[var(--text-muted)]">
                    <th className="py-3 px-4">Producto</th>
                    <th className="py-3 px-4">Área</th>
                    <th className="py-3 px-4">Anterior</th>
                    <th className="py-3 px-4">Nuevo</th>
                    <th className="py-3 px-4">Cambio</th>
                    <th className="py-3 px-4">Responsable</th>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const diff = e.new_qty - e.previous_qty;
                    const isPositive = diff >= 0;
                    return (
                      <tr key={e.id} className="border-b border-[var(--border)] hover:bg-[var(--bg-input)]/30">
                        <td className="py-3 px-4 font-medium">
                          {e.inventory_item?.product?.name || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs bg-[var(--bg-input)] px-2 py-1 rounded">
                            {e.inventory_item?.area?.name || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">{e.previous_qty}</td>
                        <td className="py-3 px-4 font-medium">{e.new_qty}</td>
                        <td className="py-3 px-4">
                          <span className={`font-bold ${isPositive ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                            {isPositive ? '+' : ''}{diff}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm">{e.updater?.full_name || '—'}</td>
                        <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                          {new Date(e.updated_at).toLocaleDateString('es-CO', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 text-sm text-[var(--text-muted)]">
                          {e.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
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
    </>
  );
}
