import { NextResponse } from "next/server";
import { getCompanies, createCompany } from "@/lib/content/service";
import { getCurrentAccountId } from "@/lib/session";
import { issueContentToken, verifyContentToken, checkAndAwardBadges } from "@/lib/identity/service";
import { checkRateLimit, RateLimitError } from "@/lib/identity/rate-limit";

const VALID_MODES = new Set(["real", "alias", "anon"]);

export async function GET() {
  return NextResponse.json(await getCompanies());
}

// Anyone can start a company page — same model the original PRD
// described ("company pages built entirely from employee submissions").
// Companies can't self-edit their own page; there's no route for a
// company account to claim or modify one.
export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  try {
    await checkRateLimit(accountId, "post");
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(Math.ceil(e.retryAfterMs / 1000)) } });
    }
    throw e;
  }

  const body = await request.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  const mode = VALID_MODES.has(body?.mode) ? body.mode : "alias";

  const { token } = await issueContentToken(accountId, mode);
  const identity = await verifyContentToken(token);

  const company = await createCompany({
    name, industry: body?.industry?.trim() || null, description: body?.description?.trim() || null,
    anonymousId: identity.anonymousId, authorDisplay: identity.displayLabel,
  });

  await checkAndAwardBadges(accountId, { startedCompany: true });

  return NextResponse.json(company, { status: 201 });
}
