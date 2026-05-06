import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    return NextResponse.json({ error: 'Solo administradores pueden exportar conteos' }, { status: 403 });
  }

  const url = new URL(request.url);
  const countId = url.searchParams.get('id');
  if (!countId) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  // Fetch the physical count
  const { data: count, error: countErr } = await supabase
    .from('physical_counts')
    .select('*')
    .eq('id', countId)
    .single();

  if (countErr || !count) {
    return NextResponse.json({ error: 'Conteo no encontrado' }, { status: 404 });
  }

  // Enrich
  const [areaRes, submitterRes] = await Promise.all([
    count.area_id ? supabase.from('areas').select('name').eq('id', count.area_id).single() : { data: null },
    count.submitted_by ? supabase.from('profiles').select('full_name').eq('id', count.submitted_by).single() : { data: null },
  ]);
  const areaName = areaRes.data?.name || 'Área';
  const submitterName = submitterRes.data?.full_name || '—';

  const items: { product_name: string; product_unit: string; system_qty: number; counted_qty: number }[] =
    Array.isArray(count.items) ? count.items : [];

  if (items.length === 0) {
    return NextResponse.json({ error: 'El conteo no tiene productos' }, { status: 404 });
  }

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'La Comitiva - Conteo Físico';
    wb.created = new Date();

    const ws = wb.addWorksheet(areaName, { properties: { defaultColWidth: 16 } });

    const COLORS = {
      primary: '1B4332', primaryLight: '2D6A4F', accent: '40916C',
      headerFont: 'FFFFFF', oddRow: 'F8F9FA', evenRow: 'FFFFFF',
      border: 'B7B7B7', catBg: 'E2E8F0', catFont: '334155',
      diffNeg: 'FEE2E2', diffPos: 'DCFCE7',
    };

    // ── Row 1: Company name ──
    ws.mergeCells('A1:F1');
    const r1 = ws.getCell('A1');
    r1.value = 'LA COMITIVA';
    r1.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.headerFont } };
    r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primary } };
    r1.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // ── Row 2: Area ──
    ws.mergeCells('A2:F2');
    const r2 = ws.getCell('A2');
    r2.value = `ÁREA: ${areaName.toUpperCase()}`;
    r2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: COLORS.headerFont } };
    r2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.primaryLight } };
    r2.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 28;

    // ── Row 3: Info ──
    ws.mergeCells('A3:F3');
    const r3 = ws.getCell('A3');
    const countDate = new Date(count.created_at);
    r3.value = `INVENTARIO FÍSICO — ${submitterName} — ${countDate.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    r3.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.headerFont } };
    r3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.accent } };
    r3.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(3).height = 24;

    // ── Row 4: Spacer ──
    ws.getRow(4).height = 8;

    // ── Row 5: Headers — matching "formato inv final" ──
    const headers = ['#', 'DESCRIPCIÓN', 'UNIDAD', 'SISTEMA', 'CONTEO', 'DIFERENCIA'];
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

    // ── Data rows ──
    let rowIdx = 6;
    let totalDiffs = 0;

    items.sort((a, b) => a.product_name.localeCompare(b.product_name));

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const diff = item.counted_qty - item.system_qty;
      if (diff !== 0) totalDiffs++;
      const isOdd = j % 2 === 0;
      const row = ws.getRow(rowIdx);

      const vals: (string | number)[] = [
        j + 1,
        item.product_name,
        item.product_unit,
        item.system_qty,
        item.counted_qty,
        diff,
      ];

      vals.forEach((val, i) => {
        const cell = row.getCell(i + 1);
        cell.value = val;
        cell.font = { name: 'Calibri', size: 10 };
        cell.alignment = { vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };

        // Base row color
        let bgColor = isOdd ? COLORS.oddRow : COLORS.evenRow;

        // Difference column styling
        if (i === 5 && diff !== 0) {
          bgColor = diff < 0 ? COLORS.diffNeg : COLORS.diffPos;
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: diff < 0 ? 'DC2626' : '16A34A' } };
          cell.value = diff > 0 ? `+${diff}` : diff;
        }

        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };

        // Center numeric columns
        if (i === 0 || i >= 3) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        if (i >= 3 && i <= 4) cell.numFmt = '#,##0.##';
      });

      row.height = 22;
      rowIdx++;
    }

    // ── Footer ──
    rowIdx++;
    ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
    const footer = ws.getCell(`A${rowIdx}`);
    footer.value = `Total: ${items.length} productos  |  Con diferencia: ${totalDiffs} productos`;
    footer.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.primaryLight } };
    footer.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(rowIdx).height = 28;

    // Notes
    if (count.notes) {
      rowIdx++;
      ws.mergeCells(`A${rowIdx}:F${rowIdx}`);
      const notesCell = ws.getCell(`A${rowIdx}`);
      notesCell.value = `Notas: ${count.notes}`;
      notesCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.catFont } };
      notesCell.alignment = { vertical: 'middle', wrapText: true };
      ws.getRow(rowIdx).height = 24;
    }

    // Column widths matching formato inv final
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 36;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 14;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const areaSlug = areaName.replace(/[^\w\-]+/g, '_').slice(0, 30);
    const dateStr = countDate.toISOString().split('T')[0];

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Conteo_${areaSlug}_${dateStr}.xlsx"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    });

  } catch (err: any) {
    console.error('Export-count error:', err);
    return NextResponse.json({ error: 'Error generando Excel: ' + (err?.message || 'desconocido') }, { status: 500 });
  }
}
