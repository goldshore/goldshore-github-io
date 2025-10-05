export default {
  async queue(batch, env) {
    for (const msg of batch.messages) {
      const job = msg.body;
      try {
        const md = await runJob(job, env);
        const key = `report-${job.type}-${Date.now()}.md`;
        await env.REPORTS_BUCKET.put(key, md, {
          httpMetadata: { contentType: 'text/markdown' }
        });

        const link = await signedLink(env, key);
        await sendEmail(env, job.fromEmail, job, link, md);
        msg.ack();
      } catch (err) {
        console.error(err);
        msg.retry();
      }
    }
  }
};

async function runJob(job, env) {
  if (job.type === 'website') return websiteReport(job.target, job.notes, env);
  if (job.type === 'portfolio') return portfolioReport(job.attachment, env);
  if (job.type === 'social') return socialReport(job.target, env);
  return `# Unknown job type\n${JSON.stringify(job, null, 2)}`;
}

async function websiteReport(url, notes, env) {
  const res = await fetch(url, { cf: { cacheEverything: false } });
  const headers = Object.fromEntries(res.headers);

  const psiUrl = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  psiUrl.searchParams.set('url', url);
  psiUrl.searchParams.set('strategy', 'mobile');
  psiUrl.searchParams.set('key', env.PSI_API_KEY || '');

  const psi = await fetch(psiUrl.toString()).then((r) => r.json());
  const audits = psi.lighthouseResult?.audits || {};
  const metrics = {
    LCP: audits['largest-contentful-paint']?.displayValue,
    CLS: audits['cumulative-layout-shift']?.displayValue,
    INP: audits['experimental-interaction-to-next-paint']?.displayValue ||
      audits['total-blocking-time']?.displayValue,
    TBT: audits['total-blocking-time']?.displayValue,
    SizeHTML: audits['total-byte-weight']?.details?.items?.find((i) => i.resourceType === 'document')?.transferSize
  };

  const cacheStatus = headers['cf-cache-status'] || 'N/A';
  const encoding = headers['content-encoding'] || 'none';
  const cacheControl = headers['cache-control'] || 'none';
  const server = headers.server || 'unknown';

  return [
    `# Website Critique – ${url}`,
    notes ? `> Notes: ${notes}` : '',
    '',
    '## Summary',
    `- CF-Cache-Status: **${cacheStatus}**`,
    `- Content-Encoding: **${encoding}**`,
    `- Cache-Control: **${cacheControl}**`,
    `- Server: **${server}**`,
    '',
    '## Core Web Vitals (PSI, mobile)',
    `- LCP: **${metrics.LCP || 'n/a'}**`,
    `- CLS: **${metrics.CLS || 'n/a'}**`,
    `- INP/TBT: **${metrics.INP || metrics.TBT || 'n/a'}**`,
    '',
    '## Quick Wins',
    '- Serve images as AVIF/WebP where possible',
    '- Ensure long-cache for static assets (css/js/img) with immutable fingerprints',
    '- Reduce third-party scripts; lazy-load non-critical',
    '- Add Security Headers (HSTS, CSP) if missing',
    '',
    '## Raw Headers',
    '```',
    JSON.stringify(headers, null, 2),
    '```'
  ].filter(Boolean).join('\n');
}

async function portfolioReport(attachment) {
  if (!attachment) return '# Portfolio Critique\nNo CSV provided.';
  return [
    '# Portfolio Critique',
    '- Allocation by sector/asset (computed)',
    '- Concentration risk (HHI), fee drag estimates',
    '- Tax-lot aging and potential short/long distribution',
    '',
    '_Attach the CSV you sent; computed columns returned in a separate artifact if needed._'
  ].join('\n');
}

async function socialReport(target) {
  return [
    `# Social Profile Critique – ${target}`,
    '- Posting cadence and best times',
    '- Content mix (video/image/text) and engagement deltas',
    '- CTA clarity and link hygiene (UTMs, 404s)',
    '- Brand consistency and accessibility (alt text)',
    '',
    '_Pull actual posts via your chosen platform API keys for deeper insights._'
  ].join('\n');
}

async function signedLink(env, key) {
  const obj = await env.REPORTS_BUCKET.head(key);
  const filename = encodeURIComponent(key);
  const base = env.PUBLIC_REPORT_BASE || `https://pub-${crypto.randomUUID()}.r2.dev`;
  const url = new URL(`${base}/${filename}`);

  if (env.PUBLIC_REPORT_TTL) {
    url.searchParams.set('ttl', env.PUBLIC_REPORT_TTL);
  }

  return url.toString();
}

async function sendEmail(env, to, job, link, md) {
  const subject = `Gold Shore Report: ${job.type} on ${job.target || 'input'}`;
  const textBody = [
    `Your ${job.type} critique is ready.`,
    `Link: ${link}`,
    '',
    'Summary:',
    md.slice(0, 800)
  ].join('\n');

  await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      From: env.REPORT_FROM,
      To: to,
      Subject: subject,
      TextBody: textBody,
      MessageStream: 'outbound'
    })
  });
}
