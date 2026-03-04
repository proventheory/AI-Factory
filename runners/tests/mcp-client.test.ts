/**
 * Unit tests for MCP client config validation and utility functions.
 * Run: npx tsx --test runners/tests/mcp-client.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateMcpConfig } from "../src/mcp-client.js";

describe("validateMcpConfig", () => {
  it("accepts valid config array", () => {
    const config = [
      { name: "test-http", server_type: "http", url_or_cmd: "https://example.com", capabilities: ["test"] },
      { name: "test-stdio", server_type: "stdio", url_or_cmd: "echo", args: ["hello"], capabilities: ["echo"] },
    ];
    const result = validateMcpConfig(config);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
    assert.strictEqual(result.config.length, 2);
    assert.strictEqual(result.config[0].name, "test-http");
    assert.strictEqual(result.config[1].server_type, "stdio");
  });

  it("rejects non-array input", () => {
    const result = validateMcpConfig("not-an-array");
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors[0].includes("JSON array"));
  });

  it("rejects config with missing name", () => {
    const result = validateMcpConfig([{ server_type: "http", url_or_cmd: "https://example.com" }]);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("name")));
  });

  it("rejects config with invalid server_type", () => {
    const result = validateMcpConfig([{ name: "x", server_type: "websocket", url_or_cmd: "ws://example.com" }]);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("server_type")));
  });

  it("rejects config with missing url_or_cmd", () => {
    const result = validateMcpConfig([{ name: "x", server_type: "http" }]);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("url_or_cmd")));
  });

  it("rejects config with non-array args", () => {
    const result = validateMcpConfig([{ name: "x", server_type: "stdio", url_or_cmd: "echo", args: "not-array" }]);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("args")));
  });

  it("accepts empty array", () => {
    const result = validateMcpConfig([]);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.config.length, 0);
  });

  it("rejects null input", () => {
    const result = validateMcpConfig(null);
    assert.strictEqual(result.valid, false);
  });
});
