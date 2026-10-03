import { DEFAULT_ONLINE_CLIENT_CONFIG, resolveOnlineClientConfig } from '../supabaseClient';

describe('production browser Supabase configuration', () => {
  it('has a public production fallback when Vercel does not inject VITE variables', () => {
    expect(resolveOnlineClientConfig({})).toEqual(DEFAULT_ONLINE_CLIENT_CONFIG);
    expect(DEFAULT_ONLINE_CLIENT_CONFIG.url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/);
    expect(DEFAULT_ONLINE_CLIENT_CONFIG.publishableKey).toMatch(/^sb_publishable_/);
    expect(DEFAULT_ONLINE_CLIENT_CONFIG.publishableKey).not.toContain('service_role');
  });

  it('prefers a complete explicit environment', () => {
    expect(resolveOnlineClientConfig({
      VITE_SUPABASE_URL: 'https://preview.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview',
    })).toEqual({
      url: 'https://preview.supabase.co',
      publishableKey: 'sb_publishable_preview',
    });
  });

  it('fails closed for partial or malformed explicit configuration', () => {
    expect(resolveOnlineClientConfig({ VITE_SUPABASE_URL: 'https://preview.supabase.co' })).toBeNull();
    expect(resolveOnlineClientConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview' })).toBeNull();
    expect(resolveOnlineClientConfig({
      VITE_SUPABASE_URL: 'not-a-url',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_preview',
    })).toBeNull();
  });
});
