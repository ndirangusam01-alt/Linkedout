import { NextResponse } from "next/server";
import { getRooms, createRoom } from "@/lib/content/service";
import { getCurrentAccountId } from "@/lib/session";
import { issueContentToken, verifyContentToken } from "@/lib/identity/service";
import { checkRateLimit, RateLimitError } from "@/lib/identity/rate-limit";

const VALID_MODES = new Set(["real", "alias", "anon"]);

export async function GET() {
  return NextResponse.json(await getRooms());
}

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
  const topic = body?.topic?.trim();
  if (!topic) return NextResponse.json({ error: "Room topic is required." }, { status: 400 });
  const mode = VALID_MODES.has(body?.mode) ? body.mode : "alias";

  const { token } = await issueContentToken(accountId, mode);
  const identity = await verifyContentToken(token);

  const room = await createRoom({
    topic, vibe: body?.vibe?.trim() || "Vent",
    startsAt: body?.startsAt ? new Date(body.startsAt).toISOString() : null,
    anonymousId: identity.anonymousId, authorDisplay: identity.displayLabel,
  });
  return NextResponse.json(room, { status: 201 });
}
