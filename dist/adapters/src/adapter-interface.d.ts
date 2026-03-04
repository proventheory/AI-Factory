/**
 * MCP Adapter Interface Contract (Section 13.2, 12C.10 A7.4).
 *
 * Every adapter in the Work Plane implements this interface.
 * The orchestrator calls validate → execute → verify → (optionally) rollback.
 */
export interface ValidationResult {
    valid: boolean;
    errors?: string[];
}
export interface VerificationResult {
    verified: boolean;
    reason?: string;
}
export interface AdapterResponse {
    data: Record<string, unknown>;
    uri?: string;
    sha256?: string;
    rollbackPointer?: Record<string, unknown>;
    rollbackStrategy?: string;
}
export interface Adapter {
    readonly name: string;
    readonly version: string;
    readonly capabilities: string[];
    validate(request: Record<string, unknown>): Promise<ValidationResult>;
    execute(request: Record<string, unknown>): Promise<AdapterResponse>;
    verify(response: AdapterResponse): Promise<VerificationResult>;
    rollback?(pointer: Record<string, unknown>): Promise<void>;
}
/**
 * Base class for adapters with common patterns.
 */
export declare abstract class BaseAdapter implements Adapter {
    abstract readonly name: string;
    abstract readonly version: string;
    abstract readonly capabilities: string[];
    abstract validate(request: Record<string, unknown>): Promise<ValidationResult>;
    abstract execute(request: Record<string, unknown>): Promise<AdapterResponse>;
    abstract verify(response: AdapterResponse): Promise<VerificationResult>;
}
//# sourceMappingURL=adapter-interface.d.ts.map