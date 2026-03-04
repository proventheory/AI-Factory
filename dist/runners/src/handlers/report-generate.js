export async function handleReportGenerate(request) {
    const components = request.input?.template?.components ?? [];
    return {
        artifact_type: "report",
        artifact_class: "docs",
        content: `<html><body><h1>Report</h1><p>${components.length} sections</p></body></html>`,
        metadata: { brand_profile_id: request.input?.brand_context?.id, section_count: components.length },
    };
}
//# sourceMappingURL=report-generate.js.map