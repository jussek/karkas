import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface OnlineEnvironment { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }
export function readOnlineEnvironment(env: OnlineEnvironment): { url: string; publishableKey: string } | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  try { new URL(url); } catch { return null; }
  return { url, publishableKey };
}

let singleton: SupabaseClient | null | undefined;
export function getSupabaseClient(env: OnlineEnvironment = import.meta.env as OnlineEnvironment): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  const config = readOnlineEnvironment(env);
  singleton = config ? createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  return singleton;
}
export function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error('Online mode is unavailable: Supabase configuration is missing.');
  return client;
}
export function resetSupabaseClientForTests(): void { singleton = undefined; }
