/**
 * MCP Adapter: wraps an MCP server as an Adapter for the tool_calls framework.
 * Uses runners/src/mcp-client.ts for transport.
 */

import type { Adapter, AdapterResponse, ValidationResult, VerificationResult } from "./adapter-interface.js";

export class McpAdapter implements Adapter {
  readonly name: string;
  readonly version = "1.0.0";
  readonly capabilities: string[];

  private serverName: string;

  constructor(serverName: string, capabilities: string[]) {
    this.name = `mcp:${serverName}`;
    this.serverName = serverName;
    this.capabilities = capabilities;
  }

  async validate(request: Record<string, unknown>): Promise<ValidationResult> {
    if (!request.tool_name || typeof request.tool_name !== "string") {
      return { valid: false, errors: ["tool_name is required"] };
    }
    return { valid: true };
  }

  async execute(request: Record<string, unknown>): Promise<AdapterResponse> {
    const { callMcpTool } = await import("#runners/mcp-client.js");
    const toolName = request.tool_name as string;
    const args = (request.arguments as Record<string, unknown>) ?? {};

    const result = await callMcpTool(this.serverName, toolName, args);

    if (result.isError) {
      const errMsg = result.content?.map((c: { text?: string }) => c.text).join("\n") ?? "MCP tool call failed";
      throw new Error(errMsg);
    }

    const textContent = result.content?.filter((c: { type?: string; text?: string }) => c.type === "text").map((c: { text?: string }) => c.text).join("\n") ?? "";

    return {
      data: { content: textContent, raw: result.content },
      uri: `mcp://${this.serverName}/${toolName}`,
    };
  }

  async verify(response: AdapterResponse): Promise<VerificationResult> {
    if (response.data?.content !== undefined) {
      return { verified: true };
    }
    return { verified: false, reason: "No content in MCP response" };
  }
}
