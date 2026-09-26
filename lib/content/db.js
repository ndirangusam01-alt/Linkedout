// Content Service storage. Logically separate from the identity store
// (lib/identity/db.js) — this table set has no column that can ever hold
// an email, password hash, or real name. Everything here references
// either an `anonymous_id` (an opaque string minted by the identity
// service, shown to nobody) or an `anon_key` (used purely for
// server-side dedup — "has this account already reacted to this post" —
// never returned to any client) plus a plain-text `*_display` label.
// That's the entire boundary: even with full read access to this schema,
// there's no way back to who someone is.
//
// Runs in Postgres, in its own SQL schema ("content") — see
// lib/db/pg-client.js for how that pool is configured and how to point
// it at a physically separate Postgres instance if you want that
// stronger boundary. Was SQLite (node:sqlite) prior to the Postgres
// migration; the incremental ALTER-TABLE migrations that made sense for
// evolving a single SQLite file over time were dropped here in favor of
// the one, current, correct schema — this file assumes a fresh Postgres
// database, not an upgrade path from the old SQLite one. See
// DEPLOYMENT.md's "Migrating existing SQLite data" section if you have
// real data in data/content.db to carry over.
//
// Companies, jobs, and rooms used to be static seed arrays. They aren't
// anymore — every row here is created through the same real
// createX()/POST route path as a post, always attributed to a real
// account via anonymous_id. See scripts/seed-content.js for how the
// initial "cold start" content actually gets created (real accounts,
// real API calls) rather than being injected as fake data.
import crypto from "node:crypto";
import { PgDatabase, getPool } from "../db/pg-client.js";
import { ROAST_LINES, ADS } from "../data.js";

export const contentDb = new PgDatabase(getPool("content"));

// Postgres has no "USE schema" — every unqualified table name resolves
// against `search_path`. Set it on every new physical connection the pool
// opens (connections are pooled/recycled, so this must run per-connect,
// not just once). Registering this listener is synchronous — it doesn't
// touch the network itself, so it's safe to run at import time (unlike
// the actual schema/table creation below, which is deliberately NOT run
// here — see the lazy initializer at the bottom of this file).
contentDb.pool.on("connect", (client) => {
  client.query("SET search_path TO content, public;").catch(() => {});
});

// Schema creation, table creation, and ad seeding all happen lazily, on
// the FIRST real query this process makes — not here, at import time.
// This is registered via setInitializer() and only actually runs inside
// PreparedStatement.get/all/run (see lib/db/pg-client.js). That matters
// because Next.js imports every API route module during `next build` to
// collect route config, without ever running the route — if this ran at
// import time instead, `next build` itself would try to open a real
// Postgres connection and fail in any build environment with no database
// reachable (exactly the ECONNREFUSED error this replaced).
contentDb.setInitializer(async () => {
  await contentDb.exec(`CREATE SCHEMA IF NOT EXISTS content;`);
  await contentDb.pool.query(`SET search_path TO content, public;`);
  await createContentTables();
  await seedAdsIfEmpty();
});

async function createContentTables() {
  await contentDb.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    mood TEXT NOT NULL,
    title TEXT,
    category TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    visibility TEXT NOT NULL DEFAULT 'public',
    scheduled_at TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    media_type TEXT,
    -- Full URL to the object in storage (public bucket), or NULL. Was a
    -- relative on-disk path served through a proxy route before the
    -- object-storage migration — see lib/media.js.
    media_path TEXT,
    poll_multi INTEGER NOT NULL DEFAULT 0,
    multi_select INTEGER NOT NULL DEFAULT 0,
    event_at TEXT,
    event_location TEXT,
    repost_of TEXT,
    quote_text TEXT,
    cringe_nominated INTEGER NOT NULL DEFAULT 0,
    cringe_votes INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    author_display TEXT NOT NULL,
    anonymous_id TEXT,
    time_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    text TEXT NOT NULL,
    cry INTEGER NOT NULL DEFAULT 0,
    laugh INTEGER NOT NULL DEFAULT 0,
    skull INTEGER NOT NULL DEFAULT 0,
    flag INTEGER NOT NULL DEFAULT 0
  );

  -- Real per-account reaction dedup. anon_key is the account's persistent
  -- "alias" anonymous_id (see lib/identity/service.js's getOrCreateAlias),
  -- reused here purely as a stable, opaque, per-account key — it is NEVER
  -- returned in any API response from this table.
  CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    anon_key TEXT NOT NULL,
    reaction TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(post_id, anon_key, reaction)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    anonymous_id TEXT,
    author_display TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    -- Replies can carry an attached file (image/video/document, reusing
    -- the same object-storage pipeline posts use) or a GIF (a URL from
    -- the Tenor integration — see lib/gifs.js) in addition to text.
    media_type TEXT,
    media_path TEXT,
    gif_url TEXT
  );

  CREATE TABLE IF NOT EXISTS poll_options (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    label TEXT NOT NULL,
    votes INTEGER NOT NULL DEFAULT 0
  );

  -- One vote PER OPTION per person (not one vote per poll) so
  -- multi-select polls work — UNIQUE spans all three columns.
  CREATE TABLE IF NOT EXISTS poll_votes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    anon_key TEXT NOT NULL,
    option_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(post_id, anon_key, option_index)
  );

  -- Cringe Awards voting, deduped the same way reactions are. The
  -- leaderboard itself is just a query over posts WHERE
  -- cringe_nominated = 1 ORDER BY cringe_votes DESC — there's no separate
  -- "awards" table; nomination is a checkbox at post-creation time (see
  -- app/api/posts/route.js).
  CREATE TABLE IF NOT EXISTS cringe_votes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    anon_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(post_id, anon_key)
  );

  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT,
    description TEXT,
    created_by_anonymous_id TEXT,
    created_by_display TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_reviews (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    anonymous_id TEXT,
    author_display TEXT NOT NULL,
    flag_type TEXT,
    tag_text TEXT,
    body TEXT NOT NULL,
    rating INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_salaries (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    anonymous_id TEXT,
    role_title TEXT NOT NULL,
    amount TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS company_horror_stories (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    anonymous_id TEXT,
    author_display TEXT NOT NULL,
    story TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    salary_min TEXT,
    salary_max TEXT,
    last_person_quit_reason TEXT,
    created_by_anonymous_id TEXT,
    created_by_display TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL,
    vibe TEXT,
    starts_at TEXT,
    created_by_anonymous_id TEXT,
    created_by_display TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- Speaker moderation: every room participant has a role (host — the
  -- room's creator, always exactly one; speaker — can publish audio;
  -- listener — can hear and use text/GIF/emoji reactions but not open
  -- their mic). New joiners default to listener and must be promoted.
  -- No UNIQUE(room_id, anon_key): leaving and rejoining writes a new row
  -- (left_at marks the old one inactive) rather than reusing one, so the
  -- same pair can legitimately repeat across a room's history.
  CREATE TABLE IF NOT EXISTS room_participants (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    anon_key TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'listener',
    hand_raised INTEGER NOT NULL DEFAULT 0,
    joined_at TEXT NOT NULL,
    left_at TEXT
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    anon_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(post_id, anon_key)
  );

  CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY, data TEXT NOT NULL);

  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts (created_at);
  CREATE INDEX IF NOT EXISTS idx_posts_repost_of ON posts (repost_of);
  CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions (post_id);
  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments (post_id);
  CREATE INDEX IF NOT EXISTS idx_company_reviews_company ON company_reviews (company_id);
`);
}

// Only ad inventory is still platform-seeded — ads aren't user-submitted
// content, so this doesn't conflict with "everything belongs to an
// account." Posts, companies, jobs, rooms are NOT seeded here; see
// scripts/seed-content.js for how real accounts create them for real.
//
// Uses contentDb.pool.query() directly rather than contentDb.prepare(...)
// — this function runs INSIDE the lazy initializer above (called from
// ensureReady()), so going through .prepare().get()/.run() here would
// call ensureReady() again and deadlock waiting on the very readiness
// promise this function is part of resolving.
async function seedAdsIfEmpty() {
  const { rows } = await contentDb.pool.query("SELECT COUNT(*) AS n FROM ads");
  if (Number(rows[0].n) === 0) {
    for (const a of ADS) {
      await contentDb.pool.query("INSERT INTO ads (id, data) VALUES ($1, $2)", [a.id, JSON.stringify(a)]);
    }
  }
}

export function rowToComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    author: row.author_display,
    text: row.text,
    mediaType: row.media_type || null,
    // Full object-storage URL, stored directly at attach time — see
    // attachMediaToComment() in lib/content/service.js.
    mediaUrl: row.media_path || null,
    gifUrl: row.gif_url || null,
    createdAt: row.created_at,
    time: formatRelativeTime(row.created_at),
  };
}

export function rowToPost(row, extra = {}) {
  return {
    id: row.id,
    type: row.type,
    mood: row.mood,
    title: row.title || null,
    category: row.category || null,
    tags: JSON.parse(row.tags || "[]"),
    visibility: row.visibility,
    scheduledAt: row.scheduled_at || null,
    pinned: !!row.pinned,
    mediaType: row.media_type || null,
    // Full object-storage URL, stored directly at upload time — see
    // savePostMedia() in lib/media.js and app/api/posts/route.js. No
    // proxy route needed: post media is public-by-design, so the client
    // hits the storage URL (or CDN in front of it) directly.
    mediaUrl: row.media_path || null,
    pollMulti: !!row.poll_multi,
    eventAt: row.event_at || null,
    eventLocation: row.event_location || null,
    repostOf: row.repost_of || null,
    quoteText: row.quote_text || null,
    cringeNominated: !!row.cringe_nominated,
    cringeVotes: row.cringe_votes,
    commentCount: row.comment_count,
    author: row.author_display,
    // Computed fresh from created_at on every read, not stored — a
    // previous version of this app stored the literal string "now" at
    // post-creation time and never updated it, so every post displayed
    // "now ago" forever, even years later. time_label the column still
    // exists for schema-compat but is no longer read; createdAt (the
    // real ISO timestamp) is the actual source of truth.
    time: formatRelativeTime(row.created_at),
    createdAt: row.created_at,
    text: row.text,
    r: { cry: row.cry, laugh: row.laugh, skull: row.skull, flag: row.flag },
    ...extra,
  };
}

// "2m ago", "3h ago", "5d ago", "2w ago", "4mo ago", "1y ago" — the "ago"
// is baked in here (not appended by the frontend) specifically to make
// "just now" read correctly instead of the awkward "just now ago".
export function formatRelativeTime(isoString) {
  const then = new Date(isoString).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 4) return `${diffWeek}w ago`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth}mo ago`;
  return `${Math.floor(diffDay / 365)}y ago`;
}

export { crypto };
export const ROAST_LINES_SEED = ROAST_LINES;
