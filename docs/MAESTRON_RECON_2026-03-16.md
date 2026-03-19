# Maestron (control.maestron.io) – Recon summary

**Date:** 2026-03-16  
**Scope:** Public surface only. **No auth bypass, injection, or brute force** was applied. Use to align AI Factory / ProfessorX and to fix weaknesses once you regain access.

---

## 1. Hosting & stack (from headers and HTML)

| Item | Value |
|------|--------|
| **Host** | control.maestron.io |
| **Frontend** | Next.js (App Router), deployed on **Vercel** |
| **Vercel** | `server: Vercel`, `x-vercel-id`, deploy ID in asset URLs: `dpl=dpl_CvPMKw1BF9A7WARYCDDqeVQ54ov9` |
| **Sentry** | Client-side; `sentry-environment=production`, `sentry-release=eabd17f08244d6c49778fea49e30ae364cce2eea`, `sentry-public_key=1f9e9fa305d1855214e02069e3157603`, `sentry-org_id=1281800` |
| **UI** | React, Tailwind, **Lucide** icons, **nuqs** (URL state), layout components: NavShell, ClientLayout, ModalProvider, QueryProvider, Toaster |

---

## 2. Routing & navigation (from HTML/RSC)

- **Root:** `GET /` → **307** → `/login`
- **Auth:** `/login` (Sign In / Sign Up / Magic Link, email/password, Google)
- **App layout:** `(main)` with sidebar

**Nav sections (labels in DOM):**

- **Operations** (active by default) → Dashboard subsection:
  - `/dashboard` – Overview
  - `/planner` – Planner
  - `/monitoring/scheduler` – Scheduler Health
- **Commerce**
- **Studio**
- **Data & Schema**
- **System**
- **Builder Studio**
- **Costs & Monitoring** (section, links not in initial HTML)

**Notable route:**

- **`/api/health`** – Returns **200** and serves the **Next.js app’s Health page** (breadcrumb: Home → Api → Health), not a JSON backend. So the “API” area is a UI section under the app route `(main)/api/...`.

---

## 3. Public path survey (no auth)

| Path | HTTP | Notes |
|------|------|--------|
| `/` | 307 → /login | Redirect to login |
| `/login` | 200 | Login page (same SPA shell) |
| `/signin`, `/signup` | 200 | Same SPA shell |
| `/health` | 307 | Redirect (likely to login) |
| `/api/health` | 200 | **Next.js page** (Health UI), not backend JSON |
| `/v1/health` | 200 | SPA shell (no dedicated backend exposed here) |
| `/robots.txt` | 200 | SPA shell (no real robots.txt) |
| `/sitemap.xml` | 200 | SPA shell |
| `/.well-known/security.txt` | 200 | SPA shell |
| `/_next/static/...` | 404 (tested webpack.js) | Assets are hashed (e.g. webpack-b30bd007c0c95587.js) |

So: **no unauthenticated JSON API or health endpoint** was found on this host. Any backend (e.g. Control Plane) is likely on another origin.

---

## 4. Asset / app structure (from login page)

- **CSS:** `/_next/static/css/841536bdb3a19411.css?dpl=...`
- **Chunks:** webpack, main-app, polyfills; `app/(main)/layout`, `app/(main)/login/page`, `app/global-error`
- **Favicon:** `/icon.svg?54837976cc1e0a7c`
- **Meta:** description “Orchestrated automation, conducted with precision.”; title “Maestron”

---

## 5. Weaknesses & recommendations (for when you have access)

- **Information disclosure (low):**
  - Sentry **release** hash and **org ID** are in the HTML. Useful for correlating deploys/source maps; consider whether release should be hidden in strict threat models.
  - **Vercel deploy ID** in asset URLs; no direct exploit, but reveals deploy identity.
- **Missing standard endpoints:**
  - **`/robots.txt`** and **`/sitemap.xml`** serve the SPA; crawlers get the app shell. Add real `robots.txt` (and sitemap if you want indexing) via Next.js rewrites or static files.
  - **`.well-known/security.txt`** is SPA; if you want a security contact, serve a real file.
- **Health check:**
  - **`/api/health`** is a **page**, not a backend health endpoint. For Vercel or load balancers, either:
    - Add a **Route Handler** (e.g. `app/api/health/route.ts`) that returns JSON and keep the Health **page** at something like `/monitoring/health`, or
    - Document that “health” is UI-only and that the real health check is on the backend (e.g. Control Plane URL).
- **Auth surface:**
  - Login has Sign In, Sign Up, Magic Link, Google. Ensure Magic Link and password reset use secure tokens and short TTLs; no testing of auth was done.

---

## 6. Alignment with AI Factory / ProfessorX

| Maestron (from recon) | AI Factory |
|----------------------|------------|
| Operations → Dashboard (Overview, Planner, Scheduler Health) | `/dashboard`, `/planner`, `/health` (scheduler/DB) |
| Commerce | Ads + Commerce operator, brands |
| Studio | Brands, document templates |
| Data & Schema | Releases, policies, adapters, MCP |
| System | Admin, self-heal, audit |
| Builder Studio | Pipeline/build-from-prompt, plan compiler |
| Costs & Monitoring | Cost dashboard, LLM budgets |
| Next.js + Vercel | Console: Next.js on Vercel |
| Tagline: “Conduct your code.” | “Orchestration for dev/marketing pipelines” |

Feature naming and structure are very close; main difference is Maestron’s “Api” section in the UI (with a Health **page**), whereas in AI Factory the health check is typically a **backend** `/health` or `/v1/health`.

---

## 7. What was not done

- No login bypass, no brute force, no injection.
- No access to backend APIs or DB; backend (if any) was not discovered on this host.
- No scraping behind auth; only public HTML and public paths.

---

## 8. If you regain access

1. **Repo:** Confirm Next.js App Router layout under `app/(main)/`, and `api` as a UI segment (e.g. `app/(main)/api/health/page.tsx`).
2. **Backend:** Identify the API origin (e.g. `api.maestron.io` or same host with route handlers) and document health/readiness endpoints.
3. **Sentry:** In Sentry project settings, decide if release should be omitted or generic in HTML.
4. **Vercel:** Add real `robots.txt` (and optionally `security.txt`) via `public/` or rewrites.
5. **Health:** Add a dedicated JSON health route (e.g. `app/api/health/route.ts`) if you need it for probes without loading the SPA.

This file can be updated with backend URLs, env var names, or schema notes once you have access to the Maestron repo or config.

---

## 9. Aggressive recon (2026-03-16)

**Scope:** Broader path enumeration, JS chunk analysis, Next.js data routes, headers, and security header audit. Still no auth bypass, injection, or brute force.

### 9.1 Path enumeration (extended)

All requests unauthenticated. **307** = redirect (almost certainly to `/login`). **200** = SPA HTML or Next.js response. **404** = not found.

| Path | Status | Notes |
|------|--------|--------|
| `/admin`, `/debug`, `/internal`, `/status`, `/metrics`, `/prometheus`, `/actuator/health` | 307 | Redirect to login |
| `/.env`, `/.env.local`, `/.git/HEAD`, `/config.json` | 307 | SPA catch-all (no direct file leak) |
| `/openapi.json`, `/swagger.yaml`, `/.well-known/openid-configuration` | 307 | SPA |
| `/auth/callback`, `/auth/session`, `/rest`, `/healthz`, `/ready` | 307 | SPA |
| `/api/v1/health` | 404 | Only path returning 404 in this set |
| `/api/trpc`, `/api/graphql` | 200 | **SPA HTML** (app route pages), not backend tRPC/GraphQL |
| **POST** `/api/trpc` (body `{}`) | 400 | Response has `x-matched-path: /[entity]/[id]` — dynamic catch-all, no JSON backend |

So: no backend API discovered on this host. `api/trpc` and `api/graphql` are **UI route names**, not live tRPC/GraphQL endpoints.

### 9.2 Next.js data routes and build id

- **Build id** (from RSC payload in HTML): `yu9p8CNmewt-uBDe_eOqq`
- **`/_next/data/yu9p8CNmewt-uBDe_eOqq/login.json`** → **200**, `content-type: text/html`, RSC payload; headers include `x-nextjs-matched-path: /login`, `x-powered-by: Next.js`
- **`/_next/data/yu9p8CNmewt-uBDe_eOqq/dashboard.json`** → empty or redirect (dashboard requires auth)
- **`/_next/data/yu9p8CNmewt-uBDe_eOqq/api/health.json`** → full SPA HTML (no server-only data leak observed)

Knowing the build id allows requesting RSC payloads for other routes; protected routes still redirect or return empty without a session.

### 9.3 JavaScript chunk recon

**Webpack chunk** (`/_next/static/chunks/webpack-*.js`):

- **Sentry** debug ID inject: `sentry-dbid-b5f1c77f-342a-45a6-8218-dc24b2217c1c`
- **Vercel Live** toolbar conditional: loads `https://vercel.live/_next-live/feedback/feedback.js` when cookie `__vercel_toolbar=1`; uses same `dpl_CvPMKw1BF9A7WARYCDDqeVQ54ov9`

**Main-app chunk** (`main-app-*.js`):

- **Full Sentry DSN** (information disclosure):  
  `https://1f9e9fa305d1855214e02069e3157603@o1281800.ingest.us.sentry.io/4510947236970496`  
  (project ID `4510947236970496`, org `1281800`, host `ingest.us.sentry.io`)
- **Client-side route list** (useful for sitemap / alignment):
  - `/account`, `/login`, `/dashboard`, `/planner`, `/costs`
  - `/builder-studio`, `/builder-studio/releases`, `/builder-studio/viewer/blocks`, `.../viewer/colors`, `.../viewer/compare`, `.../viewer/components`, `.../viewer/library`, `.../viewer/pages`, `.../viewer/spacing`, `.../viewer/themes`
  - `/design-system`, `/design-system/components`, `/design-system/library`, `/design-system/pages`, `/design-system/releases`
  - `/structure`, `/structure/register`, `/structure/settings`
  - `/preview/component`, `/viewer/library`

### 9.4 Source maps and assets

- **`/_next/static/chunks/main-app-*.js.map`** → **404**
- **`/_next/static/css/*.css.map`** → **404**  
  So **no production source maps** exposed; reduces risk of source/comment leakage.

### 9.5 Security headers (login page)

| Header | Present |
|--------|---------|
| `strict-transport-security: max-age=63072000` | Yes (HSTS) |
| `content-security-policy` | No |
| `x-frame-options` | No |
| `x-content-type-options` | No |
| `referrer-policy` | No |
| `permissions-policy` | No |

**Recommendation (when you have access):** Add CSP, `X-Frame-Options: DENY` or `SAMEORIGIN`, and `X-Content-Type-Options: nosniff` for defense in depth.

### 9.6 Subdomains

Probed: `api.maestron.io`, `app.maestron.io`, `staging.maestron.io`, `www.control.maestron.io`, `dashboard.maestron.io`. Requests failed (e.g. connection/timeout); no live alternate hosts confirmed. If a backend exists, it may be on a different domain or only reachable from the app origin.

### 9.7 Summary of aggressive findings

- **Full Sentry DSN** in client JS (project + org + ingest host).
- **Complete client route tree** recoverable from main-app chunk (Builder Studio, Design System, Structure, Costs, etc.).
- **No CSP or X-Frame-Options** — consider adding for clickjacking and XSS mitigation.
- **No production source maps** exposed.
- **`/api/trpc` and `/api/graphql`** are UI routes; POST to `/api/trpc` hits dynamic route `[entity]/[id]` and returns 400 with no JSON API.
- **Next.js build id** and `_next/data` usage confirmed; no unauthenticated server data leak seen from tested routes.

---

## 10. Authorized testing: Hydra / Burp (staging or local only)

Run these only against a **staging** or **local** Maestron instance (e.g. `http://localhost:3000` or `https://staging.maestron.io`) with **test accounts** you create. **Do not run against production** (control.maestron.io) or against third‑party auth (e.g. Google) unless their program allows it.

### 10.1 Prerequisites

- **Target URL** – Staging or local base URL (e.g. `http://localhost:3000`, `https://staging.maestron.io`).
- **Login path** – Usually `/login` or `/auth/login` (form POST).
- **Test user list** – File with one email/username per line (e.g. `users.txt`).
- **Password list** – File with one password per line (e.g. `passwords.txt`). Use a short list for testing so you don’t lock accounts.

### 10.2 Install Hydra (macOS)

```bash
# Homebrew
brew install hydra
```

### 10.3 Find the login form (manual or browser)

1. Open the login page in a browser (e.g. `http://localhost:3000/login`).
2. Open DevTools → Network, submit the form once.
3. Note: **Request URL** (e.g. `http://localhost:3000/api/auth/callback/credentials` or `/login`), **Method** (usually POST), and **Form field names** (e.g. `email`, `password`).

### 10.4 Hydra: HTTP POST form (example)

Adjust `URL`, `USER/PASS`, and form parameters to match your login.

**Single user, password list:**

```bash
hydra -l test@example.com -P passwords.txt localhost http-post-form "/login:email=^USER^&password=^PASS^:F=Sign in|Invalid"
```

**User list and password list (brute force):**

```bash
hydra -L users.txt -P passwords.txt localhost http-post-form "/login:email=^USER^&password=^PASS^:F=Sign in|Invalid"
```

- Replace `localhost` with the host (e.g. `staging.maestron.io` for HTTPS; use `-S` for SSL).
- Replace `F=Sign in|Invalid` with the failure string your app returns (so Hydra knows when login failed).
- Use `-t 1` or `-t 2` to limit parallelism and avoid rate limits.

**HTTPS example:**

```bash
hydra -l test@example.com -P passwords.txt staging.maestron.io -S https http-post-form "/login:email=^USER^&password=^PASS^:F=Invalid"
```

### 10.5 Run from this repo (when you have a target)

Once you have a **staging or local** Maestron URL and test accounts:

```bash
cd /Users/miguellozano/Documents/AI\ Factory

# Create minimal wordlists (replace with your test account and safe passwords)
echo "test@staging.local" > docs/maestron-test-users.txt
echo "TestPassword1" >> docs/maestron-test-users.txt
echo "TestPassword1" > docs/maestron-test-passwords.txt
echo "password123" >> docs/maestron-test-passwords.txt

# Example: local Maestron on port 3000 (adjust form path and failure string)
hydra -L docs/maestron-test-users.txt -P docs/maestron-test-passwords.txt localhost -s 3000 http-post-form "/login:email=^USER^&password=^PASS^:F=Invalid" -t 1 -v
```

### 10.6 Burp Intruder (alternative)

1. Configure browser to use Burp proxy.
2. Submit the login form once; capture the request in Burp.
3. Send to Intruder, set **Attack type** (e.g. Cluster bomb for user + password).
4. Set payload sets to your user list and password list.
5. Add a **Grep – Match** rule for the failure message (e.g. “Invalid” or “Sign in”).
6. Run the attack; inspect responses where the failure string is absent (possible success).

### 10.7 Important

- **Staging/local only** – Do not point Hydra or Intruder at production (control.maestron.io).
- **Test accounts only** – Use accounts you created for testing; avoid real user credentials.
- **Rate limiting** – Use `-t 1` or low concurrency to avoid locking accounts or triggering WAF.
- **Third‑party auth** – Testing Google/OAuth is out of scope unless the provider’s bug bounty or terms allow it.

---

## 11. Implemented in AI Factory (Console)

The following recommendations from this recon were applied to the AI Factory Console (Next.js on Vercel):

| Recommendation | Implementation |
|----------------|-----------------|
| **Security headers** (§5, §9.5) | `console/next.config.js`: `headers()` with X-Frame-Options (SAMEORIGIN), X-Content-Type-Options (nosniff), Referrer-Policy, Permissions-Policy, Content-Security-Policy (self, Sentry, Vercel, Control Plane origins). |
| **Real robots.txt** (§5) | `console/public/robots.txt` — real file; crawlers get it instead of SPA shell. |
| **Real security.txt** (§5) | `console/public/.well-known/security.txt` — placeholder contact/expiry; replace with your URL and email. |
| **JSON health for probes** (§5) | `console/app/api/health/route.ts` — GET returns `{ ok: true, service: "console", timestamp }`; UI health page stays at `/health`. |
| **Sentry release** (§5) | `console/sentry.client.config.ts` — optional `SENTRY_RELEASE` env to use a generic release; comment references this doc. |
| **Control Plane security headers** (§9.5) | `control-plane/src/api.ts` — middleware sets X-Content-Type-Options, X-Frame-Options, Referrer-Policy on all API responses. |

After deploy, verify: `GET /robots.txt`, `GET /.well-known/security.txt`, and `GET /api/health` return the expected content (not the SPA).

### Optional / future

- **Sitemap:** Add `console/public/sitemap.xml` (or a dynamic route) if you want search engines to index the Console; then uncomment the Sitemap line in `robots.txt` and set the URL.
- **CSP tightening:** Current CSP allows `'unsafe-inline'` and `'unsafe-eval'` for Next.js. For stricter policy, use nonces or hashes and remove those (test thoroughly).
- **Control Plane:** Security headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy) were added to the Control Plane in `control-plane/src/api.ts` so API responses are aligned with the Console.
