"use client";

import { Card, CardHeader, CardContent } from "./Card";

export function CardSection({
  title,
  rightSlot,
  children,
  className = "",
}: {
  title?: React.ReactNode;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || rightSlot) && (
        <CardHeader className="flex flex-row items-center justify-between gap-4 px-4 py-3 md:px-6">
          {title && (
            <h2 className="text-subheading font-medium text-text-primary">{title}</h2>
          )}
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </CardHeader>
      )}
      <CardContent className="px-4 py-4 md:px-6">{children}</CardContent>
    </Card>
  );
}
