import { describe, it, expect } from "vitest";
import { initiativeCreateSchema } from "../initiative";
import { approvalDecisionSchema } from "../approval";
import { secretCreateSchema } from "../secret";
import { mcpServerSchema } from "../mcp-server";
import { planTriggerSchema, runTriggerSchema } from "../plan";

describe("Zod schemas", () => {
  describe("initiativeCreateSchema", () => {
    it("validates valid input", () => {
      const result = initiativeCreateSchema.safeParse({
        intent_type: "feature",
        risk_level: "low",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing intent_type", () => {
      const result = initiativeCreateSchema.safeParse({
        risk_level: "low",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty intent_type", () => {
      const result = initiativeCreateSchema.safeParse({
        intent_type: "",
        risk_level: "low",
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional fields", () => {
      const result = initiativeCreateSchema.safeParse({
        intent_type: "feature",
        risk_level: "high",
        title: "My initiative",
        source_ref: "https://github.com/example",
        template_id: "software",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("approvalDecisionSchema", () => {
    it("validates approved decision", () => {
      const result = approvalDecisionSchema.safeParse({ decision: "approved" });
      expect(result.success).toBe(true);
    });

    it("validates rejected decision with reason", () => {
      const result = approvalDecisionSchema.safeParse({ decision: "rejected", reason: "Not ready" });
      expect(result.success).toBe(true);
    });

    it("rejects missing decision", () => {
      const result = approvalDecisionSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it("rejects invalid decision value", () => {
      const result = approvalDecisionSchema.safeParse({ decision: "maybe" });
      expect(result.success).toBe(false);
    });
  });

  describe("secretCreateSchema", () => {
    it("validates valid secret", () => {
      const result = secretCreateSchema.safeParse({ key: "API_KEY", value: "secret123" });
      expect(result.success).toBe(true);
    });

    it("rejects empty key", () => {
      const result = secretCreateSchema.safeParse({ key: "", value: "secret123" });
      expect(result.success).toBe(false);
    });

    it("rejects key with spaces", () => {
      const result = secretCreateSchema.safeParse({ key: "API KEY", value: "secret123" });
      expect(result.success).toBe(false);
    });

    it("rejects empty value", () => {
      const result = secretCreateSchema.safeParse({ key: "API_KEY", value: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("mcpServerSchema", () => {
    it("validates valid server config", () => {
      const result = mcpServerSchema.safeParse({
        name: "test-server",
        server_type: "stdio",
        url_or_cmd: "npx mcp-server",
        active: true,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing name", () => {
      const result = mcpServerSchema.safeParse({
        server_type: "stdio",
        url_or_cmd: "npx mcp-server",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("planTriggerSchema", () => {
    it("validates valid UUID initiative_id", () => {
      const result = planTriggerSchema.safeParse({
        initiative_id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.success).toBe(true);
    });

    it("rejects non-UUID initiative_id", () => {
      const result = planTriggerSchema.safeParse({
        initiative_id: "not-a-uuid",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("runTriggerSchema", () => {
    it("validates valid run trigger", () => {
      const result = runTriggerSchema.safeParse({
        plan_id: "550e8400-e29b-41d4-a716-446655440000",
        environment: "staging",
      });
      expect(result.success).toBe(true);
    });
  });
});
