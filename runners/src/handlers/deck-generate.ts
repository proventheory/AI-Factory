export async function handleDeckGenerate(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
  input?: { template?: { components: { type: string; config: Record<string, unknown> }[] }; brand_context?: Record<string, unknown> };
}) {
  const components = request.input?.template?.components ?? [];
  return {
    artifact_type: "deck",
    artifact_class: "docs",
    content: JSON.stringify({ slides: components.length, components: components.map(c => c.type) }),
    metadata: { brand_profile_id: (request.input?.brand_context as any)?.id, slide_count: components.length },
  };
}
