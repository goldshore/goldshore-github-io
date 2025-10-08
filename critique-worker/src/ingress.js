export default {
  async fetch(req, env) {
    if (req.method !== 'POST') {
      return new Response('OK');
    }

    const { payload, rawBody } = await parseBody(req);
    if (!payload) {
      return new Response('Unsupported', { status: 415 });
    }

    const job = await normalizeInput(payload);

    const sig = req.headers.get('X-Postmark-Signature');
    if (sig) {
      const verified = await verifyPostmarkSignature(sig, rawBody, env.POSTMARK_INBOUND_TOKEN);
      if (!verified) {
        return new Response('Invalid signature', { status: 401 });
      }
    }

    await env.CRITIQUE_QUEUE.send(job);
    return new Response(
      JSON.stringify({ status: 'queued', jobType: job.type }),
      { headers: { 'content-type': 'application/json' } }
    );
  }
};

async function parseBody(req) {
  const contentType = req.headers.get('content-type') || '';
  const rawBody = await req.text();

  if (contentType.includes('application/json')) {
    return { payload: JSON.parse(rawBody || '{}'), rawBody };
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const form = new URLSearchParams(rawBody);
    return { payload: Object.fromEntries(form.entries()), rawBody };
  }

  return { payload: null, rawBody };
}

async function normalizeInput(p) {
  let type = (p.type || guessType(p)).toLowerCase();
  let fromEmail = p.fromEmail || (p.FromFull && p.FromFull.Email) || 'unknown@goldshore.org';
  let target = p.target || parseTargetFromText(p.TextBody || '');
  let notes = p.notes || (p.TextBody || '').slice(0, 2000);
  let attachment = null;

  if (p.Attachments && p.Attachments.length) {
    const csv = p.Attachments.find((a) => /csv$/i.test(a.Name));
    if (csv) {
      attachment = {
        name: csv.Name,
        contentBase64: csv.Content,
        contentType: csv.ContentType
      };
    }
  }

  return { type, fromEmail, target, notes, attachment, requestedAt: Date.now() };
}

function guessType(p) {
  const body = (p.TextBody || '').toLowerCase();
  if (body.includes('portfolio')) return 'portfolio';
  if (body.includes('social')) return 'social';
  return 'website';
}

function parseTargetFromText(text) {
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : '';
}

async function verifyPostmarkSignature(signature, rawBody, secret) {
  if (!secret) return true;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = bufferToBase64(signatureBuffer);
  return expected === signature;
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
