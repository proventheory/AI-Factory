"use client";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cn } from "@/lib/utils";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuSub = ContextMenuPrimitive.Sub;

const ContextMenuContent = forwardRef<ElementRef<typeof ContextMenuPrimitive.Content>, ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>>(
  ({ className, ...props }, ref) => (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content ref={ref} className={cn("z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95", className)} {...props} />
    </ContextMenuPrimitive.Portal>
  )
);
ContextMenuContent.displayName = "ContextMenuContent";

const ContextMenuItem = forwardRef<ElementRef<typeof ContextMenuPrimitive.Item>, ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & { inset?: boolean }>(
  ({ className, inset, ...props }, ref) => (
    <ContextMenuPrimitive.Item ref={ref} className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", inset && "pl-8", className)} {...props} />
  )
);
ContextMenuItem.displayName = "ContextMenuItem";

const ContextMenuSeparator = forwardRef<ElementRef<typeof ContextMenuPrimitive.Separator>, ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>>(
  ({ className, ...props }, ref) => <ContextMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
);
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuGroup, ContextMenuSub };
