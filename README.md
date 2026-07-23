# HomeIQ Invest

Platform-independent React/TanStack Start application. Lovable-specific authentication,
build configuration, telemetry and AI gateway code have been removed.

## Local setup

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and enter your Supabase and AI provider values.
3. Install and start:

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Authentication

Email/password and Google login use Supabase directly. Configure Google as an OAuth
provider in Supabase and add these redirect URLs:

- local: `http://localhost:5173/auth`
- production: `https://YOUR-DOMAIN/auth`

## AI provider

Premium estimates call an OpenAI-compatible Chat Completions endpoint from the server.
Configure:

- `AI_API_KEY` — secret server-side key
- `AI_MODEL` — provider model name
- `AI_API_URL` — optional endpoint; defaults to OpenAI

The endpoint must support `response_format.type = json_schema`. API keys must be stored
only in the server/hosting environment, never in `VITE_*` variables.

## Deployment

The app uses TanStack Start and Nitro and can be deployed independently to providers
supporting Node/Nitro applications, including Vercel, Netlify and Cloudflare-compatible
setups. Add the same environment variables in the selected hosting provider.
