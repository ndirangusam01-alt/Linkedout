"use client";
import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import { ChevronLeft, Star, Ghost, Plus, DollarSign } from "lucide-react";
import { C, monoFont, displayFont, alpha, sunken } from "@/lib/theme";
import { Stamp, Redacted } from "@/components/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/app/auth-provider";

const inputStyle = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "8px 10px", fontSize: 12.5, width: "100%" };

function StarRating({ value, onChange, readOnly = false, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          style={{ background: "none", border: "none", padding: 0, cursor: readOnly ? "default" : "pointer" }}
        >
          <Star size={size} fill={n <= value ? C.mustard : "none"} color={n <= value ? C.mustard : C.muted} />
        </button>
      ))}
    </div>
  );
}

function ReviewForm({ companyId, onAdded }) {
  const [flagType, setFlagType] = useState("red");
  const [tagText, setTagText] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!tagText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.addCompanyReview(companyId, {
        flagType, tagText: tagText.trim(), body: body.trim() || undefined,
        rating: rating || undefined, mode: "alias",
      });
      onAdded(updated);
      setTagText(""); setBody(""); setRating(0);
    } catch (e) {
      setError(e.status === 401 ? "Log in to leave a review." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <div style={{ ...monoFont, fontSize: 10, color: C.muted, marginBottom: 4 }}>OVERALL RATING (OPTIONAL)</div>
        <StarRating value={rating} onChange={setRating} size={20} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => setFlagType("red")} style={{ ...monoFont, fontSize: 11, flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${flagType === "red" ? C.flag : C.line}`, color: flagType === "red" ? C.flag : C.muted, background: "none", cursor: "pointer" }}>🚩 Red flag</button>
        <button onClick={() => setFlagType("green")} style={{ ...monoFont, fontSize: 11, flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${flagType === "green" ? C.green : C.line}`, color: flagType === "green" ? C.green : C.muted, background: "none", cursor: "pointer" }}>✅ Green flag</button>
      </div>
      <input value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="Short tag, e.g. 'Ghosts candidates'" maxLength={60} style={inputStyle} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a full review — what's it really like working here?" rows={4} maxLength={1000} style={{ ...inputStyle, resize: "none" }} />
      {error && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{error}</div>}
      <button onClick={submit} disabled={!tagText.trim() || busy} style={{ ...monoFont, fontSize: 11.5, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "8px 14px", border: "none", cursor: "pointer", alignSelf: "flex-start", fontWeight: 700 }}>{busy ? "submitting…" : "Submit review"}</button>
    </div>
  );
}

function SalaryForm({ companyId, onAdded }) {
  const [amount, setAmount] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) { setError("Enter a valid salary amount."); return; }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.addCompanySalary(companyId, { amount: n, roleTitle: roleTitle.trim() || undefined, mode: "anon" });
      onAdded(updated);
      setAmount(""); setRoleTitle("");
    } catch (e) {
      setError(e.status === 401 ? "Log in to submit a salary." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input value={roleTitle} onChange={(e) => setRoleTitle(e.target.value)} placeholder="Role title (optional)" maxLength={60} style={inputStyle} />
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Annual salary $" style={inputStyle} />
      </div>
      {error && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{error}</div>}
      <button onClick={submit} disabled={!amount || busy} className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "8px 14px", border: "none", cursor: "pointer", alignSelf: "flex-start", fontWeight: 700 }}>
        <DollarSign size={12} /> {busy ? "submitting…" : "Submit salary (anonymous)"}
      </button>
    </div>
  );
}

function HorrorStoryForm({ companyId, onAdded }) {
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!story.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.addCompanyHorrorStory(companyId, { story: story.trim(), mode: "alias" });
      onAdded(updated);
      setStory("");
    } catch (e) {
      setError(e.status === 401 ? "Log in to share a story." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea value={story} onChange={(e) => setStory(e.target.value)} placeholder="Share an interview horror story..." rows={4} maxLength={1000} style={{ ...inputStyle, resize: "none" }} />
      {error && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{error}</div>}
      <button onClick={submit} disabled={!story.trim() || busy} style={{ ...monoFont, fontSize: 11.5, color: "#FFFFFF", background: C.mustard, borderRadius: 8, padding: "8px 14px", border: "none", cursor: "pointer", alignSelf: "flex-start", fontWeight: 700 }}>{busy ? "submitting…" : "Share story"}</button>
    </div>
  );
}

export default function CompanyDetailPage({ params }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [company, setCompany] = useState(null);
  const [error, setError] = useState(null);
  const [activeForm, setActiveForm] = useState(null);
  const [reviewTab, setReviewTab] = useState("reviews");

  useEffect(() => {
    api.getCompany(id).then(setCompany).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load this company: {error}</div>;
  if (!company) return <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading…</div>;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/companies" className="flex items-center gap-1" style={{ color: C.muted, textDecoration: "none", fontSize: 12.5 }}>
        <ChevronLeft size={15} /> All companies
      </Link>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ ...displayFont, fontSize: 22, color: C.text }}>{company.name}</span>
          {company.toxic && <Stamp text="Verified Toxic Employer" tone="flag" rotate={-5} />}
          {company.layoffBadge && <Stamp text="Verified Layoffs" tone="mustard" rotate={4} />}
        </div>
        {company.description && <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{company.description}</p>}
        <div style={{ ...monoFont, fontSize: 11.5, color: C.muted }}>{company.industry}</div>

        <div className="flex items-center gap-6 flex-wrap" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
          {company.avgRating && (
            <div className="flex items-center gap-2">
              <StarRating value={Math.round(company.avgRating)} readOnly size={16} />
              <span style={{ fontSize: 13, color: C.text }}>{company.avgRating} <span style={{ color: C.muted }}>({company.ratingCount})</span></span>
            </div>
          )}
          <span style={{ color: C.green, fontSize: 13 }}>▲ {company.greenFlags} green</span>
          <span style={{ color: C.flag, fontSize: 13 }}>▼ {company.redFlags} red</span>
          <span style={{ ...monoFont, color: C.muted, fontSize: 12.5 }}>salary: <Redacted value={company.salaryRange} /> ({company.salarySamples})</span>
        </div>

        {company.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {company.tags.map((t, i) => (
              <span key={i} style={{ ...monoFont, fontSize: 11, borderRadius: 20, padding: "3px 10px", border: `1px solid ${C.line}`, color: C.text, background: C.surface2 }}>{t.type === "red" ? "🚩" : "✅"} {t.text} · {t.n}</span>
            ))}
          </div>
        )}
      </div>

      {user && (
        <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4 flex flex-col gap-3">
          <div className="flex gap-2 flex-wrap">
            {["review", "salary", "story"].map((f) => (
              <button
                key={f}
                onClick={() => setActiveForm(activeForm === f ? null : f)}
                className="flex items-center gap-1"
                style={{ ...monoFont, fontSize: 11, color: activeForm === f ? C.mustard : C.muted, border: `1px solid ${activeForm === f ? alpha(C.mustard, 33) : C.line}`, borderRadius: 20, padding: "5px 12px", background: "none", cursor: "pointer" }}
              ><Plus size={12} /> {f === "review" ? "Write a review" : f === "salary" ? "Add salary" : "Share horror story"}</button>
            ))}
          </div>
          {activeForm === "review" && <ReviewForm companyId={company.id} onAdded={setCompany} />}
          {activeForm === "salary" && <SalaryForm companyId={company.id} onAdded={setCompany} />}
          {activeForm === "story" && <HorrorStoryForm companyId={company.id} onAdded={setCompany} />}
        </div>
      )}

      <div className="flex gap-1" style={{ borderBottom: `1px solid ${C.line}` }}>
        {[
          { key: "reviews", label: `Reviews (${company.reviews?.length || 0})` },
          { key: "salaries", label: `Salaries (${company.salaries?.length || 0})` },
          { key: "horror", label: `Horror Stories (${company.horrorStories?.length || 0})` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setReviewTab(t.key)}
            style={{ fontSize: 12.5, color: reviewTab === t.key ? C.mustard : C.muted, background: "none", border: "none", borderBottom: `2px solid ${reviewTab === t.key ? C.mustard : "transparent"}`, padding: "8px 12px", cursor: "pointer" }}
          >{t.label}</button>
        ))}
      </div>

      {reviewTab === "reviews" && (
        <div className="flex flex-col gap-3">
          {company.reviews?.length === 0 && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>No reviews yet — be the first.</div>}
          {company.reviews?.map((r, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.author}</span>
                  <span style={{ ...monoFont, fontSize: 10.5, color: r.flagType === "red" ? C.flag : C.green }}>{r.flagType === "red" ? "🚩" : "✅"} {r.tagText}</span>
                </div>
                {r.rating && <StarRating value={r.rating} readOnly size={13} />}
              </div>
              {r.body && <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{r.body}</p>}
              <span style={{ ...monoFont, fontSize: 10, color: C.muted }}>{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {reviewTab === "salaries" && (
        <div className="flex flex-col gap-3">
          {company.salaries?.length === 0 && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>No salary data yet — contribute anonymously above.</div>}
          {company.salaries?.map((s, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4 flex items-center justify-between">
              <span style={{ fontSize: 13, color: C.text }}>{s.roleTitle || "Role not specified"}</span>
              <Redacted value={`$${s.amount.toLocaleString()}`} />
            </div>
          ))}
        </div>
      )}

      {reviewTab === "horror" && (
        <div className="flex flex-col gap-3">
          {company.horrorStories?.length === 0 && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>No horror stories yet.</div>}
          {company.horrorStories?.map((h, i) => (
            <div key={i} style={{ background: sunken, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2" style={{ color: C.flag, fontSize: 11, ...monoFont }}>
                <Ghost size={13} /> {h.author}
              </div>
              <p style={{ color: C.text, fontSize: 13, lineHeight: 1.5, fontStyle: "italic" }}>{h.story}</p>
              <span style={{ ...monoFont, fontSize: 10, color: C.muted }}>{new Date(h.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
