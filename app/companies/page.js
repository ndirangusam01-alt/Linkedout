"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Plus } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";
import { api } from "@/lib/api";
import CompaniesList from "@/components/CompaniesList";
import { useAuth } from "@/app/auth-provider";

function CreateCompanyForm({ onCreated, onCancel }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const company = await api.createCompany({ name: name.trim(), industry: industry.trim() || undefined, description: description.trim() || undefined, mode: "alias" });
      onCreated(company);
    } catch (e) {
      setError(e.status === 401 ? "Log in to start a company page." : e.message);
    } finally {
      setBusy(false);
    }
  }

  const inputStyle = { background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%" };

  return (
    <div style={{ background: C.surface, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 10 }} className="p-4 flex flex-col gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" maxLength={80} style={inputStyle} />
      <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry (optional)" maxLength={60} style={inputStyle} />
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" rows={2} maxLength={200} style={{ ...inputStyle, resize: "none" }} />
      {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={!name.trim() || busy} style={{ ...monoFont, fontSize: 11.5, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, cursor: "pointer" }}>{busy ? "creating…" : "Start company page"}</button>
        <button onClick={onCancel} style={{ ...monoFont, fontSize: 11.5, color: C.muted, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 14px", cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

export default function CompaniesPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api.getCompanies().then(setCompanies).catch((e) => setError(e.message));
  }, []);

  function handleCreated(company) {
    setCompanies((cs) => [company, ...(cs || [])]);
    setShowCreate(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" style={{ ...monoFont, fontSize: 11, color: C.muted }}>
          <ShieldCheck size={13} /> pages are built by employees. companies cannot edit or remove reviews.
        </div>
        {user && !showCreate && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1" style={{ ...monoFont, fontSize: 11, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 20, padding: "4px 10px", background: "none", cursor: "pointer" }}>
            <Plus size={12} /> Start a company page
          </button>
        )}
      </div>
      {showCreate && <CreateCompanyForm onCreated={handleCreated} onCancel={() => setShowCreate(false)} />}
      {error && <div style={{ ...monoFont, fontSize: 12, color: C.flag }}>couldn't load companies: {error}</div>}
      {!companies && !error && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>loading companies…</div>}
      {companies && companies.length === 0 && <div style={{ ...monoFont, fontSize: 12, color: C.muted }}>No company pages yet — be the first to start one.</div>}
      {companies && companies.length > 0 && <CompaniesList companies={companies} />}
    </div>
  );
}
