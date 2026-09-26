// Content Service. Route handlers call these functions instead of touching
// lib/content/db.js directly. Nothing here ever accepts or stores an
// account id, email, or real name — only anonymous_id (opaque, shown to
// nobody, from the identity service), anon_key (opaque, used only for
// server-side per-account dedup, never returned to any client), and
// author_display (plain text chosen at post time).
//
// Every exported function here is `async` (and every internal call
// between them is `await`ed) because the underlying store is now
// Postgres (lib/content/db.js), queried over the network — unlike the
// old node:sqlite version, a query can't complete synchronously. Route
// handlers (app/api/**/route.js) already `await` these calls.
import crypto from "node:crypto";
import { contentDb, rowToPost, rowToComment, ROAST_LINES_SEED } from "./db.js";
import { getAliasHandle, resolveAliasAccountId, createNotification } from "../identity/service.js";

const VALID_REACTIONS = new Set(["cry", "laugh", "skull", "flag"]);

// ---------------- Posts ----------------

async function attachReactionAndPoll(row, viewerAnonKey) {
  const extra = {};
  extra.repostCount = (await contentDb.prepare("SELECT COUNT(*) AS n FROM posts WHERE repost_of = ?").get(row.id)).n;
  // Only resolves for stable 'alias' identities — see getAliasHandle's
  // own comment for why 'anon' mode posts can never get one of these.
  const alias = await getAliasHandle(row.anonymous_id);
  extra.authorHandle = alias ? alias.anonymousId : null;
  extra.authorAvatarUrl = alias ? alias.avatarUrl : null;
  if (viewerAnonKey) {
    const reaction = await contentDb.prepare(
      "SELECT reaction FROM reactions WHERE post_id = ? AND anon_key = ?"
    ).get(row.id, viewerAnonKey);
    extra.myReaction = reaction ? reaction.reaction : null;
    const bookmark = await contentDb.prepare(
      "SELECT 1 FROM bookmarks WHERE post_id = ? AND anon_key = ?"
    ).get(row.id, viewerAnonKey);
    extra.bookmarked = !!bookmark;
  }
  if (row.type === "poll") {
    const options = await contentDb.prepare(
      "SELECT option_index, label, votes FROM poll_options WHERE post_id = ? ORDER BY option_index"
    ).all(row.id);
    const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);
    extra.multiSelect = !!row.multi_select;
    extra.pollOptions = options.map((o) => ({
      index: o.option_index,
      label: o.label,
      votes: o.votes,
      pct: totalVotes > 0 ? Math.round((o.votes / totalVotes) * 100) : 0,
    }));
    if (viewerAnonKey) {
      const myVotes = await contentDb.prepare(
        "SELECT option_index FROM poll_votes WHERE post_id = ? AND anon_key = ?"
      ).all(row.id, viewerAnonKey);
      extra.myPollVotes = myVotes.map((v) => v.option_index);
    } else {
      extra.myPollVotes = [];
    }
  }
  if (row.repost_of) {
    const originalRow = await contentDb.prepare("SELECT * FROM posts WHERE id = ?").get(row.repost_of);
    extra.repostOfPost = originalRow ? rowToPost(originalRow) : null;
  }
  return extra;
}

// includeScheduled + ownerAnonymousIds: used by "my posts" so an account
// can see its own not-yet-published scheduled posts; the main feed never
// gets that flag, so scheduled posts stay invisible to everyone else
// until their time comes — a plain read-time filter, no background job.
export async function getPosts({ viewerAnonKey = null, includeScheduledForAnonymousIds = null } = {}) {
  const nowIso = new Date().toISOString();
  let rows;
  if (includeScheduledForAnonymousIds && includeScheduledForAnonymousIds.length > 0) {
    const placeholders = includeScheduledForAnonymousIds.map(() => "?").join(",");
    rows = await contentDb.prepare(
      `SELECT * FROM posts
       WHERE repost_of IS NULL AND (scheduled_at IS NULL OR scheduled_at <= ? OR anonymous_id IN (${placeholders}))
       ORDER BY created_at DESC`
    ).all(nowIso, ...includeScheduledForAnonymousIds);
  } else {
    rows = await contentDb.prepare(
      "SELECT * FROM posts WHERE repost_of IS NULL AND (scheduled_at IS NULL OR scheduled_at <= ?) ORDER BY created_at DESC"
    ).all(nowIso);
  }
  return Promise.all(rows.map(async (row) => rowToPost(row, await attachReactionAndPoll(row, viewerAnonKey))));
}

export async function getPostById(id, viewerAnonKey = null) {
  const row = await contentDb.prepare("SELECT * FROM posts WHERE id = ?").get(id);
  if (!row) return null;
  return rowToPost(row, await attachReactionAndPoll(row, viewerAnonKey));
}

export async function createPost({
  type, mood, text, tags, authorDisplay, anonymousId,
  title, category, visibility, scheduledAt, mediaType, mediaPath,
  pollOptions, multiSelect, eventAt, eventLocation, repostOf, quoteText, cringeNominated,
  // Optional backdate hook — every real API route omits this and gets
  // "now" like always. Only the cold-start seed script passes it, so a
  // batch of seeded posts can carry a natural, staggered history instead
  // of every single one reading "moments ago" the instant the site opens.
  createdAt,
}) {
  const id = crypto.randomUUID();
  const now = createdAt || new Date().toISOString();
  await contentDb.prepare(
    `INSERT INTO posts (
       id, type, mood, title, category, tags, visibility, scheduled_at, pinned,
       media_type, media_path, event_at, event_location, repost_of, quote_text,
       cringe_nominated, cringe_votes, comment_count,
       author_display, anonymous_id, time_label, created_at, text, cry, laugh, skull, flag
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, '', ?, ?, 0, 0, 0, 0)`
  ).run(
    id, type, mood, title || null, category || null, JSON.stringify(tags || []),
    visibility || "public", scheduledAt || null,
    mediaType || null, mediaPath || null, eventAt || null, eventLocation || null,
    repostOf || null, quoteText || null, cringeNominated ? 1 : 0,
    authorDisplay, anonymousId, now, text
  );

  if (type === "poll" && Array.isArray(pollOptions) && pollOptions.length >= 2) {
    if (multiSelect) await contentDb.prepare("UPDATE posts SET multi_select = 1 WHERE id = ?").run(id);
    const insertOption = contentDb.prepare(
      "INSERT INTO poll_options (id, post_id, option_index, label, votes) VALUES (?, ?, ?, ?, 0)"
    );
    for (let i = 0; i < pollOptions.length; i++) {
      await insertOption.run(crypto.randomUUID(), id, i, pollOptions[i]);
    }
  }

  return getPostById(id);
}

export async function setPinned(postId, ownerAnonymousIds, pinned) {
  const post = await contentDb.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post || !ownerAnonymousIds.includes(post.anonymous_id)) {
    const err = new Error("You can only pin your own posts.");
    err.code = "NOT_OWNER";
    throw err;
  }
  if (pinned) {
    const placeholders = ownerAnonymousIds.map(() => "?").join(",");
    await contentDb.prepare(`UPDATE posts SET pinned = 0 WHERE anonymous_id IN (${placeholders})`).run(...ownerAnonymousIds);
  }
  await contentDb.prepare("UPDATE posts SET pinned = ? WHERE id = ?").run(pinned ? 1 : 0, postId);
  return getPostById(postId);
}

// Real per-account dedup: an anon_key can hold at most one active reaction
// per post at a time (radio-button behavior, server-enforced this time —
// the earlier version of this app only enforced that client-side, which
// meant repeated API calls could inflate counts).
export async function toggleReaction(postId, anonKey, reaction) {
  if (!VALID_REACTIONS.has(reaction)) return null;
  const post = await contentDb.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post) return null;

  const existing = await contentDb.prepare(
    "SELECT reaction FROM reactions WHERE post_id = ? AND anon_key = ?"
  ).get(postId, anonKey);

  if (existing && existing.reaction === reaction) {
    await contentDb.prepare("DELETE FROM reactions WHERE post_id = ? AND anon_key = ?").run(postId, anonKey);
    await contentDb.prepare(`UPDATE posts SET ${reaction} = GREATEST(0, ${reaction} - 1) WHERE id = ?`).run(postId);
    return { post: await getPostById(postId), active: false };
  }

  if (existing) {
    await contentDb.prepare(`UPDATE posts SET ${existing.reaction} = GREATEST(0, ${existing.reaction} - 1) WHERE id = ?`).run(postId);
    await contentDb.prepare("UPDATE reactions SET reaction = ?, created_at = ? WHERE post_id = ? AND anon_key = ?")
      .run(reaction, new Date().toISOString(), postId, anonKey);
  } else {
    await contentDb.prepare(
      "INSERT INTO reactions (id, post_id, anon_key, reaction, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), postId, anonKey, reaction, new Date().toISOString());
  }
  await contentDb.prepare(`UPDATE posts SET ${reaction} = ${reaction} + 1 WHERE id = ?`).run(postId);
  return { post: await getPostById(postId), active: true };
}

export async function getPostAnonymousId(id) {
  const row = await contentDb.prepare("SELECT anonymous_id FROM posts WHERE id = ?").get(id);
  return row ? row.anonymous_id : null;
}

// Public profile for an alias handle — the "click a poster's name" page.
// Deliberately narrow: only ever resolves for a stable 'alias' identity
// (getAliasHandle refuses anything else), and only returns their public
// posts, a display label, and simple aggregate counts. No real name, no
// email, no account id, no verification status, nothing from 'real' or
// 'anon' mode posts even if the same account also posts that way.
export async function getPublicAliasProfile(anonymousId, viewerAnonKey = null) {
  const rows = await contentDb.prepare(
    "SELECT * FROM posts WHERE anonymous_id = ? AND repost_of IS NULL AND visibility = 'public' ORDER BY created_at DESC LIMIT 50"
  ).all(anonymousId);
  const totalReactions = (await contentDb.prepare(
    "SELECT COALESCE(SUM(cry + laugh + skull + flag), 0) AS n FROM posts WHERE anonymous_id = ?"
  ).get(anonymousId)).n;
  return {
    posts: await Promise.all(rows.map(async (row) => rowToPost(row, await attachReactionAndPoll(row, viewerAnonKey)))),
    postCount: rows.length,
    totalReactions,
  };
}

export async function getPostsByOwnership(anonymousIds = [], authorDisplayExact = null, viewerAnonKey = null) {
  const clauses = [];
  const params = [];
  if (anonymousIds.length > 0) {
    clauses.push(`anonymous_id IN (${anonymousIds.map(() => "?").join(",")})`);
    params.push(...anonymousIds);
  }
  if (authorDisplayExact) {
    clauses.push("(anonymous_id IS NULL AND author_display = ?)");
    params.push(authorDisplayExact);
  }
  if (clauses.length === 0) return [];
  const rows = await contentDb.prepare(
    `SELECT * FROM posts WHERE ${clauses.join(" OR ")} ORDER BY pinned DESC, created_at DESC`
  ).all(...params);
  return Promise.all(rows.map(async (row) => rowToPost(row, await attachReactionAndPoll(row, viewerAnonKey))));
}

export async function countPostsByAnonymousIds(anonymousIds = []) {
  if (anonymousIds.length === 0) return 0;
  const placeholders = anonymousIds.map(() => "?").join(",");
  return (await contentDb.prepare(
    `SELECT COUNT(*) AS n FROM posts WHERE anonymous_id IN (${placeholders}) AND repost_of IS NULL`
  ).get(...anonymousIds)).n;
}

export async function countRepostsByAnonymousIds(anonymousIds = []) {
  if (anonymousIds.length === 0) return 0;
  const placeholders = anonymousIds.map(() => "?").join(",");
  return (await contentDb.prepare(
    `SELECT COUNT(*) AS n FROM posts WHERE anonymous_id IN (${placeholders}) AND repost_of IS NOT NULL`
  ).get(...anonymousIds)).n;
}

// mediaPath here is the FULL object-storage URL (public bucket) — see
// savePostMedia() in lib/media.js. Column name kept as media_path to
// avoid an unrelated rename.
export async function attachMediaToPost(postId, mediaType, mediaPath) {
  await contentDb.prepare("UPDATE posts SET media_type = ?, media_path = ? WHERE id = ?").run(mediaType, mediaPath, postId);
  return getPostById(postId);
}

// ---------------- Comments ----------------

export async function createComment({ postId, anonymousId, authorDisplay, text, mediaType = null, mediaPath = null, gifUrl = null, createdAt }) {
  const post = await contentDb.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return null;
  const id = crypto.randomUUID();
  const now = createdAt || new Date().toISOString();
  await contentDb.prepare(
    "INSERT INTO comments (id, post_id, anonymous_id, author_display, text, media_type, media_path, gif_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, postId, anonymousId, authorDisplay, text, mediaType, mediaPath, gifUrl, now);
  await contentDb.prepare("UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?").run(postId);
  return attachCommentExtras(rowToComment({
    id, post_id: postId, author_display: authorDisplay, text,
    media_type: mediaType, media_path: mediaPath, gif_url: gifUrl, created_at: now,
  }), anonymousId);
}

async function attachCommentExtras(comment, anonymousId) {
  const alias = await getAliasHandle(anonymousId);
  return { ...comment, authorHandle: alias ? alias.anonymousId : null, authorAvatarUrl: alias ? alias.avatarUrl : null };
}

export async function getComments(postId) {
  const rows = await contentDb.prepare(
    "SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC"
  ).all(postId);
  return Promise.all(rows.map(async (row) => attachCommentExtras(rowToComment(row), row.anonymous_id)));
}

// relativePath here is the FULL object-storage URL (public bucket) — see
// savePostMedia() in lib/media.js. Kept the parameter name for backward
// compatibility with existing call sites.
export async function attachMediaToComment(commentId, kind, relativePath) {
  await contentDb.prepare("UPDATE comments SET media_type = ?, media_path = ? WHERE id = ?").run(kind, relativePath, commentId);
  const row = await contentDb.prepare("SELECT * FROM comments WHERE id = ?").get(commentId);
  return attachCommentExtras(rowToComment(row), row.anonymous_id);
}

export async function getCommentMediaPath(commentId) {
  const row = await contentDb.prepare("SELECT media_path FROM comments WHERE id = ?").get(commentId);
  return row?.media_path || null;
}

export async function countCommentsByAnonymousIds(anonymousIds = []) {
  if (anonymousIds.length === 0) return 0;
  const placeholders = anonymousIds.map(() => "?").join(",");
  return (await contentDb.prepare(
    `SELECT COUNT(*) AS n FROM comments WHERE anonymous_id IN (${placeholders})`
  ).get(...anonymousIds)).n;
}

// ---------------- Polls ----------------

export async function votePoll(postId, anonKey, optionIndex) {
  const post = await contentDb.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post || post.type !== "poll") return null;
  const option = await contentDb.prepare(
    "SELECT * FROM poll_options WHERE post_id = ? AND option_index = ?"
  ).get(postId, optionIndex);
  if (!option) return null;

  if (post.multi_select) {
    // Multi-select: this option toggles independently — voting for one
    // option never touches any other option this person already picked.
    const existingThisOption = await contentDb.prepare(
      "SELECT 1 FROM poll_votes WHERE post_id = ? AND anon_key = ? AND option_index = ?"
    ).get(postId, anonKey, optionIndex);

    if (existingThisOption) {
      await contentDb.prepare("UPDATE poll_options SET votes = GREATEST(0, votes - 1) WHERE post_id = ? AND option_index = ?")
        .run(postId, optionIndex);
      await contentDb.prepare("DELETE FROM poll_votes WHERE post_id = ? AND anon_key = ? AND option_index = ?")
        .run(postId, anonKey, optionIndex);
    } else {
      await contentDb.prepare(
        "INSERT INTO poll_votes (id, post_id, anon_key, option_index, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(crypto.randomUUID(), postId, anonKey, optionIndex, new Date().toISOString());
      await contentDb.prepare("UPDATE poll_options SET votes = votes + 1 WHERE post_id = ? AND option_index = ?").run(postId, optionIndex);
    }
    return getPostById(postId, anonKey);
  }

  // Single-select (original behavior): at most one active vote per
  // person — picking a new option replaces whichever one they had.
  const existing = await contentDb.prepare(
    "SELECT option_index FROM poll_votes WHERE post_id = ? AND anon_key = ?"
  ).get(postId, anonKey);

  if (existing && existing.option_index === optionIndex) {
    // Tapping your own already-selected option again removes your vote
    // entirely, X/LinkedOut-poll style, instead of being a no-op.
    await contentDb.prepare("UPDATE poll_options SET votes = GREATEST(0, votes - 1) WHERE post_id = ? AND option_index = ?")
      .run(postId, optionIndex);
    await contentDb.prepare("DELETE FROM poll_votes WHERE post_id = ? AND anon_key = ?").run(postId, anonKey);
    return getPostById(postId, anonKey);
  }
  if (existing) {
    await contentDb.prepare("UPDATE poll_options SET votes = GREATEST(0, votes - 1) WHERE post_id = ? AND option_index = ?")
      .run(postId, existing.option_index);
    await contentDb.prepare("UPDATE poll_votes SET option_index = ?, created_at = ? WHERE post_id = ? AND anon_key = ?")
      .run(optionIndex, new Date().toISOString(), postId, anonKey);
  } else {
    await contentDb.prepare(
      "INSERT INTO poll_votes (id, post_id, anon_key, option_index, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(crypto.randomUUID(), postId, anonKey, optionIndex, new Date().toISOString());
  }
  await contentDb.prepare("UPDATE poll_options SET votes = votes + 1 WHERE post_id = ? AND option_index = ?").run(postId, optionIndex);
  return getPostById(postId, anonKey);
}

// ---------------- Cringe Awards (a ranked view of real posts, not a separate table) ----------------

export async function voteCringe(postId, anonKey) {
  const post = await contentDb.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
  if (!post || !post.cringe_nominated) return null;
  const existing = await contentDb.prepare(
    "SELECT 1 FROM cringe_votes WHERE post_id = ? AND anon_key = ?"
  ).get(postId, anonKey);
  if (existing) return getPostById(postId);
  await contentDb.prepare(
    "INSERT INTO cringe_votes (id, post_id, anon_key, created_at) VALUES (?, ?, ?, ?)"
  ).run(crypto.randomUUID(), postId, anonKey, new Date().toISOString());
  await contentDb.prepare("UPDATE posts SET cringe_votes = cringe_votes + 1 WHERE id = ?").run(postId);
  return getPostById(postId);
}

export async function getCringeLeaderboard(limit = 20) {
  const rows = await contentDb.prepare(
    "SELECT * FROM posts WHERE cringe_nominated = 1 ORDER BY cringe_votes DESC, created_at DESC LIMIT ?"
  ).all(limit);
  return Promise.all(rows.map(async (row, i) => rowToPost(row, { ...(await attachReactionAndPoll(row, null)), rank: i + 1 })));
}

export async function getTopCringePostAnonymousId() {
  const row = await contentDb.prepare(
    "SELECT anonymous_id FROM posts WHERE cringe_nominated = 1 AND cringe_votes > 0 ORDER BY cringe_votes DESC, created_at DESC LIMIT 1"
  ).get();
  return row ? row.anonymous_id : null;
}

// ---------------- Companies ----------------

export async function createCompany({ name, industry, description, anonymousId, authorDisplay, createdAt }) {
  const id = crypto.randomUUID();
  await contentDb.prepare(
    "INSERT INTO companies (id, name, industry, description, created_by_anonymous_id, created_by_display, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, name, industry || null, description || null, anonymousId, authorDisplay, createdAt || new Date().toISOString());
  return getCompanyById(id);
}

async function companySummary(row) {
  const greenFlags = (await contentDb.prepare(
    "SELECT COUNT(*) AS n FROM company_reviews WHERE company_id = ? AND flag_type = 'green'"
  ).get(row.id)).n;
  const redFlags = (await contentDb.prepare(
    "SELECT COUNT(*) AS n FROM company_reviews WHERE company_id = ? AND flag_type = 'red'"
  ).get(row.id)).n;
  const salaryStats = await contentDb.prepare(
    "SELECT MIN(amount) AS min, MAX(amount) AS max, COUNT(*) AS n FROM company_salaries WHERE company_id = ?"
  ).get(row.id);
  const ratingStats = await contentDb.prepare(
    "SELECT AVG(rating) AS avg, COUNT(rating) AS n FROM company_reviews WHERE company_id = ? AND rating IS NOT NULL"
  ).get(row.id);
  const reviewCount = (await contentDb.prepare(
    "SELECT COUNT(*) AS n FROM company_reviews WHERE company_id = ?"
  ).get(row.id)).n;
  const layoffCount = (await contentDb.prepare(
    "SELECT COUNT(*) AS n FROM company_horror_stories WHERE company_id = ? AND story LIKE '%layoff%'"
  ).get(row.id)).n;
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    createdBy: row.created_by_display,
    createdAt: row.created_at,
    greenFlags,
    redFlags,
    reviewCount,
    avgRating: ratingStats.n > 0 ? Math.round(ratingStats.avg * 10) / 10 : null,
    ratingCount: ratingStats.n,
    toxic: redFlags >= 10 && redFlags > greenFlags * 2,
    layoffBadge: layoffCount > 0,
    salaryRange: salaryStats.n > 0 ? `$${Math.round(salaryStats.min / 1000)}k – $${Math.round(salaryStats.max / 1000)}k` : "no data yet",
    salarySamples: salaryStats.n,
  };
}

export async function getCompanies() {
  const rows = await contentDb.prepare("SELECT * FROM companies ORDER BY created_at DESC").all();
  return Promise.all(rows.map(companySummary));
}

export async function getCompanyById(id) {
  const row = await contentDb.prepare("SELECT * FROM companies WHERE id = ?").get(id);
  if (!row) return null;
  const summary = await companySummary(row);
  const tags = await contentDb.prepare(
    `SELECT flag_type AS type, tag_text AS text, COUNT(*) AS n FROM company_reviews
     WHERE company_id = ? GROUP BY flag_type, tag_text ORDER BY n DESC`
  ).all(id);
  // Full individual reviews (not just aggregated tag counts) — the
  // dedicated company detail page shows every one of these in full,
  // rather than the compact tag-pill summary the list page uses.
  const reviews = await contentDb.prepare(
    `SELECT author_display AS author, flag_type AS "flagType", tag_text AS "tagText", body, rating, created_at AS "createdAt"
     FROM company_reviews WHERE company_id = ? ORDER BY created_at DESC`
  ).all(id);
  const salaries = await contentDb.prepare(
    `SELECT role_title AS "roleTitle", amount, created_at AS "createdAt"
     FROM company_salaries WHERE company_id = ? ORDER BY created_at DESC`
  ).all(id);
  const horrorStories = await contentDb.prepare(
    'SELECT author_display AS author, story, created_at AS "createdAt" FROM company_horror_stories WHERE company_id = ? ORDER BY created_at DESC'
  ).all(id);
  return { ...summary, tags, reviews, salaries, horrorStories };
}

export async function addCompanyReview({ companyId, anonymousId, authorDisplay, flagType, tagText, body, rating, createdAt }) {
  const company = await contentDb.prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
  if (!company) return null;
  await contentDb.prepare(
    "INSERT INTO company_reviews (id, company_id, anonymous_id, author_display, flag_type, tag_text, body, rating, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), companyId, anonymousId, authorDisplay, flagType, tagText, body || null, rating || null, createdAt || new Date().toISOString());
  return getCompanyById(companyId);
}

export async function addCompanySalary({ companyId, anonymousId, roleTitle, amount, createdAt }) {
  const company = await contentDb.prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
  if (!company) return null;
  await contentDb.prepare(
    "INSERT INTO company_salaries (id, company_id, anonymous_id, role_title, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), companyId, anonymousId, roleTitle || null, amount, createdAt || new Date().toISOString());
  return getCompanyById(companyId);
}

export async function addCompanyHorrorStory({ companyId, anonymousId, authorDisplay, story, createdAt }) {
  const company = await contentDb.prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
  if (!company) return null;
  await contentDb.prepare(
    "INSERT INTO company_horror_stories (id, company_id, anonymous_id, author_display, story, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(crypto.randomUUID(), companyId, anonymousId, authorDisplay, story, createdAt || new Date().toISOString());
  return getCompanyById(companyId);
}

// ---------------- Jobs ----------------

export async function createJob({ title, companyName, salaryMin, salaryMax, lastPersonQuitReason, anonymousId, authorDisplay, createdAt }) {
  const id = crypto.randomUUID();
  await contentDb.prepare(
    `INSERT INTO jobs (id, title, company_name, salary_min, salary_max, last_person_quit_reason, created_by_anonymous_id, created_by_display, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, title, companyName, salaryMin || null, salaryMax || null, lastPersonQuitReason || null, anonymousId, authorDisplay, createdAt || new Date().toISOString());
  return getJobById(id);
}

function jobSummary(row) {
  const disclosed = row.salary_min != null && row.salary_max != null;
  const honestyReasonLength = (row.last_person_quit_reason || "").length;
  let honesty = 20;
  if (disclosed) honesty += 45;
  if (honestyReasonLength > 60) honesty += 35;
  else if (honestyReasonLength > 20) honesty += 15;
  honesty = Math.min(100, honesty);

  return {
    id: row.id,
    title: row.title,
    company: row.company_name,
    salary: disclosed ? `$${row.salary_min.toLocaleString()} – $${row.salary_max.toLocaleString()}` : "$0 – $0 — flagged: no range provided",
    lastPersonQuit: row.last_person_quit_reason || "— not disclosed —",
    ghosted: !disclosed,
    honesty,
    postedBy: row.created_by_display,
    createdAt: row.created_at,
  };
}

export async function getJobs() {
  const rows = await contentDb.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all();
  // Postings with no disclosed salary range are genuinely buried, not just
  // labeled as such — sorted after every disclosed posting, matching what
  // the Jobs page tells people happens.
  const disclosed = rows.filter((r) => r.salary_min != null && r.salary_max != null);
  const undisclosed = rows.filter((r) => r.salary_min == null || r.salary_max == null);
  return [...disclosed, ...undisclosed].map(jobSummary);
}

export async function getJobById(id) {
  const row = await contentDb.prepare("SELECT * FROM jobs WHERE id = ?").get(id);
  return row ? jobSummary(row) : null;
}

// ---------------- Vent Sessions (rooms) ----------------
// Real social/data layer (creation, joining, leaving all persist and
// reflect genuine distinct accounts) — actual audio transport is
// explicitly NOT implemented; see README.

export async function createRoom({ topic, vibe, startsAt, anonymousId, authorDisplay, createdAt }) {
  const id = crypto.randomUUID();
  const now = createdAt || new Date().toISOString();
  await contentDb.prepare(
    "INSERT INTO rooms (id, topic, vibe, starts_at, created_by_anonymous_id, created_by_display, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, topic, vibe, startsAt || null, anonymousId, authorDisplay, now);
  // The creator is the room's host from the moment it exists — not
  // something they separately "join" as a regular participant.
  if (anonymousId) {
    await contentDb.prepare(
      "INSERT INTO room_participants (id, room_id, anon_key, joined_at, role) VALUES (?, ?, ?, ?, 'host')"
    ).run(crypto.randomUUID(), id, anonymousId, now);
  }
  return getRoomById(id);
}

async function roomSummary(row) {
  const activeCount = (await contentDb.prepare(
    "SELECT COUNT(*) AS n FROM room_participants WHERE room_id = ? AND left_at IS NULL"
  ).get(row.id)).n;
  const live = row.starts_at ? new Date(row.starts_at).getTime() <= Date.now() : true;
  return {
    id: row.id,
    topic: row.topic,
    vibe: row.vibe,
    live,
    startsAt: row.starts_at,
    listeners: activeCount,
    createdBy: row.created_by_display,
    createdAt: row.created_at,
  };
}

export async function getRooms() {
  const rows = await contentDb.prepare("SELECT * FROM rooms ORDER BY created_at DESC").all();
  return Promise.all(rows.map(roomSummary));
}

export async function getRoomById(id) {
  const row = await contentDb.prepare("SELECT * FROM rooms WHERE id = ?").get(id);
  return row ? roomSummary(row) : null;
}

export async function joinRoom(roomId, anonKey) {
  const room = await contentDb.prepare("SELECT id FROM rooms WHERE id = ?").get(roomId);
  if (!room) return null;
  const active = await contentDb.prepare(
    "SELECT id FROM room_participants WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).get(roomId, anonKey);
  if (!active) {
    await contentDb.prepare(
      "INSERT INTO room_participants (id, room_id, anon_key, joined_at) VALUES (?, ?, ?, ?)"
    ).run(crypto.randomUUID(), roomId, anonKey, new Date().toISOString());
  }
  return getRoomById(roomId);
}

export async function leaveRoom(roomId, anonKey) {
  await contentDb.prepare(
    "UPDATE room_participants SET left_at = ? WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).run(new Date().toISOString(), roomId, anonKey);
  return getRoomById(roomId);
}

// ---------------- Vent Room speaker moderation ----------------

export async function getMyRoomRole(roomId, anonKey) {
  if (!anonKey) return null;
  const row = await contentDb.prepare(
    "SELECT role, hand_raised FROM room_participants WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).get(roomId, anonKey);
  return row ? { role: row.role, handRaised: !!row.hand_raised } : null;
}

// Resolves each active participant's own alias handle for display — same
// boundary reasoning as everywhere else identity gets shown alongside
// content (posts, comments, follows): the display label always comes
// from that person's own alias, never a real name, and never leaks which
// account it maps to beyond what the alias system already allows.
export async function getRoomParticipants(roomId) {
  const rows = await contentDb.prepare(
    "SELECT anon_key, role, hand_raised, joined_at FROM room_participants WHERE room_id = ? AND left_at IS NULL ORDER BY joined_at ASC"
  ).all(roomId);
  return Promise.all(rows.map(async (r) => {
    const alias = await getAliasHandle(r.anon_key);
    return {
      handle: r.anon_key,
      displayLabel: alias?.displayLabel || "Anonymous",
      avatarUrl: alias?.avatarUrl || null,
      role: r.role,
      handRaised: !!r.hand_raised,
    };
  }));
}

export async function raiseHand(roomId, anonKey, raised = true) {
  await contentDb.prepare(
    "UPDATE room_participants SET hand_raised = ? WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).run(raised ? 1 : 0, roomId, anonKey);
  return getMyRoomRole(roomId, anonKey);
}

async function requireHost(roomId, requestorAnonKey) {
  const requestor = await getMyRoomRole(roomId, requestorAnonKey);
  if (!requestor || requestor.role !== "host") {
    const err = new Error("Only the room host can do that.");
    err.code = "NOT_HOST";
    throw err;
  }
}

export async function promoteToSpeaker(roomId, requestorAnonKey, targetAnonKey) {
  await requireHost(roomId, requestorAnonKey);
  const target = await contentDb.prepare(
    "SELECT role FROM room_participants WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).get(roomId, targetAnonKey);
  if (!target) {
    const err = new Error("That person isn't in the room.");
    err.code = "NOT_FOUND";
    throw err;
  }
  await contentDb.prepare(
    "UPDATE room_participants SET role = 'speaker', hand_raised = 0 WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).run(roomId, targetAnonKey);

  const targetAccountId = await resolveAliasAccountId(targetAnonKey);
  if (targetAccountId) await createNotification(targetAccountId, "room_promoted", "You've been given the mic in a Vent Room.");
  return getRoomParticipants(roomId);
}

export async function demoteToListener(roomId, requestorAnonKey, targetAnonKey) {
  await requireHost(roomId, requestorAnonKey);
  const target = await contentDb.prepare(
    "SELECT role FROM room_participants WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).get(roomId, targetAnonKey);
  if (!target) {
    const err = new Error("That person isn't in the room.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (target.role === "host") {
    const err = new Error("The host can't be muted.");
    err.code = "CANNOT_DEMOTE_HOST";
    throw err;
  }
  await contentDb.prepare(
    "UPDATE room_participants SET role = 'listener', hand_raised = 0 WHERE room_id = ? AND anon_key = ? AND left_at IS NULL"
  ).run(roomId, targetAnonKey);

  const targetAccountId = await resolveAliasAccountId(targetAnonKey);
  if (targetAccountId) await createNotification(targetAccountId, "room_muted", "The host muted your mic in a Vent Room.");
  return getRoomParticipants(roomId);
}

// ---------------- Search ----------------

export async function searchContent(query) {
  const like = `%${query}%`;
  const posts = await contentDb.prepare(
    'SELECT id, author_display AS author, text, title FROM posts WHERE repost_of IS NULL AND (text LIKE ? OR title LIKE ?) ORDER BY created_at DESC LIMIT 10'
  ).all(like, like);
  const companies = await contentDb.prepare(
    "SELECT id, name, industry FROM companies WHERE name LIKE ? OR industry LIKE ? ORDER BY created_at DESC LIMIT 10"
  ).all(like, like);
  const jobs = await contentDb.prepare(
    'SELECT id, title, company_name AS company FROM jobs WHERE title LIKE ? OR company_name LIKE ? ORDER BY created_at DESC LIMIT 10'
  ).all(like, like);
  const rooms = await contentDb.prepare(
    "SELECT id, topic, vibe FROM rooms WHERE topic LIKE ? ORDER BY created_at DESC LIMIT 10"
  ).all(like);
  return { posts, companies, jobs, rooms };
}

// ---------------- Bookmarks & Likes history ----------------
// Both keyed by anon_key, the account's own persistent alias identity —
// same dedup pattern as reactions, same self-service reasoning as "my
// posts": an account looking up its OWN bookmarks/likes via its OWN key
// is not the same operation break-glass exists to gate.

export async function toggleBookmark(postId, anonKey) {
  const post = await contentDb.prepare("SELECT id FROM posts WHERE id = ?").get(postId);
  if (!post) return null;
  const existing = await contentDb.prepare("SELECT id FROM bookmarks WHERE post_id = ? AND anon_key = ?").get(postId, anonKey);
  if (existing) {
    await contentDb.prepare("DELETE FROM bookmarks WHERE id = ?").run(existing.id);
    return { bookmarked: false };
  }
  await contentDb.prepare("INSERT INTO bookmarks (id, post_id, anon_key, created_at) VALUES (?, ?, ?, ?)")
    .run(crypto.randomUUID(), postId, anonKey, new Date().toISOString());
  return { bookmarked: true };
}

export async function getBookmarkedPosts(anonKey) {
  const rows = await contentDb.prepare(
    `SELECT p.* FROM bookmarks b JOIN posts p ON p.id = b.post_id
     WHERE b.anon_key = ? ORDER BY b.created_at DESC`
  ).all(anonKey);
  return Promise.all(rows.map(async (row) => rowToPost(row, { ...(await attachReactionAndPoll(row, anonKey)), bookmarked: true })));
}

export async function getLikedPosts(anonKey) {
  const rows = await contentDb.prepare(
    `SELECT p.* FROM reactions r JOIN posts p ON p.id = r.post_id
     WHERE r.anon_key = ? ORDER BY r.created_at DESC`
  ).all(anonKey);
  return Promise.all(rows.map(async (row) => rowToPost(row, await attachReactionAndPoll(row, anonKey))));
}

// ---------------- Sponsored Roasts (ads) ----------------

export async function getAds() {
  const rows = await contentDb.prepare("SELECT data FROM ads ORDER BY id").all();
  return rows.map((r) => JSON.parse(r.data));
}

// ---------------- Resume roast ----------------

export function getRoastLines() {
  return ROAST_LINES_SEED;
}
