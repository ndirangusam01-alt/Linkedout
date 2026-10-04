"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import { useAuth } from "@/app/auth-provider";
import OAuthButtons from "@/components/OAuthButtons";
import { INTERESTS, ACCOUNT_TYPES } from "@/lib/data";

const PSEUDONYM_RE = /^[a-zA-Z0-9_]{3,24}$/;

export default function SignupPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [realName, setRealName] = useState("");
  const [pseudonym, setPseudonym] = useState("");
  const [country, setCountry] = useState("");
  const [accountType, setAccountType] = useState("personal");
  const [interests, setInterests] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const pseudonymValid = pseudonym.length === 0 || PSEUDONYM_RE.test(pseudonym);

  function toggleInterest(i) {
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : prev.length < 5 ? [...prev, i] : prev));
  }

  async function submit(e) {
    e.preventDefault();
    if (!PSEUDONYM_RE.test(pseudonym)) {
      setError("Pseudonym must be 3-24 characters: letters, numbers, and underscores only.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, realName, pseudonym, country, accountType, interests }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed.");
      await refresh();
      router.push("/profile");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "10px 12px", fontSize: 13.5, width: "100%" };

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 400, margin: "0 auto" }}>
      <div style={{ ...displayFont, fontSize: 22, color: C.text }}>Sign up</div>

      <OAuthButtons />
      <div className="flex items-center gap-3" style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>
        <div style={{ flex: 1, height: 1, background: C.line }} /> or <div style={{ flex: 1, height: 1, background: C.line }} />
      </div>

      <p style={{ ...monoFont, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
        Your real name is only ever used if you choose to post as "Real Name."
        Your pseudonym is what everyone sees by default — pick something you
        wouldn't mind a coworker seeing, since it's your consistent public
        identity, separate from full anonymous posting.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <input
            type="text" required placeholder="pseudonym (visible to everyone)" value={pseudonym}
            onChange={(e) => setPseudonym(e.target.value)}
            style={{ ...inputStyle, borderColor: pseudonymValid ? C.line : C.flag }}
          />
          <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginTop: 4 }}>3-24 characters: letters, numbers, underscores — unique, like a username</div>
        </div>
        <input
          type="text" required placeholder="real name (kept private by default)" value={realName}
          onChange={(e) => setRealName(e.target.value)}
          style={inputStyle}
        />
        <input
          type="email" required placeholder="work or personal email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password" required placeholder="password (8+ characters)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        <input
          type="text" placeholder="country (optional)" value={country}
          onChange={(e) => setCountry(e.target.value)}
          style={inputStyle}
        />

        <div>
          <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 6 }}>ACCOUNT TYPE</div>
          <div className="flex gap-2">
            {ACCOUNT_TYPES.map((t) => (
              <button
                key={t.key} type="button" onClick={() => setAccountType(t.key)}
                style={{
                  ...monoFont, fontSize: 11.5, flex: 1, padding: "8px", borderRadius: 8,
                  border: `1px solid ${accountType === t.key ? C.mustard : C.line}`,
                  color: accountType === t.key ? C.mustard : C.muted, background: accountType === t.key ? alpha(C.mustard, 8) : "transparent",
                }}
              >{t.label}</button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 6 }}>INTERESTS (up to 5, optional — used only as a feed filter, never for ranking)</div>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const active = interests.includes(i);
              return (
                <button
                  key={i} type="button" onClick={() => toggleInterest(i)}
                  style={{
                    ...monoFont, fontSize: 10.5, padding: "4px 10px", borderRadius: 20,
                    border: `1px solid ${active ? C.mustard : C.line}`,
                    color: active ? C.mustard : C.muted, background: active ? alpha(C.mustard, 8) : "transparent",
                  }}
                >{i}</button>
              );
            })}
          </div>
        </div>

        {error && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{error}</div>}
        <button
          type="submit" disabled={busy}
          style={{ ...monoFont, fontSize: 12.5, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "10px 14px", fontWeight: 700 }}
        >{busy ? "creating account…" : "Sign up"}</button>
      </form>
      <div style={{ ...monoFont, fontSize: 11.5, color: C.muted }}>
        Already have an account? <Link href="/login" style={{ color: C.mustard }}>Log in</Link>
      </div>
    </div>
  );
}
