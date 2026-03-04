export declare function handleUiScaffold(request: {
    run_id: string;
    job_run_id: string;
    job_type: string;
    initiative_id?: string;
}): Promise<{
    artifact_type: string;
    artifact_class: string;
    content: string;
    metadata: {
        brand_profile_id: string | undefined;
    };
}>;
//# sourceMappingURL=ui-scaffold.d.ts.map