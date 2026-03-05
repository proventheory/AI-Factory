# Supabase Vault — Where to Get Keys

Add these secrets to **each** Supabase project’s Vault (staging and prod):

- **Staging:** [Vault → ai-factory-staging](https://supabase.com/dashboard/project/anqhihkvovuhfzsyqtxu/settings/vault)
- **Prod:** [Vault → ai-factory-prod](https://supabase.com/dashboard/project/wxupyzthtzeckgbzqmjy/settings/vault)

You can use the same keys for both, or different keys per environment (e.g. separate GitHub PATs).

---

## Using your `.env` file

Your **project root `.env`** (gitignored) should already contain these. Use the **same names** when adding to the Vault:

| Vault secret name        | Your `.env` variable       | Where to get it if missing |
|--------------------------|----------------------------|-----------------------------|
| `github_token`           | `GITHUB_TOKEN`             | GitHub → Settings → Developer settings → Personal access tokens |
| `openai_api_key`         | `OPENAI_API_KEY`          | [OpenAI API keys](https://platform.openai.com/api-keys) |
| `vercel_api_token`       | `VERCEL_API_TOKEN`         | Vercel → Account → Tokens |
| `supabase_access_token`  | `SUPABASE_ACCESS_TOKEN`    | [Supabase Access Tokens](https://supabase.com/dashboard/account/tokens) |
| `render_api_key`         | `RENDER_API_KEY`           | Render → Account → API Keys |

Copy the **value** from each variable in `.env` into the Vault secret with the matching name above.

---

## How to add them

**Option A — Dashboard (both projects)**  
1. Open each project → **Integrations → Vault → Secrets**.  
2. Click **Add new secret**.  
3. For each row in the table above: **Name** = vault secret name, **Secret** = value from `.env`.

**Option B — SQL (once per project)**  
1. Open **SQL Editor** for that project.  
2. Open `scripts/seed-supabase-vault.sql`, replace every `YOUR_...` placeholder with the real value from your `.env`.  
3. Run the script.  
4. Repeat for the other project (staging then prod), using the same or different values.

After that, both Vaults are populated and your app can read them via `secret_refs` / Vault APIs.
