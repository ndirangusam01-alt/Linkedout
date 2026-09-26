"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  UserCog, Lock, Bell, Sun, Moon, Monitor, Check, AlertTriangle, Phone,
  BadgeCheck, Building2, Briefcase, Clock, Download, UserX, ChevronLeft, Upload,
} from "lucide-react";
import { C, monoFont, displayFont, alpha } from "@/lib/theme";
import { useAuth } from "@/app/auth-provider";
import { useTheme } from "@/app/theme-provider";
import { api } from "@/lib/api";
import { INTERESTS, ACCOUNT_TYPES } from "@/lib/data";

const CATEGORIES = [
  { key: "account", label: "Your Account", icon: UserCog },
  { key: "security", label: "Security & Verification", icon: Lock },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "appearance", label: "Appearance", icon: Sun },
  { key: "data", label: "Your Data & Account", icon: Download },
];

const inputStyle = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "9px 11px", fontSize: 13, width: "100%" };

export default function SettingsPage() {
  const { user, loading, refresh, logout } = useAuth();
  const [category, setCategory] = useState("account");

  if (loading) return <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading…</div>;
  if (!user) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-5">
        <p style={{ fontSize: 13.5, color: C.text }}>Log in to see settings.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/profile" style={{ display: "flex", color: C.muted }}><ChevronLeft size={18} /></Link>
        <div style={{ ...displayFont, fontSize: 19, color: C.text }}>Settings & Privacy</div>
      </div>

      <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: `1px solid ${C.line}` }}>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          const active = category === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className="flex items-center gap-1.5 px-3 py-2"
              style={{
                fontSize: 12, color: active ? C.mustard : C.muted, background: "none", border: "none",
                borderBottom: `2px solid ${active ? C.mustard : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}
            ><Icon size={13} /> {c.label}</button>
          );
        })}
      </div>

      {category === "account" && <AccountCategory user={user} refresh={refresh} />}
      {category === "security" && <SecurityCategory user={user} refresh={refresh} />}
      {category === "notifications" && <NotificationsCategory />}
      {category === "appearance" && <AppearanceCategory />}
      {category === "data" && <DataCategory logout={logout} />}
    </div>
  );
}

function SettingsCard({ title, icon: Icon, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <Icon size={13} /> {title}
      </div>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------
   YOUR ACCOUNT — profile fields, all with cooldown awareness
--------------------------------------------------------- */
function CooldownNotice({ cooldown, fieldLabel }) {
  if (!cooldown) return null;
  return (
    <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 10.5, color: C.mustard, background: alpha(C.mustard, 8), border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 8, padding: "8px 10px" }}>
      <Clock size={12} />
      You can change your {fieldLabel} again on {new Date(cooldown.nextAllowedAt).toLocaleDateString()} ({cooldown.remainingDays} day{cooldown.remainingDays === 1 ? "" : "s"} left).
    </div>
  );
}

function AccountCategory({ user, refresh }) {
  const [pseudonym, setPseudonym] = useState(user.pseudonym);
  const [realName, setRealName] = useState(user.realName);
  const [bio, setBio] = useState(user.bio || "");
  const [country, setCountry] = useState(user.country || "");
  const [accountType, setAccountType] = useState(user.accountType || "personal");
  const [interests, setInterests] = useState(user.interests || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const cooldowns = user.cooldowns || {};
  const pseudonymLocked = !!cooldowns.pseudonym;
  const realNameLocked = !!cooldowns.realName;

  const dirty = pseudonym !== user.pseudonym || realName !== user.realName || bio !== (user.bio || "")
    || country !== (user.country || "") || accountType !== user.accountType
    || JSON.stringify(interests) !== JSON.stringify(user.interests || []);

  function toggleInterest(i) {
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : prev.length < 5 ? [...prev, i] : prev));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateProfile({ pseudonym, realName, bio, country, accountType, interests });
      await refresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsCard title="Your Account" icon={UserCog}>
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 4 }}>PSEUDONYM — visible to everyone, unique like a username</div>
        <input value={pseudonym} onChange={(e) => setPseudonym(e.target.value)} style={inputStyle} maxLength={24} disabled={pseudonymLocked} />
        <div style={{ marginTop: 6 }}>
          {pseudonymLocked ? <CooldownNotice cooldown={cooldowns.pseudonym} fieldLabel="pseudonym" /> : (
            <div style={{ ...monoFont, fontSize: 10, color: C.muted }}>Can be changed once every 14 days.</div>
          )}
        </div>
      </div>
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 4 }}>REAL NAME — only shown if you post as "Real Name"</div>
        <input value={realName} onChange={(e) => setRealName(e.target.value)} style={inputStyle} maxLength={80} disabled={realNameLocked} />
        <div style={{ marginTop: 6 }}>
          {realNameLocked ? <CooldownNotice cooldown={cooldowns.realName} fieldLabel="real name" /> : (
            <div style={{ ...monoFont, fontSize: 10, color: C.muted }}>Can be changed once every 14 days.</div>
          )}
        </div>
      </div>
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 4 }}>BIO ({bio.length}/280)</div>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} style={{ ...inputStyle, resize: "none" }} rows={3} maxLength={280} />
      </div>
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 4 }}>COUNTRY</div>
        <input value={country} onChange={(e) => setCountry(e.target.value)} style={inputStyle} maxLength={60} />
      </div>
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 6 }}>ACCOUNT TYPE</div>
        <div className="flex gap-2">
          {ACCOUNT_TYPES.map((t) => (
            <button
              key={t.key} onClick={() => setAccountType(t.key)}
              style={{ ...monoFont, fontSize: 11.5, flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${accountType === t.key ? C.mustard : C.line}`, color: accountType === t.key ? C.mustard : C.muted, background: accountType === t.key ? alpha(C.mustard, 8) : "transparent", cursor: "pointer" }}
            >{t.label}</button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 6 }}>INTERESTS (up to 5)</div>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => {
            const active = interests.includes(i);
            return (
              <button
                key={i} onClick={() => toggleInterest(i)}
                style={{ ...monoFont, fontSize: 10.5, padding: "4px 10px", borderRadius: 20, border: `1px solid ${active ? C.mustard : C.line}`, color: active ? C.mustard : C.muted, background: active ? alpha(C.mustard, 8) : "transparent", cursor: "pointer" }}
              >{i}</button>
            );
          })}
        </div>
      </div>
      {error && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{error}</div>}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{ ...monoFont, fontSize: 12, color: "#FFFFFF", background: dirty ? C.mustard : C.surface2, border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: dirty ? "pointer" : "default" }}
        >{saving ? "saving…" : "Save changes"}</button>
        {saved && <span className="flex items-center gap-1" style={{ ...monoFont, fontSize: 11, color: C.green }}><Check size={13} /> saved</span>}
      </div>
    </SettingsCard>
  );
}

/* ---------------------------------------------------------
   SECURITY & VERIFICATION
--------------------------------------------------------- */
function SecurityCategory({ user, refresh }) {
  return (
    <div className="flex flex-col gap-4">
      <PasswordSection user={user} />
      <EmailPhoneSection user={user} refresh={refresh} />
      <IdentityVerificationSection user={user} refresh={refresh} />
      <ConnectedAccountsSection user={user} refresh={refresh} />
    </div>
  );
}

function PasswordSection({ user }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);

  async function changePassword() {
    setPwSaving(true);
    setPwError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setCurrentPassword(""); setNewPassword("");
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 2500);
    } catch (e) {
      setPwError(e.message);
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <SettingsCard title="Password" icon={Lock}>
      {user.hasPassword ? (
        <div className="flex flex-col gap-2">
          <input type="password" placeholder="current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle} />
          <input type="password" placeholder="new password (8+ characters)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          {pwError && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{pwError}</div>}
          <div className="flex items-center gap-3">
            <button
              onClick={changePassword}
              disabled={!currentPassword || newPassword.length < 8 || pwSaving}
              style={{ ...monoFont, fontSize: 12, color: C.text, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start" }}
            >{pwSaving ? "updating…" : "Update password"}</button>
            {pwSaved && <span className="flex items-center gap-1" style={{ ...monoFont, fontSize: 11, color: C.green }}><Check size={13} /> updated</span>}
          </div>
        </div>
      ) : (
        <div style={{ ...monoFont, fontSize: 11, color: C.muted }}>
          This account signed up via {user.hasGoogle ? "Google" : "Apple"} and has no password to change.
        </div>
      )}
    </SettingsCard>
  );
}

function EmailPhoneSection({ user, refresh }) {
  const [resendState, setResendState] = useState("idle");
  const [phone, setPhone] = useState(user.phone || "");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState(user.phoneVerified ? "verified" : "enter-phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [smsNote, setSmsNote] = useState(null);

  async function resendVerification() {
    setResendState("sending");
    try { await api.resendVerification(); setResendState("sent"); } catch { setResendState("idle"); }
  }
  async function requestCode() {
    if (!phone.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await api.requestPhoneVerification(phone.trim());
      setStage("enter-code");
      setSmsNote(res.smsSent ? "Code sent." : "SMS isn't configured in this environment — check the server console for the code.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function confirmCode() {
    if (!code.trim()) return;
    setBusy(true); setError(null);
    try { await api.confirmPhoneVerification(code.trim()); await refresh(); setStage("verified"); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <SettingsCard title="Email & Phone" icon={Phone}>
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontSize: 13, color: C.text }}>{user.email}</div>
          <div style={{ ...monoFont, fontSize: 10.5, color: user.emailVerified ? C.green : C.flag, marginTop: 2 }}>{user.emailVerified ? "verified" : "not verified"}</div>
        </div>
        {!user.emailVerified && (
          <button onClick={resendVerification} disabled={resendState !== "idle"} style={{ ...monoFont, fontSize: 10.5, color: C.mustard, background: "none", border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
            {resendState === "sent" ? "sent!" : resendState === "sending" ? "sending…" : "resend"}
          </button>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 8 }}>PHONE (OPTIONAL)</div>
        {stage === "verified" ? (
          <div className="flex items-center gap-2" style={{ fontSize: 13, color: C.green }}><Check size={14} /> {user.phone} verified</div>
        ) : stage === "enter-code" ? (
          <div className="flex flex-col gap-2">
            {smsNote && <div style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>{smsNote}</div>}
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" maxLength={6} style={inputStyle} />
            {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
            <button onClick={confirmCode} disabled={!code.trim() || busy} style={{ ...monoFont, fontSize: 12, color: C.text, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start" }}>{busy ? "verifying…" : "Confirm code"}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" style={inputStyle} />
            {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
            <button onClick={requestCode} disabled={!phone.trim() || busy} style={{ ...monoFont, fontSize: 12, color: C.text, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start" }}>{busy ? "sending…" : "Send code"}</button>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

const VERIFICATION_TYPES = [
  { key: "government_id", label: "Government ID", icon: BadgeCheck, hint: "Upload a clear photo of a government-issued ID (passport, driver's license, national ID). Cover any info you don't want a reviewer to see except what proves your identity." },
  { key: "business", label: "Business", icon: Building2, hint: "Upload a business registration document, or add a note with your work email domain / a link proving your role." },
  { key: "professional", label: "Professional", icon: Briefcase, hint: "Upload a license, certificate, or add a note with a LinkedIn/portfolio link proving your professional claim." },
];

function VerificationRow({ type, status, refresh }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  async function submit() {
    if (!notes.trim() && !file) return;
    setBusy(true); setError(null);
    try {
      const form = new FormData();
      form.set("type", type.key);
      form.set("notes", notes.trim());
      if (file) form.set("document", file);
      await api.submitVerificationRequest(form);
      await refresh();
      setOpen(false);
      setNotes("");
      setFile(null);
    }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const statusColor = status === "verified" ? C.green : status === "pending" ? C.mustard : status === "rejected" ? C.flag : C.muted;
  const statusLabel = status === "verified" ? "verified" : status === "pending" ? "pending review" : status === "rejected" ? "rejected" : "not verified";
  const Icon = type.icon;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} color={C.muted} />
          <span style={{ fontSize: 13, color: C.text }}>{type.label}</span>
          <span style={{ ...monoFont, fontSize: 10, color: statusColor }}>· {statusLabel}</span>
        </div>
        {status === "none" || status === "rejected" ? (
          <button onClick={() => setOpen((o) => !o)} className="lo-tap" style={{ ...monoFont, fontSize: 10.5, color: C.mustard, background: "none", border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>request</button>
        ) : status === "pending" ? <Clock size={13} color={C.mustard} /> : <Check size={14} color={C.green} />}
      </div>
      {open && (
        <div className="lo-enter flex flex-col gap-2.5" style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12 }}>
          <div style={{ ...monoFont, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{type.hint}</div>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="lo-tap flex items-center gap-2"
            style={{
              ...monoFont, fontSize: 11.5, color: file ? C.text : C.muted, background: C.surface, border: `1.5px dashed ${file ? C.mustard : C.line}`,
              borderRadius: 8, padding: "12px 14px", cursor: "pointer", textAlign: "left",
            }}
          >
            <Upload size={14} color={file ? C.mustard : C.muted} />
            {file ? file.name : "Upload a photo or PDF"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional note for the reviewer" rows={2} maxLength={400} style={{ ...inputStyle, resize: "none" }} />
          {error && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{error}</div>}
          <button onClick={submit} disabled={(!notes.trim() && !file) || busy} className="lo-tap flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", alignSelf: "flex-start", fontWeight: 700 }}>
            {busy && <Upload size={12} className="lo-spin" />} {busy ? "submitting…" : "Submit for review"}
          </button>
        </div>
      )}
    </div>
  );
}

function IdentityVerificationSection({ user, refresh }) {
  const [history, setHistory] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    api.getVerificationRequests().then((r) => setHistory(r.requests || r)).catch(() => setHistory([]));
  }, [user.governmentIdStatus, user.businessVerifiedStatus, user.professionalVerifiedStatus]);

  const typeLabel = { government_id: "Government ID", business: "Business", professional: "Professional" };

  return (
    <SettingsCard title="Identity Verification" icon={BadgeCheck}>
      <div style={{ ...monoFont, fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
        Reviewed by a human operator, not instant. Submitting doesn't reveal anything to other users; only your verified badge (if approved) becomes visible.
      </div>
      <VerificationRow type={VERIFICATION_TYPES[0]} status={user.governmentIdStatus} refresh={refresh} />
      <VerificationRow type={VERIFICATION_TYPES[1]} status={user.businessVerifiedStatus} refresh={refresh} />
      <VerificationRow type={VERIFICATION_TYPES[2]} status={user.professionalVerifiedStatus} refresh={refresh} />

      {history && history.length > 0 && (
        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 4 }}>
          <button onClick={() => setShowHistory((s) => !s)} className="lo-tap flex items-center gap-1" style={{ ...monoFont, fontSize: 10.5, color: C.muted, background: "none", border: "none", cursor: "pointer" }}>
            {showHistory ? "Hide" : "View"} submission history ({history.length})
          </button>
          {showHistory && (
            <div className="lo-enter flex flex-col gap-2" style={{ marginTop: 8 }}>
              {history.map((r) => (
                <div key={r.id} style={{ background: C.surface2, borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 11.5, color: C.text, fontWeight: 600 }}>{typeLabel[r.type] || r.type}</span>
                    <span style={{
                      ...monoFont, fontSize: 9.5,
                      color: r.status === "approved" ? C.green : r.status === "rejected" ? C.flag : C.mustard,
                    }}>{r.status}</span>
                  </div>
                  <span style={{ ...monoFont, fontSize: 9.5, color: C.muted }}>submitted {new Date(r.created_at).toLocaleDateString()}</span>
                  {r.review_note && <span style={{ fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>Reviewer note: {r.review_note}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

function ConnectedAccountsSection({ user }) {
  return (
    <SettingsCard title="Connected Accounts" icon={BadgeCheck}>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 13, color: C.text }}>Google</span>
        {user.hasGoogle ? <span style={{ ...monoFont, fontSize: 10.5, color: C.green }}>connected</span> : (
          <a href="/api/auth/google" style={{ ...monoFont, fontSize: 10.5, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 8, padding: "6px 10px", textDecoration: "none" }}>connect</a>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 13, color: C.text }}>Apple</span>
        {user.hasApple ? <span style={{ ...monoFont, fontSize: 10.5, color: C.green }}>connected</span> : (
          <a href="/api/auth/apple" style={{ ...monoFont, fontSize: 10.5, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 8, padding: "6px 10px", textDecoration: "none" }}>connect</a>
        )}
      </div>
    </SettingsCard>
  );
}

/* ---------------------------------------------------------
   NOTIFICATIONS
--------------------------------------------------------- */
function NotificationsCategory() {
  const [prefs, setPrefs] = useState(null);
  const [error, setError] = useState(null);
  const [savingKey, setSavingKey] = useState(null);

  useEffect(() => {
    api.getNotificationPreferences().then((r) => setPrefs(r.categories)).catch((e) => setError(e.message));
  }, []);

  async function toggle(category, channel) {
    const current = prefs[category];
    const next = { ...current, [channel]: !current[channel] };
    setPrefs((p) => ({ ...p, [category]: next }));
    setSavingKey(`${category}:${channel}`);
    try {
      await api.setNotificationPreference(category, { [channel]: next[channel] });
    } catch (e) {
      setPrefs((p) => ({ ...p, [category]: current })); // revert on failure
      setError(e.message);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <SettingsCard title="Notifications" icon={Bell}>
      <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 4 }}>
        Choose where each kind of notification reaches you. Turning off a category doesn't retroactively delete past notifications, and never reveals who triggered one — just that something happened.
      </p>
      {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
      {!prefs ? (
        <div className="flex flex-col gap-2">
          <div className="lo-skeleton" style={{ height: 48 }} />
          <div className="lo-skeleton" style={{ height: 48 }} />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2" style={{ padding: "4px 0" }}>
            <span />
            {["inApp", "email", "push"].map((ch) => (
              <span key={ch} style={{ ...monoFont, fontSize: 9.5, color: C.muted, textAlign: "center", width: 46, textTransform: "uppercase" }}>
                {ch === "inApp" ? "App" : ch}
              </span>
            ))}
          </div>
          {Object.entries(prefs).map(([key, cat]) => (
            <div key={key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2" style={{ padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
              <div>
                <div style={{ fontSize: 12.5, color: C.text }}>{cat.label}</div>
                <div style={{ ...monoFont, fontSize: 9.5, color: C.muted, marginTop: 1 }}>{cat.description}</div>
              </div>
              {["inApp", "email", "push"].map((ch) => (
                <button
                  key={ch}
                  onClick={() => toggle(key, ch)}
                  disabled={savingKey === `${key}:${ch}`}
                  className="lo-tap"
                  style={{
                    width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", position: "relative",
                    background: cat[ch] ? C.mustard : C.surface2, justifySelf: "center",
                  }}
                >
                  <span style={{
                    position: "absolute", top: 2, left: cat[ch] ? 20 : 2, width: 18, height: 18, borderRadius: "50%",
                    background: "#FFFFFF", transition: "left 0.15s ease",
                  }} />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

/* ---------------------------------------------------------
   APPEARANCE
--------------------------------------------------------- */
function AppearanceCategory() {
  const { mode, setMode } = useTheme();
  const OPTIONS = [
    { key: "system", label: "System", icon: Monitor },
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
  ];
  return (
    <SettingsCard title="Appearance" icon={Sun}>
      <div className="flex gap-2">
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = mode === o.key;
          return (
            <button
              key={o.key} onClick={() => setMode(o.key)}
              className="flex-1 flex flex-col items-center gap-1.5"
              style={{ padding: "12px 8px", borderRadius: 8, border: `1px solid ${active ? C.mustard : C.line}`, background: active ? alpha(C.mustard, 8) : "transparent", cursor: "pointer" }}
            >
              <Icon size={16} color={active ? C.mustard : C.muted} />
              <span style={{ ...monoFont, fontSize: 10.5, color: active ? C.mustard : C.muted }}>{o.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ ...monoFont, fontSize: 10, color: C.muted }}>Changes apply instantly, everywhere in the app.</div>
    </SettingsCard>
  );
}

/* ---------------------------------------------------------
   YOUR DATA & ACCOUNT — export, deactivate, delete
--------------------------------------------------------- */
function DataCategory({ logout }) {
  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Download Your Data" icon={Download}>
        <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
          Get a copy of your profile info, badges, verification history, and your own post history as a JSON file.
        </p>
        <a
          href="/api/profile/export"
          style={{ ...monoFont, fontSize: 12, color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", textDecoration: "none", alignSelf: "flex-start", display: "inline-block" }}
        >Download JSON</a>
      </SettingsCard>

      <DeactivateSection />
      <DeleteSection logout={logout} />
    </div>
  );
}

function DeactivateSection() {
  const { refresh, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleDeactivate() {
    setBusy(true); setError(null);
    try {
      await api.deactivateAccount(password);
      await logout();
      window.location.href = "/";
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <SettingsCard title="Deactivate Account" icon={UserX}>
      <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
        Temporarily disables your account and logs you out everywhere. Logging back in with your password reactivates it automatically — nothing is deleted. Your posts stay in the feed either way, since they were never linked back to your account in the first place.
      </p>
      {!confirming ? (
        <button onClick={() => setConfirming(true)} style={{ ...monoFont, fontSize: 12, color: C.text, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start" }}>Deactivate account</button>
      ) : (
        <div className="flex flex-col gap-2">
          <input type="password" placeholder="confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
          <div className="flex gap-2">
            <button onClick={handleDeactivate} disabled={busy} style={{ ...monoFont, fontSize: 12, color: "#FFFFFF", background: C.corpblue, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>{busy ? "deactivating…" : "Confirm deactivation"}</button>
            <button onClick={() => { setConfirming(false); setPassword(""); setError(null); }} style={{ ...monoFont, fontSize: 12, color: C.muted, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function DeleteSection({ logout }) {
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true); setError(null);
    try {
      await api.deleteAccount(password);
      await logout();
      window.location.href = "/";
    } catch (e) {
      setError(e.message);
      setDeleting(false);
    }
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${alpha(C.flag, 40)}`, borderRadius: 10 }} className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: C.flag, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <AlertTriangle size={13} /> Delete Account — Permanent
      </div>
      {!confirming ? (
        <button onClick={() => setConfirming(true)} style={{ ...monoFont, fontSize: 12, color: C.flag, background: "none", border: `1px solid ${alpha(C.flag, 40)}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer", alignSelf: "flex-start" }}>Delete account</button>
      ) : (
        <div className="flex flex-col gap-3">
          <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>
            Unlike deactivating, this cannot be undone. Deletes your account, profile, avatar, and notifications permanently. Posts you've already made stay in the feed — they were never linked back to your account in the first place.
          </p>
          <input type="password" placeholder="confirm your password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          {error && <div style={{ ...monoFont, fontSize: 11.5, color: C.flag }}>{error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={handleDelete} disabled={deleting} style={{ ...monoFont, fontSize: 12, color: "#fff", background: C.flag, border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>{deleting ? "deleting…" : "Permanently delete"}</button>
            <button onClick={() => { setConfirming(false); setPassword(""); setError(null); }} style={{ ...monoFont, fontSize: 12, color: C.muted, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
