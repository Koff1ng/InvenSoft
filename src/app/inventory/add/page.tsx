'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import Navbar from '@/components/Navbar';

export default function AddProductPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { profile, areas, sedes } = useAuth();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('unidades');
  const [quantity, setQuantity] = useState('0');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedSedeId, setSelectedSedeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !profile) return;

    const areaId = profile.role === 'admin' ? selectedAreaId : profile.area_id;
    if (!areaId) {
      setError('Debe seleccionar un área');
      setLoading(false);
      return;
    }

    // Create product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .insert({ name, unit, category: category || null, notes: notes || null, area_id: areaId, sede_id: selectedSedeId || null })
      .select()
      .single();

    if (prodErr) {
      setError(prodErr.message);
      setLoading(false);
      return;
    }

    // Create inventory item
    const { error: invErr } = await supabase
      .from('inventory_items')
      .insert({
        product_id: product.id,
        area_id: areaId,
        sede_id: selectedSedeId || null,
        quantity: parseFloat(quantity),
        updated_by: user.id,
      });

    if (invErr) {
      setError(invErr.message);
      setLoading(false);
      return;
    }

    router.push('/inventory');
  };

  return (
    <>
      <Navbar />
      <div className="max-w-lg mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">Agregar Producto</h1>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">Nombre del producto</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="Ej: Tomates"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="quantity" className="block text-sm font-medium mb-1">Cantidad inicial</label>
              <input
                id="quantity"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input-field"
                min="0"
                step="0.1"
                required
              />
            </div>
            <div>
              <label htmlFor="unit" className="block text-sm font-medium mb-1">Unidad</label>
              <select
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="input-field"
              >
                <option value="unidades">Unidades</option>
                <option value="kg">Kilogramos</option>
                <option value="lb">Libras</option>
                <option value="litros">Litros</option>
                <option value="paquetes">Paquetes</option>
                <option value="cajas">Cajas</option>
                <option value="botellas">Botellas</option>
              </select>
            </div>
          </div>

          {profile?.role === 'admin' && (
            <div>
              <label htmlFor="area" className="block text-sm font-medium mb-1">Área</label>
              <select
                id="area"
                value={selectedAreaId}
                onChange={(e) => setSelectedAreaId(e.target.value)}
                className="input-field"
                required
              >
                <option value="">Seleccionar área...</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {profile?.role === 'admin' && sedes.length > 0 && (
            <div>
              <label htmlFor="sede" className="block text-sm font-medium mb-1">Sede</label>
              <select
                id="sede"
                value={selectedSedeId}
                onChange={(e) => setSelectedSedeId(e.target.value)}
                className="input-field"
              >
                <option value="">Sin sede asignada</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="category" className="block text-sm font-medium mb-1">Categoría (opcional)</label>
            <input
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input-field"
              placeholder="Ej: Alimentos, Bebidas, Limpieza"
              list="category-suggestions"
            />
            <datalist id="category-suggestions">
              <option value="Abarrotes" />
              <option value="Fruver" />
              <option value="Cárnicos" />
              <option value="Lácteos" />
              <option value="Bebidas" />
              <option value="Suministros" />
              <option value="Limpieza" />
              <option value="Desechables" />
            </datalist>
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium mb-1">Notas (opcional)</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field"
              rows={2}
              placeholder="Notas adicionales..."
            />
          </div>

          {error && (
            <div className="text-[var(--danger)] text-sm bg-red-900/20 p-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button type="submit" disabled={loading} className="btn-primary flex-1 disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
            <button type="button" onClick={() => router.back()} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
