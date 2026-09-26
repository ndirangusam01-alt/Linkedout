import { NextResponse } from "next/server";
import { getPublicAliasProfile } from "@/lib/content/service";
import { getAliasHandle, getFollowerCount, isFollowing } from "@/lib/identity/service";
import { getCurrentAccountId } from "@/lib/session";
import { getOrCreateAlias } from "@/lib/identity/service";

// /api/u/[handle] — handle is an alias-mode anonymous_id. Anything that
// isn't a real, currently-valid alias identity (including any anon-mode
// id, even a real one that exists) 404s here rather than resolving —
// that refusal is what keeps fully-anonymous posts unlinkable, which is
// the whole point of that mode existing.
export async function GET(request, { params }) {
  const { handle } = await params;
  const alias = await getAliasHandle(handle);
  if (!alias) return NextResponse.json({ error: "No profile here." }, { status: 404 });

  const accountId = await getCurrentAccountId();
  const viewerAnonKey = accountId ? (await getOrCreateAlias(accountId)).anonymousId : null;

  const profile = await getPublicAliasProfile(handle, viewerAnonKey);
  return NextResponse.json({
    displayLabel: alias.displayLabel, avatarUrl: alias.avatarUrl, handle, ...profile,
    followerCount: await getFollowerCount(handle),
    isFollowing: await isFollowing(accountId, handle),
    isSelf: Boolean(accountId) && (await getOrCreateAlias(accountId)).anonymousId === handle,
  });
}
