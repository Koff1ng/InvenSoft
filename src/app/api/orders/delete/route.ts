import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getUserFromRequest } from '@/app/api/local-auth/route';
import { deleteOrder, getOrderById, getProfileById } from '@/lib/local-db';

const IS_CLOUD = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Supabase UUID or local SQLite 32-char hex id */
function isValidOrderId(id: string): boolean {
  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const hex32 = /^[0-9a-fA-F]{32}$/;
  return uuidRe.test(id) || hex32.test(id);
}

export async function POST(request: NextRequest) {
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  const id = body?.id;
  if (!id || typeof id !== 'string' || !isValidOrderId(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  if (!IS_CLOUD) {
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    const profile = getProfileById(user.id);
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    const order = getOrderById(id);
    if (!order) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
    if (order.status !== 'enviado') {
      return NextResponse.json({ error: 'Solo se pueden eliminar pedidos enviados' }, { status: 403 });
    }
    deleteOrder(id);
    return NextResponse.json({ success: true });
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

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .single();

  if (orderErr || !order) {
    return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 });
  }
  if (order.status !== 'enviado') {
    return NextResponse.json({ error: 'Solo se pueden eliminar pedidos enviados' }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = serviceKey
    ? createClient(SUPABASE_URL, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : supabase;

  const { error: delErr } = await db.from('orders').delete().eq('id', id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message || 'Error al eliminar' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
