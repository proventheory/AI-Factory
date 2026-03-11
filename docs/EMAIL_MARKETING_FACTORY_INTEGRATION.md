# Email Marketing Factory Integration

The **Email Marketing Factory** is the full app (source: [CULTURA-AI](https://github.com/cultura-company/CULTURA-AI)) **copied into this repo** and adapted to fit the AI Factory framework. There is no external link: the app lives in `email-marketing-factory/` and is served at `/email-marketing` on the same origin (Console proxies to it).

---

## 1. Copy the entire app into the repo

Run once from repo root:

```bash
./scripts/clone-email-marketing-factory.sh
```

This clones the source repo into **`email-marketing-factory/`**. The full app (Next.js, Prisma, Easy Email, MUI, etc.) is then part of this repo. Do **not** link out to a separate deployment; the code is here.

---

## 2. Changes to fit our framework

After copying, apply these changes **inside `email-marketing-factory/`** so it fits the AI Factory framework.

### 2.1 Base path (same-origin under Console)

The Console serves the Email Marketing Factory at `/email-marketing` by proxying. The app must run with that base path.

- In **`email-marketing-factory/next.config.mjs`** (or `next.config.js`), set:

```js
const nextConfig = {
  basePath: '/email-marketing',
  // ... rest of config
};
```

- Use **`assetPrefix: '/email-marketing'** if you have static assets that need to resolve correctly when served under the proxy.

### 2.2 Auth: same Supabase project

- Use the **same Supabase project** as the Console (same `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- In **`email-marketing-factory/.env`** (or `.env.local`), set:
  - `NEXT_PUBLIC_SUPABASE_URL` = same as Console
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = same as Console  
  So sessions and RBAC align with the rest of the framework.

### 2.3 Env and Control Plane (optional)

- If the Email Marketing Factory should call the Control Plane API (e.g. to create initiatives for campaigns or record runs):
  - Add **`NEXT_PUBLIC_CONTROL_PLANE_API`** (e.g. `http://localhost:3001`) to `email-marketing-factory/.env`.
- Prefer reading **env from the same `.env` pattern** as the Console (see `console/.env.example`).

### 2.4 Port

- Run the Email Marketing Factory on a **fixed port** (e.g. **3002**) so the Console can proxy to it:
  - In **`email-marketing-factory/package.json`**: `"dev": "next dev -p 3002"` (or set in `.env` as `PORT=3002`).

### 2.5 Console proxy (already done in framework)

- **Console** `next.config.js` rewrites `/email-marketing` and `/email-marketing/:path*` to `NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN` (e.g. `http://localhost:3002`).
- Set **`NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN=http://localhost:3002`** in **`console/.env.local`** so the Console dev server proxies to the Email Marketing Factory. No external link: the user stays on the same origin and the nav item "Email Marketing" goes to `/email-marketing`.

### 2.6 Schema alignment (AI Factory)

- Campaigns can map to **initiatives** with **`intent_type = 'email_design_generator'`** (Console: **Email Design Generator**).
- Email templates can be stored as **artifacts** with **`artifact_class = 'email_template'`**.
- Campaign-level fields: **`email_design_generator_metadata`** table (see `supabase/migrations/20250303000004_email_marketing_factory.sql` and `20250318000000_rename_email_campaign_metadata_to_email_design_generator.sql`). Optionally wire the Email Marketing Factory to read/write this table when using the shared DB.

---

## 3. Repo layout (after copy)

```
AI Factory (repo root)
├── control-plane/
├── runners/
├── console/                         # ProfessorX; nav includes "Email Design Generator" → /email-marketing
├── email-marketing-factory/          # Full copied app (after clone); apply framework changes above
│   ├── src/
│   ├── next.config.mjs              # basePath: '/email-marketing', port 3002
│   ├── .env                         # Same Supabase + optional CONTROL_PLANE_API
│   └── ...
├── docs/
│   └── EMAIL_MARKETING_FACTORY_INTEGRATION.md
├── scripts/
│   └── clone-email-marketing-factory.sh
└── supabase/migrations/
    ├── 20250303000004_email_marketing_factory.sql   # creates table (renamed by 20250318), artifact_class
    └── 20250318000000_rename_email_campaign_metadata_to_email_design_generator.sql   # email_design_generator_metadata
```

---

## 4. Running

1. **Control Plane:** `npm run start:control-plane` (e.g. 3001).
2. **Console:** `cd console && npm run dev` (3000). Set `NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN=http://localhost:3002` in `console/.env.local` so `/email-marketing` proxies.
3. **Email Marketing Factory:** `cd email-marketing-factory && pnpm install && pnpm dev` (3002, with `basePath: '/email-marketing'`).

Clicking **Email Marketing** in the Console opens `/email-marketing` on the same origin; the Console proxies to the copied app. No external link.

---

## 5. Mapping: Email Marketing Factory ↔ AI Factory

| Email Marketing Factory | AI Factory |
|-------------------------|------------|
| Campaign / flow | **Initiative** (`intent_type = 'email_design_generator'`) |
| Email template | **Artifact** (`artifact_class = 'email_template'`) |
| Send / dispatch | **Run** or job_run |
| Approvals | **Approvals** table + Console Approvals page |
| Campaign metadata | **email_design_generator_metadata** table |

---

## 6. Naming: design generator vs campaign (sent)

- **email_design_generator** — Intent type for initiatives that create an email *design* in the Console (**Email Design Generator**). This is the generator flow: brand → template → generate. Stored as `initiatives.intent_type = 'email_design_generator'`.
- **email_campaign** — Do not use as an `intent_type`. Sent campaigns are implemented by the **Klaviyo operator pack**: push design artifacts to Klaviyo as templates and campaigns (Console → Klaviyo, or POST /v1/klaviyo/campaigns/push). See [KLAVIYO_OPERATOR_PACK.md](KLAVIYO_OPERATOR_PACK.md).

The table **`email_design_generator_metadata`** holds metadata for the *design* initiative (subject, from, template ref). The API is **`/v1/email_designs`**. Sent campaigns use **`klaviyo_template_sync`**, **`klaviyo_sent_campaigns`**, and related Klaviyo API/Console flows.

## 7. API (Control Plane)

The Control Plane exposes **`/v1/email_designs`** for initiatives with **`intent_type = 'email_design_generator'`** (Console: **Email Design Generator**).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/email_designs` | List initiatives where `intent_type = 'email_design_generator'` (optional `campaign_kind=landing_page`) |
| GET | `/v1/email_designs/:id` | Single email design (initiative + metadata) |
| POST | `/v1/email_designs` | Create initiative with `intent_type = 'email_design_generator'` and a row in `email_design_generator_metadata` |
| PATCH | `/v1/email_designs/:id` | Update email design metadata |

---

## 8. References

- **Naming (design vs campaign):** `docs/EMAIL_DESIGN_VS_CAMPAIGN.md` — why we use `email_design_generator` and reserve *email campaign* for future sent campaigns (Klaviyo, etc.).
- Source repo: https://github.com/cultura-company/CULTURA-AI  
- AI Factory stack: `docs/STACK_AND_DECISIONS.md`  
- Schema: `schemas/001_core_schema.sql` (initiatives, artifacts, email_design_generator_metadata), `supabase/migrations/20250303000004_email_marketing_factory.sql`, `20250318000000_rename_email_campaign_metadata_to_email_design_generator.sql`
