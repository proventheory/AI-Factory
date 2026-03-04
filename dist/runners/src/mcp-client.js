/**
 * MCP client for runners: connect to MCP servers (HTTP or stdio) and dispatch tool calls.
 * Config loaded from MCP_SERVERS_JSON env or config/mcp.json file.
 * See docs/DEPLOYMENT_PLAN_WITH_MCP.md §4.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
export function validateMcpConfig(raw) {
    const errors = [];
    if (!Array.isArray(raw))
        return { valid: false, errors: ["Config must be a JSON array"], config: [] };
    const config = [];
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        if (!item || typeof item !== "object") {
            errors.push(`[${i}]: must be an object`);
            continue;
        }
        if (typeof item.name !== "string" || !item.name)
            errors.push(`[${i}]: name is required (string)`);
        if (item.server_type !== "http" && item.server_type !== "stdio")
            errors.push(`[${i}]: server_type must be "http" or "stdio"`);
        if (typeof item.url_or_cmd !== "string" || !item.url_or_cmd)
            errors.push(`[${i}]: url_or_cmd is required (string)`);
        if (item.args !== undefined && !Array.isArray(item.args))
            errors.push(`[${i}]: args must be an array`);
        if (item.env !== undefined && (typeof item.env !== "object" || item.env === null))
            errors.push(`[${i}]: env must be an object`);
        if (errors.length === 0)
            config.push(item);
    }
    return { valid: errors.length === 0, errors, config: errors.length === 0 ? config : [] };
}
let _config = null;
export function loadMcpConfig() {
    if (_config)
        return _config;
    let raw;
    const envJson = process.env.MCP_SERVERS_JSON;
    if (envJson) {
        raw = JSON.parse(envJson);
    }
    else {
        const filePaths = ["config/mcp.json", "mcp-servers.json"];
        for (const fp of filePaths) {
            if (existsSync(fp)) {
                raw = JSON.parse(readFileSync(fp, "utf-8"));
                break;
            }
        }
    }
    if (!raw) {
        _config = [];
        return _config;
    }
    const result = validateMcpConfig(raw);
    if (!result.valid) {
        console.error("[mcp-client] Config validation errors:", result.errors.join("; "));
        _config = [];
        return _config;
    }
    _config = result.config;
    return _config;
}
export function getMcpServer(name) {
    return loadMcpConfig().find((s) => s.name === name);
}
export function getMcpServerByCapability(capability) {
    return loadMcpConfig().find((s) => s.capabilities?.includes(capability));
}
async function callHttpMcpServer(server, toolName, args) {
    const url = server.url_or_cmd.replace(/\/$/, "");
    const headers = {
        "Content-Type": "application/json",
    };
    if (server.auth_header) {
        headers["Authorization"] = server.auth_header;
    }
    const body = {
        method: "tools/call",
        params: { name: toolName, arguments: args },
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        const res = await fetch(`${url}/mcp`, {
            method: "POST",
            headers,
            body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), ...body }),
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text();
            return { isError: true, content: [{ type: "text", text: `HTTP ${res.status}: ${text}` }] };
        }
        const data = (await res.json());
        if (data.error) {
            return { isError: true, content: [{ type: "text", text: data.error.message }] };
        }
        return data.result ?? { content: [] };
    }
    finally {
        clearTimeout(timeout);
    }
}
const stdioProcesses = new Map();
function getStdioProcess(server) {
    let proc = stdioProcesses.get(server.name);
    if (proc && !proc.killed)
        return proc;
    const args = server.args ?? [];
    proc = spawn(server.url_or_cmd, args, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(server.env ?? {}) },
    });
    proc.on("exit", () => stdioProcesses.delete(server.name));
    stdioProcesses.set(server.name, proc);
    return proc;
}
async function callStdioMcpServer(server, toolName, args) {
    const proc = getStdioProcess(server);
    const id = randomUUID();
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`MCP stdio timeout for ${server.name}`));
        }, 30_000);
        const request = JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name: toolName, arguments: args },
        }) + "\n";
        let buffer = "";
        const onData = (data) => {
            buffer += data.toString();
            const lines = buffer.split("\n");
            for (const line of lines) {
                if (!line.trim())
                    continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.id === id) {
                        clearTimeout(timeout);
                        proc.stdout?.off("data", onData);
                        if (parsed.error) {
                            resolve({ isError: true, content: [{ type: "text", text: parsed.error.message }] });
                        }
                        else {
                            resolve(parsed.result ?? { content: [] });
                        }
                    }
                }
                catch {
                    // partial JSON, continue buffering
                }
            }
        };
        proc.stdout?.on("data", onData);
        proc.stdin?.write(request);
    });
}
export async function callMcpTool(serverName, toolName, args) {
    const server = getMcpServer(serverName);
    if (!server) {
        return { isError: true, content: [{ type: "text", text: `MCP server not found: ${serverName}` }] };
    }
    if (server.server_type === "http") {
        return callHttpMcpServer(server, toolName, args);
    }
    return callStdioMcpServer(server, toolName, args);
}
export function shutdownStdioProcesses() {
    for (const [, proc] of stdioProcesses) {
        proc.kill();
    }
    stdioProcesses.clear();
}
//# sourceMappingURL=mcp-client.js.map