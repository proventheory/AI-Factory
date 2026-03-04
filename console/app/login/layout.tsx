import AppShell from "@/components/AppShell";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
