/**
 * Graph OS API routes: GET/POST /v1/graphs/* and /v1/graph/*.
 */

import type { Express } from "express";
import { v4 as uuid } from "uuid";
import { pool, withTransaction } from "../db.js";
import { createRun } from "../scheduler.js";
import { routeRun } from "../release-manager.js";
import { isValidProjectionKey } from "./base/mapping-loader.js";
import { strategyGraph } from "./strategy-graph.js";
import { catalogGraph } from "./catalog-graph.js";
import { dependencyGraph } from "./dependency-graph.js";
import type { GraphProjectionKey } from "./base/types.js";

const PROJECTIONS: Record<GraphProjectionKey, { build: (client: import("pg").PoolClient, opts?: { nodeLimit?: number; edgeLimit?: number }) => Promise<import("./base/types.js").GraphProjectionResult>; query: (client: import("pg").PoolClient, request: import("./base/types.js").GraphQueryRequest) => Promise<import("./base/types.js").GraphQueryResponse> }> = {
  strategy: strategyGraph,
  catalog: catalogGraph,
  dependency: dependencyGraph,
  topology: { build: async () => ({ graph: "topology", nodes: [], edges: [], summary: { node_count: 0, edge_count: 0, node_counts_by_kind: {}, edge_counts_by_kind: {} } }), query: async (_c, req) => ({ graph: "topology", nodes: [], edges: [] }) },
  governance: { build: async () => ({ graph: "governance", nodes: [], edges: [], summary: { node_count: 0, edge_count: 0, node_counts_by_kind: {}, edge_counts_by_kind: {} } }), query: async (_c, req) => ({ graph: "governance", nodes: [], edges: [] }) },
};

export function registerGraphRoutes(app: Express): void {
  /** GET /v1/graphs/schema — schema as graph (Phase 6.4); must be before :name */
  app.get("/v1/graphs/schema", async (_req, res) => {
    try {
      const tables = await pool.query(
        `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') AND table_type = 'BASE TABLE' ORDER BY table_schema, table_name LIMIT 200`
      );
      const columns = await pool.query(
        `SELECT table_schema, table_name, column_name, data_type FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name, ordinal_position LIMIT 1000`
      );
      const nodes = [
        ...tables.rows.map((r: { table_schema: string; table_name: string }) => ({
          node_id: `schema:table:${r.table_schema}.${r.table_name}`,
          node_kind: "table",
          label: `${r.table_schema}.${r.table_name}`,
          backing_table: "information_schema.tables",
          metadata: r,
        })),
        ...columns.rows.map((r: { table_schema: string; table_name: string; column_name: string; data_type: string }) => ({
          node_id: `schema:column:${r.table_schema}.${r.table_name}.${r.column_name}`,
          node_kind: "column",
          label: r.column_name,
          backing_table: "information_schema.columns",
          metadata: r,
        })),
      ];
      const edges = columns.rows.map((r: { table_schema: string; table_name: string; column_name: string }) => ({
        edge_id: `schema:contains:${r.table_schema}.${r.table_name}->${r.column_name}`,
        edge_kind: "contains",
        from_node_id: `schema:table:${r.table_schema}.${r.table_name}`,
        to_node_id: `schema:column:${r.table_schema}.${r.table_name}.${r.column_name}`,
      }));
      res.json({ graph: "schema", nodes, edges, summary: { node_count: nodes.length, edge_count: edges.length } });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  /** GET /v1/graphs/:name — return projection by name */
  app.get("/v1/graphs/:name", async (req, res) => {
    const name = (req.params.name ?? "").toLowerCase();
    if (!isValidProjectionKey(name)) {
      return res.status(400).json({ error: "Invalid projection name", valid: ["dependency", "topology", "strategy", "governance", "catalog"] });
    }
    try {
      const result = await withTransaction(async (client) => {
        return PROJECTIONS[name].build(client, { nodeLimit: 500, edgeLimit: 1000 });
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  /** POST /v1/graphs/query — structured graph query */
  app.post("/v1/graphs/query", async (req, res) => {
    const body = req.body as { graph?: string; preset?: string; query?: Record<string, unknown> };
    const graph = body?.graph?.toLowerCase();
    if (!graph || !isValidProjectionKey(graph)) {
      return res.status(400).json({ error: "Missing or invalid graph", valid: ["dependency", "topology", "strategy", "governance", "catalog"] });
    }
    try {
      const response = await withTransaction((client) =>
        PROJECTIONS[graph].query(client, { graph: graph as GraphProjectionKey, preset: body.preset, query: body.query })
      );
      res.json(response);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  /** POST /v1/graph/nodes — create canonical node (platform_graph_nodes) */
  app.post("/v1/graph/nodes", async (req, res) => {
    const body = req.body as { kind_key?: string; kind_id?: string; backing_table?: string; backing_id?: string; state?: string; title?: string; slug?: string; summary?: string; spec_json?: Record<string, unknown>; owner_type?: string; owner_id?: string };
    try {
      const kindId = body.kind_id ?? (body.kind_key
        ? (await pool.query("SELECT id FROM graph_node_kinds WHERE key = $1", [body.kind_key])).rows[0]?.id
        : null);
      if (!kindId) return res.status(400).json({ error: "kind_key or kind_id required" });
      const r = await pool.query(
        `INSERT INTO platform_graph_nodes (kind_id, backing_table, backing_id, state, title, slug, summary, spec_json, owner_type, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, kind_id, backing_table, backing_id, state, title, slug, summary, spec_json, created_at`,
        [
          kindId,
          body.backing_table ?? null,
          body.backing_id != null ? String(body.backing_id) : null,
          body.state ?? "declared",
          body.title ?? null,
          body.slug ?? null,
          body.summary ?? null,
          body.spec_json ? JSON.stringify(body.spec_json) : null,
          body.owner_type ?? null,
          body.owner_id ?? null,
        ]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  /** GET /v1/graph/nodes/:id — get one node by canonical id or uuid */
  app.get("/v1/graph/nodes/:id", async (req, res) => {
    const id = req.params.id;
    try {
      const isUuid = /^[0-9a-f-]{36}$/i.test(id);
      if (isUuid) {
        const r = await pool.query(
          `SELECT n.id, n.kind_id, k.key AS kind_key, n.backing_table, n.backing_id, n.state, n.title, n.slug, n.summary, n.spec_json, n.observed_json, n.desired_json, n.created_at
           FROM platform_graph_nodes n JOIN graph_node_kinds k ON k.id = n.kind_id WHERE n.id = $1 AND n.archived_at IS NULL`,
          [id]
        );
        if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
        return res.json(r.rows[0]);
      }
      const r = await pool.query(
        `SELECT n.id, n.kind_id, k.key AS kind_key, n.backing_table, n.backing_id, n.state, n.title, n.slug, n.summary, n.spec_json, n.observed_json, n.desired_json, n.created_at
         FROM platform_graph_nodes n JOIN graph_node_kinds k ON k.id = n.kind_id
         WHERE n.backing_table IS NOT NULL AND n.backing_id IS NOT NULL AND n.archived_at IS NULL
         AND ('g:' || k.key || ':' || n.backing_table || ':' || n.backing_id) = $1`,
        [id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  /** POST /v1/graph/edges — create canonical edge (platform_graph_edges) */
  app.post("/v1/graph/edges", async (req, res) => {
    const body = req.body as { from_node_id: string; to_node_id: string; edge_kind_key?: string; edge_kind_id?: string; metadata_json?: Record<string, unknown> };
    try {
      const edgeKindId = body.edge_kind_id ?? (body.edge_kind_key
        ? (await pool.query("SELECT id FROM graph_edge_kinds WHERE key = $1", [body.edge_kind_key])).rows[0]?.id
        : null);
      if (!edgeKindId || !body.from_node_id || !body.to_node_id) {
        return res.status(400).json({ error: "from_node_id, to_node_id, and edge_kind_key or edge_kind_id required" });
      }
      const r = await pool.query(
        `INSERT INTO platform_graph_edges (from_node_id, edge_kind_id, to_node_id, metadata_json)
         SELECT $1::uuid, $2, $3::uuid, $4
         WHERE EXISTS (SELECT 1 FROM platform_graph_nodes WHERE id = $1::uuid AND archived_at IS NULL)
         AND EXISTS (SELECT 1 FROM platform_graph_nodes WHERE id = $3::uuid AND archived_at IS NULL)
         RETURNING id, from_node_id, edge_kind_id, to_node_id, metadata_json, created_at`,
        [body.from_node_id, edgeKindId, body.to_node_id, body.metadata_json ? JSON.stringify(body.metadata_json) : null]
      );
      if (r.rows.length === 0) return res.status(400).json({ error: "Node not found or invalid UUID" });
      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  /** GET /v1/graph/subgraph — subgraph by filters (initiative_id, root_node_id, node_kind, depth, edge_kind) */
  app.get("/v1/graph/subgraph", async (req, res) => {
    const initiative_id = req.query.initiative_id as string | undefined;
    const root_node_id = req.query.root_node_id as string | undefined;
    const node_kind = req.query.node_kind as string | undefined;
    const depth = Math.min(Number(req.query.depth) || 3, 10);
    const edge_kind = req.query.edge_kind as string | undefined;
    try {
      if (!root_node_id && !initiative_id) {
        return res.status(400).json({ error: "root_node_id or initiative_id required" });
      }
      let nodeIds: string[] = [];
      if (root_node_id) {
        const r = await pool.query(
          `WITH RECURSIVE sub(nid, d) AS (
            SELECT id::text, 1 FROM platform_graph_nodes WHERE id = $1::uuid AND archived_at IS NULL
            UNION ALL
            SELECT e.to_node_id::text, s.d + 1 FROM platform_graph_edges e
            JOIN sub s ON s.nid = e.from_node_id::text
            WHERE e.archived_at IS NULL AND s.d < $2
            ${edge_kind ? "AND e.edge_kind_id = (SELECT id FROM graph_edge_kinds WHERE key = $3)" : ""}
          ) SELECT nid FROM sub`,
          edge_kind ? [root_node_id, depth, edge_kind] : [root_node_id, depth]
        );
        nodeIds = r.rows.map((row: { nid: string }) => row.nid);
      }
      if (initiative_id && nodeIds.length === 0) {
        const r = await pool.query(
          "SELECT id::text FROM platform_graph_nodes WHERE (spec_json->>'initiative_id') = $1 OR (desired_json->>'initiative_id') = $1 AND archived_at IS NULL",
          [initiative_id]
        );
        nodeIds = r.rows.map((row: { id: string }) => row.id);
      }
      if (nodeIds.length === 0) {
        return res.json({ nodes: [], edges: [] });
      }
      const cond = node_kind ? "AND k.key = $2" : "";
      const params = node_kind ? [nodeIds, node_kind] : [nodeIds];
      const nodesQ = await pool.query(
        `SELECT n.id, k.key AS kind_key, n.backing_table, n.backing_id, n.state, n.title, n.slug, n.summary, n.spec_json, n.created_at
         FROM platform_graph_nodes n JOIN graph_node_kinds k ON k.id = n.kind_id
         WHERE n.id::text = ANY($1) AND n.archived_at IS NULL ${cond}`,
        params
      );
      const edgesQ = await pool.query(
        `SELECT e.id, ek.key AS edge_kind_key, e.from_node_id, e.to_node_id, e.metadata_json, e.created_at
         FROM platform_graph_edges e JOIN graph_edge_kinds ek ON ek.id = e.edge_kind_id
         WHERE e.from_node_id::text = ANY($1) AND e.to_node_id::text = ANY($1) AND e.archived_at IS NULL`,
        [nodeIds]
      );
      res.json({ nodes: nodesQ.rows, edges: edgesQ.rows });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  // --- Phase 3: Operators ---
  app.post("/v1/operators/register", async (req, res) => {
    try {
      const b = req.body as { key: string; display_name?: string; description?: string; version?: string; handler_key: string; determinism_level?: string; config_json?: Record<string, unknown> };
      if (!b?.key || !b?.handler_key) return res.status(400).json({ error: "key and handler_key required" });
      const r = await pool.query(
        `INSERT INTO operator_definitions (key, display_name, description, version, handler_key, determinism_level, config_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (key) DO UPDATE SET display_name = EXCLUDED.display_name, handler_key = EXCLUDED.handler_key, updated_at = now() RETURNING id, key, display_name, version, handler_key, status, created_at`,
        [b.key, b.display_name ?? null, b.description ?? null, b.version ?? "1", b.handler_key, b.determinism_level ?? null, b.config_json ? JSON.stringify(b.config_json) : null]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/operators", async (req, res) => {
    try {
      const artifact_type = req.query.artifact_type as string | undefined;
      const status = (req.query.status as string) || "active";
      let q = "SELECT id, key, display_name, description, version, handler_key, determinism_level, status, config_json, created_at FROM operator_definitions WHERE status = $1";
      const params: unknown[] = [status];
      if (artifact_type) {
        q += " AND id IN (SELECT operator_definition_id FROM operator_capability_bindings WHERE artifact_type = $2 OR node_kind_key = $2)";
        params.push(artifact_type);
      }
      q += " ORDER BY key";
      const r = await pool.query(q, params);
      res.json({ items: r.rows });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/operators/resolve", async (req, res) => {
    try {
      const b = req.body as { node_kind?: string; artifact_type?: string; required_state?: string; environment?: string };
      const r = await pool.query(
        `SELECT od.id, od.key, od.display_name, od.handler_key, ocb.priority, ocb.is_default
         FROM operator_definitions od
         JOIN operator_capability_bindings ocb ON ocb.operator_definition_id = od.id
         WHERE od.status = 'active' AND (ocb.node_kind_key = $1 OR ocb.artifact_type = $2 OR $1 IS NULL AND $2 IS NULL)
         ORDER BY ocb.is_default DESC, ocb.priority ASC`,
        [b?.node_kind ?? null, b?.artifact_type ?? null]
      );
      res.json({ operators: r.rows, missing_inputs: [] });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/operators/:id/execute", async (req, res) => {
    try {
      const body = req.body as { initiative_id?: string; environment?: string };
      const initiativeId = body?.initiative_id?.trim();
      if (!initiativeId) return res.status(400).json({ error: "initiative_id required" });
      const environment = (body?.environment && ["sandbox", "staging", "prod"].includes(body.environment)) ? body.environment : "sandbox";

      const op = await pool.query("SELECT id, key, handler_key FROM operator_definitions WHERE id = $1 AND status = 'active'", [req.params.id]);
      if (op.rows.length === 0) return res.status(404).json({ error: "Operator not found" });
      const handlerKey = (op.rows[0] as { handler_key: string }).handler_key;

      const runId = await withTransaction(async (client) => {
        const initCheck = await client.query("SELECT id FROM initiatives WHERE id = $1", [initiativeId]);
        if (initCheck.rows.length === 0) throw new Error("Initiative not found");
        const planHash = `operator-execute:${req.params.id}`;
        let planId: string;
        const existing = await client.query("SELECT id FROM plans WHERE initiative_id = $1 AND plan_hash = $2", [initiativeId, planHash]);
        if (existing.rows.length > 0) {
          planId = (existing.rows[0] as { id: string }).id;
        } else {
          planId = uuid();
          await client.query("INSERT INTO plans (id, initiative_id, plan_hash) VALUES ($1, $2, $3)", [planId, initiativeId, planHash]);
          const nodeId = uuid();
          await client.query("INSERT INTO plan_nodes (id, plan_id, node_key, job_type, node_type) VALUES ($1, $2, $3, $4, 'job')", [nodeId, planId, "execute", handlerKey]);
        }
        let releaseId: string;
        try {
          const route = await routeRun(pool, environment as "sandbox" | "staging" | "prod");
          releaseId = route.releaseId;
        } catch {
          const ins = await pool.query("INSERT INTO releases (id, status, percent_rollout) VALUES ($1, 'promoted', 100) RETURNING id", [uuid()]);
          releaseId = (ins.rows[0] as { id: string }).id;
        }
        return createRun(client as import("pg").PoolClient, {
          planId,
          releaseId,
          policyVersion: "latest",
          environment: environment as "sandbox" | "staging" | "prod",
          cohort: "control",
          rootIdempotencyKey: `operator-execute:${req.params.id}:${Date.now()}`,
        });
      });

      res.status(201).json({ run_id: runId, operator_id: req.params.id, handler_key: handlerKey, message: "Run created; runner will execute when connected." });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "Initiative not found") return res.status(404).json({ error: msg });
      res.status(500).json({ error: msg });
    }
  });

  // --- Phase 3: Saved flows ---
  app.post("/v1/flows", async (req, res) => {
    try {
      const b = req.body as { key: string; name?: string; description?: string; input_schema_json?: Record<string, unknown>; default_params_json?: Record<string, unknown>; invocation_mode?: string };
      if (!b?.key) return res.status(400).json({ error: "key required" });
      const r = await pool.query(
        `INSERT INTO saved_flows (key, name, description, input_schema_json, default_params_json, invocation_mode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, key, name, status, created_at`,
        [b.key, b.name ?? null, b.description ?? null, b.input_schema_json ? JSON.stringify(b.input_schema_json) : null, b.default_params_json ? JSON.stringify(b.default_params_json) : null, b.invocation_mode ?? "manual"]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/flows", async (_req, res) => {
    try {
      const r = await pool.query("SELECT id, key, name, description, status, invocation_mode, created_at FROM saved_flows ORDER BY key");
      res.json({ items: r.rows });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/flows/:id", async (req, res) => {
    try {
      const r = await pool.query("SELECT * FROM saved_flows WHERE id = $1", [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/flows/:id/run", async (req, res) => {
    try {
      const idempotency_key = (req.body as { idempotency_key?: string })?.idempotency_key ?? (req.headers["idempotency-key"] as string) ?? null;
      if (!idempotency_key) return res.status(400).json({ error: "idempotency_key required" });
      const body = req.body as { initiative_id?: string; environment?: string };
      const initiativeId = body?.initiative_id?.trim();
      const flow = await pool.query("SELECT id, key, name FROM saved_flows WHERE id = $1 AND status = 'active'", [req.params.id]);
      if (flow.rows.length === 0) return res.status(404).json({ error: "Flow not found" });
      const bindings = await pool.query(
        "SELECT operator_definition_id FROM saved_flow_bindings WHERE saved_flow_id = $1 AND operator_definition_id IS NOT NULL ORDER BY created_at LIMIT 1",
        [req.params.id]
      );
      if (bindings.rows.length === 0) {
        return res.status(202).json({ flow_id: req.params.id, idempotency_key, message: "No operator bindings; add bindings to run this flow.", run_id: null });
      }
      const operatorId = (bindings.rows[0] as { operator_definition_id: string }).operator_definition_id;
      if (!initiativeId) {
        return res.status(400).json({ error: "initiative_id required to execute flow" });
      }
      const environment = (body?.environment && ["sandbox", "staging", "prod"].includes(body.environment)) ? body.environment : "sandbox";
      const op = await pool.query("SELECT id, handler_key FROM operator_definitions WHERE id = $1 AND status = 'active'", [operatorId]);
      if (op.rows.length === 0) return res.status(400).json({ error: "Flow references inactive or missing operator" });
      const handlerKey = (op.rows[0] as { handler_key: string }).handler_key;

      const runId = await withTransaction(async (client) => {
        const initCheck = await client.query("SELECT id FROM initiatives WHERE id = $1", [initiativeId]);
        if (initCheck.rows.length === 0) throw new Error("Initiative not found");
        const planHash = `flow-run:${req.params.id}:${idempotency_key}`;
        let planId: string;
        const existing = await client.query("SELECT id FROM plans WHERE initiative_id = $1 AND plan_hash = $2", [initiativeId, planHash]);
        if (existing.rows.length > 0) planId = (existing.rows[0] as { id: string }).id;
        else {
          planId = uuid();
          await client.query("INSERT INTO plans (id, initiative_id, plan_hash) VALUES ($1, $2, $3)", [planId, initiativeId, planHash]);
          const nodeId = uuid();
          await client.query("INSERT INTO plan_nodes (id, plan_id, node_key, job_type, node_type) VALUES ($1, $2, $3, $4, 'job')", [nodeId, planId, "flow_step", handlerKey]);
        }
        let releaseId: string;
        try {
          const route = await routeRun(pool, environment as "sandbox" | "staging" | "prod");
          releaseId = route.releaseId;
        } catch {
          const ins = await pool.query("INSERT INTO releases (id, status, percent_rollout) VALUES ($1, 'promoted', 100) RETURNING id", [uuid()]);
          releaseId = (ins.rows[0] as { id: string }).id;
        }
        return createRun(client as import("pg").PoolClient, {
          planId,
          releaseId,
          policyVersion: "latest",
          environment: environment as "sandbox" | "staging" | "prod",
          cohort: "control",
          rootIdempotencyKey: idempotency_key,
        });
      });

      res.status(201).json({ run_id: runId, flow_id: req.params.id, idempotency_key, message: "Flow run started (first bound operator)." });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "Initiative not found") return res.status(404).json({ error: msg });
      res.status(500).json({ error: msg });
    }
  });

  // --- Phase 4: Ask / Intent ---
  app.post("/v1/ask", async (req, res) => {
    try {
      const b = req.body as { raw_text: string; source_type?: string; context?: Record<string, unknown>; initiative_id?: string };
      if (!b?.raw_text) return res.status(400).json({ error: "raw_text required" });
      const doc = await pool.query(
        `INSERT INTO intent_documents (source_type, raw_text, context_json, status) VALUES ($1, $2, $3, 'pending') RETURNING id`,
        [b.source_type ?? "api", b.raw_text, b.context ? JSON.stringify(b.context) : null]
      );
      const intentId = doc.rows[0].id;
      await pool.query(
        `INSERT INTO intent_resolutions (intent_document_id, resolution_type, confidence, requires_approval, status) VALUES ($1, 'unknown', 0, true, 'proposed') RETURNING id`,
        [intentId]
      );
      res.json({
        intent_type: "unknown",
        confidence: 0,
        requires_approval: true,
        resolved_endpoint: null,
        resolved_params: null,
        intent_document_id: intentId,
      });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/intents", async (req, res) => {
    try {
      const b = req.body as { raw_text: string; source_type?: string; context?: Record<string, unknown>; initiative_id?: string };
      if (!b?.raw_text) return res.status(400).json({ error: "raw_text required" });
      const r = await pool.query(
        `INSERT INTO intent_documents (source_type, raw_text, context_json, status) VALUES ($1, $2, $3, 'pending') RETURNING id, created_at`,
        [b.source_type ?? "api", b.raw_text, b.context ? JSON.stringify(b.context) : null]
      );
      res.status(201).json({ intent_document_id: r.rows[0].id, created_at: r.rows[0].created_at });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/intents/:id/compile", async (req, res) => {
    try {
      const r = await pool.query(
        `INSERT INTO build_specs (intent_document_id, status) SELECT $1, 'draft' WHERE EXISTS (SELECT 1 FROM intent_documents WHERE id = $1) RETURNING id, intent_document_id, status, created_at`,
        [req.params.id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "Intent not found" });
      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/build-specs/:id", async (req, res) => {
    try {
      const r = await pool.query("SELECT * FROM build_specs WHERE id = $1", [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/build-specs/:id/materialize", async (req, res) => {
    try {
      const spec = await pool.query("SELECT id, initiative_id, goal_type, requested_outputs_json, status FROM build_specs WHERE id = $1", [req.params.id]);
      if (spec.rows.length === 0) return res.status(404).json({ error: "Not found" });
      const buildSpecId = spec.rows[0].id;
      const kindRow = await pool.query("SELECT id FROM graph_node_kinds WHERE key = 'plan' LIMIT 1");
      const kindId = kindRow.rows[0]?.id;
      if (!kindId) return res.status(500).json({ error: "graph_node_kinds not seeded" });
      const nodeRow = await pool.query(
        `INSERT INTO platform_graph_nodes (kind_id, backing_table, backing_id, state, title, spec_json) VALUES ($1, 'build_specs', $2, 'declared', $3, $4) RETURNING id`,
        [kindId, buildSpecId, `Build spec ${buildSpecId}`, JSON.stringify({ goal_type: spec.rows[0].goal_type, requested_outputs_json: spec.rows[0].requested_outputs_json, initiative_id: spec.rows[0].initiative_id })]
      );
      const graphNodeId = nodeRow.rows[0].id;
      await pool.query(
        `INSERT INTO build_spec_nodes (build_spec_id, graph_node_id, role_key, required_state) VALUES ($1, $2, 'primary', 'declared') ON CONFLICT (build_spec_id, role_key) DO UPDATE SET graph_node_id = EXCLUDED.graph_node_id`,
        [buildSpecId, graphNodeId]
      );
      await pool.query("UPDATE build_specs SET status = 'materialized', updated_at = now() WHERE id = $1", [buildSpecId]);
      res.json({ build_spec_id: buildSpecId, graph_node_id: graphNodeId, message: "Materialized; one platform_graph_node created and linked in build_spec_nodes." });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  // --- Phase 6: Reconcile ---
  app.post("/v1/reconcile/node/:id", async (req, res) => {
    try {
      const idempotency_key = (req.body as { idempotency_key?: string })?.idempotency_key ?? (req.headers["idempotency-key"] as string) ?? `reconcile-${req.params.id}-${Date.now()}`;
      const r = await pool.query(
        `INSERT INTO reconciliation_tasks (graph_node_id, idempotency_key, status) VALUES ($1::uuid, $2, 'pending')
         ON CONFLICT (idempotency_key) DO UPDATE SET graph_node_id = EXCLUDED.graph_node_id RETURNING id, graph_node_id, status, idempotency_key, created_at`,
        [req.params.id, idempotency_key]
      );
      res.status(202).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/reconcile/subgraph", async (req, res) => {
    try {
      const b = req.body as { initiative_id?: string; root_node_id?: string; desired_state?: string; idempotency_key?: string };
      const idempotencyBase = b?.idempotency_key ?? `subgraph:${Date.now()}`;
      let nodeIds: string[] = [];

      if (b?.root_node_id) {
        const r = await pool.query(
          `WITH RECURSIVE sub(nid, d) AS (
            SELECT id::text, 1 FROM platform_graph_nodes WHERE id = $1::uuid AND archived_at IS NULL
            UNION ALL
            SELECT e.to_node_id::text, s.d + 1 FROM platform_graph_edges e JOIN sub s ON s.nid = e.from_node_id::text WHERE e.archived_at IS NULL AND s.d < 20
          ) SELECT nid FROM sub`,
          [b.root_node_id]
        );
        nodeIds = r.rows.map((row: { nid: string }) => row.nid);
      } else if (b?.initiative_id) {
        const r = await pool.query(
          `SELECT id::text FROM platform_graph_nodes WHERE (spec_json->>'initiative_id' = $1 OR desired_json->>'initiative_id' = $1) AND archived_at IS NULL`,
          [b.initiative_id, b.initiative_id]
        );
        nodeIds = r.rows.map((row: { id: string }) => row.id);
        if (nodeIds.length === 0) {
          const fallback = await pool.query(
            "SELECT id::text FROM platform_graph_nodes WHERE backing_table = 'build_specs' AND archived_at IS NULL AND spec_json->>'initiative_id' = $1",
            [b.initiative_id]
          );
          nodeIds = fallback.rows.map((row: { id: string }) => row.id);
        }
      }

      if (nodeIds.length === 0) {
        return res.status(200).json({ message: "No nodes in scope", task_count: 0, node_ids: [] });
      }

      const desiredState = b?.desired_state ?? "produced";
      const inserted: { id: string; graph_node_id: string }[] = [];
      for (let i = 0; i < nodeIds.length; i++) {
        const idem = `${idempotencyBase}:${nodeIds[i]}`;
        const r = await pool.query(
          `INSERT INTO reconciliation_tasks (graph_node_id, idempotency_key, status, desired_state) VALUES ($1::uuid, $2, 'pending', $3)
           ON CONFLICT (idempotency_key) DO UPDATE SET desired_state = EXCLUDED.desired_state RETURNING id, graph_node_id`,
          [nodeIds[i], idem, desiredState]
        );
        if (r.rows.length > 0) inserted.push(r.rows[0] as { id: string; graph_node_id: string });
      }
      res.status(202).json({ message: "Reconciliation tasks enqueued", task_count: inserted.length, node_ids: nodeIds, desired_state: desiredState });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/reconciliation-tasks/:id", async (req, res) => {
    try {
      const r = await pool.query("SELECT * FROM reconciliation_tasks WHERE id = $1", [req.params.id]);
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  // --- Phase 6: Action and approval policies ---
  app.get("/v1/policies/action", async (_req, res) => {
    try {
      const r = await pool.query("SELECT policy_key, action_type, scope_type, scope_ref, environment, requires_approval, is_enabled FROM action_policies WHERE is_enabled = true ORDER BY policy_key");
      res.json({ items: r.rows });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/policies/action", async (req, res) => {
    try {
      const b = req.body as { policy_key: string; action_type: string; scope_type?: string; scope_ref?: string; environment?: string; requires_approval?: boolean; is_enabled?: boolean; rule_json?: Record<string, unknown> };
      if (!b?.policy_key || !b?.action_type) return res.status(400).json({ error: "policy_key and action_type required" });
      const r = await pool.query(
        `INSERT INTO action_policies (policy_key, action_type, scope_type, scope_ref, environment, requires_approval, is_enabled, rule_json)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (policy_key) DO UPDATE SET action_type = EXCLUDED.action_type, scope_type = EXCLUDED.scope_type, scope_ref = EXCLUDED.scope_ref, environment = EXCLUDED.environment, requires_approval = EXCLUDED.requires_approval, is_enabled = EXCLUDED.is_enabled, rule_json = EXCLUDED.rule_json, updated_at = now()
         RETURNING id, policy_key, action_type, requires_approval, is_enabled`,
        [b.policy_key, b.action_type, b.scope_type ?? null, b.scope_ref ?? null, b.environment ?? null, b.requires_approval ?? false, b.is_enabled ?? true, b.rule_json ? JSON.stringify(b.rule_json) : null]
      );
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/policies/approval", async (_req, res) => {
    try {
      const r = await pool.query("SELECT id, policy_key, scope_type, scope_ref, rule_json, is_active FROM approval_policies WHERE is_active = true ORDER BY policy_key");
      res.json({ items: r.rows });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/policies/approval", async (req, res) => {
    try {
      const b = req.body as { policy_key: string; scope_type?: string; scope_ref?: string; rule_json?: Record<string, unknown>; is_active?: boolean };
      if (!b?.policy_key) return res.status(400).json({ error: "policy_key required" });
      const r = await pool.query(
        `INSERT INTO approval_policies (policy_key, scope_type, scope_ref, rule_json, is_active)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (policy_key) DO UPDATE SET scope_type = EXCLUDED.scope_type, scope_ref = EXCLUDED.scope_ref, rule_json = EXCLUDED.rule_json, is_active = EXCLUDED.is_active, updated_at = now()
         RETURNING id, policy_key, scope_type, is_active`,
        [b.policy_key, b.scope_type ?? null, b.scope_ref ?? null, b.rule_json ? JSON.stringify(b.rule_json) : null, b.is_active ?? true]
      );
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/approvals/request", async (req, res) => {
    try {
      const b = req.body as { graph_node_id?: string; operator_definition_id?: string; action_key: string; reason?: string; requested_by?: string };
      if (!b?.action_key) return res.status(400).json({ error: "action_key required" });
      const r = await pool.query(
        `INSERT INTO approval_requests_v2 (graph_node_id, operator_definition_id, action_key, reason, requested_by, status)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'pending') RETURNING id, action_key, status, created_at`,
        [b.graph_node_id ?? null, b.operator_definition_id ?? null, b.action_key, b.reason ?? null, b.requested_by ?? "api"]
      );
      res.status(201).json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.get("/v1/approvals/requests", async (req, res) => {
    try {
      const status = (req.query.status as string) || "pending";
      const r = await pool.query("SELECT * FROM approval_requests_v2 WHERE status = $1 ORDER BY created_at DESC LIMIT 100", [status]);
      res.json({ items: r.rows });
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

  app.post("/v1/approvals/requests/:id/resolve", async (req, res) => {
    try {
      const action = (req.body as { action?: string })?.action ?? (req.body as { resolve?: string })?.resolve;
      if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "action must be approve or reject" });
      const status = action === "approve" ? "approved" : "rejected";
      const r = await pool.query(
        `UPDATE approval_requests_v2 SET status = $1, resolved_by = $2, resolved_at = now() WHERE id = $3 AND status = 'pending' RETURNING id, action_key, status, resolved_at`,
        [status, (req.headers["x-user-id"] as string) ?? "api", req.params.id]
      );
      if (r.rows.length === 0) return res.status(404).json({ error: "Not found or already resolved" });
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: String((e as Error).message) });
    }
  });

}
