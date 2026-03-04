export declare function handleCopyGenerate(request: {
    run_id: string;
    job_run_id: string;
    job_type: string;
    initiative_id?: string;
    input?: {
        topic?: string;
        content_type?: string;
        length?: string;
    };
}): Promise<{
    artifact_type: string;
    artifact_class: string;
    content: string;
    metadata: {
        brand_profile_id: string | undefined;
        content_type: string | undefined;
    };
}>;
//# sourceMappingURL=copy-generate.d.ts.map