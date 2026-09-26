import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { roastResume } from "@/lib/ai";
import { extractResumeText } from "@/lib/resume-parse";

// Real now: accepts either a multipart upload (`resume` file — PDF or
// .txt) or a JSON body with pasted `text`, extracts the actual resume
// content, and sends it to the AI roast prompt. Falls back to a fixed
// (still funny, just not personalized) line set if ANTHROPIC_API_KEY
// isn't configured — same graceful-degradation shape as the Humble Brag
// Translator.
export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  let text;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("resume");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No file received." }, { status: 400 });
      }
      text = await extractResumeText(file);
    } else {
      const body = await request.json().catch(() => null);
      text = body?.text?.trim();
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }

  if (!text || text.trim().length < 20) {
    return NextResponse.json({ error: "That doesn't look like enough resume text to roast." }, { status: 400 });
  }

  const result = await roastResume(text);
  return NextResponse.json(result);
}
