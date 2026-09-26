"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Building2, Briefcase, User, Search, Mic, Trophy, LogOut, Bell,
  PenSquare, Settings, MoreHorizontal, MessageCircle, UserPlus, BadgeCheck, ShieldAlert,
} from "lucide-react";
import { C, displayFont, monoFont, alpha, grainDot, sunken } from "@/lib/theme";
import { PulseDot } from "@/components/primitives";
import { useAuth } from "@/app/auth-provider";
import { useNotifications } from "@/app/notifications-provider";
import { useComposer } from "@/app/composer-provider";
import { api } from "@/lib/api";

// Jobs is paused (not deleted) — flip this back to true to bring it back
// in both the sidebar/mobile tabs below and the page itself (see
// app/jobs/page.js, which shows a "paused" notice while this is false).
const JOBS_ENABLED = false;

const NAV_ITEMS = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/companies", label: "Companies", icon: Building2 },
  ...(JOBS_ENABLED ? [{ href: "/jobs", label: "Jobs", icon: Briefcase }] : []),
  { href: "/vent", label: "Vent", icon: Mic },
  { href: "/awards", label: "Awards", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
];

// Mobile keeps a compact top tab row instead of the full sidebar labels —
// Search gets its own icon in the top bar there instead of a tab slot.
const MOBILE_TABS = NAV_ITEMS.filter((t) => t.href !== "/search");

function NotificationBell({ variant = "icon" }) {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  const CATEGORY_ICON = {
    engagement: MessageCircle, social: UserPlus, rooms: Mic,
    achievements: Trophy, verification: BadgeCheck, account: ShieldAlert,
  };

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!user) return null;

  const panel = open && (
    <div
      style={{
        position: "absolute", ...(variant === "icon" ? { right: 0, top: "calc(100% + 10px)" } : { left: "calc(100% + 12px)", bottom: 0 }),
        width: 320, maxHeight: 400, overflowY: "auto",
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, zIndex: 30,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: `1px solid ${C.line}` }}>
        <span style={{ ...displayFont, fontSize: 13, color: C.text }}>Notifications</span>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{ ...monoFont, fontSize: 10.5, color: C.mustard, background: "none", border: "none", cursor: "pointer" }}>
            mark all read
          </button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div style={{ padding: 16, ...monoFont, fontSize: 11.5, color: C.muted }}>Nothing yet.</div>
      ) : (
        notifications.map((n) => {
          const CatIcon = CATEGORY_ICON[n.category] || MessageCircle;
          return (
          <button
            key={n.id}
            onClick={() => markRead(n.id)}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
              background: n.read ? "transparent" : sunken,
              border: "none", borderBottom: `1px solid ${C.line}`, cursor: "pointer",
            }}
          >
            <div className="flex items-start gap-2">
              <CatIcon size={13} color={C.mustard} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ ...monoFont, fontSize: 9.5, color: C.muted, marginTop: 3 }}>
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          </button>
          );
        })
      )}
    </div>
  );

  if (variant === "sidebar") {
    return (
      <div style={{ position: "relative" }} ref={panelRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-4 w-full"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 12px", borderRadius: 999, color: C.text }}
        >
          <div style={{ position: "relative" }}>
            <Bell size={22} />
            {unreadCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -6, background: C.flag, color: "#fff", fontSize: 9, borderRadius: 20, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", ...monoFont }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="hidden xl:inline" style={{ fontSize: 16 }}>Notifications</span>
        </button>
        {panel}
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 2 }}
        aria-label="Notifications"
      >
        <Bell size={17} color={C.muted} />
        {unreadCount > 0 && (
          <span style={{ position: "absolute", top: -3, right: -3, background: C.flag, color: "#fff", fontSize: 9, borderRadius: 20, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", ...monoFont }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!user) return null;

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 w-full"
        style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 12px", borderRadius: 999 }}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.pseudonym} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.muted }}>
            {user.pseudonym?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div className="hidden xl:flex flex-col items-start" style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{user.pseudonym}</span>
          <span style={{ ...monoFont, fontSize: 10.5, color: C.muted }}>{user.isPremium ? "Premium" : "Free tier"}</span>
        </div>
        <MoreHorizontal size={16} color={C.muted} className="hidden xl:block" />
      </button>
      {open && (
        <div style={{ position: "absolute", left: 0, bottom: "calc(100% + 8px)", width: 220, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10, zIndex: 30, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", overflow: "hidden" }}>
          <Link href="/profile" onClick={() => setOpen(false)} style={{ display: "block", padding: "10px 14px", fontSize: 13, color: C.text, textDecoration: "none" }}>View profile</Link>
          <Link href="/settings" onClick={() => setOpen(false)} style={{ display: "block", padding: "10px 14px", fontSize: 13, color: C.text, textDecoration: "none", borderTop: `1px solid ${C.line}` }}>Settings & Privacy</Link>
          <button
            onClick={async () => { setOpen(false); await logout(); router.push("/"); }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", fontSize: 13, color: C.flag, background: "none", border: "none", borderTop: `1px solid ${C.line}`, cursor: "pointer" }}
          >Log out</button>
        </div>
      )}
    </div>
  );
}

function DesktopSidebar({ pathname, liveRoomCount }) {
  const { user, loading } = useAuth();
  const composer = useComposer();

  return (
    <div className="hidden md:flex flex-col justify-between" style={{ width: 88, flexShrink: 0, height: "100vh", position: "sticky", top: 0, padding: "12px 8px" }}>
      <div className="flex flex-col gap-1 xl:items-stretch items-center">
        <Link
          href="/"
          className="lo-tap"
          style={{ padding: 10, display: "flex", borderRadius: 14 }}
        >
          <img
            src="/logo-mark.png"
            alt="LinkedOut"
            width={40}
            height={40}
            style={{ filter: "drop-shadow(0 2px 10px rgba(76,97,255,0.35))" }}
          />
        </Link>
        {NAV_ITEMS.map((t) => {
          const Icon = t.icon;
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex items-center gap-4 xl:justify-start justify-center"
              style={{ padding: "10px 12px", borderRadius: 999, color: active ? C.text : C.muted, textDecoration: "none", fontWeight: active ? 700 : 400, position: "relative" }}
            >
              <Icon size={23} />
              <span className="hidden xl:inline" style={{ fontSize: 16 }}>{t.label}</span>
              {t.href === "/vent" && liveRoomCount > 0 && (
                <span style={{ position: "absolute", top: 8, right: 10 }}><PulseDot /></span>
              )}
            </Link>
          );
        })}
        <NotificationBell variant="sidebar" />

        {!loading && user && (
          <button
            onClick={composer.open}
            className="flex items-center justify-center xl:justify-start gap-3"
            style={{ marginTop: 8, background: C.mustard, color: "#FFFFFF", border: "none", borderRadius: 999, padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: 15 }}
          >
            <PenSquare size={18} className="xl:hidden" />
            <span className="hidden xl:inline">Post</span>
          </button>
        )}
      </div>

      <div>
        {!loading && (user ? <UserMenu /> : (
          <Link href="/login" style={{ display: "block", textAlign: "center", ...monoFont, fontSize: 12, color: "#FFFFFF", background: C.mustard, borderRadius: 999, padding: "10px 8px", textDecoration: "none" }}>
            Log in
          </Link>
        ))}
      </div>
    </div>
  );
}

function SuggestedForYou() {
  const [suggestions, setSuggestions] = useState(null);
  const [followingSet, setFollowingSet] = useState(new Set());

  useEffect(() => {
    api.getSuggestions().then((r) => setSuggestions(r.suggestions)).catch(() => setSuggestions([]));
  }, []);

  async function follow(handle) {
    setFollowingSet((s) => new Set(s).add(handle));
    try { await api.followHandle(handle); }
    catch { setFollowingSet((s) => { const next = new Set(s); next.delete(handle); return next; }); }
  }

  if (suggestions && suggestions.length === 0) return null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
      <div style={{ ...displayFont, fontSize: 15, color: C.text, marginBottom: 4 }}>People you may know</div>
      <div style={{ ...monoFont, fontSize: 9.5, color: C.muted, marginBottom: 10 }}>ranked by follower count — no hidden algorithm</div>
      {!suggestions ? (
        <div className="flex flex-col gap-2">
          <div className="lo-skeleton" style={{ height: 32 }} />
          <div className="lo-skeleton" style={{ height: 32 }} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {suggestions.map((s) => (
            <div key={s.handle} className="flex items-center gap-2">
              <Link href={`/u/${s.handle}`}>
                {s.avatarUrl
                  ? <img src={s.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                  : <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12 }}>{s.displayLabel[0]}</div>}
              </Link>
              <Link href={`/u/${s.handle}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
                <div style={{ fontSize: 12.5, color: C.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.displayLabel}</div>
                <div style={{ ...monoFont, fontSize: 10, color: C.muted }}>{s.followerCount} follower{s.followerCount === 1 ? "" : "s"}</div>
              </Link>
              <button
                onClick={() => follow(s.handle)}
                disabled={followingSet.has(s.handle)}
                className="lo-tap"
                style={{ ...monoFont, fontSize: 10.5, color: followingSet.has(s.handle) ? C.muted : C.mustard, background: "none", border: `1px solid ${followingSet.has(s.handle) ? C.line : alpha(C.mustard, 40)}`, borderRadius: 20, padding: "4px 10px", cursor: followingSet.has(s.handle) ? "default" : "pointer" }}
              >
                {followingSet.has(s.handle) ? "Following" : "Follow"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RightPanel({ liveRoomCount }) {
  const { user } = useAuth();
  return (
    <div className="hidden lg:flex flex-col gap-4" style={{ width: 320, flexShrink: 0, padding: "12px 16px", height: "100vh", position: "sticky", top: 0, overflowY: "auto" }}>
      <Link
        href="/search"
        className="flex items-center gap-2"
        style={{ background: C.surface2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "10px 16px", color: C.muted, fontSize: 13.5, textDecoration: "none" }}
      >
        <Search size={15} /> Search LinkedOut
      </Link>

      {user && <SuggestedForYou />}

      {!user?.isPremium && (
        <div style={{ background: C.surface, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 14, padding: 16 }}>
          <div style={{ ...displayFont, fontSize: 15, color: C.text, marginBottom: 6 }}>Get Premium</div>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>No ads, unlimited posts, unlocked salary data across every company page.</div>
          <Link href="/premium" style={{ display: "inline-block", ...monoFont, fontSize: 12, color: "#FFFFFF", background: C.mustard, borderRadius: 999, padding: "8px 16px", textDecoration: "none", fontWeight: 700 }}>Upgrade</Link>
        </div>
      )}

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ ...displayFont, fontSize: 15, color: C.text, marginBottom: 10 }}>Vent Sessions</div>
        {liveRoomCount > 0 ? (
          <Link href="/vent" className="flex items-center gap-2" style={{ fontSize: 13, color: C.text, textDecoration: "none" }}>
            <PulseDot /> {liveRoomCount} room{liveRoomCount === 1 ? "" : "s"} open right now
          </Link>
        ) : (
          <div style={{ fontSize: 12.5, color: C.muted }}>Nothing open right now — start one.</div>
        )}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16 }}>
        <div style={{ ...displayFont, fontSize: 15, color: C.text, marginBottom: 6 }}>Humble Brag Translator</div>
        <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginBottom: 10 }}>See your real title in full LinkedIn-hype, or decode someone else's humblebrag.</div>
        <Link href="/title-translator" style={{ ...monoFont, fontSize: 12, color: C.corpblue, textDecoration: "none" }}>Try it →</Link>
      </div>
    </div>
  );
}

function MobileHeader({ pathname, liveRoomCount }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  return (
    <div style={{ borderBottom: `1px solid ${C.line}`, background: C.ink }} className="sticky top-0 z-10 md:hidden">
      <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 lo-tap" style={{ ...displayFont, fontSize: 21, fontWeight: 800, color: C.text, textDecoration: "none" }}>
          <img
            src="/logo-mark.png"
            alt=""
            width={32}
            height={32}
            style={{ display: "block", filter: "drop-shadow(0 2px 8px rgba(76,97,255,0.4))" }}
          />
          <span className="flex items-center gap-0.5">
            Linked<span style={{ color: C.mustard }}>Out</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/search" style={{ display: "flex" }}><Search size={17} color={C.muted} /></Link>
          <NotificationBell />
          {loading ? (
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface2 }} />
          ) : user ? (
            <>
              {!user.isPremium && (
                <Link href="/premium" style={{ ...monoFont, fontSize: 10.5, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 20, padding: "4px 10px", textDecoration: "none" }}>
                  Upgrade
                </Link>
              )}
              <Link href="/profile" title={user.pseudonym} style={{ display: "flex", alignItems: "center" }}>
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.pseudonym}
                    style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: user.isPremium ? `1px solid ${C.mustard}` : "none" }}
                  />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: user.isPremium ? C.mustard : C.muted, border: user.isPremium ? `1px solid ${C.mustard}` : "none" }}>
                    {user.pseudonym?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
              </Link>
              <button
                onClick={async () => { await logout(); router.push("/"); }}
                title="Log out"
                style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}
              >
                <LogOut size={14} color={C.muted} />
              </button>
            </>
          ) : (
            <Link href="/login" style={{ ...monoFont, fontSize: 11.5, color: C.mustard, border: `1px solid ${alpha(C.mustard, 33)}`, borderRadius: 20, padding: "5px 12px", textDecoration: "none" }}>
              Log in
            </Link>
          )}
        </div>
      </div>
      <div className="max-w-3xl mx-auto flex px-4 gap-1 overflow-x-auto">
        {MOBILE_TABS.map((t) => {
          const Icon = t.icon;
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className="flex items-center gap-1.5 px-3 py-2"
              style={{
                fontSize: 12.5, color: active ? C.mustard : C.muted, whiteSpace: "nowrap", flexShrink: 0,
                textDecoration: "none",
                borderBottom: `2px solid ${active ? C.mustard : "transparent"}`,
              }}
            >
              <Icon size={14} /> {t.label}
              {t.href === "/vent" && liveRoomCount > 0 && <PulseDot />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function Shell({ children }) {
  const pathname = usePathname();
  const [liveRoomCount, setLiveRoomCount] = useState(0);

  // Real count, not a hardcoded number — polled occasionally rather than
  // on every render; a stale-by-a-minute count on a small indicator dot
  // is an acceptable tradeoff for not hitting the API from every page.
  useEffect(() => {
    let cancelled = false;
    async function loadRooms() {
      try {
        const rooms = await api.getRooms();
        if (!cancelled) setLiveRoomCount(rooms.filter((r) => r.live && r.listeners > 0).length);
      } catch {
        // quiet — a nice-to-have indicator, not core functionality
      }
    }
    loadRooms();
    const interval = setInterval(loadRooms, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div style={{ background: C.ink, minHeight: "100vh", color: C.text }} className="w-full">
      <div
        style={{ backgroundImage: `radial-gradient(circle at 1px 1px, ${grainDot} 1px, transparent 0)`, backgroundSize: "18px 18px" }}
        className="min-h-screen"
      >
        <MobileHeader pathname={pathname} liveRoomCount={liveRoomCount} />

        {/* Desktop: X-style three-column layout — fixed nav rail, center
            content column, optional right panel. Mobile falls back to the
            top-bar-plus-tabs header above, sidebar/right panel just don't
            render (hidden via Tailwind breakpoints, not separate code
            paths, so there's one source of truth for nav state). */}
        <div className="max-w-6xl mx-auto flex">
          <DesktopSidebar pathname={pathname} liveRoomCount={liveRoomCount} />
          <div key={pathname} className="lo-route-enter flex-1 min-w-0 px-4 py-5 md:px-6 max-w-full md:max-w-2xl mx-auto">{children}</div>
          <RightPanel liveRoomCount={liveRoomCount} />
        </div>
      </div>
    </div>
  );
}
