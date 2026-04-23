import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Local-mode cookie name
const LOCAL_COOKIE = 'lc_session';

export async function middleware(request: NextRequest) {
  const publicPaths = ['/login', '/reset-password'];
  const isPublic = publicPaths.includes(request.nextUrl.pathname);
  const isApi = request.nextUrl.pathname.startsWith('/api/');

  // Allow API routes through
  if (isApi) return NextResponse.next();

  let isAuthenticated = false;

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    // ── Real Supabase mode ──
    const response = NextResponse.next({ request });

    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();
    isAuthenticated = !!user;

    if (isPublic) {
      if (isAuthenticated && request.nextUrl.pathname === '/login') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
      return response;
    }

    if (!isAuthenticated) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return response;
  } else {
    // ── Local SQLite mode ──
    const token = request.cookies.get(LOCAL_COOKIE)?.value;
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(atob(parts[1]));
          if (payload.exp && payload.exp > Date.now() / 1000) {
            isAuthenticated = true;
          } else if (!payload.exp) {
            isAuthenticated = true;
          }
        } catch {
          isAuthenticated = false;
        }
      }
    }

    if (isPublic) {
      if (isAuthenticated && request.nextUrl.pathname === '/login') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    }

    if (!isAuthenticated) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
