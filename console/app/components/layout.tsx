import AppShell from "@/components/AppShell";

export default function ComponentsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
