// Server-side Supabase client
// Uses real Supabase when env vars are set, otherwise falls back to local SQLite mock
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const IS_CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function createServerSupabaseClient() {
  if (IS_CLOUD) {
    const cookieStore = await cookies();
    return createServerClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is called from Server Components — cookies can only be set
            // in Server Actions or Route Handlers. The middleware handles refresh.
          }
        },
      },
    });
  }

  // Fallback: local SQLite mode (dev only)
  const jwt = require('jsonwebtoken');
  const db = require('./local-db');

  const JWT_SECRET = 'la-comitiva-local-dev-secret-2024';
  const COOKIE_NAME = 'lc_session';

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  let currentUser: { id: string; email: string } | null = null;

  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
      currentUser = db.getUserById(payload.sub) || null;
    } catch {
      currentUser = null;
    }
  }

  return {
    auth: {
      async getUser() {
        return { data: { user: currentUser }, error: null };
      },
      async getSession() {
        if (currentUser) {
          return { data: { session: { access_token: 'local', user: currentUser } }, error: null };
        }
        return { data: { session: null }, error: null };
      },
    },
    from(table: string) {
      return new ServerQueryBuilder(table, db);
    },
  } as any;
}

class ServerQueryBuilder {
  private _table: string;
  private _filters: Record<string, unknown> = {};
  private _single = false;
  private db: any;

  constructor(table: string, db: any) { this._table = table; this.db = db; }

  select(_columns?: string, _opts?: any) { return this; }
  eq(col: string, val: unknown) { this._filters[col] = val; return this; }
  order(_col: string, _opts?: any) { return this; }

  single<T = any>(): Promise<{ data: T | null; error: any }> {
    this._single = true;
    return this._execute() as any;
  }

  then(onfulfilled?: any, onrejected?: any) {
    return this._execute().then(onfulfilled, onrejected);
  }

  private async _execute() {
    if (this._table === 'profiles') {
      if (this._filters.id) {
        const profile = this.db.getProfileById(this._filters.id as string);
        return { data: profile || null, error: null };
      }
      const all = this.db.getAllProfiles();
      return { data: all.map((p: any) => ({ ...p, area: p.area_name ? { name: p.area_name } : null })), error: null };
    }

    if (this._table === 'areas') {
      return { data: this.db.getAllAreas(), error: null };
    }

    if (this._table === 'inventory_items') {
      if (this._filters.id) {
        return { data: this.db.getInventoryItemById(this._filters.id as string), error: null };
      }
      const result = this.db.getInventoryItems({});
      return { data: result.data, error: null };
    }

    return { data: null, error: null };
  }
}
