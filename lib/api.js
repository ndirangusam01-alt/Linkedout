// Thin fetch wrappers around the API routes. Every function here hits a
// real HTTP endpoint under /app/api — nothing in this file reads mock data
// directly. Swapping the backend later means editing lib/content/service.js
// / lib/identity/service.js and these route handlers, not any component.

async function request(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const res = await fetch(url, {
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request to ${url} failed (${res.status})`);
    err.status = res.status;
    err.code = body.code;
    err.retryAfter = res.headers.get("Retry-After");
    throw err;
  }
  return res.json();
}

export const api = {
  getPosts: () => request("/api/posts"),
  // formData carries text/type/mood/tags/title/category/visibility/
  // scheduledAt/pollOptions/eventAt/eventLocation/cringeNominated/mode,
  // plus an optional `media` file — see ComposerModal.jsx for how it's
  // built. FormData, not JSON, because a post can include a file upload.
  createPost: (formData) => request("/api/posts", { method: "POST", body: formData }),
  getPost: (id) => request(`/api/posts/${id}`),
  getAliasProfile: (handle) => request(`/api/u/${handle}`),
  followHandle: (handle) => request(`/api/u/${handle}/follow`, { method: "POST" }),
  unfollowHandle: (handle) => request(`/api/u/${handle}/follow`, { method: "DELETE" }),
  getSuggestions: () => request("/api/suggestions"),
  getFollowing: () => request("/api/following"),
  reactToPost: (id, reaction) =>
    request(`/api/posts/${id}/react`, { method: "POST", body: JSON.stringify({ reaction }) }),
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
  repost: (id, mode = "alias", quoteText = null) =>
    request(`/api/posts/${id}/repost`, { method: "POST", body: JSON.stringify({ mode, quoteText }) }),
  votePoll: (id, optionIndex) =>
    request(`/api/posts/${id}/poll-vote`, { method: "POST", body: JSON.stringify({ optionIndex }) }),
  voteCringe: (id) => request(`/api/posts/${id}/cringe-vote`, { method: "POST" }),
  pinPost: (id, pinned) => request(`/api/posts/${id}/pin`, { method: "POST", body: JSON.stringify({ pinned }) }),

  getCompanies: () => request("/api/companies"),
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

  getAwards: () => request("/api/awards"),

  getAds: () => request("/api/ads"),
  upgradeToPremium: () => request("/api/premium/upgrade", { method: "POST" }),
  downgradeFromPremium: () => request("/api/premium/downgrade", { method: "POST" }),

  getStripeStatus: () => request("/api/stripe/status"),
  createCheckoutSession: () => request("/api/stripe/checkout", { method: "POST" }),
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
