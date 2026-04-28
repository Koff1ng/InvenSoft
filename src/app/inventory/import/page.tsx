'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useRouter } from 'next/navigation';
import type { Profile, Area } from '@/lib/types';
import Navbar from '@/components/Navbar';

export default function ImportPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [, setCsvText] = useState('');
  const [preview, setPreview] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: number; err: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      setProfile(prof);

      if (prof?.role === 'admin') {
        const { data } = await supabase.from('areas').select('*');
        setAreas(data || []);
      }
    };
    load();
  }, [supabase]);

  const downloadTemplate = () => {
    const csv = 'nombre,unidad,cantidad,notas\nEjemplo Producto,kg,10,Nota opcional';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_inventario.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setError('El archivo debe tener al menos una fila de encabezado y una de datos.');
      setPreview([]);
      return;
    }
    setError('');
    // Skip header row
    const rows = lines.slice(1).map(line => {
      // Handle quoted fields
      const fields: string[] = [];
      let current = '';
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { fields.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      fields.push(current.trim());
      return fields;
    });
    setPreview(rows);
  };

  const handleImport = async () => {
    if (!profile) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const areaId = profile.role === 'admin' ? selectedAreaId : profile.area_id;
    if (!areaId) {
      setError('Selecciona un área');
      return;
    }

    setLoading(true);
    setError('');
    let ok = 0;
    let err = 0;

    for (const row of preview) {
      const [name, unit, quantityStr, notes] = row;
      if (!name) { err++; continue; }

      const quantity = parseFloat(quantityStr);
      if (isNaN(quantity)) { err++; continue; }

      // Insert product
      const { data: product, error: prodErr } = await supabase
        .from('products')
        .insert({
          name,
          unit: unit || 'unidades',
          notes: notes || null,
          area_id: areaId,
        })
        .select()
        .single();

      if (prodErr || !product) { err++; continue; }

      // Insert inventory item
      const { error: invErr } = await supabase
        .from('inventory_items')
        .insert({
          product_id: product.id,
          area_id: areaId,
          quantity,
          updated_by: user.id,
        });

      if (invErr) { err++; } else { ok++; }
    }

    setResult({ ok, err });
    setLoading(false);
  };

  return (
    <>
      <Navbar />
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-2">Importar Productos (CSV)</h1>
        <p className="text-[var(--text-muted)] text-sm mb-6">
          Sube un archivo CSV para agregar productos en lote.
        </p>

        <div className="card space-y-4">
          {/* Template download */}
          <div>
            <button onClick={downloadTemplate} className="btn-secondary text-sm">
              📄 Descargar Plantilla CSV
            </button>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Columnas: nombre, unidad, cantidad, notas
            </p>
          </div>

          {/* Area selector for admin */}
          {profile?.role === 'admin' && (
            <div>
              <label htmlFor="import-area" className="block text-sm font-medium mb-1">Área destino</label>
              <select
                id="import-area"
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

          {/* File upload */}
          <div>
            <label htmlFor="csv-file" className="block text-sm font-medium mb-1">Archivo CSV</label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="input-field text-sm"
            />
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Vista previa ({preview.length} filas):</p>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                      <th className="py-1 px-2 text-left">Nombre</th>
                      <th className="py-1 px-2 text-left">Unidad</th>
                      <th className="py-1 px-2 text-left">Cantidad</th>
                      <th className="py-1 px-2 text-left">Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-b border-[var(--border)]/50">
                        <td className="py-1 px-2">{row[0] || '—'}</td>
                        <td className="py-1 px-2">{row[1] || 'unidades'}</td>
                        <td className="py-1 px-2">{row[2] || '0'}</td>
                        <td className="py-1 px-2 text-[var(--text-muted)]">{row[3] || '—'}</td>
                      </tr>
                    ))}
                    {preview.length > 10 && (
                      <tr>
                        <td colSpan={4} className="py-1 px-2 text-center text-[var(--text-muted)]">
                          ...y {preview.length - 10} más
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {error && (
            <div className="text-[var(--danger)] text-sm bg-red-900/20 p-3 rounded-lg">
              {error}
            </div>
          )}

          {result && (
            <div className="p-3 rounded-lg bg-green-900/20 text-[var(--success)] text-sm">
              {result.ok} productos importados correctamente.
              {result.err > 0 && <span className="text-[var(--danger)]"> {result.err} errores.</span>}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={loading || preview.length === 0}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {loading ? 'Importando...' : `Importar ${preview.length} productos`}
            </button>
            <button onClick={() => router.back()} className="btn-secondary">
              Volver
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
