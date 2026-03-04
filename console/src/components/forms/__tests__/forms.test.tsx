import { describe, it, expect } from "vitest";

describe("Form components", () => {
  it("FormField module exports all components", async () => {
    const mod = await import("../FormField");
    expect(mod.FormItem).toBeDefined();
    expect(mod.FormLabel).toBeDefined();
    expect(mod.FormDescription).toBeDefined();
    expect(mod.FormMessage).toBeDefined();
    expect(mod.FormInput).toBeDefined();
    expect(mod.FormTextarea).toBeDefined();
    expect(mod.FormSelect).toBeDefined();
    expect(mod.FormCheckbox).toBeDefined();
    expect(mod.FormSwitch).toBeDefined();
    expect(mod.FormActions).toBeDefined();
  });

  it("barrel export includes all form components", async () => {
    const mod = await import("../index");
    expect(mod.FormInput).toBeDefined();
    expect(mod.FormTextarea).toBeDefined();
    expect(mod.FormSelect).toBeDefined();
    expect(mod.FormCheckbox).toBeDefined();
    expect(mod.FormSwitch).toBeDefined();
    expect(mod.FormActions).toBeDefined();
  });
});
