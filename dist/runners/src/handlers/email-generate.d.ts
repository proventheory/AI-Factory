export declare function handleEmailGenerate(request: {
    run_id: string;
    job_run_id: string;
    job_type: string;
    initiative_id?: string;
    input?: {
        subject_hint?: string;
        audience?: string;
    };
}): Promise<{
    artifact_type: string;
    artifact_class: string;
    content: string;
    metadata: {
        brand_profile_id: string | undefined;
        brand_color: any;
    };
}>;
//# sourceMappingURL=email-generate.d.ts.map