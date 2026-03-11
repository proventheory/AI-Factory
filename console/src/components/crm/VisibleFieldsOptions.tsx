"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/Popover";
import { Checkbox } from "@/components/ui/Checkbox";

export type VisibleFieldOption = { key: string; label: string };

export function VisibleFieldsOptions({
  columns,
  visibleKeys,
  onVisibleKeysChange,
  triggerLabel = "Fields",
}: {
  columns: VisibleFieldOption[];
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (key: string) => {
    if (visibleKeys.includes(key)) {
      onVisibleKeysChange(visibleKeys.filter((k) => k !== key));
    } else {
      onVisibleKeysChange([...visibleKeys, key]);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="text-body-small font-medium text-text-secondary mb-2">Visible columns</div>
        <div className="flex flex-col gap-1.5">
          {columns.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={visibleKeys.includes(key)}
                onChange={() => toggle(key)}
              />
              <span className="text-body-small">{label}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
