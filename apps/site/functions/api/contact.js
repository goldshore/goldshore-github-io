export async function onRequestPost({ request, env }) {
  try {
    const form = await request.formData();

    const turnstileSecret = env.TURNSTILE_SECRET;
    const formspreeEndpoint = env.FORMSPREE_ENDPOINT;

    if (!turnstileSecret || !formspreeEndpoint) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'missing_environment', missing: { turnstile: !turnstileSecret, formspree: !formspreeEndpoint } }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    const token = form.get('cf-turnstile-response');
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
    const email = form.get('email') || '';
    const message = form.get('message') || '';
    const name = form.get('name') || '';
    const focus = form.get('focus') || '';

    forward.set('email', email);
    forward.set('message', message);
    if (name) forward.set('name', name);
    if (focus) forward.set('focus', focus);
    forward.set('_subject', 'Gold Shore Contact');

    const fsRes = await fetch(formspreeEndpoint, { method: 'POST', body: forward });
    if (!fsRes.ok) {
      const txt = await fsRes.text();
      return new Response(JSON.stringify({ ok: false, reason: 'formspree_error', txt }), {
        status: 502,
        headers: { 'content-type': 'application/json' }
      });
    }

    const redirectRaw = form.get('_redirect');
    let redirect = '/#contact-success';

    if (typeof redirectRaw === 'string') {
      const redirectCandidate = redirectRaw.trim();

      if (redirectCandidate) {
        try {
          const requestUrl = new URL(request.url);
          const redirectUrl = new URL(redirectCandidate, requestUrl);

          if (
            redirectUrl.origin === requestUrl.origin &&
            redirectUrl.pathname.startsWith('/') &&
            !redirectCandidate.startsWith('//')
          ) {
            redirect = `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}` || '/';
          }
        } catch (_) {
          // fall back to default redirect
        }
      }
    }

    return Response.redirect(redirect, 303);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
