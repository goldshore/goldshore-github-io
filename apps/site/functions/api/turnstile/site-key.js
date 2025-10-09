export const onRequestGet = async ({ env }) => {
  const siteKey = env?.PUBLIC_TURNSTILE_SITE_KEY;

  return new Response(
    JSON.stringify({ siteKey: siteKey ?? null }),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
};
