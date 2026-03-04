/**
 * Admin Resource Registry — canonical definition per resource for generated CRUD.
 * Cursor and generators use this to produce /admin/[resource] pages consistently.
 */
export type AdminResource = {
  key: string;
  label: string;
  table: string;
  listColumns: { key: string; label: string }[];
  editableFields?: string[];
  permissions?: string[];
};

export const ADMIN_RESOURCES: AdminResource[] = [
  {
    key: "initiatives",
    label: "Initiatives",
    table: "initiatives",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "intent_type", label: "Intent Type" },
      { key: "title", label: "Title" },
      { key: "risk_level", label: "Risk" },
      { key: "created_at", label: "Created" },
    ],
    editableFields: ["intent_type", "title", "risk_level", "source_ref"],
  },
  {
    key: "plans",
    label: "Plans",
    table: "plans",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "initiative_id", label: "Initiative" },
      { key: "version", label: "Version" },
      { key: "status", label: "Status" },
      { key: "created_at", label: "Created" },
    ],
  },
  {
    key: "runs",
    label: "Runs",
    table: "runs",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "status", label: "Status" },
      { key: "environment", label: "Environment" },
      { key: "started_at", label: "Started" },
      { key: "finished_at", label: "Finished" },
    ],
  },
  {
    key: "job_runs",
    label: "Job Runs",
    table: "job_runs",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "run_id", label: "Run" },
      { key: "plan_node_id", label: "Plan Node" },
      { key: "status", label: "Status" },
      { key: "started_at", label: "Started" },
      { key: "finished_at", label: "Finished" },
    ],
  },
  {
    key: "artifacts",
    label: "Artifacts",
    table: "artifacts",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "artifact_type", label: "Type" },
      { key: "uri", label: "URI" },
      { key: "producer_plan_node_id", label: "Producer Node" },
      { key: "created_at", label: "Created" },
    ],
  },
  {
    key: "approvals",
    label: "Approvals",
    table: "approval_requests",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
      { key: "run_id", label: "Run" },
      { key: "created_at", label: "Created" },
    ],
  },
  {
    key: "plan_nodes",
    label: "Plan Nodes",
    table: "plan_nodes",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "plan_id", label: "Plan" },
      { key: "node_key", label: "Node Key" },
      { key: "job_type", label: "Job Type" },
      { key: "sequence", label: "Sequence" },
    ],
  },
  {
    key: "plan_edges",
    label: "Plan Edges",
    table: "plan_edges",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "plan_id", label: "Plan" },
      { key: "from_node_id", label: "From" },
      { key: "to_node_id", label: "To" },
    ],
  },
  {
    key: "tool_calls",
    label: "Tool Calls",
    table: "tool_calls",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "job_run_id", label: "Job Run" },
      { key: "capability", label: "Capability" },
      { key: "status", label: "Status" },
      { key: "started_at", label: "Started" },
    ],
  },
  {
    key: "agent_memory",
    label: "Agent Memory",
    table: "agent_memory",
    listColumns: [
      { key: "id", label: "ID" },
      { key: "scope", label: "Scope" },
      { key: "key", label: "Key" },
      { key: "created_at", label: "Created" },
    ],
  },
  {
    key: "mcp_servers",
    label: "MCP Servers",
    table: "mcp_server_config",
    listColumns: [
      { key: "name", label: "Name" },
      { key: "server_type", label: "Type" },
      { key: "url_or_cmd", label: "URL / Command" },
      { key: "active", label: "Active" },
      { key: "created_at", label: "Created" },
    ],
    editableFields: ["name", "server_type", "url_or_cmd", "auth_header", "capabilities"],
    permissions: ["admin", "operator"],
  },
];

export function getResource(key: string): AdminResource | undefined {
  return ADMIN_RESOURCES.find((r) => r.key === key);
}
