# SEO “Connect Google” OAuth — one-time platform setup

This describes the **one-time** setup for the OAuth “Connect Google” flow. Google is connected **per brand** (on the brand page). Initiatives that have a brand assigned use that brand’s Google connection for GSC/GA4 (no per-user service accounts).

## Google Cloud project (you or your team do this once)

1. **Google Cloud Console** → create or select a project.
2. **APIs & Services → Credentials** → **Create credentials** → **OAuth client ID**.
3. **Application type:** Web application.
4. **Authorized redirect URIs:** add **exactly** the URL where Google will send users after they approve:
   - Production: `https://<your-control-plane-host>/v1/seo/google/callback`  
     Example: `https://your-app.onrender.com/v1/seo/google/callback`
   - Local dev (optional): `http://localhost:3001/v1/seo/google/callback`
5. **Authorized JavaScript origins:** leave empty (server-side flow).
6. Copy the **Client ID** and **Client Secret**.

## OAuth consent screen

In the same project: **OAuth consent screen** → configure app name, support email, and **scopes**. Add:

- `https://www.googleapis.com/auth/webmasters.readonly` (Search Console)
- `https://www.googleapis.com/auth/analytics.readonly` (GA4)

## Environment variables (control-plane)

Set these on the **control-plane** (and any server that performs the token exchange):

| Variable | Description |
|----------|-------------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth client ID from Google Cloud. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret. |
| `GOOGLE_OAUTH_ENCRYPTION_KEY` | 32-byte key used to encrypt refresh tokens before storing in the DB. Use a 64-character hex string (e.g. `openssl rand -hex 32`) or a long passphrase; **must be set in production**. |
| `CONTROL_PLANE_URL` | Base URL of the control-plane (e.g. `https://your-app.onrender.com`). Used to build the callback URL for the OAuth client and for token refresh. |
| `CONSOLE_URL` | (Recommended) Base URL of the Console app (e.g. `https://your-console.vercel.app`). When OAuth fails (e.g. missing code/state), the user is redirected here with `?google_oauth_error=…` instead of to the callback URL, which would cause a redirect loop. If unset, the API returns 400 + HTML. |

**Redirect URI** in the Google OAuth client config must match:  
`<CONTROL_PLANE_URL>/v1/seo/google/callback` (no trailing slash on `CONTROL_PLANE_URL`).

## Console (optional)

If the console runs on a different origin, set:

- `NEXT_PUBLIC_CONTROL_PLANE_API` to the control-plane base URL so the “Connect Google” button calls the correct auth endpoint.

## Flow summary

1. User opens a **Brand** and clicks **Connect Google** (on the brand page).
2. Console calls `GET <control-plane>/v1/seo/google/auth?brand_id=…&redirect_uri=…` (redirect_uri = brand page URL).
3. Control-plane returns `{ url: "https://accounts.google.com/…" }`; user is redirected to Google.
4. User signs in (and picks account if prompted) and grants access; Google redirects to `GET <control-plane>/v1/seo/google/callback?code=…&state=…`.
5. Control-plane exchanges the code for tokens, encrypts and stores the refresh token in `brand_google_credentials`, then redirects to the brand page with `?google_connected=1`.
6. When creating an initiative (e.g. SEO migration audit), user selects a **brand**; that initiative uses the brand’s Google connection.
7. Runners call `GET <control-plane>/v1/initiatives/:id/google_access_token`; the API resolves the initiative’s brand and returns a token from `brand_google_credentials` (or legacy `initiative_google_credentials`).
