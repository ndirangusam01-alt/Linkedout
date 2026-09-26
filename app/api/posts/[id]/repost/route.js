import { NextResponse } from "next/server";
import { createPost, getPostById, getPostAnonymousId, countRepostsByAnonymousIds } from "@/lib/content/service";
import { getCurrentAccountId } from "@/lib/session";
import { issueContentToken, verifyContentToken, notifyOwnerOfAnonymousId, getAnonymousIdsForAccount, checkAndAwardBadges } from "@/lib/identity/service";
import { checkRateLimit, RateLimitError } from "@/lib/identity/rate-limit";

const VALID_MODES = new Set(["real", "alias", "anon"]);

// A repost is a real post — a new row in the posts table with repost_of
// set — attributed to whoever reposted it. That's what makes "shows on
// your profile" work automatically: getPostsByOwnership already finds
// every post with your anonymous_id, reposts included, with no special
// casing needed. Optional quoteText adds your own commentary above the
// embedded original (a "quote repost").
export async function POST(request, { params }) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in to repost." }, { status: 401 });

  try {
    await checkRateLimit(accountId, "post");
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429, headers: { "Retry-After": String(Math.ceil(e.retryAfterMs / 1000)) } });
    }
    throw e;
  }

  const { id } = await params;
  const original = await getPostById(id);
  if (!original) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (original.repostOf) return NextResponse.json({ error: "Can't repost a repost — repost the original instead." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const mode = VALID_MODES.has(body?.mode) ? body.mode : "alias";
  const quoteText = body?.quoteText?.trim() || null;

  const { token } = await issueContentToken(accountId, mode);
  const identity = await verifyContentToken(token);

  const repost = await createPost({
    type: original.type,
    mood: original.mood,
    text: "",
    tags: [],
    authorDisplay: identity.displayLabel,
    anonymousId: identity.anonymousId,
    visibility: "public",
    repostOf: id,
    quoteText,
  });

  const originalAnonymousId = await getPostAnonymousId(id);
  if (originalAnonymousId) {
    await notifyOwnerOfAnonymousId(originalAnonymousId, "repost", `${identity.displayLabel} reposted your post.`, id, accountId);
  }

  const anonymousIds = await getAnonymousIdsForAccount(accountId);
  await checkAndAwardBadges(accountId, { repostCount: await countRepostsByAnonymousIds(anonymousIds) });

  return NextResponse.json(repost, { status: 201 });
}
