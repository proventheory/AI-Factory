export async function handleDeckGenerate(request) {
    const components = request.input?.template?.components ?? [];
    return {
        artifact_type: "deck",
        artifact_class: "docs",
        content: JSON.stringify({ slides: components.length, components: components.map(c => c.type) }),
        metadata: { brand_profile_id: request.input?.brand_context?.id, slide_count: components.length },
    };
}
//# sourceMappingURL=deck-generate.js.map