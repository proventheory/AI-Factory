/**
 * MCP client for runners: connect to MCP servers (HTTP or stdio) and dispatch tool calls.
 * Config loaded from MCP_SERVERS_JSON env or config/mcp.json file.
 * See docs/DEPLOYMENT_PLAN_WITH_MCP.md §4.
 */
export interface McpServerConfig {
    name: string;
    server_type: "http" | "stdio";
    url_or_cmd: string;
    args?: string[];
    env?: Record<string, string>;
    auth_header?: string;
    capabilities?: string[];
}
export declare function validateMcpConfig(raw: unknown): {
    valid: boolean;
    errors: string[];
    config: McpServerConfig[];
};
export interface McpToolCallRequest {
    method: "tools/call";
    params: {
        name: string;
        arguments: Record<string, unknown>;
    };
}
export interface McpToolCallResponse {
    content?: Array<{
        type: string;
        text?: string;
    }>;
    isError?: boolean;
}
export declare function loadMcpConfig(): McpServerConfig[];
export declare function getMcpServer(name: string): McpServerConfig | undefined;
export declare function getMcpServerByCapability(capability: string): McpServerConfig | undefined;
export declare function callMcpTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<McpToolCallResponse>;
export declare function shutdownStdioProcesses(): void;
//# sourceMappingURL=mcp-client.d.ts.map