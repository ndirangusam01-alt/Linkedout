import { NextResponse } from "next/server";
import { toggleReaction, getPostAnonymousId } from "@/lib/content/service";
import { getCurrentAccountId } from "@/lib/session";
import { checkRateLimit, RateLimitError } from "@/lib/identity/rate-limit";
import { notifyOwnerOfAnonymousId, getOrCreateAlias } from "@/lib/identity/service";

const VALID_REACTIONS = new Set(["cry", "laugh", "skull", "flag"]);
const REACTION_LABELS = { cry: "😩 cried at", laugh: "😂 laughed at", skull: "💀 died at", flag: "🚩 flagged" };

export async function POST(request, { params }) {
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return NextResponse.json({ error: "You need to be logged in to react." }, { status: 401 });
  }

  try {
    await checkRateLimit(accountId, "react");
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(Math.ceil(e.retryAfterMs / 1000)) } });
    }
    throw e;
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const reaction = body?.reaction;

  if (!VALID_REACTIONS.has(reaction)) {
    return NextResponse.json({ error: "Unknown reaction type." }, { status: 400 });
  }

  // anon_key: the account's own persistent alias identity, reused purely
  // as an opaque per-account dedup key — never returned to any client.
  // This is what makes reaction counts real: one account can only hold
  // one active reaction per post at a time, enforced server-side (see
  // toggleReaction in lib/content/service.js), not just in the browser's
  // local state like the earlier version of this app.
  const anonKey = (await getOrCreateAlias(accountId)).anonymousId;
  const result = await toggleReaction(id, anonKey, reaction);
  if (!result) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  if (result.active) {
    const postAnonymousId = await getPostAnonymousId(id);
    if (postAnonymousId) {
      await notifyOwnerOfAnonymousId(
        postAnonymousId,
        "reaction",
        `Someone ${REACTION_LABELS[reaction]} your post.`,
        id,
        accountId
      );
    }
  }

  return NextResponse.json(result.post);
}
