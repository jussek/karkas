import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface OnlineEnvironment { VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string }
export interface OnlineClientConfig { url: string; publishableKey: string }

/**
 * Public browser identifiers for this application. They are intentionally safe
 * to ship to the client: authorization still depends on Supabase Auth + RLS.
 * VITE_* values override these defaults for previews/local environments.
 */
export const DEFAULT_ONLINE_CLIENT_CONFIG: Readonly<OnlineClientConfig> = Object.freeze({
  url: 'https://ovgkpmhcqcjsutlugerw.supabase.co',
  publishableKey: 'sb_publishable_s3fmhiGRh0qNVhxGFPRgBg_NgGosudr',
});

export function readOnlineEnvironment(env: OnlineEnvironment): OnlineClientConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  try { new URL(url); } catch { return null; }
  return { url, publishableKey };
}

export function resolveOnlineClientConfig(env: OnlineEnvironment): OnlineClientConfig | null {
  const configured = readOnlineEnvironment(env);
  if (configured) return configured;

  // If deployment explicitly supplied only one/broken VITE_* value, fail closed
  // instead of silently sending that environment to the production project.
  const hasExplicitOnlineConfig = Boolean(
    env.VITE_SUPABASE_URL?.trim() || env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
  return hasExplicitOnlineConfig ? null : { ...DEFAULT_ONLINE_CLIENT_CONFIG };
}

let singleton: SupabaseClient | null | undefined;
export function getSupabaseClient(env: OnlineEnvironment = import.meta.env as OnlineEnvironment): SupabaseClient | null {
  if (singleton !== undefined) return singleton;
  const config = resolveOnlineClientConfig(env);
  singleton = config ? createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  return singleton;
}
export function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) throw new Error('Online mode is unavailable: Supabase configuration is invalid.');
  return client;
}
export function resetSupabaseClientForTests(): void { singleton = undefined; }
