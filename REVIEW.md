# GoldShore Repository Review

## Summary
This review captures the most critical issues discovered while inspecting the GoldShore codebase. Each finding includes reproduction details and remediation guidance.

## Findings

### 1. Worker CORS responses always echo the site origin
- **Location:** `apps/api-worker/src/index.ts`
- **Problem:** `buildCorsHeaders` sets `access-control-allow-origin` to ``${url.protocol}//${url.host}``, i.e. the Worker host. For cross-origin callers (for example, an app served from `https://app.goldshore.io` hitting the Worker on `https://goldshore.org`), the preflight response will advertise `https://goldshore.org` instead of the caller's `Origin` request header. Browsers reject the request because the header no longer matches the requesting origin.
- **Impact:** Any frontend hosted on a different origin cannot talk to the Worker—fetch/XHR requests will fail with a CORS error even though the proxy succeeds server-side.
- **Recommendation:** Read the `Origin` header from the inbound request, validate it against an allowlist, and mirror that value in `access-control-allow-origin`. Also ensure the response adds `Vary: Origin` so caches keep variants separate.

### 2. Image optimisation pipeline is reused after being consumed
- **Location:** `packages/image-tools/process-images.mjs`
- **Problem:** The script creates a Sharp pipeline and calls `await pipeline.webp(...).toFile(...)` followed by `await pipeline.avif(...).toFile(...)` on the same pipeline instance. After Sharp renders the first output the pipeline input is consumed; the second call therefore fails with `Error: Input buffer has already been consumed` when the script processes multiple assets.
- **Impact:** The optimisation script cannot reliably produce both WebP and AVIF variants, preventing the asset build from completing.
- **Recommendation:** Clone the pipeline before each format-specific operation, e.g. `await pipeline.clone().webp(...)` and `await pipeline.clone().avif(...)`, or instantiate two separate Sharp pipelines from the source file.

