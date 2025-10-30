export async function onRequestGet({ env }) {
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'missing_site_key' }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, siteKey }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}
