import { requireSupabaseClient } from './supabaseClient';

export async function ensureOnlineIdentity(): Promise<string> {
  const client = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (sessionData.session?.user.id) return sessionData.session.user.id;
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user?.id) throw new Error('Anonymous authentication did not return a user.');
  return data.user.id;
}
