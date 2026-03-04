export async function handleReportGenerate(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  input?: { template?: { components: { type: string; config: Record<string, unknown> }[] }; brand_context?: Record<string, unknown> };
}) {
  const components = request.input?.template?.components ?? [];
  return {
    artifact_type: "report",
    artifact_class: "docs",
    content: `<html><body><h1>Report</h1><p>${components.length} sections</p></body></html>`,
    metadata: { brand_profile_id: (request.input?.brand_context as any)?.id, section_count: components.length },
  };
}
