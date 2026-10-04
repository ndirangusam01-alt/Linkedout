"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { C, monoFont, displayFont } from "@/lib/theme";
import { useAuth } from "@/app/auth-provider";
import { useDialog } from "@/components/Dialog";
import { friendlyError } from "@/lib/api";

const CATS = [["general", "General question"], ["account", "My account"], ["billing", "Billing & subscription"], ["bug", "Something's broken"], ["safety", "Safety or abuse"], ["feature", "Feature request"]];
const call = async (url, opts) => { const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts }).catch(() => { throw new Error("You're offline, or we can't reach LinkedOut right now."); }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(r.status >= 500 ? "Something went wrong on our side. Please try again." : d.error || "Something went wrong."); return d; };

// Help & Support: your requests, the conversation with our team, and a new-request form.
export default function SupportPage() {
  const { user, loading } = useAuth();
  const dialog = useDialog();
  const [tickets, setTickets] = useState(null), [open, setOpen] = useState(null), [thread, setThread] = useState(null), [composing, setComposing] = useState(false);
  const [f, setF] = useState({ category: "general", subject: "", body: "" }), [reply, setReply] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState(null);
  const input = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 10, padding: "10px 12px", fontSize: 14, width: "100%" };
  const btn = (p) => ({ ...monoFont, fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: "9px 16px", cursor: "pointer", color: p ? "#fff" : C.text, background: p ? C.mustard : "transparent", border: `1px solid ${p ? C.mustard : C.line}` });

  const loadList = useCallback(() => call("/api/support").then((d) => setTickets(d.tickets)).catch((e) => setErr(e.message)), []);
  const loadThread = useCallback((id) => call(`/api/support/${id}`).then(setThread).catch((e) => setErr(e.message)), []);
  useEffect(() => { if (user) loadList(); }, [user, loadList]);
  useEffect(() => { if (open) loadThread(open); else setThread(null); }, [open, loadThread]);

  if (loading) return null;
  if (!user) return <div style={{ ...monoFont, color: C.muted, padding: 20 }}>Please <Link href="/login" style={{ color: C.mustard }}>log in</Link> to contact support.</div>;

  async function create() {
    setBusy(true); setErr(null);
    try { const r = await call("/api/support", { method: "POST", body: JSON.stringify(f) }); setComposing(false); setF({ category: "general", subject: "", body: "" }); await loadList(); dialog.toast(`Request ${r.ref} sent`); setOpen(r.id); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function send() {
    setBusy(true); setErr(null);
    try { await call(`/api/support/${open}`, { method: "POST", body: JSON.stringify({ body: reply }) }); setReply(""); await loadThread(open); loadList(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="flex items-center justify-between gap-3">
        <div style={{ ...displayFont, fontSize: 22, color: C.text }}>{open ? "Your request" : "Help & Support"}</div>
        {open ? <button style={btn(false)} onClick={() => setOpen(null)}>← All requests</button> : !composing && <button style={btn(true)} onClick={() => setComposing(true)}>New request</button>}
      </div>
      {err && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>{err}</div>}

      {composing && !open && (
        <div className="flex flex-col gap-3" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} style={input}>{CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input placeholder="Subject" maxLength={140} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={input} />
          <textarea placeholder="Tell us what's going on. The more detail, the faster we can help." rows={6} maxLength={4000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={input} />
          <div className="flex gap-2 justify-end"><button style={btn(false)} onClick={() => setComposing(false)}>Cancel</button><button style={{ ...btn(true), opacity: f.subject.trim() && f.body.trim() ? 1 : 0.5 }} disabled={busy || !f.subject.trim() || !f.body.trim()} onClick={create}>{busy ? "Sending…" : "Send request"}</button></div>
        </div>
      )}

      {!open && !composing && (tickets === null ? <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div> : tickets.length === 0
        ? <div style={{ ...monoFont, fontSize: 13, color: C.muted, lineHeight: 1.6 }}>No requests yet. If something's wrong or you have a question, send us a request and we'll reply here.</div>
        : tickets.map((t) => (
          <button key={t.id} onClick={() => setOpen(t.id)} style={{ textAlign: "left", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", color: C.text }}>
            <div className="flex justify-between gap-2"><b style={{ fontSize: 14 }}>{t.subject}</b><span style={{ ...monoFont, fontSize: 11, color: t.status === "open" ? C.mustard : t.status === "pending" ? C.corpblue : C.green }}>{t.status === "pending" ? "reply from support" : t.status}</span></div>
            <div style={{ ...monoFont, fontSize: 11, color: C.muted, marginTop: 2 }}>{t.ref} · {new Date(t.updatedAt).toLocaleDateString()}</div>
          </button>
        )))}

      {open && thread && (
        <>
          <div style={{ ...monoFont, fontSize: 11, color: C.muted }}>{thread.ticket.ref} · {thread.ticket.subject} · {thread.ticket.status}</div>
          <div className="flex flex-col gap-2">
            {thread.messages.map((m, i) => (
              <div key={i} style={{ alignSelf: m.from === "you" ? "flex-end" : "flex-start", maxWidth: "88%", background: m.from === "you" ? C.mustard + "22" : C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: "9px 13px" }}>
                <div style={{ ...monoFont, fontSize: 10, color: C.muted }}>{m.from === "you" ? "You" : "LinkedOut Support"} · {new Date(m.at).toLocaleString()}</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, color: C.text }}>{m.body}</div>
              </div>
            ))}
          </div>
          <textarea rows={3} placeholder={["resolved", "closed"].includes(thread.ticket.status) ? "Reply to reopen this request…" : "Write a reply…"} value={reply} onChange={(e) => setReply(e.target.value)} style={input} />
          <div className="flex justify-end"><button style={{ ...btn(true), opacity: reply.trim() ? 1 : 0.5 }} disabled={busy || !reply.trim()} onClick={send}>Send reply</button></div>
        </>
      )}
    </div>
  );
}
