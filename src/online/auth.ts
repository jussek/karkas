import { requireSupabaseClient } from './supabaseClient';

let validatedUserId: string | null = null;
let identityInFlight: Promise<string> | null = null;

function messageOf(reason: unknown): string {
  return reason && typeof reason === 'object' && 'message' in reason
    ? String((reason as { message?: unknown }).message ?? '').toLowerCase()
    : '';
}

function statusOf(reason: unknown): number | null {
  if (!reason || typeof reason !== 'object' || !('status' in reason)) return null;
  const value = Number((reason as { status?: unknown }).status);
  return Number.isFinite(value) ? value : null;
}

function isStaleSessionError(reason: unknown): boolean {
  const status = statusOf(reason);
  const message = messageOf(reason);
  return status === 401
    || status === 403
    || message.includes('invalid refresh token')
    || message.includes('refresh token not found')
    || message.includes('jwt expired')
    || message.includes('auth session missing')
    || message.includes('session from session_id claim');
}

async function resolveOnlineIdentity(): Promise<string> {
  const client = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError && !isStaleSessionError(sessionError)) throw sessionError;

  if (sessionData.session?.user.id && !sessionError) {
    // getSession is storage-backed; validate once against Auth before trusting a
    // persisted mobile session. This recovers cleanly from stale refresh tokens.
    const { data: userData, error: userError } = await client.auth.getUser();
    if (!userError && userData.user?.id) return userData.user.id;
    if (userError && !isStaleSessionError(userError)) throw userError;
  }

  if (sessionError || sessionData.session) {
    // Never revoke another device: only discard this browser's broken session.
    await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user?.id) throw new Error('Anonymous authentication did not return a user.');
  return data.user.id;
}

export async function ensureOnlineIdentity(): Promise<string> {
  if (validatedUserId) return validatedUserId;
  if (identityInFlight) return identityInFlight;

  identityInFlight = resolveOnlineIdentity()
    .then((userId) => {
      validatedUserId = userId;
      return userId;
    })
    .finally(() => {
      identityInFlight = null;
    });

  return identityInFlight;
}
