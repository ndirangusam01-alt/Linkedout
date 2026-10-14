import { getStory, deleteStory, setOutcome } from "@/lib/stories/service";
import { viewer, requireViewer, json, fail } from "@/lib/stories/http";
import { recordView } from "@/lib/stories/analytics";

export async function GET(request, { params }) {
  const { id } = await params;
  const v = await viewer();
  const s = await getStory(id, v.key);
  if (!s) return json({ error: "We couldn't find that story." }, 404);
  if (s.status === "published") recordView(id, v.key, s.isOwner ? v.key : null, request.headers.get("x-forwarded-for")).catch(() => {});
  return json(s);
}
export async function PATCH(request, { params }) {
  const v = await requireViewer(); if (v.error) return v.error;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try { return json(await setOutcome(id, v.key, body.outcome)); } catch (e) { return fail(e); }
}
export async function DELETE(_req, { params }) {
  const v = await requireViewer(); if (v.error) return v.error;
  const { id } = await params;
  try { return json(await deleteStory(id, v.key)); } catch (e) { return fail(e); }
}
