"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import ConversationList from "@/components/messages/ConversationList";
import { useAuth } from "@/app/auth-provider";
import { C, monoFont, displayFont } from "@/lib/theme";

// Two panes on desktop (list + chat), one pane on phones: the list when no
// chat is open, the chat when one is.
export default function MessagesLayout({ children }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const inChat = pathname.split("/").length > 2 && pathname.split("/")[2];

  if (loading) return <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading…</div>;
  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <div style={{ ...displayFont, fontSize: 16, color: C.text }}>Log in to use messages</div>
        <Link href="/login" style={{ ...monoFont, fontSize: 12, color: "#fff", background: C.mustard, borderRadius: 8, padding: "8px 16px", textDecoration: "none", fontWeight: 700 }}>Log in</Link>
      </div>
    );
  }
  return (
    <div className="flex gap-4" style={{ height: "calc(100dvh - 150px)", minHeight: 420, margin: "-4px 0" }}>
      <aside className={`${inChat ? "hidden md:flex" : "flex"} flex-col`} style={{ width: "100%", maxWidth: 320, flexShrink: 0, minHeight: 0 }}>
        <ConversationList />
      </aside>
      <section className={`${inChat ? "flex" : "hidden md:flex"} flex-col flex-1`} style={{ minWidth: 0, minHeight: 0 }}>
        {children}
      </section>
    </div>
  );
}
