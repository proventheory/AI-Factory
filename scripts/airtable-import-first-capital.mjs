#!/usr/bin/env node
/**
 * First Capital Group Airtable import: base app6pjOKnxdrZsDWR → organizations, taxonomy_websites, taxonomy_vocabularies, taxonomy_terms, brand_profiles.
 * Uses scope first-capital-group. Run discovery first to get schema (or script fetches schema from API).
 *
 * Requires: AIRTABLE_TOKEN, DATABASE_URL. Optional: AIRTABLE_BASE_ID (default app6pjOKnxdrZsDWR).
 *
 * Usage:
 *   AIRTABLE_TOKEN=patXXX node --env-file=.env scripts/airtable-import-first-capital.mjs
 *   npm run airtable:import:first-capital
 */

import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const BASE_ID = process.env.AIRTABLE_BASE_ID || "app6pjOKnxdrZsDWR";
const SCOPE_KEY = "first-capital-group";
const SCHEMA_PATH = join(root, "docs", "airtable-discovery", `schema_${BASE_ID}.json`);

function getToken() {
  return process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY;
}

async function fetchSchemaFromApi() {
  const token = getToken();
  if (!token) return null;
  const url = `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

function tableByName(schema, names) {
  const list = schema?.tables || [];
  for (const n of names) {
    const t = list.find((x) => x.name === n || (x.name && x.name.toLowerCase() === n.toLowerCase()));
    if (t) return t;
  }
  return null;
}

async function fetchTable(baseId, tableIdOrName, token) {
  const all = [];
  let offset = null;
  const base = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableIdOrName)}`;
  do {
    const url = offset ? `${base}?offset=${offset}` : base;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
    const data = await res.json();
    all.push(...(data.records || []));
    offset = data.offset || null;
  } while (offset);
  return all;
}

function slugify(s) {
  if (!s || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const token = getToken();
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (!token) {
    console.error("AIRTABLE_TOKEN or AIRTABLE_API_KEY is not set");
    process.exit(1);
  }

  let schema = null;
  if (existsSync(SCHEMA_PATH)) {
    schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
    console.log("Using schema from", SCHEMA_PATH);
  } else {
    console.log("Fetching schema from Airtable...");
    schema = await fetchSchemaFromApi();
    if (schema) console.log("Schema fetched. Tables:", schema.tables?.map((t) => t.name).join(", "));
  }

  const websitesTable = schema ? tableByName(schema, ["Websites", "Website", "Sites"]) : { id: "Websites", name: "Websites" };
  const vocabTable = schema ? tableByName(schema, ["Vocabulary", "Vocabularies", "Vocabularies"]) : null;
  const termsTable = schema ? tableByName(schema, ["Terms", "Term"]) : null;

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let importBatchId;

  try {
    await client.query("BEGIN");

    const batchRes = await client.query(
      `INSERT INTO import_batches (scope_key, source_system, status) VALUES ($1, 'airtable', 'running') RETURNING id`,
      [SCOPE_KEY]
    );
    importBatchId = batchRes.rows[0].id;
    console.log("Import batch:", importBatchId);

    await client.query(
      `INSERT INTO organizations (name, slug) VALUES ('First Capital Group', $1) ON CONFLICT (slug) DO NOTHING`,
      [SCOPE_KEY]
    );
    const orgRow = await client.query("SELECT id FROM organizations WHERE slug = $1", [SCOPE_KEY]);
    const orgId = orgRow.rows[0]?.id;
    if (!orgId) throw new Error("organizations.first-capital-group not found after upsert");

    await client.query(
      `INSERT INTO raw_airtable_bases (base_id, name) VALUES ($1, $2) ON CONFLICT (base_id) DO UPDATE SET name = EXCLUDED.name`,
      [BASE_ID, "First Capital Group"]
    );

    let websites = [];
    const tableId = websitesTable?.id || websitesTable?.name || "Websites";
    try {
      websites = await fetchTable(BASE_ID, tableId, token);
      console.log("Websites records:", websites.length);
    } catch (e) {
      console.warn("Could not fetch Websites table:", e.message);
    }

    for (const rec of websites) {
      const fields = rec.fields || {};
      const name = fields.Name || fields["Website Name"] || fields["Site Name"] || rec.id;
      const url = fields.URL || fields.Url || fields["Website URL"] || "";
      const airtableRecordId = rec.id;
      const existing = await client.query(
        `SELECT id FROM taxonomy_websites WHERE airtable_base_id = $1 AND airtable_table_id = $2 AND airtable_record_id = $3`,
        [BASE_ID, tableId, airtableRecordId]
      );
      if (existing.rows[0]) {
        await client.query(
          `UPDATE taxonomy_websites SET organization_id = $2, name = $3, status = 'active', url = COALESCE(NULLIF($4,''), url), metadata_json = $5::jsonb, updated_at = now() WHERE id = $1`,
          [existing.rows[0].id, orgId, String(name), url || null, JSON.stringify(fields)]
        );
      } else {
        await client.query(
          `INSERT INTO taxonomy_websites (organization_id, airtable_base_id, airtable_table_id, airtable_record_id, name, status, url, metadata_json)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, $7::jsonb)`,
          [orgId, BASE_ID, tableId, airtableRecordId, String(name), url || null, JSON.stringify(fields)]
        );
      }
    }

    const webRows = await client.query(
      "SELECT id, name, airtable_record_id FROM taxonomy_websites WHERE organization_id = $1",
      [orgId]
    );
    console.log("Taxonomy websites:", webRows.rows.length);

    for (const web of webRows.rows) {
      const brandSlug = slugify(web.name) || `brand-${web.airtable_record_id?.slice(0, 8) || web.id}`;
      let brandId = null;
      const existing = await client.query("SELECT id FROM brand_profiles WHERE slug = $1", [brandSlug]);
      if (existing.rows[0]) {
        brandId = existing.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO brand_profiles (name, slug, status) VALUES ($1, $2, 'active') RETURNING id`,
          [web.name, brandSlug]
        );
        brandId = ins.rows[0].id;
        console.log("Created brand:", web.name, brandSlug);
      }
      await client.query(
        `UPDATE brand_profiles SET website_id = $2 WHERE id = $1`,
        [brandId, web.id]
      );
    }

if (vocabTable && termsTable) {
      const vocabTableId = vocabTable.id || vocabTable.name;
      const termsTableId = termsTable.id || termsTable.name;
      let vocabs = [];
      try {
        vocabs = await fetchTable(BASE_ID, vocabTableId, token);
      } catch (_) {}
      let terms = [];
      try {
        terms = await fetchTable(BASE_ID, termsTableId, token);
      } catch (_) {}
      for (const web of webRows.rows) {
        const webAirtableId = web.airtable_record_id;
        const vocabsForWeb = webAirtableId
          ? vocabs.filter((v) => {
              const link = v.fields?.Website ?? v.fields?.website;
              const arr = Array.isArray(link) ? link : link ? [link] : [];
              return arr.length === 0 || arr.includes(webAirtableId);
            })
          : vocabs;
      for (const v of vocabsForWeb) {
        const vFields = v.fields || {};
        const vName = vFields.Name || vFields.Vocabulary || v.id;
        const visibility = vFields.Visibility || vFields.visibility || null;
        let vocabId = null;
        const exVocab = await client.query(
          `SELECT id FROM taxonomy_vocabularies WHERE website_id = $1 AND airtable_record_id = $2`,
          [web.id, v.id]
        );
        if (exVocab.rows[0]) {
          await client.query(
            `UPDATE taxonomy_vocabularies SET name = $2, visibility = $3, metadata_json = $4::jsonb WHERE id = $1`,
            [exVocab.rows[0].id, String(vName), visibility, JSON.stringify(vFields)]
          );
          vocabId = exVocab.rows[0].id;
        } else {
          const ins = await client.query(
            `INSERT INTO taxonomy_vocabularies (website_id, airtable_record_id, name, visibility, metadata_json) VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
            [web.id, v.id, String(vName), visibility, JSON.stringify(vFields)]
          );
          vocabId = ins.rows[0]?.id;
        }
        if (!vocabId) continue;
        for (const t of terms) {
          const tFields = t.fields || {};
          const termVocabLinks = tFields.Vocabulary || tFields.vocabulary || [];
          const linked = Array.isArray(termVocabLinks) ? termVocabLinks : [termVocabLinks];
          if (linked.length && !linked.includes(v.id)) continue;
          const termName = tFields.Name || tFields.Term || tFields.term_name || t.id;
          const urlValue = tFields["Url Value"] ?? tFields.url_value ?? tFields.URL ?? null;
          const exTerm = await client.query(
            `SELECT id FROM taxonomy_terms WHERE website_id = $1 AND airtable_record_id = $2`,
            [web.id, t.id]
          );
          if (exTerm.rows[0]) {
            await client.query(
              `UPDATE taxonomy_terms SET vocabulary_id = $2, term_name = $3, url_value = COALESCE(NULLIF($4,''), url_value), metadata_json = $5::jsonb WHERE id = $1`,
              [exTerm.rows[0].id, vocabId, String(termName), urlValue, JSON.stringify(tFields)]
            );
          } else {
            await client.query(
              `INSERT INTO taxonomy_terms (vocabulary_id, website_id, airtable_record_id, term_name, url_value, metadata_json)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
              [vocabId, web.id, t.id, String(termName), urlValue, JSON.stringify(tFields)]
            );
          }
        }
      }
      }
      console.log("Vocabularies and terms imported (if tables present).");
    }

    const stats = {
      taxonomy_websites: webRows.rows.length,
      brands_linked: webRows.rows.length,
    };
    await client.query(
      `UPDATE import_batches SET status = 'succeeded', finished_at = now(), stats_json = $2 WHERE id = $1`,
      [importBatchId, JSON.stringify(stats)]
    );
    await client.query("COMMIT");
    console.log("\nFirst Capital import succeeded. Stats:", JSON.stringify(stats, null, 2));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (importBatchId) {
      await client.query(
        `UPDATE import_batches SET status = 'failed', finished_at = now() WHERE id = $1`,
        [importBatchId]
      ).catch(() => {});
      await client.query(
        `INSERT INTO import_issues (batch_id, source_system, entity_type, message, detail_json) VALUES ($1, 'airtable', 'first_capital_import', $2, $3)`,
        [importBatchId, err.message, JSON.stringify({ stack: err.stack })]
      ).catch(() => {});
    }
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
