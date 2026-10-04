"use client";
import { use } from "react";
import { C } from "@/lib/theme";
import { useAdmin } from "@/components/admin/AdminContext";
import SectionTable from "@/components/admin/SectionTable";
import UsersAdmin from "@/components/admin/UsersAdmin";
import DmInvestigations from "@/components/admin/DmInvestigations";

export default function AdminSection({ params }) {
  const { section } = use(params);
  const me = useAdmin();
  const sec = me.sections.find((s) => s.id === section);
  if (!sec) return <p style={{ color: C.muted }}>Your role doesn't have access to this section.</p>;
  if (sec.kind === "dm") return <DmInvestigations />;
  return sec.kind === "users" ? <UsersAdmin /> : <SectionTable key={section} id={section} title={sec.label} />;
}
