// Real AI integration for the Title Translator — the one feature in this
// app that directly needed a language model, since "translate a job title
// into LinkedIn hype-speak (or decode it back)" is squarely a text-
// generation task, not something a lookup table could do convincingly.
//
// Same graceful-degradation pattern as Stripe/Twilio/Resend elsewhere in
// this app: calls the real Anthropic API when ANTHROPIC_API_KEY is set,
// falls back to a small canned example set when it isn't, so the feature
// is demoable without any credentials and becomes real the moment a key
// is added — nothing to rewire.
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

export function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `You are the "Title Translator" on LinkedOut, a satirical anti-corporate career-honesty app whose whole thesis is that LinkedIn inflates job titles into meaningless corporate hype. You do exactly one job: translate between a REAL, honest job title/description and the LINKEDIN-HYPE version of it, in whichever direction the user asks.

Rules:
- REAL → LINKEDIN: take a plain, honest title or description and inflate it into the kind of over-the-top, buzzword-laden, achievement-hyperbole title LinkedIn culture produces (e.g. "answers emails" -> "Strategic Communications Orchestrator driving cross-functional stakeholder alignment").
- LINKEDIN → REAL: take a hyped LinkedIn-style title and decode it back into blunt, plain-English honesty about what the job probably actually is.
- Keep it SHORT: one punchy line, not a paragraph. This is a quick, funny utility, not an essay generator.
- Stay work/career-related. If the input is unrelated to jobs/titles/careers, gently redirect rather than translating nonsense.
- Never mention real, named companies or real people.
- Respond with ONLY the translated line — no preamble, no quotes, no "Here's your translation:".`;

export async function translateTitle(input, direction) {
  if (!isAiConfigured()) {
    return { output: canned(input, direction), configured: false };
  }

  const directionInstruction = direction === "linkedin-to-real"
    ? `Decode this LinkedIn-hype title/phrase back into blunt real-world honesty: "${input}"`
    : `Inflate this real, honest title/description into LinkedIn-hype: "${input}"`;

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: directionInstruction }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ai] Anthropic API error:", res.status, errText);
      return { output: canned(input, direction), configured: true, error: `AI request failed (${res.status})` };
    }

    const data = await res.json();
    const output = data.content?.find((b) => b.type === "text")?.text?.trim();
    if (!output) {
      return { output: canned(input, direction), configured: true, error: "AI returned an empty response" };
    }
    return { output, configured: true };
  } catch (e) {
    console.error("[ai] Title translation request failed:", e.message);
    return { output: canned(input, direction), configured: true, error: e.message };
  }
}

// Used both as the "not configured" fallback and as a safety net if a
// configured call still fails for some reason — the feature should never
// just show an error with nothing else, given how central it is to what
// this app is making fun of.
const CANNED_REAL_TO_LINKEDIN = [
  "Synergistic Growth Catalyst spearheading paradigm-shifting stakeholder value creation",
  "Chief Vibes Officer driving best-in-class cross-functional alignment",
  "Strategic Impact Architect operationalizing next-generation thought leadership",
];
const CANNED_LINKEDIN_TO_REAL = [
  "Answers emails and sits in meetings about the emails",
  "Does the job of two people, got a nicer title instead of a raise",
  "Nobody actually knows what this role does, including the person doing it",
];

function canned(input, direction) {
  const pool = direction === "linkedin-to-real" ? CANNED_LINKEDIN_TO_REAL : CANNED_REAL_TO_LINKEDIN;
  // Deterministic-ish pick based on input so the same input doesn't
  // visibly jump around between requests in the unconfigured demo state.
  const idx = Math.abs(hashString(input)) % pool.length;
  return pool[idx];
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ---------------- Resume Roast ----------------
// Same real-AI/graceful-fallback shape as translateTitle above. Roasts
// the ACTUAL resume text extracted from whatever the person uploaded
// (see lib/resume-parse.js) — not a fixed line set unrelated to what they
// submitted, which is what this endpoint did before this pass.
const ROAST_SYSTEM_PROMPT = `You are the resume-roasting feature on LinkedOut, a satirical anti-corporate career-honesty app. Someone has pasted their real resume text. Your job: roast it — genuinely funny, sharp, a little savage, but never cruel about things they can't control (age, gaps for health/family reasons, employment status, typos from non-native English, disability, etc — redirect humor at corporate-speak, buzzwords, vague achievements, and resume clichés instead). Think "a hilarious friend who's also a ruthless editor," not "a bully."

Rules:
- Return exactly 4 to 6 short roast lines, each one a single punchy sentence (not a paragraph).
- Base every line on something ACTUALLY in the resume text you were given — quote or paraphrase a real buzzword, bullet, or claim from it. Generic roasts that could apply to any resume are a failure.
- Go for maximum comedic effect: exaggeration, mock-serious tone, comparisons, callbacks.
- Never insult protected characteristics, health, disability, age, gaps, or personal circumstances — roast the WRITING and the corporate-speak, not the person.
- Respond with ONLY a JSON array of strings, nothing else — no markdown fences, no preamble. Example: ["line one", "line two", "line three", "line four"]`;

export async function roastResume(resumeText) {
  if (!isAiConfigured()) {
    return { lines: CANNED_ROAST_LINES, configured: false };
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: ROAST_SYSTEM_PROMPT,
        messages: [{ role: "user", content: resumeText.slice(0, 12000) }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[ai] Resume roast API error:", res.status, errText);
      return { lines: CANNED_ROAST_LINES, configured: true, error: `AI request failed (${res.status})` };
    }

    const data = await res.json();
    const raw = data.content?.find((b) => b.type === "text")?.text?.trim();
    let lines;
    try {
      lines = JSON.parse(raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim());
    } catch {
      lines = null;
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return { lines: CANNED_ROAST_LINES, configured: true, error: "AI returned an unexpected response" };
    }
    return { lines: lines.slice(0, 6).map(String), configured: true };
  } catch (e) {
    console.error("[ai] Resume roast request failed:", e.message);
    return { lines: CANNED_ROAST_LINES, configured: true, error: e.message };
  }
}

const CANNED_ROAST_LINES = [
  "\"Synergized cross-functional deliverables\" — bold of you to describe a group chat that way.",
  "Five bullet points and not one number. Did you \"increase efficiency\" or did you vibe near a spreadsheet?",
  "\"Detail-oriented\" is doing a lot of lifting for a resume with three different font sizes.",
  "\"Self-starter, team player, hard worker\" — congratulations, you've described every human who has ever had a job.",
];
