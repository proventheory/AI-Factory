export declare function handleBrandCompile(request: {
    run_id: string;
    job_run_id: string;
    job_type: string;
    initiative_id?: string;
    input?: {
        brand_profile: Record<string, unknown>;
    };
}): Promise<{
    error: string;
    artifacts?: undefined;
    metadata?: undefined;
} | {
    artifacts: {
        artifact_type: string;
        artifact_class: string;
        uri: string;
    }[];
    metadata: {
        brand_profile_id: any;
    };
    error?: undefined;
}>;
//# sourceMappingURL=brand-compile.d.ts.map