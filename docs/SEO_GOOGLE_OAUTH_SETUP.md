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

---

## Enabling APIs in Google Cloud (for keyword data)

The OAuth scopes above only allow the app to *request* access; the corresponding **APIs must be enabled** in the same Google Cloud project or requests will fail or return empty data.

### Traffic keywords (GSC) — required for “Traffic keywords (GSC)” in Step 4

1. **Enable the Search Console API** in your project:
   - **Link:** [Google Cloud Console → Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)
   - Open the link, select the **same project** you use for OAuth, and click **Enable**.
2. In [Google Search Console](https://search.google.com/search-console), add and verify the property for your site (e.g. `https://stigmahemp.com` or `sc-domain:stigmahemp.com`). The account you use for “Connect Google” on the brand must have access to that property.
3. In the SEO Migration Wizard **Step 2**, select the brand, set the **Site URL** to match the GSC property (e.g. `https://stigmahemp.com`), and click **Fetch GSC report**. Step 4 will then show **Traffic keywords (GSC)** per URL.

### Monthly search volume (Google Ads) — optional

To fill **Monthly search volume** in Step 4 (and the “Fetch monthly search volume (Google Ads)” button), you need the **Google Ads API** and a developer token. You can reuse the **same OAuth client** you use for GSC/GA4.

#### Step 1: Add the Google Ads scope in Google Cloud

1. Open [Google Cloud Console → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
2. Select the **same project** where you created your OAuth client (the one used for “Connect Google”).
3. Click **EDIT APP** (or “Configure consent screen” if you haven’t set it up yet).
4. Go to the **Scopes** step → **ADD OR REMOVE SCOPES**.
5. In the filter/search box, type `adwords` or paste: `https://www.googleapis.com/auth/adwords`.
6. Check **Google Ads API** (or the scope that shows that URL) → **UPDATE** → **SAVE AND CONTINUE** through the rest of the wizard.

#### Step 2: Get a refresh token with the Ads scope (one-time)

1. Open **[OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)** in your browser.
2. Click the **gear icon (⚙️)** in the right sidebar.
3. Check **“Use your own OAuth credentials”**.
4. Enter your **OAuth Client ID** and **OAuth Client secret** (same as `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` from your Google Cloud project).
5. Close the settings. In **Step 1 - Select & authorize APIs**:
   - In the list, open **“Google Ads API v18”** (or search for “Google Ads”).
   - Check **`https://www.googleapis.com/auth/adwords`**.
   - Click **Authorize APIs**.
6. Sign in with the Google account that has access to your Google Ads account (e.g. hello@proventheory.co) and click **Allow**.
7. In **Step 2 - Exchange authorization code for tokens**, click **Exchange authorization code for tokens**.
8. Copy the **Refresh token** from the response (long string). You’ll use it as `GOOGLE_ADS_REFRESH_TOKEN`.

#### Step 3: Set the three env vars on Render

1. Go to [Render Dashboard](https://dashboard.render.com) → open your **control-plane** service (e.g. **ai-factory-api-staging**).
2. Go to the **Environment** tab.
3. Add or edit these variables (merge with existing; don’t remove others):
   - **Key:** `GOOGLE_ADS_CLIENT_ID` → **Value:** your OAuth Client ID (same as `GOOGLE_OAUTH_CLIENT_ID`).
   - **Key:** `GOOGLE_ADS_CLIENT_SECRET` → **Value:** your OAuth Client secret (same as `GOOGLE_OAUTH_CLIENT_SECRET`).
   - **Key:** `GOOGLE_ADS_REFRESH_TOKEN` → **Value:** the refresh token you copied from the Playground in Step 2.
4. Click **Save Changes**. Render will redeploy the service.

You should already have `GOOGLE_ADS_DEVELOPER_TOKEN` and `GOOGLE_ADS_CUSTOMER_ID` set (e.g. from API Center and MCP). Once all five vars are set, “Fetch monthly search volume (Google Ads)” in the SEO Migration Wizard Step 4 should work.
