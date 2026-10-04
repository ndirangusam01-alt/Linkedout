// Thin fetch wrappers around the API routes. Every function here hits a
// real HTTP endpoint under /app/api — nothing in this file reads mock data
// directly. Swapping the backend later means editing lib/content/service.js
// / lib/identity/service.js and these route handlers, not any component.

// What people see when something fails. Technical detail (URLs, SQL, stack traces,
// host names) never goes into a message — only into the dev console.
export const MESSAGES = {
  offline: "You're offline, or we can't reach LinkedOut right now. Check your connection and try again.",
  server: "Something went wrong on our side. Please try again in a moment.",
  generic: "Something went wrong. Please try again.",
};
const TECHNICAL = /(ECONN|ETIMEDOUT|ENOTFOUND|SELECT |INSERT |UPDATE |DELETE FROM|syntax error|stack|node_modules|\bat \w+[.(]|undefined|\[object|TypeError|ReferenceError|localhost|\.js:\d+)/i;
function safeMessage(status, body) {
  if (status >= 500) return MESSAGES.server;
  const m = body?.error;
  if (typeof m === "string" && m.length > 0 && m.length <= 220 && !TECHNICAL.test(m)) return m;
  return status === 404 ? "We couldn't find that." : status === 403 ? "You don't have access to that." : MESSAGES.generic;
}
export function friendlyError(e) {
  const m = e?.message;
  if (e?.isNetworkError || e?.status) return m || MESSAGES.generic;
  return typeof m === "string" && m.length <= 220 && !TECHNICAL.test(m) ? m : MESSAGES.generic;
}

async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  let res;
  try {
    res = await fetch(url, {
      headers: isFormData ? undefined : { "Content-Type": "application/json" },
      ...options,
    });
  } catch (e) {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("lo:connectivity", { detail: false }));
    const err = new Error(MESSAGES.offline);
    err.isNetworkError = true; err.code = "OFFLINE";
    throw err;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("lo:connectivity", { detail: true }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(safeMessage(res.status, body));
    err.status = res.status;
    err.code = body.code;
    err.fields = body.fields;
    err.body = res.status >= 500 ? {} : body;
    err.retryAfter = res.headers.get("Retry-After");
    throw err;
  }
  return res.json().catch(() => { throw Object.assign(new Error(MESSAGES.server), { status: 502 }); });
}

export const api = {
  getPosts: () => request("/api/posts"),
  getPostsPage: ({ before, limit = 40 }) => request(`/api/posts?limit=${limit}&before=${encodeURIComponent(before)}`),
  getNewPostCount: (since) => request(`/api/posts/new-count?since=${encodeURIComponent(since)}`),
  // formData carries text/type/mood/tags/title/category/visibility/
  // scheduledAt/pollOptions/eventAt/eventLocation/cringeNominated/mode,
  // plus an optional `media` file — see ComposerModal.jsx for how it's
  // built. FormData, not JSON, because a post can include a file upload.
  createPost: (formData) => request("/api/posts", { method: "POST", body: formData }),
  getPost: (id) => request(`/api/posts/${id}`),
  getAliasProfile: (handle) => request(`/api/u/${handle}`),
  followHandle: (handle) => request(`/api/u/${handle}/follow`, { method: "POST" }),
  unfollowHandle: (handle) => request(`/api/u/${handle}/follow`, { method: "DELETE" }),
  getFollowing: () => request("/api/following"),
  likeComment: (id, on) => request(`/api/comments/${id}/like`, { method: "POST", body: JSON.stringify({ on }) }),
  likePost: (id, on) => request(`/api/posts/${id}/like`, { method: "POST", body: JSON.stringify({ on }) }),
  reactToPost: (id, reaction) =>
    request(`/api/posts/${id}/react`, { method: "POST", body: JSON.stringify({ reaction }) }),
  // ---- Messages ----
  getConversations: (box = "inbox") => request(`/api/messages/conversations?box=${box}`),
  getUnreadMessages: () => request("/api/messages/unread"),
  startConversation: (handle, text) => request("/api/messages/requests", { method: "POST", body: JSON.stringify({ handle, text }) }),
  getConversation: (id, { after, before, limit } = {}) => {
    const q = new URLSearchParams(); if (after) q.set("after", after); if (before) q.set("before", before); if (limit) q.set("limit", limit);
    return request(`/api/messages/conversations/${id}${q.toString() ? "?" + q : ""}`);
  },
  sendDm: (id, { text, replyTo, clientId }) => request(`/api/messages/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ text, replyTo, clientId }) }),
  respondToRequest: (id, action) => request(`/api/messages/conversations/${id}/respond`, { method: "POST", body: JSON.stringify({ action }) }),
  markConversationRead: (id) => request(`/api/messages/conversations/${id}/read`, { method: "POST" }),
  sendTyping: (id) => request(`/api/messages/conversations/${id}/typing`, { method: "POST" }),
  updateConversation: (id, changes) => request(`/api/messages/conversations/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  clearConversation: (id) => request(`/api/messages/conversations/${id}`, { method: "DELETE" }),
  reportConversation: (id, payload) => request(`/api/messages/conversations/${id}/report`, { method: "POST", body: JSON.stringify(payload) }),
  editDm: (mid, text) => request(`/api/messages/items/${mid}`, { method: "PATCH", body: JSON.stringify({ text }) }),
  deleteDm: (mid) => request(`/api/messages/items/${mid}`, { method: "DELETE" }),
  reactDm: (mid, reaction) => request(`/api/messages/items/${mid}/react`, { method: "POST", body: JSON.stringify({ reaction }) }),
  getBlocks: () => request("/api/messages/blocks"),
  blockHandle: (handle) => request("/api/messages/blocks", { method: "POST", body: JSON.stringify({ handle }) }),
  unblockHandle: (handle) => request(`/api/messages/blocks?handle=${encodeURIComponent(handle)}`, { method: "DELETE" }),
  getDmPrefs: () => request("/api/messaging-preferences"),
  updateDmPrefs: (prefs) => request("/api/messaging-preferences", { method: "PUT", body: JSON.stringify(prefs) }),
  reactToComment: (id, reaction) =>
    request(`/api/comments/${id}/react`, { method: "POST", body: JSON.stringify({ reaction }) }),
  getComments: (id) => request(`/api/posts/${id}/comments`),
  // `payload` is either a plain object ({ text, mode, gifUrl }) — sent as
  // JSON — or a FormData instance (built when the reply has a file
  // attached, see ReplyComposer.jsx) sent as-is.
  addComment: (id, payload) =>
    request(`/api/posts/${id}/comments`, {
      method: "POST",
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
    }),
  searchGifs: (query) => request(`/api/gifs/search${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  // Toggle: on=true reposts, on=false removes it, omitted flips.
  repost: (id, { on = null, mode = "alias", quoteText = null } = {}) =>
    request(`/api/posts/${id}/repost`, { method: "POST", body: JSON.stringify({ on, mode, quoteText }) }),
  unrepost: (id) => request(`/api/posts/${id}/repost`, { method: "DELETE" }),
  votePoll: (id, optionIndex) =>
    request(`/api/posts/${id}/poll-vote`, { method: "POST", body: JSON.stringify({ optionIndex }) }),
  voteCringe: (id) => request(`/api/posts/${id}/cringe-vote`, { method: "POST" }),
  pinPost: (id, pinned) => request(`/api/posts/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }),

  getCompanies: () => request("/api/companies"),
  getMyCompanies: () => request("/api/companies?mine=1"),
  getCompanyTerms: () => request("/api/company-terms"),
  updateCompany: (id, changes) => request(`/api/companies/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  deleteCompany: (id, permanent = false) => request(`/api/companies/${id}${permanent ? "?permanent=1" : ""}`, { method: "DELETE" }),
  restoreCompany: (id) => request(`/api/companies/${id}/restore`, { method: "POST" }),
  uploadCompanyDocument: (id, file, docType) => {
    const fd = new FormData(); fd.append("document", file); fd.append("docType", docType);
    return request(`/api/companies/${id}/documents`, { method: "POST", body: fd });
  },
  removeCompanyDocument: (id, documentId) => request(`/api/companies/${id}/documents?documentId=${documentId}`, { method: "DELETE" }),
  sendCompanyDomainCode: (id, email) => request(`/api/companies/${id}/verify-domain`, { method: "POST", body: JSON.stringify({ email }) }),
  confirmCompanyDomain: (id, code) => request(`/api/companies/${id}/verify-domain`, { method: "POST", body: JSON.stringify({ code }) }),
  reportCompany: (id, payload) => request(`/api/companies/${id}/report`, { method: "POST", body: JSON.stringify(payload) }),
  getCompany: (id) => request(`/api/companies/${id}`),
  createCompany: (payload) => request("/api/companies", { method: "POST", body: JSON.stringify(payload) }),
  addCompanyReview: (id, payload) => request(`/api/companies/${id}/review`, { method: "POST", body: JSON.stringify(payload) }),
  addCompanySalary: (id, payload) => request(`/api/companies/${id}/salary`, { method: "POST", body: JSON.stringify(payload) }),
  addCompanyHorrorStory: (id, payload) => request(`/api/companies/${id}/horror-story`, { method: "POST", body: JSON.stringify(payload) }),

  getJobs: () => request("/api/jobs"),
  createJob: (payload) => request("/api/jobs", { method: "POST", body: JSON.stringify(payload) }),

  getRooms: () => request("/api/rooms"),
  createRoom: (payload) => request("/api/rooms", { method: "POST", body: JSON.stringify(payload) }),
  joinRoom: (id) => request(`/api/rooms/${id}/join`, { method: "POST" }),
  leaveRoom: (id) => request(`/api/rooms/${id}/leave`, { method: "POST" }),
  getRoomToken: (id) => request(`/api/rooms/${id}/token`),
  getRoomParticipants: (id) => request(`/api/rooms/${id}/participants`),
  raiseHand: (id, raised = true) => request(`/api/rooms/${id}/raise-hand`, { method: "POST", body: JSON.stringify({ raised }) }),
  promoteToSpeaker: (id, handle) => request(`/api/rooms/${id}/promote`, { method: "POST", body: JSON.stringify({ handle }) }),
  demoteToListener: (id, handle) => request(`/api/rooms/${id}/demote`, { method: "POST", body: JSON.stringify({ handle }) }),
  muteAllInRoom: (id) => request(`/api/rooms/${id}/mute-all`, { method: "POST" }),
  removeFromRoom: (id, handle, ban = true) => request(`/api/rooms/${id}/remove`, { method: "POST", body: JSON.stringify({ handle, ban }) }),
  updateRoom: (id, changes) => request(`/api/rooms/${id}`, { method: "PATCH", body: JSON.stringify(changes) }),
  endRoom: (id) => request(`/api/rooms/${id}/end`, { method: "POST" }),
  deleteRoom: (id) => request(`/api/rooms/${id}`, { method: "DELETE" }),

  getAwards: () => request("/api/awards"),

  getAds: () => request("/api/ads"),
  getFeedConfig: () => request("/api/feed-config"),

  createCheckoutSession: (tier) => request("/api/stripe/checkout", { method: "POST", body: JSON.stringify({ tier }) }),
  createPortalSession: () => request("/api/stripe/portal", { method: "POST" }),

  // payload: a File (sent as multipart) or a plain string of pasted resume text (sent as JSON)
  getResumeRoast: (payload) => {
    if (payload instanceof File) {
      const form = new FormData();
      form.set("resume", payload);
      return request("/api/resume-roast", { method: "POST", body: form });
    }
    return request("/api/resume-roast", { method: "POST", body: JSON.stringify({ text: payload }) });
  },

  search: (q) => request(`/api/search?q=${encodeURIComponent(q)}`),
  getAiStatus: () => request("/api/title-translate"),
  translateTitle: (input, direction) => request("/api/title-translate", { method: "POST", body: JSON.stringify({ input, direction }) }),

  // ---- Profile ----
  getProfile: () => request("/api/profile"),
  updateProfile: (updates) => request("/api/profile", { method: "PATCH", body: JSON.stringify(updates) }),
  getMyPosts: () => request("/api/profile/posts"),
  getMyBookmarks: () => request("/api/profile/bookmarks"),
  getMyLikes: () => request("/api/profile/likes"),
  toggleBookmark: (id) => request(`/api/posts/${id}/bookmark`, { method: "POST" }),
  deleteAccount: (password) => request("/api/profile/delete", { method: "POST", body: JSON.stringify({ password }) }),
  deactivateAccount: (password) => request("/api/profile/deactivate", { method: "POST", body: JSON.stringify({ password }) }),
  exportData: () => request("/api/profile/export"),

  uploadAvatar: (file) => {
    const form = new FormData();
    form.append("avatar", file);
    return request("/api/profile/avatar", { method: "POST", body: form });
  },
  deleteAvatar: () => request("/api/profile/avatar", { method: "DELETE" }),

  // ---- Auth extras ----
  changePassword: (currentPassword, newPassword) =>
    request("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  requestPasswordReset: (email) =>
    request("/api/auth/request-password-reset", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, newPassword) =>
    request("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) }),
  verifyEmail: (token) => request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }),
  resendVerification: () => request("/api/auth/resend-verification", { method: "POST" }),

  // ---- Phone verification (optional) ----
  requestPhoneVerification: (phone) => request("/api/auth/phone/request", { method: "POST", body: JSON.stringify({ phone }) }),
  confirmPhoneVerification: (code) => request("/api/auth/phone/confirm", { method: "POST", body: JSON.stringify({ code }) }),

  // ---- Government ID / Business / Professional verification ----
  getVerificationRequests: () => request("/api/verification"),
  // formData: { type, notes, document (File, optional) }
  submitVerificationRequest: (formData) =>
    request("/api/verification", { method: "POST", body: formData }),

  // ---- Notifications ----
  getNotifications: () => request("/api/notifications"),
  markNotificationRead: (id) => request(`/api/notifications/${id}/read`, { method: "POST" }),
  registerPushToken: (token, platform) =>
    request("/api/push-tokens", { method: "POST", body: JSON.stringify({ token, platform }) }),
  unregisterPushToken: (token) =>
    request("/api/push-tokens", { method: "DELETE", body: JSON.stringify({ token }) }),
  getNotificationPreferences: () => request("/api/notification-preferences"),
  setNotificationPreference: (category, changes) =>
    request("/api/notification-preferences", { method: "PUT", body: JSON.stringify({ category, ...changes }) }),
  markAllNotificationsRead: () => request("/api/notifications/read-all", { method: "POST" }),
};
