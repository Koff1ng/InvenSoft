import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getUserFromRequest } from '@/app/api/local-auth/route';

const IS_CLOUD = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Reject unless the requester is an authenticated admin (prevents open abuse of service-role user management). */
async function assertCallerIsAdmin(req: NextRequest): Promise<NextResponse | null> {
  if (!IS_CLOUD) {
    const user = getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { getProfileById } = await import('@/lib/local-db');
    const profile = getProfileById(user.id) as { role?: string } | undefined;
    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        /* read-only: session refresh not needed for this check */
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  return null;
}

// Admin API: uses service_role key to manage users without affecting current session
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Convert username → email for Supabase Auth
function toAuthEmail(username: string): string {
  if (username.includes('@')) return username;
  return `${username.toLowerCase().replace(/\s+/g, '')}@lacomitiva.local`;
}

export async function POST(req: NextRequest) {
  try {
    const denied = await assertCallerIsAdmin(req);
    if (denied) return denied;

    const body = await req.json();
    const { username, password, full_name, role, area_id } = body;

    if (!username || !password || !full_name || !role) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    if (!IS_CLOUD) {
      try {
        const { createUser } = await import('@/lib/local-db');
        const user = createUser(username.trim(), password, full_name, role, role === 'admin' ? null : area_id || null, username.trim());
        return NextResponse.json({ success: true, id: user.id });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al crear usuario local';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const admin = getAdminClient();
    const authEmail = toAuthEmail(username.trim());

    let userId: string;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.signUp({ email: authEmail, password });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data.user) return NextResponse.json({ error: 'No se pudo crear el usuario' }, { status: 500 });
      userId = data.user.id;
    }

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH: edit user — supports password change and username change.
// The basic profile fields (full_name, role, area_id) can still be updated via the
// `profiles` table directly from the client. This endpoint exists because those
// require admin/service_role privileges that the browser session doesn't have.
export async function PATCH(req: NextRequest) {
  try {
    const denied = await assertCallerIsAdmin(req);
    if (denied) return denied;

    const body = await req.json();
    const { id, password, username } = body as { id?: string; password?: string; username?: string };

    if (!id) return NextResponse.json({ error: 'Falta id de usuario' }, { status: 400 });
    if (!password && !username) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 });
    }

    if (!IS_CLOUD) {
      const { updateUserPassword, updateUsername, updateProfile } = await import('@/lib/local-db');
      try {
        if (password) updateUserPassword(id, password);
        if (username) {
          updateUsername(id, username.trim());
          updateProfile(id, { username: username.trim() });
        }
        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error al actualizar usuario';
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'No se puede cambiar contraseña/usuario sin SUPABASE_SERVICE_ROLE_KEY configurada en el servidor.' },
        { status: 501 }
      );
    }

    const admin = getAdminClient();
    const updatePayload: { password?: string; email?: string } = {};
    if (password) updatePayload.password = password;
    if (username) updatePayload.email = toAuthEmail(username.trim());

    const { error: authErr } = await admin.auth.admin.updateUserById(id, updatePayload);
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

    if (username) {
      const { error: profErr } = await admin
        .from('profiles')
        .update({ username: username.trim() })
        .eq('id', id);
      if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error interno';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
