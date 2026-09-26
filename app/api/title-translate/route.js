import { NextResponse } from "next/server";
import { translateTitle, isAiConfigured } from "@/lib/ai";
import { getCurrentAccountId } from "@/lib/session";
import { checkRateLimit, RateLimitError } from "@/lib/identity/rate-limit";

const VALID_DIRECTIONS = new Set(["real-to-linkedin", "linkedin-to-real"]);

export async function GET() {
  return NextResponse.json({ configured: isAiConfigured() });
}

export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  // Reuses the "react" rate-limit tier — frequent-but-bounded, matching
  // how often someone would realistically retry this, without needing a
  // brand new tier just for one feature.
  try {
    await checkRateLimit(accountId, "react");
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(Math.ceil(e.retryAfterMs / 1000)) } });
    }
    throw e;
  }

  const body = await request.json().catch(() => null);
  const input = body?.input?.trim();
  const direction = body?.direction;
  if (!input) return NextResponse.json({ error: "Enter a title or description first." }, { status: 400 });
  if (!VALID_DIRECTIONS.has(direction)) return NextResponse.json({ error: "Invalid direction." }, { status: 400 });
  if (input.length > 300) return NextResponse.json({ error: "Keep it under 300 characters." }, { status: 400 });

  const result = await translateTitle(input, direction);
  return NextResponse.json(result);
}
