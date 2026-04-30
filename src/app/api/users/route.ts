import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { shouldSyncAuthEmailForLoginUpdate, toAuthEmail } from '@/lib/lacomitiva-auth';

const IS_CLOUD = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Admin API: uses service_role key to manage users without affecting current session
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
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

    let skipAuthUpdate = false;
    if (username) {
      const { data: authUser, error: getUserErr } = await admin.auth.admin.getUserById(id);
      if (getUserErr || !authUser?.user) {
        return NextResponse.json(
          { error: getUserErr?.message || 'Usuario no encontrado en Auth' },
          { status: 400 },
        );
      }
      const currentEmail = authUser.user.email;
      if (shouldSyncAuthEmailForLoginUpdate(currentEmail, username)) {
        updatePayload.email = toAuthEmail(username.trim());
      } else {
        // Display-only username change: do not call Auth with an empty payload.
        skipAuthUpdate = !password;
      }
    }

    if (!skipAuthUpdate) {
      const { error: authErr } = await admin.auth.admin.updateUserById(id, updatePayload);
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    }

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
