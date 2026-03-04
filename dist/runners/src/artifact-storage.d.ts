/**
 * Artifact storage: upload blobs to Supabase Storage, download via signed URLs.
 *
 * Decision: Supabase Storage (not S3). Already have Supabase, zero new infra.
 * Bucket: "artifacts" — created automatically if missing.
 *
 * Uses dynamic import for @supabase/supabase-js so it doesn't break if
 * the package isn't installed in the runners workspace (only needed at runtime).
 */
export declare function uploadArtifact(runId: string, artifactId: string, content: string | Buffer, contentType?: string): Promise<string | null>;
export declare function getArtifactSignedUrl(storagePath: string): Promise<string | null>;
export declare function downloadArtifact(storagePath: string): Promise<string | null>;
export declare function isStorageConfigured(): Promise<boolean>;
//# sourceMappingURL=artifact-storage.d.ts.map