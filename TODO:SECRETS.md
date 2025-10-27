# TODO: Secrets

The following secrets need to be configured for the application to run correctly.

- `GS_DRIVE_FOLDER_ID`: The ID of the Google Drive folder to sync with `/packages/refs`.
- `GOOGLE_APPLICATION_CREDENTIALS`: The path to the Google Cloud service account credentials file.
- `OPENAI_API_KEY`: Authorizes the Worker when calling OpenAI's Responses API.
- `GPT_SHARED_SECRET`: Bearer token browsers must send when requesting `/api/gpt`.
- `GPT_ALLOWED_ORIGINS`: Comma-separated origins that receive permissive CORS headers.
- `CF_ACCESS_AUD` / `CF_ACCESS_ISS` / `CF_ACCESS_JWKS_URL` (optional): Lock API access behind Cloudflare Zero Trust when required.
- `FORMSPREE_ENDPOINT`: Submission URL for the contact form backend.
- `TURNSTILE_SECRET`: Server-side secret for Cloudflare Turnstile verification.
- `CF_API_TOKEN`: Cloudflare API token for deploying workers.
- `CF_ACCOUNT_ID`: Cloudflare account ID.
