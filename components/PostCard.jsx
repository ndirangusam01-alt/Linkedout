"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, MessageCircle, Repeat2, Share2, Trophy, Pin, Calendar, MapPin, FileText, Bookmark } from "lucide-react";
import { C, monoFont, alpha } from "@/lib/theme";
import { Stamp, ReactionBar, MoodPill } from "@/components/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/app/auth-provider";
import ReplyComposer from "./ReplyComposer";

function PostMedia({ post }) {
  if (!post.mediaUrl) return null;
  if (post.mediaType === "image") {
    return <img src={post.mediaUrl} alt="" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.line}`, maxHeight: 420, objectFit: "cover" }} />;
  }
  if (post.mediaType === "video") {
    return <video src={post.mediaUrl} controls style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.line}`, maxHeight: 420 }} />;
  }
  if (post.mediaType === "audio") {
    return <audio src={post.mediaUrl} controls style={{ width: "100%" }} />;
  }
  if (post.mediaType === "document") {
    return (
      <a href={post.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", textDecoration: "none", color: C.text }}>
        <FileText size={16} color={C.muted} /> <span style={{ fontSize: 12.5 }}>View attached document</span>
      </a>
    );
  }
  return null;
}

function PollBlock({ post, onVoted }) {
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState(null);
  const options = post.pollOptions || [];
  const myVotes = post.myPollVotes || [];

  async function vote(index) {
    if (voting) return;
    setVoting(true);
    setError(null);
    try {
      const updated = await api.votePoll(post.id, index);
      onVoted(updated);
    } catch (e) {
      setError(e.status === 401 ? "Log in to vote." : e.message || "Couldn't register your vote.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-1">
      {post.multiSelect && (
        <div style={{ ...monoFont, fontSize: 10, color: C.muted }}>Select all that apply</div>
      )}
      {error && <div style={{ ...monoFont, fontSize: 10.5, color: C.flag }}>{error}</div>}
      {options.map((o) => {
        const mine = myVotes.includes(o.index);
        return (
          <button
            key={o.index}
            onClick={(e) => { e.stopPropagation(); vote(o.index); }}
            disabled={voting}
            className="relative rounded overflow-hidden w-full text-left lo-tap"
            style={{ border: `1px solid ${mine ? C.mustard : C.line}`, cursor: "pointer" }}
          >
            <div style={{ width: `${o.pct}%`, background: mine ? alpha(C.mustard, 20) : alpha(C.corpblue, 20), position: "absolute", inset: 0, transition: "width 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }} />
            <div className="relative flex items-center justify-between px-3 py-2" style={{ fontSize: 12.5, color: C.text }}>
              <span>{mine ? (post.multiSelect ? "☑ " : "✓ ") : ""}{o.label}</span>
              <span style={{ ...monoFont, color: C.muted }}>{o.pct}% ({o.votes})</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function CommentSection({ postId, initialComments = null }) {
  const [comments, setComments] = useState(initialComments);

  useEffect(() => {
    if (initialComments) return;
    api.getComments(postId).then(setComments).catch(() => setComments([]));
  }, [postId, initialComments]);

  return (
    <div className="flex flex-col gap-3" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12, marginTop: 2 }}>
      {comments === null && (
        <div className="flex flex-col gap-2">
          <div className="lo-skeleton" style={{ height: 44 }} />
          <div className="lo-skeleton" style={{ height: 44 }} />
        </div>
      )}
      {comments?.map((c) => (
        <div key={c.id} className="lo-enter flex items-start gap-2.5">
          {c.authorHandle ? (
            <Link href={`/u/${c.authorHandle}`}>
              {c.authorAvatarUrl
                ? <img src={c.authorAvatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                : <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12 }}>{c.author[0]}</div>}
            </Link>
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, flexShrink: 0 }}>
              {c.author.startsWith("Anonymous") ? <EyeOff size={13} /> : c.author[0]}
            </div>
          )}
          <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.4 }}>
              {c.authorHandle
                ? <Link href={`/u/${c.authorHandle}`} style={{ fontWeight: 600, color: C.text, textDecoration: "none" }} className="hover:underline">{c.author}</Link>
                : <span style={{ fontWeight: 600, color: C.text }}>{c.author}</span>}{" "}
              <span style={{ ...monoFont, fontSize: 10, color: C.muted }}>{c.time}</span>
              {c.text && <div style={{ color: C.text, marginTop: 1 }}>{c.text}</div>}
            </div>
            {c.gifUrl && <img src={c.gifUrl} alt="" style={{ maxWidth: 160, borderRadius: 8, display: "block" }} />}
            {c.mediaUrl && c.mediaType === "image" && <img src={c.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 8, display: "block" }} />}
            {c.mediaUrl && c.mediaType === "video" && <video src={c.mediaUrl} controls style={{ maxWidth: 220, borderRadius: 8, display: "block" }} />}
            {c.mediaUrl && c.mediaType === "audio" && <audio src={c.mediaUrl} controls style={{ maxWidth: 220 }} />}
            {c.mediaUrl && c.mediaType === "document" && (
              <a href={c.mediaUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5" style={{ ...monoFont, fontSize: 11, color: C.corpblue, textDecoration: "none" }}>
                <FileText size={12} /> attachment
              </a>
            )}
          </div>
        </div>
      ))}
      <ReplyComposer postId={postId} onPosted={(c) => setComments((list) => [...(list || []), c])} />
    </div>
  );
}

function RepostModal({ post, onClose, onDone }) {
  const [quoteText, setQuoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.repost(post.id, "alias", quoteText.trim() || null);
      onDone(created);
      onClose();
    } catch (e) {
      setError(e.status === 401 ? "Log in to repost." : e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,12,0.72)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, width: "100%", maxWidth: 420, padding: 16 }} className="flex flex-col gap-3">
        <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>Repost</div>
        <textarea
          value={quoteText}
          onChange={(e) => setQuoteText(e.target.value)}
          placeholder="Add a comment (optional)..."
          rows={3}
          maxLength={280}
          style={{ width: "100%", background: C.surface2, border: `1px solid ${C.line}`, color: C.text, borderRadius: 8, padding: 10, fontSize: 13, resize: "none" }}
        />
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, fontSize: 12, color: C.muted, maxHeight: 100, overflow: "hidden" }}>
          {post.text || "(original post)"}
        </div>
        {error && <div style={{ ...monoFont, fontSize: 11, color: C.flag }}>{error}</div>}
        <div className="flex items-center gap-2 justify-end">
          <button onClick={onClose} style={{ ...monoFont, fontSize: 11.5, color: C.muted, background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{ ...monoFont, fontSize: 11.5, color: "#FFFFFF", background: C.mustard, border: "none", borderRadius: 8, padding: "7px 14px", fontWeight: 700, cursor: "pointer" }}>{busy ? "reposting…" : "Repost"}</button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ post, size = 34 }) {
  if (post.authorAvatarUrl) {
    return <img src={post.authorAvatarUrl} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: C.surface2,
      display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, flexShrink: 0,
    }}>
      {post.author.startsWith("Anonymous") ? <EyeOff size={size * 0.44} /> : post.author[0]}
    </div>
  );
}

function AuthorRow({ post }) {
  const name = <div style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{post.author}</div>;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {post.authorHandle ? (
          <Link href={`/u/${post.authorHandle}`} className="lo-tap" style={{ display: "flex" }} onClick={(e) => e.stopPropagation()}>
            <Avatar post={post} />
          </Link>
        ) : (
          <Avatar post={post} />
        )}
        <div>
          {post.authorHandle ? (
            <Link href={`/u/${post.authorHandle}`} style={{ textDecoration: "none" }} onClick={(e) => e.stopPropagation()} className="hover:underline">{name}</Link>
          ) : name}
          <div className="flex items-center gap-2 mt-0.5">
            <span style={{ ...monoFont, fontSize: 11, color: C.muted }} title={new Date(post.createdAt).toLocaleString()}>{post.time}</span>
            <MoodPill text={post.mood} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {post.pinned && <Pin size={13} color={C.mustard} />}
        {post.type === "parody" && <Stamp text="Parody" tone="mustard" rotate={6} />}
      </div>
    </div>
  );
}

export default function PostCard({ post: initialPost, detailMode = false }) {
  const router = useRouter();
  const { user } = useAuth();
  const [post, setPost] = useState(initialPost);
  const [showRepostModal, setShowRepostModal] = useState(false);
  const [shareNotice, setShareNotice] = useState(null);
  const [cringeVoting, setCringeVoting] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);

  const [bookmarkPulse, setBookmarkPulse] = useState(false);

  async function handleBookmark() {
    if (bookmarking) return;
    setBookmarking(true);
    try {
      const result = await api.toggleBookmark(post.id);
      setPost((p) => ({ ...p, bookmarked: result.bookmarked }));
      if (result.bookmarked) {
        setBookmarkPulse(true);
        setTimeout(() => setBookmarkPulse(false), 320);
      }
    } catch (e) {
      setShareNotice(e.status === 401 ? "Log in to bookmark." : "Couldn't bookmark that.");
      setTimeout(() => setShareNotice(null), 2500);
    } finally {
      setBookmarking(false);
    }
  }

  async function handleShare() {
    const url = `${window.location.origin}/#post-${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ text: post.text?.slice(0, 100), url });
      } else {
        await navigator.clipboard.writeText(url);
        setShareNotice("Link copied");
        setTimeout(() => setShareNotice(null), 2000);
      }
    } catch {
      // user cancelled the share sheet — not an error
    }
  }

  async function handleCringeVote() {
    if (cringeVoting) return;
    setCringeVoting(true);
    try {
      const updated = await api.voteCringe(post.id);
      setPost(updated);
    } catch {
      // quiet — cringe voting is a fun extra, not core functionality
    } finally {
      setCringeVoting(false);
    }
  }

  // A repost renders as "You reposted" + the embedded original content —
  // repostOfPost is attached server-side (see attachReactionAndPoll in
  // lib/content/service.js).
  const original = post.repostOfPost;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }} className="p-4 flex flex-col gap-3">
      <div
        onClick={detailMode ? undefined : () => router.push(`/post/${post.id}`)}
        style={detailMode ? undefined : { cursor: "pointer" }}
        className="flex flex-col gap-3"
      >
      {original ? (
        <>
          <div className="flex items-center gap-2" style={{ color: C.muted, fontSize: 11.5 }}>
            <Repeat2 size={13} /> <span style={{ fontWeight: 600, color: C.text }}>{post.author}</span> reposted
          </div>
          {post.quoteText && <p style={{ color: C.text, fontSize: 14, lineHeight: 1.5 }}>{post.quoteText}</p>}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 12 }} className="flex flex-col gap-2">
            <AuthorRow post={original} />
            <p style={{ color: C.text, fontSize: 13.5, lineHeight: 1.5 }}>{original.text}</p>
            <PostMedia post={original} />
          </div>
        </>
      ) : (
        <>
          <AuthorRow post={post} />

          {post.title && <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{post.title}</div>}
          <p style={{ color: C.text, fontSize: 14.5, lineHeight: 1.55 }}>{post.text}</p>

          {post.type === "event" && (post.eventAt || post.eventLocation) && (
            <div className="flex flex-col gap-1" style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10 }}>
              {post.eventAt && (
                <div className="flex items-center gap-2" style={{ fontSize: 12, color: C.text }}>
                  <Calendar size={13} color={C.muted} /> {new Date(post.eventAt).toLocaleString()}
                </div>
              )}
              {post.eventLocation && (
                <div className="flex items-center gap-2" style={{ fontSize: 12, color: C.text }}>
                  <MapPin size={13} color={C.muted} /> {post.eventLocation}
                </div>
              )}
            </div>
          )}

          <PostMedia post={post} />

          {post.type === "poll" && post.pollOptions && (
            <PollBlock post={post} onVoted={setPost} />
          )}
        </>
      )}
      </div>

      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.tags.map((t, i) => (
            <span key={i} style={{ ...monoFont, fontSize: 10.5, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 6px" }}>#{t}</span>
          ))}
        </div>
      )}

      {post.cringeNominated && (
        <button
          onClick={handleCringeVote}
          disabled={cringeVoting}
          className="flex items-center gap-1.5"
          style={{ ...monoFont, fontSize: 11, color: C.mustard, background: alpha(C.mustard, 8), border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 20, padding: "4px 10px", alignSelf: "flex-start", cursor: "pointer" }}
        ><Trophy size={12} /> Cringe Awards: {post.cringeVotes} vote{post.cringeVotes === 1 ? "" : "s"}</button>
      )}

      <div className="flex items-center gap-2 flex-wrap justify-between">
        <ReactionBar postId={post.id} r={post.r} myReaction={post.myReaction} />
        <div className="flex items-center gap-4" style={{ color: C.muted }}>
          <button
            onClick={detailMode ? undefined : () => router.push(`/post/${post.id}`)}
            className="flex items-center gap-1 lo-tap"
            style={{ background: "none", border: "none", color: C.muted, cursor: detailMode ? "default" : "pointer", borderRadius: 8, padding: 4 }}
          >
            <MessageCircle size={15} /> {post.commentCount > 0 && <span style={{ ...monoFont, fontSize: 11 }}>{post.commentCount}</span>}
          </button>
          <button onClick={() => setShowRepostModal(true)} className="flex items-center gap-1 lo-tap" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", borderRadius: 8, padding: 4 }}>
            <Repeat2 size={15} /> {post.repostCount > 0 && <span style={{ ...monoFont, fontSize: 11 }}>{post.repostCount}</span>}
          </button>
          <button onClick={handleShare} className="lo-tap" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", borderRadius: 8, padding: 4 }}>
            <Share2 size={15} />
          </button>
          <button
            onClick={handleBookmark}
            disabled={bookmarking}
            className="lo-tap"
            style={{
              background: "none", border: "none", color: post.bookmarked ? C.mustard : C.muted, cursor: "pointer",
              borderRadius: 8, padding: 4,
              transform: bookmarkPulse ? "scale(1.35)" : "scale(1)",
              transition: "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.18s ease",
            }}
          >
            <Bookmark size={15} fill={post.bookmarked ? C.mustard : "none"} />
          </button>
        </div>
      </div>
      {shareNotice && <div className="lo-toast" style={{ ...monoFont, fontSize: 10.5, color: C.green, textAlign: "right" }}>{shareNotice}</div>}

      {detailMode && <CommentSection postId={post.id} />}
      {showRepostModal && (
        <RepostModal
          post={post}
          onClose={() => setShowRepostModal(false)}
          onDone={() => {}}
        />
      )}
    </div>
  );
}
