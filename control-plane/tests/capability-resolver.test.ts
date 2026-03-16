/**
 * Unit tests for capability resolver: deterministic ranking, consumes filter, no side effects (boundary).
 * Run: npx tsx --test control-plane/tests/capability-resolver.test.ts (from repo root).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { resolveOperators } from "../src/capability-resolver.js";

function mockClient(queries: Map<string, { rows: unknown[] }>): PoolClient {
  return {
    query: async (text: string, values?: unknown[]) => {
      const key = text.replace(/\s+/g, " ").trim();
      const out = queries.get(key);
      if (out) return { rows: out.rows } as never;
      const byFirstLine = key.split(" ").slice(0, 4).join(" ");
      for (const [k, v] of queries) {
        if (k.startsWith(byFirstLine)) return { rows: v.rows } as never;
      }
      return { rows: [] } as never;
    },
  } as unknown as PoolClient;
}

describe("resolveOperators", () => {
  it("returns empty when produces artifact type is unknown", async () => {
    const client = mockClient(
      new Map([["SELECT id, key FROM artifact_types WHERE key = ANY($1::text[])", { rows: [] }]])
    );
    const r = await resolveOperators(client, { produces: "unknown_type" });
    assert.deepEqual(r.operators, []);
  });

  it("returns operators that produce the artifact type in deterministic order (priority then key)", async () => {
    const atId = "at-copy-id";
    const client = mockClient(
      new Map([
        [
          "SELECT id, key FROM artifact_types WHERE key = ANY($1::text[])",
          { rows: [{ id: atId, key: "copy" }] },
        ],
        [
          "SELECT o.id, o.key, o.priority FROM operators o JOIN operator_produces_artifact_type opat ON opat.operator_id = o.id WHERE opat.artifact_type_id = $1",
          {
            rows: [
              { id: "op-b", key: "op_b", priority: 20 },
              { id: "op-a", key: "op_a", priority: 10 },
            ],
          },
        ],
      ])
    );
    const r = await resolveOperators(client, { produces: "copy" });
    assert.deepEqual(r.operators, ["op_a", "op_b"]);
  });

  it("treats null priority as lowest (sorted last)", async () => {
    const atId = "at-id";
    const client = mockClient(
      new Map([
        ["SELECT id, key FROM artifact_types WHERE key = ANY($1::text[])", { rows: [{ id: atId, key: "x" }] }],
        [
          "SELECT o.id, o.key, o.priority FROM operators o JOIN operator_produces_artifact_type opat ON opat.operator_id = o.id WHERE opat.artifact_type_id = $1",
          {
            rows: [
              { id: "op-null", key: "op_null", priority: null },
              { id: "op-10", key: "op_10", priority: 10 },
            ],
          },
        ],
      ])
    );
    const r = await resolveOperators(client, { produces: "x" });
    assert.deepEqual(r.operators, ["op_10", "op_null"]);
  });

  it("filters by consumes (conjunctive): only operators that consume all requested types", async () => {
    const atLanding = "at-landing";
    const atCopy = "at-copy";
    const client = mockClient(
      new Map([
        [
          "SELECT id, key FROM artifact_types WHERE key = ANY($1::text[])",
          { rows: [{ id: atLanding, key: "landing_page" }, { id: atCopy, key: "copy" }] },
        ],
        [
          "SELECT o.id, o.key, o.priority FROM operators o JOIN operator_produces_artifact_type opat ON opat.operator_id = o.id WHERE opat.artifact_type_id = $1",
          {
            rows: [
              { id: "op-landing", key: "landing_page_generate", priority: 10 },
              { id: "op-other", key: "other_landing", priority: 20 },
            ],
          },
        ],
        [
          "SELECT operator_id FROM operator_consumes_artifact_type WHERE artifact_type_id = ANY($1::uuid[]) GROUP BY operator_id HAVING COUNT(*) = $2",
          { rows: [{ operator_id: "op-landing" }] },
        ],
      ])
    );
    const r = await resolveOperators(client, { produces: "landing_page", consumes: ["copy"] });
    assert.deepEqual(r.operators, ["landing_page_generate"]);
  });

  it("boundary: resolver does not create nodes or mutate plan (read-only: only SELECT queries)", async () => {
    const queries: string[] = [];
    const client = {
      query: async (text: string) => {
        queries.push(text.replace(/\s+/g, " ").trim());
        if (text.includes("artifact_types")) return { rows: [{ id: "at1", key: "copy" }] } as never;
        if (text.includes("operator_produces_artifact_type")) return { rows: [{ id: "o1", key: "copy_generate", priority: 10 }] } as never;
        return { rows: [] } as never;
      },
    } as unknown as PoolClient;
    await resolveOperators(client, { produces: "copy" });
    const hasInsert = queries.some((q) => q.toUpperCase().startsWith("INSERT"));
    const hasUpdate = queries.some((q) => q.toUpperCase().startsWith("UPDATE"));
    const hasDelete = queries.some((q) => q.toUpperCase().startsWith("DELETE"));
    assert.equal(hasInsert, false, "resolver must not INSERT");
    assert.equal(hasUpdate, false, "resolver must not UPDATE");
    assert.equal(hasDelete, false, "resolver must not DELETE");
  });

  it("same produces and consumes returns same order (deterministic)", async () => {
    const atId = "at-id";
    const client = mockClient(
      new Map([
        ["SELECT id, key FROM artifact_types WHERE key = ANY($1::text[])", { rows: [{ id: atId, key: "copy" }] }],
        [
          "SELECT o.id, o.key, o.priority FROM operators o JOIN operator_produces_artifact_type opat ON opat.operator_id = o.id WHERE opat.artifact_type_id = $1",
          { rows: [{ id: "op1", key: "copy_generate", priority: 10 }] },
        ],
      ])
    );
    const a = await resolveOperators(client, { produces: "copy" });
    const b = await resolveOperators(client, { produces: "copy" });
    assert.deepEqual(a.operators, b.operators);
  });
});
