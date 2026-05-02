/**
 * Auth users created via /api/users use a synthetic email ending in @lacomitiva.local.
 * Legacy or manually created users may use a real email as auth.users.email.
 */

export function isSyntheticLacomitivaEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().endsWith('@lacomitiva.local');
}

/** Map login identifier to Supabase Auth email (synthetic domain for plain usernames). */
export function toAuthEmail(username: string): string {
  if (username.includes('@')) return username;
  return `${username.toLowerCase().replace(/\s+/g, '')}@lacomitiva.local`;
}

/** Whether PATCH username should also update auth.users.email. */
export function shouldSyncAuthEmailForLoginUpdate(
  currentAuthEmail: string | null | undefined,
  newLoginValue: string,
): boolean {
  const trimmed = newLoginValue.trim();
  if (!trimmed) return false;
  return isSyntheticLacomitivaEmail(currentAuthEmail) || trimmed.includes('@');
}
