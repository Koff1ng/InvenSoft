import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: Request) {
  // Auth via Supabase
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* read-only in route handler GET */ },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  // Fetch inventory data from Supabase
  const url = new URL(request.url);
  const sedeId = url.searchParams.get('sede') || undefined;

  let query = supabase
    .from('inventory_items')
    .select('quantity, updated_at, product:products(name, unit, category, notes), area:areas(name), sede:sedes(name)');

  if (sedeId) query = query.eq('sede_id', sedeId);

  const { data: items } = await query;
  if (!items?.length) return new NextResponse('No hay datos para exportar', { status: 200 });

  // Flatten items
  const flatItems = items.map((i: any) => ({
    area_name: i.area?.name || '',
    product_name: i.product?.name || '',
    quantity: i.quantity,
    product_unit: i.product?.unit || '',
    product_category: i.product?.category || 'Sin Categoría',
    product_notes: i.product?.notes || '',
    sede_name: i.sede?.name || '',
    updated_at: i.updated_at,
  }));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'La Comitiva - Sistema de Inventarios';
  wb.created = new Date();

  const COLORS = {
    primary: '1B4332', primaryLight: '2D6A4F', accent: '40916C',
    headerFont: 'FFFFFF', catBg: 'E2E8F0', catFont: '334155',
    oddRow: 'F8F9FA', evenRow: 'FFFFFF', border: 'B7B7B7',
    lowStockBg: 'FFF3CD', lowStockFont: '856404',
  };

  const now = new Date();

  // Group by category
  const byCategory: Record<string, typeof flatItems> = {};
  for (const item of flatItems) {
    const cat = item.product_category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  const catNames = Object.keys(byCategory).sort();

  // ── Summary sheet ──
  const ws = wb.addWorksheet('Inventario General', { properties: { defaultColWidth: 18 } });

  ws.mergeCells('A1:F1');
  const title = ws.getCell('A1');
  const sedeName = sedeId && flatItems[0]?.sede_name ? flatItems[0].sede_name : 'Todas las Sedes';
  title.value = `La Comitiva — ${sedeName}`;
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.headerFont } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 42;

  ws.mergeCells('A2:F2');
  const sub = ws.getCell('A2');
  sub.value = `Exportado el ${now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} a las ${now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.headerFont } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primaryLight } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 24;

  ws.getRow(3).height = 8;

  const headers = ['Área', 'Producto', 'Cantidad', 'Unidad', 'Notas', 'Última Actualización'];
  const hRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.primary } } };
  });
  hRow.height = 28;

  let rowIdx = 5;
  for (const catName of catNames) {
    const catItems = byCategory[catName];
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    const catCell = ws.getRow(rowIdx).getCell(1);
    catCell.value = `${catName}  (${catItems.length} productos)`;
    catCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.catFont } };
    catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.catBg } };
    catCell.alignment = { vertical: 'middle' };
    ws.getRow(rowIdx).height = 26;
    rowIdx++;

    for (let j = 0; j < catItems.length; j++) {
      const item = catItems[j];
      const row = ws.getRow(rowIdx);
      const isOdd = j % 2 === 0;
      const qty = Number(item.quantity) || 0;
      const isLow = qty <= 5;

      const vals = [item.area_name, item.product_name, qty, item.product_unit, item.product_notes,
        item.updated_at ? new Date(item.updated_at).toLocaleString('es-CO') : ''];

      vals.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { vertical: 'middle', wrapText: i === 4 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isLow && i === 2 ? COLORS.lowStockBg : (isOdd ? COLORS.oddRow : COLORS.evenRow) } };
        cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
        if (i === 2) { cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.numFmt = '#,##0.##'; if (isLow) cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.lowStockFont } }; }
        if (i === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });
      row.height = 22;
      rowIdx++;
    }
    ws.getRow(rowIdx).height = 6;
    rowIdx++;
  }

  rowIdx++;
  ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
  const footer = ws.getCell(`A${rowIdx}`);
  const lowCount = flatItems.filter(i => (Number(i.quantity) || 0) <= 5).length;
  footer.value = `Total: ${flatItems.length} productos en ${catNames.length} categorías  |  Stock bajo (≤5): ${lowCount} productos`;
  footer.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.primaryLight } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rowIdx).height = 28;

  ws.getColumn(1).width = 16; ws.getColumn(2).width = 28; ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14; ws.getColumn(5).width = 30; ws.getColumn(6).width = 22;

  const buffer = await wb.xlsx.writeBuffer();
  const dateStr = now.toISOString().split('T')[0];

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Inventario_LaComitiva_${dateStr}.xlsx"`,
    },
  });
}
