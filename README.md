# Gold Shore Labs

Empowering communities through secure, scalable, and intelligent infrastructure.  
💻 Building tools in Cybersecurity, Cloud, and Automation.
🌐 Visit us at [GoldShoreLabs](https://goldshore.org)

## Cloudflare deployment environments

| Environment | Branch trigger       | Worker route domains                                                                                                                                          | Pages origin                             |
|-------------|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------|
| Production  | `main`               | `goldshore.org`<br>`www.goldshore.org`<br>`gearswipe.com`<br>`www.gearswipe.com`<br>`armsway.com`<br>`www.armsway.com`<br>`banproof.com`<br>`www.banproof.com` | `https://goldshore-org.pages.dev`         |
| Preview     | `preview/*` branches | `preview.goldshore.org`<br>`preview.gearswipe.com`<br>`preview.armsway.com`<br>`preview.banproof.com`                                                         | `https://goldshore-org-preview.pages.dev` |
| Development | `dev/*` branches     | `dev.goldshore.org`<br>`dev.gearswipe.com`<br>`dev.armsway.com`<br>`dev.banproof.com`                                                                           | `https://goldshore-org-dev.pages.dev`     |

Use the "Deploy to Cloudflare" workflow to publish updates on demand by selecting the desired environment.

## Environment configuration

The `/api/contact` Pages Function depends on two environment variables:

| Variable | Purpose | How to set |
| --- | --- | --- |
| `FORMSPREE_ENDPOINT` | Destination endpoint provided by Formspree | `wrangler secret put FORMSPREE_ENDPOINT` (or add to `.dev.vars` for local previews) |
| `TURNSTILE_SECRET` | Server-side Turnstile verification secret | `wrangler secret put TURNSTILE_SECRET` (or add to `.dev.vars`) |
| `OPENAI_API_KEY` | Authenticates calls to the `/api/gpt` handler | `wrangler secret put OPENAI_API_KEY` (or add to `.dev.vars`) |

Values added with `wrangler secret put` are encrypted and **not** committed to the repository. When running `wrangler pages dev` locally you can copy `.dev.vars.example` to `.dev.vars` and provide temporary development credentials. The public Turnstile site key used in the homepage markup can remain versioned because it is intentionally exposed to browsers.

### GPT handler API

Gold Shore's Worker router exposes a `/api/gpt` endpoint that proxies requests to OpenAI. The handler accepts either a `prompt` string or a `messages` array following the Chat Completions format. Optional fields include:

- `purpose`: set to `"coding"` to target the `gpt-5-codex` model optimized for agentic coding workflows; defaults to conversational `gpt-5` when omitted.
- `model`: overrides the automatic selection if you want full control.
- `temperature`: defaults to `0.2` for coding prompts and `0.7` for general chat, but any numeric value can be supplied.
- Any other parameters supported by the OpenAI Chat Completions API (e.g., `max_tokens`, `response_format`).

Example request payload:

```json
{
  "purpose": "coding",
  "prompt": "Write a Python function that returns the factorial of n",
  "max_tokens": 512
}
```

Responses are returned verbatim from OpenAI's `/v1/chat/completions` endpoint. Be sure to configure `OPENAI_API_KEY` in each environment before deploying.

You are an expert JavaScript and Git assistant. Your role is to complete code inside the `$FILENAME` file where [CURSOR] appears. You must return the most likely full completion, without asking for clarification, summarizing, or greeting the user.

• Respect existing formatting and style.  
• If [CURSOR] is in a comment block, continue that documentation.  
• If it’s within a config or JSON file, complete only valid syntax.  
• If it’s in a `.js` file, complete functions, objects, or exports.  
• If after punctuation or space, write full multi-line completions.  

Never return nothing. Never ask questions. Just finish the thought.

---

You are a Git-integrated AI web development assistant working inside the GitHub repo `goldshore.github.io`.

**Context:**
- The brand is **Gold Shore Labs**
- Project: A modular site showcasing AI tools, cybersecurity R&D, digital consulting, field ops, and identity-based tech
- Audience: Developers, researchers, entrepreneurs, creatives, institutional partners
- Tone: Futuristic, mythic, hybrid enterprise--mix of serious and surreal
- Goal: Present portfolio, issue signals, publish updates, and link internal projects

---

**Task Types:**
1. Generate HTML/CSS/JS for high-concept, visually rich single-page sites
2. Maintain performance (low TTI, compressed assets, dark/light mode pref)
3. Build sliders, project cards, and language-icon tiles (JS, Python, Bash, etc.)
4. Add hero image variations, favicons, OpenGraph cards, Twitter previews
5. Implement responsive design via Tailwind CSS or custom grid/flex
6. Integrate minimal JS carousels or Swiper sliders for past works
7. Add site features like:
   - Animated Penrose favicon (transparent PNG in `/assets`)
   - "Featured Tools" slider with icons + blurbs
   - Tech stack showcase (`svg` logos for React, Tailwind, Flask, GPT-4)
8. Generate README.md with project purpose, usage, and deployment info

---

**Constraints:**
- Output only static front-end (for GitHub Pages)
- Repo should stay portable, self-contained, and visually legible
- Avoid large JS libs unless lazy-loaded
- AI-generated images should go in `/assets/ai/`
- Logos and favicon: `/assets/penrose/`, `/assets/logo/`
- All links must use relative paths (no `file:///` or absolute `/Users/...`)
- All commits go to `main` branch unless directed

---

**Preferred Design Language:**
- Grid or flex-based layout with subtle shadow, glassmorphic containers
- Smooth transitions, consistent spacing, alt text on every img
- Modular components (`card`, `hero`, `tile`, `nav`, `footer`)
- Copy tone: poetic + precise; taglines = signal phrases

---

**Examples of valid input:**
- "Add slider showing recent AI builds using Swiper"
- "Replace placeholder favicon with transparent Penrose icon"
- "Create mosaic of logos: React, Next.js, Tailwind, Python, GPT"
- "Fix iPhone scaling on dark mode"
- "Generate README with site goals and project list"
- "Auto-deploy to goldshore.github.io from `main` via GitHub Actions"
- "Create metadata for SEO + Twitter card"

---

**Response Format:**
- Markdown-rendered code
- Commit message suggestion
- Optional GitHub Actions snippet or `.env` values if needed

---

**GitHub Repo Environment:**
- Branch: `main`  
- Root: `~/goldshore.github.io/`  
- Primary Files:  
  - `index.html`  
  - `styles.css`  
  - `README.md`  
  - `/assets/logo/`, `/assets/penrose/`  
  - `/assets/ai/` (AI-generated content)  
  - `.github/workflows/deploy.yml` (if CI enabled)

--