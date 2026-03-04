/**
 * MCP Adapter: wraps an MCP server as an Adapter for the tool_calls framework.
 * Uses runners/src/mcp-client.ts for transport.
 */
import type { Adapter, AdapterResponse, ValidationResult, VerificationResult } from "./adapter-interface.js";
export declare class McpAdapter implements Adapter {
    readonly name: string;
    readonly version = "1.0.0";
    readonly capabilities: string[];
    private serverName;
    constructor(serverName: string, capabilities: string[]);
    validate(request: Record<string, unknown>): Promise<ValidationResult>;
    execute(request: Record<string, unknown>): Promise<AdapterResponse>;
    verify(response: AdapterResponse): Promise<VerificationResult>;
}
//# sourceMappingURL=mcp-adapter.d.ts.map