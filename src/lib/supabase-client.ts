// Supabase client — uses @supabase/ssr for cookie-based sessions (works with middleware)
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const IS_CLOUD = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let _client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (IS_CLOUD) {
    if (!_client) {
      _client = createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
        cookieOptions: {
          // Session cookie — expires when the browser closes
          maxAge: 0,
        },
        isSingleton: true,
      });
    }
    return _client;
  }

  // Fallback to local mock (dev mode with SQLite only)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createMockClient } = require('./mock-supabase');
  return createMockClient() as any;
}
