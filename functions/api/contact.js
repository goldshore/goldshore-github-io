const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: JSON_HEADERS
  });
}

async function verifyTurnstile(token, secret, ip) {
  const tokenStr = typeof token === 'string' ? token : '';
  const secretStr = typeof secret === 'string' ? secret : '';

  const usingTestCredentials = secretStr.startsWith('1x') && tokenStr.startsWith('1x');
  if (usingTestCredentials) {
    return { success: true, mode: 'test' };
  }

  const params = new URLSearchParams({
    secret: secretStr,
    response: tokenStr,
    remoteip: ip || ''
  });

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: params
  });

  if (!response.ok) {
    throw new Error(`turnstile_verify_http_${response.status}`);
  }

  return response.json();
}

export async function onRequestPost({ request, env }) {
  try {
    const turnstileSecret = env.TURNSTILE_SECRET;
    const formspreeEndpoint = env.FORMSPREE_ENDPOINT;

    if (!turnstileSecret || !formspreeEndpoint) {
      return jsonResponse(
        {
          ok: false,
          reason: 'missing_environment',
          missing: {
            turnstile: !turnstileSecret,
            formspree: !formspreeEndpoint
          }
        },
        { status: 500 }
      );
    }

    const form = await request.formData();

    const email = (form.get('email') || '').toString().trim();
    const message = (form.get('message') || '').toString().trim();
    const token = (form.get('cf-turnstile-response') || '').toString();

    if (!token) {
      return jsonResponse({ ok: false, reason: 'missing_token' }, { status: 400 });
    }

    if (!email || !message) {
      return jsonResponse({ ok: false, reason: 'missing_fields' }, { status: 400 });
    }

    const verifyRes = await verifyTurnstile(
      token,
      turnstileSecret,
      request.headers.get('CF-Connecting-IP')
    );

    if (!verifyRes.success) {
      return jsonResponse({ ok: false, reason: 'turnstile_failed', verifyRes }, { status: 400 });
    }

    if (!formspreeEndpoint.startsWith('mock:')) {
      const forward = new FormData();
      forward.set('email', email);
      forward.set('message', message);
      forward.set('_subject', 'Gold Shore Contact');

      const fsRes = await fetch(formspreeEndpoint, {
        method: 'POST',
        body: forward
      });

      if (!fsRes.ok) {
        const txt = await fsRes.text();
        return jsonResponse({ ok: false, reason: 'formspree_error', txt }, { status: 502 });
      }
    }

    return new Response(null, {
      status: 303,
      headers: { Location: '/#contact-success' }
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) }, { status: 500 });
  }
}
