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

  // Items are stored as JSONB in the orders.items column
  const items: any[] = Array.isArray(order.items) ? order.items : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'La Comitiva - Pedidos';
  wb.created = new Date();

  const COLORS = {
    primary: '1B4332', primaryLight: '2D6A4F', accent: '40916C',
    headerFont: 'FFFFFF', oddRow: 'F8F9FA', evenRow: 'FFFFFF', border: 'B7B7B7',
  };

  const ws = wb.addWorksheet('Pedido', { properties: { defaultColWidth: 18 } });

  ws.mergeCells('A1:E1');
  const title = ws.getCell('A1');
  title.value = 'Pedido — La Comitiva';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: COLORS.headerFont } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 42;

  ws.mergeCells('A2:E2');
  const sub = ws.getCell('A2');
  const catLabel = order.category ? `  |  Categoría: ${order.category}` : '';
  const sedeLabel = order.sede?.name ? `  |  Sede: ${order.sede.name}` : '';
  sub.value = `Área: ${order.area?.name || '—'}${sedeLabel}  |  Creado por: ${order.creator?.full_name || '—'}${catLabel}`;
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

  items.forEach((item: any, j: number) => {
    const row = ws.getRow(j + 6);
    const isOdd = j % 2 === 0;
    const vals = [j + 1, item.product_name || '', Number(item.quantity) || 0, item.unit || '', item.notes || ''];
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
  });

  const footerRow = items.length + 7;
  ws.mergeCells(`A${footerRow}:E${footerRow}`);
  const footer = ws.getCell(`A${footerRow}`);
  footer.value = `Total: ${items.length} ${items.length === 1 ? 'producto' : 'productos'}`;
  footer.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.primaryLight } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(footerRow).height = 28;

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
