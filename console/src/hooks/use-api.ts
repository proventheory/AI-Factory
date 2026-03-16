"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useRuns(
  params?: { status?: string; intent_type?: string; environment?: string; limit?: number },
  options?: { refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: ["runs", params?.status, params?.intent_type, params?.environment, params?.limit],
    queryFn: () => api.getRuns(params),
    refetchInterval: options?.refetchInterval,
  });
}

export function useRun(id: string | null) {
  return useQuery({
    queryKey: ["run", id],
    queryFn: () => api.getRun(id!),
    enabled: !!id,
  });
}

export function useInitiatives(params?: { intent_type?: string; risk_level?: string; limit?: number }) {
  return useQuery({
    queryKey: ["initiatives", params?.intent_type, params?.risk_level, params?.limit],
    queryFn: () => api.getInitiatives(params),
  });
}

export function useInitiative(id: string | null) {
  return useQuery({
    queryKey: ["initiative", id],
    queryFn: () => api.getInitiative(id!),
    enabled: !!id,
  });
}

export function useCreateInitiative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { intent_type: string; title?: string | null; risk_level: string; source_ref?: string; brand_profile_id?: string | null }) => api.createInitiative(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
    },
  });
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ intent_type: string; title: string | null; risk_level: string; source_ref: string; goal_metadata: Record<string, unknown> }> }) => api.updateInitiative(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
      queryClient.invalidateQueries({ queryKey: ["initiative"] });
    },
  });
}

export function usePlans(params?: { initiative_id?: string; limit?: number }) {
  return useQuery({
    queryKey: ["plans", params?.initiative_id, params?.limit],
    queryFn: () => api.getPlans(params),
  });
}

export function usePlan(id: string | null) {
  return useQuery({
    queryKey: ["plan", id],
    queryFn: () => api.getPlan(id!),
    enabled: !!id,
  });
}

export function useBuildSpecs(initiativeId: string | null) {
  return useQuery({
    queryKey: ["build_specs", initiativeId],
    queryFn: () => api.getBuildSpecs(initiativeId!),
    enabled: !!initiativeId,
  });
}

export function useBuildSpec(id: string | null) {
  return useQuery({
    queryKey: ["build_spec", id],
    queryFn: () => api.getBuildSpec(id!),
    enabled: !!id,
  });
}

export function useLaunches(params?: { initiative_id?: string; limit?: number }) {
  return useQuery({
    queryKey: ["launches", params?.initiative_id, params?.limit],
    queryFn: () => api.getLaunches(params),
  });
}

export function useLaunch(id: string | null) {
  return useQuery({
    queryKey: ["launch", id],
    queryFn: () => api.getLaunch(id!),
    enabled: !!id,
  });
}

export function useCreateBuildSpec() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { initiative_id: string; spec: Record<string, unknown>; extended?: boolean }) => api.createBuildSpec(body),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["build_specs", v.initiative_id] });
      queryClient.invalidateQueries({ queryKey: ["launches"] });
      queryClient.invalidateQueries({ queryKey: ["launch"] });
    },
  });
}

export function useCreateBuildSpecFromStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { initiative_id: string; strategy_doc: string }) => api.createBuildSpecFromStrategy(body),
    onSuccess: (_, v) => {
      queryClient.invalidateQueries({ queryKey: ["build_specs", v.initiative_id] });
      queryClient.invalidateQueries({ queryKey: ["launches"] });
      queryClient.invalidateQueries({ queryKey: ["launch"] });
    },
  });
}

export function useLaunchAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, inputs }: { action: string; inputs: Record<string, unknown> }) => api.postLaunchAction(action, inputs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["launches"] });
      queryClient.invalidateQueries({ queryKey: ["launch"] });
    },
  });
}

export function useLaunchValidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (launchId: string) => api.postLaunchValidate(launchId),
    onSuccess: (_, launchId) => {
      queryClient.invalidateQueries({ queryKey: ["launch", launchId] });
      queryClient.invalidateQueries({ queryKey: ["launches"] });
    },
  });
}

export function useV1SliceFunnel() {
  return useQuery({
    queryKey: ["v1_slice_funnel"],
    queryFn: () => api.getV1SliceFunnel(),
  });
}

export function useDecisionLoopObserve() {
  return useQuery({
    queryKey: ["decision_loop_observe"],
    queryFn: () => api.getDecisionLoopObserve(),
  });
}

export function useDecisionLoopTick() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: { auto_act?: boolean; compute_baselines?: boolean }) => api.postDecisionLoopTick(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision_loop_observe"] });
      queryClient.invalidateQueries({ queryKey: ["memory_entries"] });
    },
  });
}

export function useDeployEvents(params?: { service_id?: string; status?: string; limit?: number }) {
  return useQuery({
    queryKey: ["deploy_events", params?.service_id, params?.status, params?.limit],
    queryFn: () => api.getDeployEvents(params),
  });
}

export function useDeployEventRepairPlan(deployId: string | null) {
  return useQuery({
    queryKey: ["deploy_event_repair_plan", deployId],
    queryFn: () => api.getDeployEventRepairPlan(deployId!),
    enabled: !!deployId,
  });
}

export function useDeployEventsSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.postDeployEventsSync(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deploy_events"] }),
  });
}

export function useDeployEventsSyncGitHub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.postDeployEventsSyncGitHub(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deploy_events"] }),
  });
}

/** Live Render service status (staging + prod) for operator dashboard. */
export function useRenderStatus(options?: { refetchInterval?: number | false }) {
  return useQuery({
    queryKey: ["render_status"],
    queryFn: () => api.getRenderStatus(),
    refetchInterval: options?.refetchInterval ?? 60_000, // default 1 min
  });
}

export function useImportGraph(serviceId: string | null) {
  return useQuery({
    queryKey: ["import_graph", serviceId],
    queryFn: () => api.getImportGraph(serviceId!),
    enabled: !!serviceId,
  });
}

export function useSchemaDrift(params?: { environment_a?: string; environment_b?: string }) {
  return useQuery({
    queryKey: ["schema_drift", params?.environment_a, params?.environment_b],
    queryFn: () => api.getSchemaDrift(params),
  });
}

export function useContractBreakageScan(params?: { scope_key?: string }) {
  return useQuery({
    queryKey: ["contract_breakage_scan", params?.scope_key],
    queryFn: () => api.getContractBreakageScan(params),
  });
}

export function useIncidentMemory(params?: { limit?: number; failure_class?: string }) {
  return useQuery({
    queryKey: ["incident_memory", params?.limit, params?.failure_class],
    queryFn: () => api.getIncidentMemory(params),
  });
}

export function useMemoryLookup(signature: string | null, options?: { limit?: number }) {
  return useQuery({
    queryKey: ["memory_lookup", signature, options?.limit],
    queryFn: () => api.getMemoryLookup({ signature: signature ?? undefined, limit: options?.limit }),
    enabled: !!signature,
  });
}

export function useCheckpoints(params?: { limit?: number; scope_type?: string; scope_id?: string }) {
  return useQuery({
    queryKey: ["checkpoints", params?.limit, params?.scope_type, params?.scope_id],
    queryFn: () => api.getCheckpoints(params),
  });
}

export function useCheckpoint(id: string | null) {
  return useQuery({
    queryKey: ["checkpoint", id],
    queryFn: () => api.getCheckpoint(id!),
    enabled: !!id,
  });
}

export function useCheckpointDiff(id: string | null) {
  return useQuery({
    queryKey: ["checkpoint_diff", id],
    queryFn: () => api.getCheckpointDiff(id!),
    enabled: !!id,
  });
}

export function usePostCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { scope_type: string; scope_id: string; run_id?: string }) => api.postCheckpoint(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checkpoints"] }),
  });
}

export function useFailureClusters(params?: { limit?: number }) {
  return useQuery({
    queryKey: ["failure_clusters", params?.limit],
    queryFn: () => api.getFailureClusters(params),
  });
}

export function useChangeEvents(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["change_events", params?.limit, params?.offset],
    queryFn: () => api.getChangeEvents(params),
  });
}

export function useChangeEvent(id: string | null) {
  return useQuery({
    queryKey: ["change_event", id],
    queryFn: () => api.getChangeEvent(id!),
    enabled: !!id,
  });
}

export function useChangeEventImpacts(id: string | null) {
  return useQuery({
    queryKey: ["change_event_impacts", id],
    queryFn: () => api.getChangeEventImpacts(id!),
    enabled: !!id,
  });
}

export function useGraphTopology(planId: string | null) {
  return useQuery({
    queryKey: ["graph_topology", planId],
    queryFn: () => api.getGraphTopology(planId!),
    enabled: !!planId,
  });
}

export function useGraphFrontier(runId: string | null) {
  return useQuery({
    queryKey: ["graph_frontier", runId],
    queryFn: () => api.getGraphFrontier(runId!),
    enabled: !!runId,
  });
}

export function useGraphRepairPlan(runId: string | null, nodeId: string | null) {
  return useQuery({
    queryKey: ["graph_repair_plan", runId, nodeId],
    queryFn: () => api.getGraphRepairPlan(runId!, nodeId!),
    enabled: !!runId && !!nodeId,
  });
}

export function usePostGraphSubgraphReplay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { run_id: string; node_ids?: string[] }) => api.postGraphSubgraphReplay(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["graph_repair_plan"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useMigrationGuard() {
  return useMutation({
    mutationFn: (body: { sql?: string; migration_ref?: string }) => api.postMigrationGuard(body),
  });
}

export function useGraphAudit(runId: string | null) {
  return useQuery({
    queryKey: ["graph_audit", runId],
    queryFn: () => api.getGraphAudit(runId!),
    enabled: !!runId,
  });
}

export function useGraphMissingCapabilities(planId: string | null) {
  return useQuery({
    queryKey: ["graph_missing_capabilities", planId],
    queryFn: () => api.getGraphMissingCapabilities(planId!),
    enabled: !!planId,
  });
}

export function useGraphLineage(artifactId: string | null) {
  return useQuery({
    queryKey: ["graph_lineage", artifactId],
    queryFn: () => api.getGraphLineage(artifactId!),
    enabled: !!artifactId,
  });
}

export function useBaselinesCompute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.postBaselinesCompute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision_loop_observe"] });
    },
  });
}

export function useArtifacts(params?: { limit?: number; artifact_class?: string; run_id?: string }) {
  return useQuery({
    queryKey: ["artifacts", params?.limit, params?.artifact_class, params?.run_id],
    queryFn: () => api.getArtifacts(params),
  });
}

export function useArtifact(id: string | null) {
  return useQuery({
    queryKey: ["artifact", id],
    queryFn: () => api.getArtifact(id!),
    enabled: !!id,
  });
}

export function useArtifactContent(id: string | null) {
  return useQuery({
    queryKey: ["artifact-content", id],
    queryFn: () => api.getArtifactContent(id!),
    enabled: !!id,
  });
}

export function useUpdateArtifact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: api.UpdateArtifactPayload }) => api.updateArtifact(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["artifact", id] });
      queryClient.invalidateQueries({ queryKey: ["artifact-content", id] });
      queryClient.invalidateQueries({ queryKey: ["artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["run"] });
    },
  });
}

export function useJobRuns(params?: { status?: string; environment?: string; run_id?: string; limit?: number }) {
  return useQuery({
    queryKey: ["job_runs", params?.status, params?.environment, params?.run_id, params?.limit],
    queryFn: () => api.getJobRuns(params),
  });
}

export function useJobRun(id: string | null) {
  return useQuery({
    queryKey: ["job_run", id],
    queryFn: () => api.getJobRun(id!),
    enabled: !!id,
  });
}

export function useApprovals(params?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ["approvals", params?.status, params?.limit],
    queryFn: () => api.getApprovals(params),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => api.getPendingApprovals(),
  });
}

export function useApproval(id: string | null) {
  return useQuery({
    queryKey: ["approval", id],
    queryFn: () => api.getApproval(id!),
    enabled: !!id,
  });
}

export function useToolCalls(params?: { run_id?: string; job_run_id?: string; limit?: number }) {
  return useQuery({
    queryKey: ["tool_calls", params?.run_id, params?.job_run_id, params?.limit],
    queryFn: () => api.getToolCalls(params),
  });
}

export function useRerunRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.rerunRun(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useCancelRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, reason }: { runId: string; reason?: string }) => api.cancelRun(runId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      queryClient.invalidateQueries({ queryKey: ["run"] });
    },
  });
}

export function useLlmCalls(params?: { run_id?: string; model_tier?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["llm_calls", params?.run_id, params?.model_tier, params?.limit, params?.offset],
    queryFn: () => api.getLlmCalls(params),
  });
}

export function useUsage(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["usage", params?.from, params?.to],
    queryFn: () => api.getUsage(params),
  });
}

export function useAgentMemory(params?: { initiative_id?: string; run_id?: string; scope?: string; limit?: number }) {
  return useQuery({
    queryKey: ["agent_memory", params?.initiative_id, params?.run_id, params?.scope, params?.limit],
    queryFn: () => api.getAgentMemory(params),
  });
}

export function useAgentMemoryById(id: string | null) {
  return useQuery({
    queryKey: ["agent_memory", id],
    queryFn: () => api.getAgentMemoryById(id!),
    enabled: !!id,
  });
}

export function useMcpServers(params?: { limit?: number }) {
  return useQuery({
    queryKey: ["mcp_servers", params?.limit],
    queryFn: () => api.getMcpServers(params),
  });
}

export function useMcpServer(id: string | null) {
  return useQuery({
    queryKey: ["mcp_server", id],
    queryFn: () => api.getMcpServer(id!),
    enabled: !!id,
  });
}

export function useJobRunLlmCalls(jobRunId: string | null) {
  return useQuery({
    queryKey: ["job_run_llm_calls", jobRunId],
    queryFn: () => api.getJobRunLlmCalls(jobRunId!),
    enabled: !!jobRunId,
  });
}

export function useUsageByJobType(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["usage_by_job_type", params?.from, params?.to],
    queryFn: () => api.getUsageByJobType(params),
  });
}

export function useAnalytics(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["analytics", params?.from, params?.to],
    queryFn: () => api.getAnalytics(params),
  });
}

export function useEmailCampaigns(params?: { limit?: number; offset?: number; campaign_kind?: string }) {
  return useQuery({
    queryKey: ["email_designs", params?.limit, params?.offset, params?.campaign_kind],
    queryFn: () => api.getEmailCampaigns(params),
  });
}

export function useEmailCampaign(id: string | null) {
  return useQuery({
    queryKey: ["email_design", id],
    queryFn: () => api.getEmailCampaign(id!),
    enabled: !!id,
  });
}

export function useCreateEmailCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createEmailCampaign>[0]) => api.createEmailCampaign(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email_designs"] }),
  });
}

export function useUpdateEmailCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateEmailCampaign>[1] }) => api.updateEmailCampaign(id, body),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["email_designs"] });
      queryClient.invalidateQueries({ queryKey: ["email_design", id] });
    },
  });
}

export function useSitemapProducts() {
  return useMutation({
    mutationFn: (params: { sitemap_url: string; sitemap_type: string; page?: number; limit?: number }) => api.fetchSitemapProducts(params),
  });
}

export function useProductsFromUrl() {
  return useMutation({
    mutationFn: (params: { url: string; type: "shopify_json" | "sitemap_xml"; sitemap_type?: string; limit?: number }) => api.fetchProductsFromUrl(params),
  });
}

export function useEmailTemplates(params?: { type?: string; brand_profile_id?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["email_templates", params?.type, params?.brand_profile_id, params?.limit, params?.offset],
    queryFn: () => api.getEmailTemplates(params),
  });
}

export function useEmailTemplate(id: string | null) {
  return useQuery({
    queryKey: ["email_template", id],
    queryFn: () => api.getEmailTemplate(id!),
    enabled: !!id,
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteEmailTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email_templates"] }),
  });
}

// ——— Klaviyo operator pack ———
export function useKlaviyoTemplates(brand_profile_id?: string) {
  return useQuery({
    queryKey: ["klaviyo_templates", brand_profile_id],
    queryFn: () => api.getKlaviyoTemplates(brand_profile_id),
  });
}

export function useKlaviyoCampaigns(brand_profile_id?: string) {
  return useQuery({
    queryKey: ["klaviyo_campaigns", brand_profile_id],
    queryFn: () => api.getKlaviyoCampaigns(brand_profile_id),
  });
}

export function useKlaviyoFlows(brand_profile_id?: string) {
  return useQuery({
    queryKey: ["klaviyo_flows", brand_profile_id],
    queryFn: () => api.getKlaviyoFlows(brand_profile_id),
  });
}

export function useKlaviyoCampaignsPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.postKlaviyoCampaignsPush>[0]) => api.postKlaviyoCampaignsPush(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["klaviyo_campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["klaviyo_templates"] });
    },
  });
}

export function useKlaviyoFlowsCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.postKlaviyoFlows>[0]) => api.postKlaviyoFlows(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["klaviyo_flows"] }),
  });
}

export function useKlaviyoFlowSetStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ flowId, body }: { flowId: string; body: Parameters<typeof api.patchKlaviyoFlowStatus>[1] }) => api.patchKlaviyoFlowStatus(flowId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["klaviyo_flows"] }),
  });
}

export function useRoutingPolicies() {
  return useQuery({
    queryKey: ["routing_policies"],
    queryFn: () => api.getRoutingPolicies(),
  });
}

export function useLlmBudgets(params?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["llm_budgets", params?.limit, params?.offset],
    queryFn: () => api.getLlmBudgets(params),
  });
}

export function useWebhookOutbox(params?: { status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["webhook_outbox", params?.status, params?.limit, params?.offset],
    queryFn: () => api.getWebhookOutbox(params),
  });
}

// -- Brand Engine --

export function useBrandProfiles(params?: { status?: string; search?: string; limit?: number }) {
  return useQuery({
    queryKey: ["brandProfiles", params?.status, params?.search, params?.limit],
    queryFn: () => api.getBrandProfiles(params),
  });
}

export function useBrandProfile(id: string | null) {
  return useQuery({
    queryKey: ["brandProfile", id],
    queryFn: () => api.getBrandProfile(id!),
    enabled: !!id,
  });
}

export function useBrandUsage(brandProfileId: string | null) {
  return useQuery({
    queryKey: ["brandUsage", brandProfileId],
    queryFn: () => api.getBrandUsage(brandProfileId!),
    enabled: !!brandProfileId,
  });
}

export function useCreateBrandProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createBrandProfile>[0]) => api.createBrandProfile(body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["brandProfiles"] }); },
  });
}

export function useUpdateBrandProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<api.BrandProfileRow>) => api.updateBrandProfile(id, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["brandProfiles"] }); queryClient.invalidateQueries({ queryKey: ["brandProfile"] }); },
  });
}

export function useDeleteBrandProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBrandProfile(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["brandProfiles"] }); },
  });
}

export function useBrandEmbeddings(brandId: string | null, params?: { embedding_type?: string }) {
  return useQuery({
    queryKey: ["brandEmbeddings", brandId, params?.embedding_type],
    queryFn: () => api.getBrandEmbeddings(brandId!, params),
    enabled: !!brandId,
  });
}

export function useCreateBrandEmbedding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, ...body }: { brandId: string; content: string; embedding_type: string; metadata?: Record<string, unknown> }) => api.createBrandEmbedding(brandId, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["brandEmbeddings"] }); },
  });
}

export function useDeleteBrandEmbedding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ brandId, embeddingId }: { brandId: string; embeddingId: string }) => api.deleteBrandEmbedding(brandId, embeddingId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["brandEmbeddings"] }); },
  });
}

export function useBrandAssets(brandId: string | null) {
  return useQuery({
    queryKey: ["brandAssets", brandId],
    queryFn: () => api.getBrandAssets(brandId!),
    enabled: !!brandId,
  });
}

export function useDocumentTemplates(params?: { brand_profile_id?: string; template_type?: string }) {
  return useQuery({
    queryKey: ["documentTemplates", params?.brand_profile_id, params?.template_type],
    queryFn: () => api.getDocumentTemplates(params),
  });
}

export function useDocumentTemplate(id: string | null) {
  return useQuery({
    queryKey: ["documentTemplate", id],
    queryFn: () => api.getDocumentTemplate(id!),
    enabled: !!id,
  });
}

export function useCreateDocumentTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createDocumentTemplate>[0]) => api.createDocumentTemplate(body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["documentTemplates"] }); },
  });
}
