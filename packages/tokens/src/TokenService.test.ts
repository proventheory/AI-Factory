/**
 * Unit tests for TokenService and export stubs.
 */

import { getToken, setToken, mergeTokens, validateTokens, computeDerivedTokens } from "./TokenService.js";
import { exportToCssVariables } from "./export-css.js";
import { exportToEmailJson } from "./export-email.js";
import { exportToDeckConfig } from "./export-deck.js";
import { brandTokensDefault } from "./defaults.js";
import type { DesignTokens } from "./types.js";

describe("TokenService", () => {
  test("getToken returns value at path", () => {
    const t: DesignTokens = { colors: { brand: { "500": "#3b82f6" } } };
    expect(getToken(t, "colors.brand.500")).toBe("#3b82f6");
    expect(getToken(t, "colors.missing")).toBeUndefined();
  });

  test("setToken sets value at path", () => {
    const t: DesignTokens = {};
    setToken(t, "colors.primary", "#ff0000");
    expect((t.colors as Record<string, string>).primary).toBe("#ff0000");
  });

  test("mergeTokens overrides base", () => {
    const base: DesignTokens = { colors: { brand: { "500": "#000" } } };
    const over: DesignTokens = { colors: { brand: { "500": "#fff" } } };
    const merged = mergeTokens(base, over);
    expect(getToken(merged, "colors.brand.500")).toBe("#fff");
  });

  test("validateTokens rejects non-hex color", () => {
    const t: DesignTokens = { colors: { brand: { "500": "not-a-hex" } } };
    const { valid, errors } = validateTokens(t);
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes("not-a-hex"))).toBe(true);
  });

  test("validateTokens accepts hex", () => {
    const t: DesignTokens = { colors: { brand: { "500": "#abc" } } };
    const { valid } = validateTokens(t);
    expect(valid).toBe(true);
  });

  test("computeDerivedTokens adds hover/active from default", () => {
    const t: DesignTokens = {
      colors: { button: { primary: { default: "#333" } } },
    };
    const out = computeDerivedTokens(t);
    const primary = (out.colors as Record<string, Record<string, Record<string, string>>>).button?.primary;
    expect(primary?.hover).toBe("#333");
    expect(primary?.active).toBe("#333");
  });
});

describe("Export stubs", () => {
  test("exportToCssVariables produces stable CSS with default tokens", () => {
    const css = exportToCssVariables(brandTokensDefault);
    expect(css).toContain(":root {");
    expect(css).toContain("--brand-color");
    expect(css).toMatchSnapshot();
  });

  test("exportToEmailJson produces valid JSON subset", () => {
    const json = exportToEmailJson(brandTokensDefault);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveProperty("colors");
    expect(json).toMatchSnapshot();
  });

  test("exportToDeckConfig produces stable deck config", () => {
    const config = exportToDeckConfig(brandTokensDefault);
    expect(config).toHaveProperty("typography");
    expect(config).toMatchSnapshot();
  });
});
