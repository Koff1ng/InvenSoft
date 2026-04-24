import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll() { /* read-only */ },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const url = new URL(request.url);
  const orderId = url.searchParams.get('id');
  if (!orderId) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { data: order } = await supabase
    .from('orders')
    .select('*, area:areas(name), sede:sedes(name), creator:profiles!orders_created_by_fkey(full_name)')
    .eq('id', orderId)
    .single();

  if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });

  const items: any[] = Array.isArray(order.items) ? order.items : [];

  // Group items by category
  const byCategory: Record<string, any[]> = {};
  for (const item of items) {
    const cat = item.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  const catNames = Object.keys(byCategory);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'La Comitiva - Pedidos';
  wb.created = new Date();

  const COLORS = {
    primary: '1B4332', primaryLight: '2D6A4F', accent: '40916C',
    headerFont: 'FFFFFF', oddRow: 'F8F9FA', evenRow: 'FFFFFF', border: 'B7B7B7',
    catBg: 'E2E8F0', catFont: '334155',
  };

  const ws = wb.addWorksheet('Pedido', { properties: { defaultColWidth: 18 } });

  // Title
  ws.mergeCells('A1:E1');
  const title = ws.getCell('A1');
  title.value = 'Pedido — La Comitiva';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.headerFont } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 42;

  // Info
  ws.mergeCells('A2:E2');
  const sub = ws.getCell('A2');
  const sedeLabel = order.sede?.name ? `  |  Sede: ${order.sede.name}` : '';
  sub.value = `Área: ${order.area?.name || '—'}${sedeLabel}  |  Creado por: ${order.creator?.full_name || '—'}`;
  sub.font = { name: 'Calibri', size: 11, color: { argb: COLORS.headerFont } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primaryLight } };
  sub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 28;

  ws.mergeCells('A3:E3');
  const dateSub = ws.getCell('A3');
  const now = new Date(order.created_at);
  const statusLabel = order.status === 'enviado' ? 'Enviado' : 'Borrador';
  dateSub.value = `Fecha: ${now.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}  |  Estado: ${statusLabel}`;
  dateSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.headerFont } };
  dateSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
  dateSub.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(3).height = 24;

  ws.getRow(4).height = 8;

  // Column headers
  const headers = ['#', 'Producto', 'Cantidad', 'Unidad', 'Notas'];
  const hRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = hRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.headerFont } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: COLORS.primary } } };
  });
  hRow.height = 28;

  let rowIdx = 6;
  let itemNum = 1;

  for (const catName of catNames) {
    const catItems = byCategory[catName];

    // Category header row
    ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
    const catCell = ws.getRow(rowIdx).getCell(1);
    catCell.value = `${catName}  (${catItems.length} productos)`;
    catCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.catFont } };
    catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.catBg } };
    catCell.alignment = { vertical: 'middle' };
    ws.getRow(rowIdx).height = 26;
    rowIdx++;

    catItems.forEach((item: any, j: number) => {
      const row = ws.getRow(rowIdx);
      const isOdd = j % 2 === 0;
      const vals = [itemNum, item.product_name || '', Number(item.quantity) || 0, item.unit || '', item.notes || ''];
      vals.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { vertical: 'middle', wrapText: i === 4 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isOdd ? COLORS.oddRow : COLORS.evenRow } };
        cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
        if (i === 0 || i === 2 || i === 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (i === 2) cell.numFmt = '#,##0.##';
      });
      row.height = 22;
      rowIdx++;
      itemNum++;
    });

    // Small spacer between categories
    ws.getRow(rowIdx).height = 6;
    rowIdx++;
  }

  // Footer
  rowIdx++;
  ws.mergeCells(`A${rowIdx}:E${rowIdx}`);
  const footer = ws.getCell(`A${rowIdx}`);
  footer.value = `Total: ${items.length} productos en ${catNames.length} ${catNames.length === 1 ? 'categoría' : 'categorías'}`;
  footer.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.primaryLight } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(rowIdx).height = 28;

  ws.getColumn(1).width = 6; ws.getColumn(2).width = 30; ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14; ws.getColumn(5).width = 28;

  const buffer = await wb.xlsx.writeBuffer();
  const areaSlug = String(order.area?.name || 'pedido').replace(/\s+/g, '_');
  const dateStr = now.toISOString().split('T')[0];

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Pedido_${areaSlug}_${dateStr}.xlsx"`,
    },
  });
}
