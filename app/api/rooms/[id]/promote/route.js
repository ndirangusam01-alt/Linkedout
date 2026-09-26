import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { getOrCreateAlias } from "@/lib/identity/service";
import { promoteToSpeaker } from "@/lib/content/service";

export async function POST(request, { params }) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.handle) return NextResponse.json({ error: "handle is required." }, { status: 400 });

  const identity = await getOrCreateAlias(accountId);
  try {
    const participants = await promoteToSpeaker(id, identity.anonymousId, body.handle);
    return NextResponse.json({ participants });
  } catch (e) {
    const status = e.code === "NOT_HOST" ? 403 : e.code === "NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: e.message }, { status });
  }
}
