import { BottomNav } from "@/shared/components/layout";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      {children}
      <BottomNav />
    </div>
  );
}
