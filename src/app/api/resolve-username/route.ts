import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function fallbackEmail(username: string): string {
  return `${username.toLowerCase().replace(/\s+/g, '')}@lacomitiva.local`;
}

// Resolves a username (or email) to the actual auth.users email so the client
// can call signInWithPassword. We never reveal whether a username exists or not:
// if the lookup fails we still return a synthesized fallback email so the caller
// gets the same generic "Invalid login credentials" error from Supabase Auth.
export async function POST(req: NextRequest) {
  // Local SQLite mode has no Supabase env vars. The mock client handles
  // username-based login on its own, so just echo the input.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    try {
      const { username } = await req.json();
      const u = String(username || '').trim();
      return NextResponse.json({ email: u || '' });
    } catch {
      return NextResponse.json({ email: '' });
    }
  }

  let username = '';
  try {
    const body = await req.json();
    username = String(body?.username || '').trim();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!username) {
    return NextResponse.json({ error: 'username requerido' }, { status: 400 });
  }

  // Already an email — caller can use as-is.
  if (username.includes('@')) {
    return NextResponse.json({ email: username });
  }

  // Without service-role we can't read profiles (RLS blocks anon) nor look up
  // auth.users. Best we can do is the synthesized fallback, which works for
  // any user that was created through /api/users (POST).
  if (!SERVICE_KEY) {
    return NextResponse.json({ email: fallbackEmail(username) });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Find the profile whose username matches (case-insensitive, exact).
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .ilike('username', username)
    .maybeSingle();

  // 2. If we found one, fetch the actual auth email.
  if (profile?.id) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (!error && data?.user?.email) {
      return NextResponse.json({ email: data.user.email });
    }
  }

  // 3. Fallback — synthesized email (works for users created via the username flow).
  return NextResponse.json({ email: fallbackEmail(username) });
}
