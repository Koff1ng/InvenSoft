import { NextResponse, type NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getUserByUsername, getUserById, getProfileById, updateUserPassword } from '@/lib/local-db';

const JWT_SECRET = 'la-comitiva-local-dev-secret-2024';
const COOKIE_NAME = 'lc_session';

export function createToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { sub: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { sub: string };
  } catch {
    return null;
  }
}

export function getUserFromRequest(request: NextRequest): { id: string; email: string } | null {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  const payload = verifyToken(cookie);
  if (!payload) return null;
  return getUserById(payload.sub) || null;
}

// POST: login, logout, updatePassword
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action } = body;

  if (action === 'login') {
    const { email, password } = body;
    // The frontend converts plain usernames to "<user>@lacomitiva.local" so the
    // same form can talk to Supabase Auth. In local SQLite mode we store the
    // plain username, so strip the suffix here before the lookup.
    const raw = String(email || '').trim();
    const stripped = raw.toLowerCase().endsWith('@lacomitiva.local')
      ? raw.slice(0, -'@lacomitiva.local'.length)
      : raw;
    // Try the stripped form first, then fall back to the raw value (real emails).
    const user = getUserByUsername(stripped) || getUserByUsername(raw);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 400 });
    }

    const token = createToken(user.id);
    const profile = getProfileById(user.id);

    const res = NextResponse.json({
      user: { id: user.id, email: user.email },
      profile,
    });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  }

  if (action === 'logout') {
    const res = NextResponse.json({ success: true });
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  if (action === 'updatePassword') {
    const user = getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { password } = body;
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Contraseña muy corta' }, { status: 400 });
    }
    updateUserPassword(user.id, password);
    return NextResponse.json({ success: true });
  }

  if (action === 'resetPassword') {
    // In local mode, just acknowledge — no email to send
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
}

// GET: get current user
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null, profile: null });
  }
  const profile = getProfileById(user.id);
  return NextResponse.json({ user, profile });
}

export { JWT_SECRET, COOKIE_NAME };
