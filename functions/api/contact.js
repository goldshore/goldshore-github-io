export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData();

    const turnstileSecret = env.TURNSTILE_SECRET;
    const formspreeEndpoint = env.FORMSPREE_ENDPOINT;

    if (!turnstileSecret || !formspreeEndpoint) {
      return new Response(
        JSON.stringify({
          ok: false,
          reason: 'missing_environment',
          missing: {
            turnstile: !turnstileSecret,
            formspree: !formspreeEndpoint
          }
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const token = form.get('cf-turnstile-response');
    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'missing_token' }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
    const ip = request.headers.get('CF-Connecting-IP');
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({
        secret: turnstileSecret,
        response: token,
        remoteip: ip || ''
      })
    }).then((r) => r.json());

    if (!verifyRes.success) {
      return new Response(JSON.stringify({ ok: false, reason: 'turnstile_failed', verifyRes }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }

    const forward = new FormData();
    forward.set('email', form.get('email') || '');
    forward.set('message', form.get('message') || '');
    forward.set('_subject', 'Gold Shore Contact');

    const fsRes = await fetch(formspreeEndpoint, { method: 'POST', body: forward });
    if (!fsRes.ok) {
      const txt = await fsRes.text();
      return new Response(JSON.stringify({ ok: false, reason: 'formspree_error', txt }), {
        status: 502,
        headers: { 'content-type': 'application/json' }
      });
    }

    return Response.redirect('/#contact-success', 303);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
