"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { C, monoFont, displayFont } from "@/lib/theme";
import { useAuth } from "@/app/auth-provider";
import OAuthButtons from "@/components/OAuthButtons";

const OAUTH_ERROR_MESSAGES = {
  oauth_state_mismatch: "That sign-in attempt expired or was tampered with — try again.",
  oauth_failed: "Sign-in didn't go through. Try again, or use email + password.",
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(OAUTH_ERROR_MESSAGES[searchParams.get("error")] || null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed.");
      await refresh();
      router.push("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "10px 12px", fontSize: 13.5 };

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 360, margin: "0 auto" }}>
      <div style={{ ...displayFont, fontSize: 22, color: C.text }}>Log in</div>

      <OAuthButtons />
      <div className="flex items-center gap-3" style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>
        <div style={{ flex: 1, height: 1, background: C.line }} /> or <div style={{ flex: 1, height: 1, background: C.line }} />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          type="email" required placeholder="work or personal email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" required placeholder="password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{error}</div>}
        <div className="flex justify-end">
          <Link href="/forgot-password" style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>Forgot password?</Link>
        </div>
        <button
          type="submit" disabled={busy}
          style={{ ...monoFont, fontSize: 12.5, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "10px 14px", fontWeight: 700 }}
        >{busy ? "logging in…" : "Log in"}</button>
      </form>
      <div style={{ ...monoFont, fontSize: 11.5, color: C.muted }}>
        No account? <Link href="/signup" style={{ color: C.mustard }}>Sign up</Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
