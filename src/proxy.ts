import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const LOCAL_COOKIE = 'lc_session';

export async function proxy(request: NextRequest) {
  const publicPaths = ['/login', '/reset-password'];
  const isPublic = publicPaths.includes(request.nextUrl.pathname);
  const isApi = request.nextUrl.pathname.startsWith('/api/');

  if (isApi) return NextResponse.next();

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
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

    // Use getSession() instead of getUser() — local JWT check, no network call
    const { data: { session } } = await supabase.auth.getSession();
    const isAuthenticated = !!session;

    if (isPublic) {
      // Don't redirect away from login even if authenticated — let the page handle it
      return response;
    }

    if (!isAuthenticated) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    return response;
  } else {
    // Local SQLite fallback
    const token = request.cookies.get(LOCAL_COOKIE)?.value;
    let isAuthenticated = false;
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(atob(parts[1]));
          isAuthenticated = !payload.exp || payload.exp > Date.now() / 1000;
        } catch {
          isAuthenticated = false;
        }
      }
    }

    if (isPublic) return NextResponse.next();

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
