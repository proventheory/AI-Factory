export declare function handleDeckGenerate(request: {
    run_id: string;
    job_run_id: string;
    job_type: string;
    initiative_id?: string;
    input?: {
        template?: {
            components: {
                type: string;
                config: Record<string, unknown>;
            }[];
        };
        brand_context?: Record<string, unknown>;
    };
}): Promise<{
    artifact_type: string;
    artifact_class: string;
    content: string;
    metadata: {
        brand_profile_id: any;
        slide_count: number;
    };
}>;
//# sourceMappingURL=deck-generate.d.ts.map