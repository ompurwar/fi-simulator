import AppShell from "@/components/layout/AppShell";
import { ChatPanel } from "@/components/assistant/ChatPanel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <ChatPanel />
    </>
  );
}
