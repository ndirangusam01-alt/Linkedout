// Extracts plain text from an uploaded resume so it can actually be sent
// to the AI roast prompt (see lib/ai.js's roastResume) — this used to not
// exist at all; the old /api/resume-roast route never even looked at the
// uploaded file.
//
// PDF extraction uses pdf-parse (added to package.json — run `npm
// install` after pulling this). DOC/DOCX aren't parsed here (would need
// a separate library like mammoth); those fall through to the "please
// paste your resume text instead" path in the route/UI rather than
// silently failing.
export async function extractResumeText(file) {
  const buffer = Buffer.from(await file.arrayBuffer());

  if (file.type === "text/plain") {
    return buffer.toString("utf-8");
  }

  if (file.type === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(buffer);
    return data.text;
  }

  const err = new Error("Couldn't read that file type — upload a PDF or .txt, or paste your resume text below instead.");
  err.code = "UNSUPPORTED_TYPE";
  throw err;
}
