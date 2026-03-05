/**
 * MCP Adapter: wraps an MCP server as an Adapter for the tool_calls framework.
 * Uses runners/src/mcp-client.ts for transport.
 */
export class McpAdapter {
    name;
    version = "1.0.0";
    capabilities;
    serverName;
    constructor(serverName, capabilities) {
        this.name = `mcp:${serverName}`;
        this.serverName = serverName;
        this.capabilities = capabilities;
    }
    async validate(request) {
        if (!request.tool_name || typeof request.tool_name !== "string") {
            return { valid: false, errors: ["tool_name is required"] };
        }
        return { valid: true };
    }
    async execute(request) {
        const { callMcpTool } = await import("../../runners/src/mcp-client.js");
        const toolName = request.tool_name;
        const args = request.arguments ?? {};
        const result = await callMcpTool(this.serverName, toolName, args);
        if (result.isError) {
            const errMsg = result.content?.map((c) => c.text).join("\n") ?? "MCP tool call failed";
            throw new Error(errMsg);
        }
        const textContent = result.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") ?? "";
        return {
            data: { content: textContent, raw: result.content },
            uri: `mcp://${this.serverName}/${toolName}`,
        };
    }
    async verify(response) {
        if (response.data?.content !== undefined) {
            return { verified: true };
        }
        return { verified: false, reason: "No content in MCP response" };
    }
}
//# sourceMappingURL=mcp-adapter.js.map