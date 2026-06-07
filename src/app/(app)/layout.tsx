import { BottomNav } from "@/shared/components/layout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col">
      {children}
      <BottomNav />
    </div>
  );
}
