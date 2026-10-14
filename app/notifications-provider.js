"use client";
import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/app/auth-provider";
import { api } from "@/lib/api";
import { playSound, pullSoundPrefs } from "@/lib/sounds";

const NotificationsContext = createContext(null);
const POLL_INTERVAL_MS = 12000;

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);
  const seenIdsRef = useRef(null); // null until the first load, so history never chimes

  const refresh = useCallback(async () => {
    if (!user) {
      seenIdsRef.current = null;
      setMessageUnread(0);
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const data = await api.getNotifications();
      // Chime once for each genuinely new unread notification that arrives
      // after the first load — never for existing ones, never twice.
      const ids = new Set(data.notifications.map((n) => n.id));
      if (seenIdsRef.current) {
        const fresh = data.notifications.some((n) => !n.read && !seenIdsRef.current.has(n.id));
        if (fresh) {
          // Message notifications use the message tone; everything else the general one.
          const onlyMessages = data.notifications.filter((n) => !n.read && !seenIdsRef.current.has(n.id)).every((n) => n.category === "messages");
          playSound(onlyMessages ? "message" : "notify");
        }
      }
      seenIdsRef.current = ids;
      api.getUnreadMessages().then((r) => setMessageUnread(r.total || 0)).catch(() => {});
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      // Quiet failure — notifications are a nice-to-have, not core
      // functionality; a network blip here shouldn't surface an error UI.
    }
  }, [user]);

  useEffect(() => { if (user) pullSoundPrefs(); }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
    if (!user) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  async function markRead(id) {
    setNotifications((ns) => ns.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      refresh(); // reconcile with the server if the optimistic update was wrong
    }
  }

  async function markAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      refresh();
    }
  }

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, messageUnread, setMessageUnread, refresh, markRead, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
