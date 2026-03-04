# Email Marketing Factory — AI Factory framework

This app is the **Email Marketing Factory** inside the AI Factory repo. It was copied in full from the source (CULTURA-AI) and runs at `/email-marketing` via the Console proxy.

## Quick start under AI Factory

1. **Env:** Copy `.env.example` to `.env`. For same-origin under Console:
   - `BASEPATH=/email-marketing`
   - Use same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as the Console (same Supabase project).
2. **Run:** `pnpm install && pnpm dev` (app listens on port 3002).
3. **Console:** In `console/.env.local` set `NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN=http://localhost:3002`. Restart the Console; open "Email Marketing" in the nav → same origin `/email-marketing`.

See **`docs/EMAIL_MARKETING_FACTORY_INTEGRATION.md`** in the repo root for full integration and schema mapping.
