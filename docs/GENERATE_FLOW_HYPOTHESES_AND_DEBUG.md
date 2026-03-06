# Generate template failure – 10 hypotheses and fixes

When "Create campaign and generate" fails with `{"error":"invalid input value for enum risk_level: \"medium\""}`, these are the main hypotheses and what was done.

## 10 hypotheses

1. **GET /v1/initiatives?risk_level=medium** – A list request with `risk_level=medium` passes the literal to PostgreSQL; the enum only allows `low` | `med` | `high`. **Fix:** Normalize query param in GET /v1/initiatives so `medium` → `med`.
2. **POST /v1/email_campaigns sends risk_level from client** – If the console (or any client) sends `risk_level: "medium"` and the API forwards it to the INSERT, the DB rejects it. **Fix:** API must never use body.risk_level for email_campaigns; always use `'med'` in INSERT.
3. **Stale control-plane deployment** – Staging/prod might be running an old build that still forwards or uses `risk_level` from the body. **Fix:** Rebuild and redeploy control-plane; ensure dist has the normalized INSERT and GET filter.
4. **POST /v1/initiatives used instead of POST /v1/email_campaigns** – If something calls the generic initiatives endpoint with `risk_level: "medium"`, it would fail before normalization. **Fix:** POST /v1/initiatives already uses `normalizeRiskLevel(risk_level)`; no change needed there.
5. **DB default or trigger** – A default/trigger on `initiatives.risk_level` could inject `'medium'`. **Fix:** Unlikely if the error says "input value"; still, all API paths now use only `low`|`med`|`high`.
6. **React Query refetch with wrong params** – After create, invalidateQueries might refetch a list with a filter that includes `risk_level=medium`. **Fix:** Normalizing GET initiatives filter (H1) covers this.
7. **CORS or proxy rewriting body** – A proxy might add or rewrite `risk_level`. **Fix:** API ignores body.risk_level for email_campaigns and uses a constant.
8. **Plan or start step writing risk_level** – Plan compiler or start run might UPDATE initiatives with a raw value. **Fix:** Checked; plan/start do not write risk_level. No change.
9. **Column missing (brand_profile_id) triggers fallback that fails** – First INSERT can fail with 42703; fallback INSERT also used `'med'`; if the fallback had been wrong, we’d see a different error. **Fix:** Fallback INSERT now explicitly uses the same `riskLevel` constant.
10. **Multiple requests in one flow** – The visible error might be from a different request in the same flow (e.g. list after create). **Fix:** GET initiatives now normalizes risk_level; POST email_campaigns never sends "medium".

## Code changes applied

- **control-plane/src/api.ts**
  - GET /v1/initiatives: when filtering by `risk_level`, use `normalizeRiskLevel(risk_level)` before passing to the query.
  - POST /v1/email_campaigns: introduce a `riskLevel = "med"` constant; use it in both the main INSERT and the fallback INSERT; do not read or use `body.risk_level`.

## How to test locally

1. Start DB (e.g. Supabase local or a running DATABASE_URL).
2. Start control-plane: `npm run dev:control-plane` (or `node dist/control-plane/src/index.js` after `npm run build`).
3. Create campaign (no risk_level in body):
   ```bash
   curl -s -X POST http://localhost:3001/v1/email_campaigns \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","metadata_json":{"products":[]}}'
   ```
   Expect 201 and an `id`.
4. Optional: send body with `risk_level: "medium"` and confirm the API still returns 201 and the row has `risk_level: "med"`.
5. Compile plan and start run (use the `id` from step 3):
   ```bash
   curl -s -X POST "http://localhost:3001/v1/initiatives/INITIATIVE_ID/plan" -H "Content-Type: application/json" -d '{}'
   curl -s -X POST "http://localhost:3001/v1/plans/PLAN_ID/start" -H "Content-Type: application/json" -d '{"environment":"sandbox"}'
   ```

## 5-minute verification loop

Run the test script (see below) against local API every minute for 5 minutes, or run self-heal once and then the API test:

- `npm run build` (from repo root)
- `node dist/control-plane/src/index.js` in one terminal (with DATABASE_URL)
- In another: `node scripts/test-generate-flow.mjs` (or curl manually as above)

If all return 201/200, the generate flow is fixed at the API layer; then verify the Console against the same API (NEXT_PUBLIC_CONTROL_PLANE_API).
