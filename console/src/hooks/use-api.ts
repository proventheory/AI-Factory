"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useRuns(params?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ["runs", params?.status, params?.limit],
    queryFn: () => api.getRuns(params),
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
    mutationFn: (body: { intent_type: string; title?: string | null; risk_level: string; source_ref?: string }) => api.createInitiative(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["initiatives"] });
    },
  });
}

export function useUpdateInitiative() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<{ intent_type: string; title: string | null; risk_level: string; source_ref: string }> }) => api.updateInitiative(id, body),
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

export function useLlmCalls(params?: { run_id?: string; model_tier?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["llm_calls", params?.run_id, params?.model_tier, params?.limit, params?.offset],
    queryFn: () => api.getLlmCalls(params),
  });
}

export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: () => api.getUsage(),
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
