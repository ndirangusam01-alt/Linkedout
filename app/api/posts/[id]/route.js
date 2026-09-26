import { NextResponse } from "next/server";
import { getPostById } from "@/lib/content/service";
import { getCurrentAccountId } from "@/lib/session";
import { getOrCreateAlias } from "@/lib/identity/service";

export async function GET(request, { params }) {
  const { id } = await params;
  const accountId = await getCurrentAccountId();
  const viewerAnonKey = accountId ? (await getOrCreateAlias(accountId)).anonymousId : null;

  const post = await getPostById(id, viewerAnonKey);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  return NextResponse.json(post);
}
