// Supabase client — uses real Supabase when env vars are set, otherwise falls back to local mock
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Detect if running in cloud mode (Vercel / production)
const IS_CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let _client: ReturnType<typeof createSupabaseClient> | null = null;

export function createClient() {
  if (IS_CLOUD) {
    // Real Supabase
    if (!_client) {
      _client = createSupabaseClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
        auth: {
          persistSession: typeof window !== 'undefined',
          autoRefreshToken: true,
        },
      });
    }
    return _client;
  }

  // Fallback to local mock (local dev mode with SQLite only)
  // This code path is never reached on Vercel since env vars are always set
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMockClient } = require('./mock-supabase');
  return createMockClient() as any;
}
