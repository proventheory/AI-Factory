/**
 * Unit tests for loadArtifactContentForLlm (artifact hygiene helper).
 * Run: npm test (or npx tsx --test runners/tests/artifact-content.test.ts)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type pg from "pg";
import {
  loadArtifactContentForLlm,
  MAX_ARTIFACT_CHARS_FOR_LLM,
  MAX_ARTIFACT_BYTES_SERIALIZED,
} from "../src/artifact-content.js";

function mockClient(rows: { metadata_json: Record<string, unknown> | null }[]): pg.PoolClient {
  return {
    query: async () => ({ rows: rows.length ? [rows[0]] : [] }),
  } as unknown as pg.PoolClient;
}

describe("loadArtifactContentForLlm", () => {
  it("returns plain text content from metadata_json.content", async () => {
    const client = mockClient([{ metadata_json: { content: "Hello world" } }]);
    const out = await loadArtifactContentForLlm(client, "any-id");
    assert.equal(out, "Hello world");
  });

  it("returns content from metadata_json.summary when content is not a string", async () => {
    const client = mockClient([{ metadata_json: { content: 123, summary: "Short summary" } }]);
    const out = await loadArtifactContentForLlm(client, "any-id");
    assert.equal(out, "Short summary");
  });

  it("returns empty string for missing artifact", async () => {
    const client = mockClient([]);
    const out = await loadArtifactContentForLlm(client, "missing-id");
    assert.equal(out, "");
  });

  it("returns empty string for null metadata_json", async () => {
    const client = mockClient([{ metadata_json: null }]);
    const out = await loadArtifactContentForLlm(client, "any-id");
    assert.equal(out, "");
  });

  it("uses stringifyStable fallback for non-text metadata and applies char limit", async () => {
    const client = mockClient([{ metadata_json: { foo: "a", bar: "b" } }]);
    const out = await loadArtifactContentForLlm(client, "any-id");
    assert.ok(out.includes("foo") && out.includes("bar"));
    assert.ok(out === '{"bar":"b","foo":"a"}'); // stable key order
  });

  it("truncates at max chars and appends marker", async () => {
    const long = "x".repeat(200);
    const client = mockClient([{ metadata_json: { content: long } }]);
    const out = await loadArtifactContentForLlm(client, "any-id", 50, 100_000);
    assert.equal(out.length, 50 + "\n[truncated...]".length);
    assert.ok(out.endsWith("\n[truncated...]"));
    assert.equal(out.slice(0, 50), "x".repeat(50));
  });

  it("truncates at max bytes when exceeded", async () => {
    const long = "é".repeat(1000);
    const client = mockClient([{ metadata_json: { content: long } }]);
    const out = await loadArtifactContentForLlm(client, "any-id", 100_000, 10);
    assert.ok(out.endsWith("\n[truncated...]"));
    assert.ok(out.length <= 10 + 20);
  });

  it("deterministic output for same input (plain text)", async () => {
    const client = mockClient([{ metadata_json: { content: "same" } }]);
    const a = await loadArtifactContentForLlm(client, "id");
    const b = await loadArtifactContentForLlm(client, "id");
    assert.equal(a, b);
  });

  it("deterministic output for JSON fallback (stable key order)", async () => {
    const client = mockClient([{ metadata_json: { z: 1, a: 2 } }]);
    const out = await loadArtifactContentForLlm(client, "id");
    assert.equal(out, '{"a":2,"z":1}');
  });

  it("constants have expected defaults", () => {
    assert.equal(MAX_ARTIFACT_CHARS_FOR_LLM, 15_000);
    assert.equal(MAX_ARTIFACT_BYTES_SERIALIZED, 50_000);
  });
});
