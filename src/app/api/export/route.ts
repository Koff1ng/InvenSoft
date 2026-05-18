import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface InventoryItemRow {
  quantity: number;
  updated_at: string | null;
  product: { name?: string; unit?: string; category?: string; notes?: string } | null;
  area: { id?: string; name?: string; parent_id?: string | null } | null;
  sede: { name?: string } | null;
}

export async function GET(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: 'Credenciales faltantes' }, { status: 503 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* read-only */ },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const url = new URL(request.url);
  const filterArea = url.searchParams.get('area');
  const filterCategory = url.searchParams.get('category');
  const filterSearch = url.searchParams.get('search')?.toLowerCase();
  const sedeId = url.searchParams.get('sede') || undefined;

  // Fetch all inventory items with product, area, sede
  // Fetch ALL items with pagination (Supabase default limit = 1000)
  const PAGE_SIZE = 1000;
  let allItems: any[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase
      .from('inventory_items')
      .select('area_id, quantity, updated_at, product:products(name, unit, category, notes), area:areas(id, name, parent_id), sede:sedes(name)')
      // Deterministic order required: .range() without ORDER BY can duplicate or skip rows across pages
      .order('id', { ascending: true })
      .range(from, to);

    if (sedeId) query = query.eq('sede_id', sedeId);

    const { data, error: queryErr } = await query;
    if (queryErr) {
      return NextResponse.json({ error: 'Error: ' + queryErr.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allItems = allItems.concat(data);
      if (data.length < PAGE_SIZE) hasMore = false;
      page++;
    }
  }

  const itemsRaw = allItems;
  if (!itemsRaw.length) {
    return NextResponse.json({ error: 'No hay datos para exportar' }, { status: 404 });
  }

  // Fetch all areas for grouping
  const { data: allAreas } = await supabase.from('areas').select('id, name, slug, parent_id');
  const areasMap = new Map((allAreas || []).map((a: any) => [a.id, a]));

  try {
    const items = itemsRaw as unknown as (InventoryItemRow & { area_id: string })[];

    let flatItems = items.map((i) => ({
      area_id: i.area_id,
      area_name: i.area?.name || '',
      area_parent_id: (i.area as any)?.parent_id || null,
      product_name: i.product?.name || '',
      quantity: i.quantity,
      product_unit: i.product?.unit || '',
      product_category: i.product?.category || 'General',
      product_notes: i.product?.notes || '',
      sede_name: i.sede?.name || '',
      updated_at: i.updated_at,
    }));

    if (filterArea) flatItems = flatItems.filter(i => i.area_id === filterArea);
    if (filterCategory) flatItems = flatItems.filter(i => i.product_category === filterCategory);
    if (filterSearch) flatItems = flatItems.filter(i => i.product_name.toLowerCase().includes(filterSearch));

    if (flatItems.length === 0) {
      return NextResponse.json({ error: 'No hay datos con estos filtros' }, { status: 404 });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'La Comitiva - Sistema de Inventarios';
    wb.created = new Date();

    const COLORS = {
      primary: '1B4332', primaryLight: '2D6A4F', accent: '40916C',
      headerFont: 'FFFFFF', catBg: 'E2E8F0', catFont: '334155',
      oddRow: 'F8F9FA', evenRow: 'FFFFFF', border: 'B7B7B7',
    };

    const now = new Date();
    const dateLabel = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });

    // ═══════════════════════════════════════════════
    // Helper: create a sheet matching "formato inv final"
    // Columns: # GRUPO | CLAVE | DESCRIPCION | UNIDAD | TOTAL
    // ═══════════════════════════════════════════════
    function createAreaSheet(
      sheetName: string,
      areaLabel: string,
      sheetItems: typeof flatItems,
    ) {
      const ws = wb.addWorksheet(sheetName, { properties: { defaultColWidth: 16 } });

      // ── Row 1: LA COMITIVA ──
      ws.mergeCells('A1:E1');
      const r1 = ws.getCell('A1');
      r1.value = 'LA COMITIVA';
      r1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.headerFont } };
      r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
      r1.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 32;

      // ── Row 2: AREA ──
      ws.mergeCells('A2:E2');
      const r2 = ws.getCell('A2');
      r2.value = `                 AREA:        ${areaLabel.toUpperCase()}`;
      r2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFont } };
      r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primaryLight } };
      r2.alignment = { vertical: 'middle' };
      ws.getRow(2).height = 26;

      // ── Row 3: INVENTARIO FISICO ──
      ws.mergeCells('A3:E3');
      const r3 = ws.getCell('A3');
      r3.value = `          INVENTARIO FISICO   ALMACÉN    ${dateLabel}`;
      r3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.headerFont } };
      r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
      r3.alignment = { vertical: 'middle' };
      ws.getRow(3).height = 22;

      // ── Row 4: spacer ──
      ws.getRow(4).height = 8;

      // ── Row 5: Headers ──
      const headers = ['# GRUPO', 'CLAVE', 'DESCRIPCION', 'UNIDAD', 'TOTAL'];
      const hRow = ws.getRow(5);
      headers.forEach((h, i) => {
        const cell = hRow.getCell(i + 1);
        cell.value = h;
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.headerFont } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'medium', color: { argb: COLORS.primary } } };
      });
      hRow.height = 24;

      // ── Data rows (sorted by category then name) ──
      sheetItems.sort((a, b) => {
        const catCmp = a.product_category.localeCompare(b.product_category);
        if (catCmp !== 0) return catCmp;
        return a.product_name.localeCompare(b.product_name);
      });

      let rowIdx = 6;
      for (let j = 0; j < sheetItems.length; j++) {
        const item = sheetItems[j];
        const isOdd = j % 2 === 0;
        const row = ws.getRow(rowIdx);

        const vals: (string | number)[] = [
          item.product_category.toUpperCase(),
          '', // CLAVE - no tenemos clave, dejamos vacío
          item.product_name,
          item.product_unit,
          item.quantity,
        ];

        vals.forEach((val, i) => {
          const cell = row.getCell(i + 1);
          cell.value = val;
          cell.font = { name: 'Calibri', size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? COLORS.oddRow : COLORS.evenRow } };
          cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
          cell.alignment = { vertical: 'middle' };

          if (i === 0) cell.alignment = { horizontal: 'left', vertical: 'middle' };
          if (i === 1 || i === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
          if (i === 4) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.numFmt = '#,##0.##';
          }
        });

        row.height = 20;
        rowIdx++;
      }

      // Column widths matching formato inv final
      ws.getColumn(1).width = 16; // # GRUPO
      ws.getColumn(2).width = 10; // CLAVE
      ws.getColumn(3).width = 42; // DESCRIPCION
      ws.getColumn(4).width = 10; // UNIDAD
      ws.getColumn(5).width = 10; // TOTAL

      return ws;
    }

    // ═══════════════════════════════════════════════
    // CONSOLIDADO sheet (all items, with extra columns)
    // Columns: # GRUPO | CLAVE | DESCRIPCION | UNIDAD | TOTAL | AREA
    // ═══════════════════════════════════════════════
    const wsConsolidado = wb.addWorksheet('CONSOLIDADO', { properties: { defaultColWidth: 16 } });

    // Row 1
    wsConsolidado.mergeCells('A1:F1');
    const c1 = wsConsolidado.getCell('A1');
    c1.value = 'LA COMITIVA';
    c1.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.headerFont } };
    c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };
    wsConsolidado.getRow(1).height = 32;

    // Row 2
    wsConsolidado.mergeCells('A2:F2');
    const c2 = wsConsolidado.getCell('A2');
    c2.value = 'CLL 4 NO. 34-32 CALI VALLE DEL CAUCA COL';
    c2.font = { name: 'Calibri', size: 10, color: { argb: COLORS.headerFont } };
    c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primaryLight } };
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
    wsConsolidado.getRow(2).height = 22;

    // Row 3
    wsConsolidado.mergeCells('A3:F3');
    const c3 = wsConsolidado.getCell('A3');
    c3.value = `INVENTARIO FISICO   ALMACÉN: 1     ${dateLabel}`;
    c3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.headerFont } };
    c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
    c3.alignment = { horizontal: 'center', vertical: 'middle' };
    wsConsolidado.getRow(3).height = 22;

    // Row 4: spacer
    wsConsolidado.getRow(4).height = 8;

    // Row 5: Headers
    const consHeaders = ['# GRUPO', 'CLAVE', 'DESCRIPCION', 'UNIDAD', 'TOTAL', 'AREA'];
    const consHRow = wsConsolidado.getRow(5);
    consHeaders.forEach((h, i) => {
      const cell = consHRow.getCell(i + 1);
      cell.value = h;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.headerFont } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { bottom: { style: 'medium', color: { argb: COLORS.primary } } };
    });
    consHRow.height = 24;

    // Consolidado: deduplicate products, sum quantities
    const productMap = new Map<string, { category: string; name: string; unit: string; totalQty: number; areas: Set<string> }>();
    for (const item of flatItems) {
      const key = item.product_name.toLowerCase();
      if (productMap.has(key)) {
        const existing = productMap.get(key)!;
        existing.totalQty += item.quantity;
        existing.areas.add(item.area_name);
      } else {
        productMap.set(key, {
          category: item.product_category,
          name: item.product_name,
          unit: item.product_unit,
          totalQty: item.quantity,
          areas: new Set([item.area_name]),
        });
      }
    }

    const consolidated = Array.from(productMap.values()).sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return catCmp;
      return a.name.localeCompare(b.name);
    });

    let consRowIdx = 6;
    for (let j = 0; j < consolidated.length; j++) {
      const item = consolidated[j];
      const isOdd = j % 2 === 0;
      const row = wsConsolidado.getRow(consRowIdx);

      const vals: (string | number)[] = [
        item.category.toUpperCase(),
        '',
        item.name,
        item.unit,
        item.totalQty,
        Array.from(item.areas).join(', '),
      ];

      vals.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? COLORS.oddRow : COLORS.evenRow } };
        cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
        cell.alignment = { vertical: 'middle' };
        if (i === 1 || i === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (i === 4) { cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.numFmt = '#,##0.##'; }
      });
      row.height = 20;
      consRowIdx++;
    }

    wsConsolidado.getColumn(1).width = 16;
    wsConsolidado.getColumn(2).width = 10;
    wsConsolidado.getColumn(3).width = 42;
    wsConsolidado.getColumn(4).width = 10;
    wsConsolidado.getColumn(5).width = 10;
    wsConsolidado.getColumn(6).width = 30;

    // ═══════════════════════════════════════════════
    // One sheet per area (sub-areas get their own sheet)
    // ═══════════════════════════════════════════════
    const byArea = new Map<string, typeof flatItems>();
    for (const item of flatItems) {
      const areaId = item.area_id;
      if (!byArea.has(areaId)) byArea.set(areaId, []);
      byArea.get(areaId)!.push(item);
    }

    // Sort areas: parent areas first, then their children
    const sortedAreaIds = Array.from(byArea.keys()).sort((a, b) => {
      const aArea = areasMap.get(a);
      const bArea = areasMap.get(b);
      const aName = aArea?.name || '';
      const bName = bArea?.name || '';
      return aName.localeCompare(bName);
    });

    for (const areaId of sortedAreaIds) {
      const areaItems = byArea.get(areaId)!;
      const areaInfo = areasMap.get(areaId);
      const areaName = areaInfo?.name || areaItems[0]?.area_name || 'Área';
      // Sheet name max 31 chars, no special chars
      const sheetName = areaName.replace(/[\\/*?[\]:]/g, '').substring(0, 31).trim();

      // Skip if sheet already exists (duplicate name edge case)
      try {
        createAreaSheet(sheetName, areaName, areaItems);
      } catch {
        // Sheet name conflict — add suffix
        try {
          createAreaSheet(sheetName.substring(0, 28) + ' (2)', areaName, areaItems);
        } catch { /* skip */ }
      }
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const dateStr = now.toISOString().split('T')[0];

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Inventario_LaComitiva_${dateStr}.xlsx"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (err: any) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Error generando Excel: ' + (err?.message || 'desconocido') }, { status: 500 });
  }
}
