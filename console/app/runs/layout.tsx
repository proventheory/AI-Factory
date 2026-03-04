import AppShell from "@/components/AppShell";

export default function RunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
