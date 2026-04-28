import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const IS_CLOUD = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Admin API: uses service_role key to manage users without affecting current session
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Fallback to anon key if service role not set (will work for signUp but not admin.createUser)
    return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Convert username → email for Supabase Auth
function toAuthEmail(username: string): string {
  if (username.includes('@')) return username;
  // Plain usernames get a fake domain
  return `${username.toLowerCase().replace(/\s+/g, '')}@lacomitiva.local`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, full_name, role, area_id } = body;

    if (!username || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    // ── LOCAL MODE (SQLite) ──
    if (!IS_CLOUD) {
      try {
        const { createUser } = await import('@/lib/local-db');
        const user = createUser(username.trim(), password, full_name, role, role === 'admin' ? null : area_id || null, username.trim());
        return NextResponse.json({ success: true, id: user.id });
      } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error al crear usuario local' }, { status: 400 });
      }
    }

    // ── CLOUD MODE (Supabase) ──
    const admin = getAdminClient();
    const authEmail = toAuthEmail(username.trim());

    // Try admin.createUser (requires service_role key)
    let userId: string;
    
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // Best: admin API — doesn't trigger confirmation emails, doesn't affect sessions
      const { data, error } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      userId = data.user.id;
    } else {
      // Fallback: signUp (may require email confirmation)
      const { data, error } = await admin.auth.signUp({ email: authEmail, password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data.user) return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 });
      userId = data.user.id;
    }

    // Insert profile with the original username for display
    const { error: profileError } = await admin.from('profiles').insert({
      id: userId,
      full_name,
      role,
      area_id: role === 'admin' ? null : area_id || null,
      username: username.trim(),
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, id: userId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Error interno' }, { status: 500 });
  }
}
