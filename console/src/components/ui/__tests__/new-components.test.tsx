import { describe, it, expect } from "vitest";

describe("New UI components", () => {
  it("AlertDialog exports", async () => {
    const mod = await import("../AlertDialog");
    expect(mod.AlertDialog).toBeDefined();
    expect(mod.AlertDialogTrigger).toBeDefined();
    expect(mod.AlertDialogContent).toBeDefined();
    expect(mod.AlertDialogAction).toBeDefined();
    expect(mod.AlertDialogCancel).toBeDefined();
  });

  it("Progress exports", async () => {
    const mod = await import("../Progress");
    expect(mod.Progress).toBeDefined();
  });

  it("Tooltip exports", async () => {
    const mod = await import("../Tooltip");
    expect(mod.Tooltip).toBeDefined();
    expect(mod.TooltipTrigger).toBeDefined();
    expect(mod.TooltipContent).toBeDefined();
    expect(mod.TooltipProvider).toBeDefined();
  });

  it("ScrollArea exports", async () => {
    const mod = await import("../ScrollArea");
    expect(mod.ScrollArea).toBeDefined();
    expect(mod.ScrollBar).toBeDefined();
  });

  it("Accordion exports", async () => {
    const mod = await import("../Accordion");
    expect(mod.Accordion).toBeDefined();
    expect(mod.AccordionItem).toBeDefined();
    expect(mod.AccordionTrigger).toBeDefined();
    expect(mod.AccordionContent).toBeDefined();
  });

  it("HoverCard exports", async () => {
    const mod = await import("../HoverCard");
    expect(mod.HoverCard).toBeDefined();
    expect(mod.HoverCardTrigger).toBeDefined();
    expect(mod.HoverCardContent).toBeDefined();
  });

  it("Popover exports", async () => {
    const mod = await import("../Popover");
    expect(mod.Popover).toBeDefined();
    expect(mod.PopoverTrigger).toBeDefined();
    expect(mod.PopoverContent).toBeDefined();
  });

  it("RadioGroup exports", async () => {
    const mod = await import("../RadioGroup");
    expect(mod.RadioGroup).toBeDefined();
    expect(mod.RadioGroupItem).toBeDefined();
  });

  it("Sheet exports", async () => {
    const mod = await import("../Sheet");
    expect(mod.Sheet).toBeDefined();
    expect(mod.SheetContent).toBeDefined();
    expect(mod.SheetHeader).toBeDefined();
    expect(mod.SheetTitle).toBeDefined();
  });

  it("Slider exports", async () => {
    const mod = await import("../Slider");
    expect(mod.Slider).toBeDefined();
  });

  it("Sonner/Toaster exports", async () => {
    const mod = await import("../Sonner");
    expect(mod.Toaster).toBeDefined();
  });

  it("ContextMenu exports", async () => {
    const mod = await import("../ContextMenu");
    expect(mod.ContextMenu).toBeDefined();
    expect(mod.ContextMenuTrigger).toBeDefined();
    expect(mod.ContextMenuContent).toBeDefined();
    expect(mod.ContextMenuItem).toBeDefined();
  });
});
