import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { getSuggestedHandles } from "@/lib/identity/service";

// A plain, explainable "most-followed handles you don't already follow"
// ranking — see getSuggestedHandles' own comment for why this isn't a
// black-box model. Works logged-out too (just skips the "already
// following" exclusion).
export async function GET() {
  const accountId = await getCurrentAccountId();
  const suggestions = await getSuggestedHandles(accountId);
  return NextResponse.json({ suggestions });
}
