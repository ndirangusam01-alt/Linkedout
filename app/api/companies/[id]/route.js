import { NextResponse } from "next/server";
import { getCompanyById } from "@/lib/content/service";

export async function GET(request, { params }) {
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) return NextResponse.json({ error: "Company not found." }, { status: 404 });
  return NextResponse.json(company);
}
