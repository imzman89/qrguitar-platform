export function validateExportEnvironment(env, { development = false, platform = 'all' } = {}) {
  const origin = (env.EXPO_PUBLIC_API_ORIGIN || 'https://www.qrguitar.com').replace(/\/$/, '');
  if (!['https://qrguitar.com', 'https://www.qrguitar.com'].includes(origin)
      && !(development && platform === 'web' && origin === 'http://127.0.0.1:3014')) {
    throw new Error('The export requires an approved QRguitar API origin.');
  }
  const url = env.EXPO_PUBLIC_SUPABASE_URL || '';
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  if (development && !url && !key) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash
        || parsed.pathname !== '/' || !key || key.startsWith('sb_secret_')) throw new Error();
    if (!key.startsWith('sb_publishable_')) {
      const segments = key.split('.');
      if (segments.length !== 3 || JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')).role !== 'anon') throw new Error();
    } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) throw new Error();
  } catch {
    throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and a public publishable key (or legacy anon key) before exporting. Server credentials must never enter a mobile build.');
  }
}
