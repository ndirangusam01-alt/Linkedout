// Avatar storage — uploaded to the object storage PUBLIC bucket (see
// lib/storage.js). saveAvatar() returns the full public URL, stored
// directly in accounts.avatar_path (see lib/identity/service.js) and
// handed straight to clients — no proxy route needed, same reasoning as
// lib/media.js.
import { uploadPublicObject, deletePublicObject, keyFromPublicUrl } from "./storage.js";

const ALLOWED_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export function isAllowedAvatarType(mimeType) {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, mimeType);
}

export const AVATAR_MAX_BYTES = MAX_BYTES;

// Removes any previously-stored avatar object for this account,
// regardless of extension (a user might upload a .png, delete it, then
// upload a .webp — old objects shouldn't linger in the bucket).
async function removeExistingAvatarObjects(accountId) {
  await Promise.all(
    Object.values(ALLOWED_TYPES).map((ext) => deletePublicObject(`avatars/${accountId}.${ext}`).catch(() => {}))
  );
}

export async function saveAvatar(accountId, file) {
  if (!isAllowedAvatarType(file.type)) {
    const err = new Error("Avatar must be a PNG, JPEG, or WEBP image.");
    err.code = "INVALID_TYPE";
    throw err;
  }
  if (file.size > MAX_BYTES) {
    const err = new Error("Avatar must be under 5MB.");
    err.code = "TOO_LARGE";
    throw err;
  }
  await removeExistingAvatarObjects(accountId);
  const ext = ALLOWED_TYPES[file.type];
  const key = `avatars/${accountId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadPublicObject(key, buffer, file.type);
}

// avatarUrl is the full public URL previously returned by saveAvatar
// (stored as-is in accounts.avatar_path) — recovers the storage key from
// it so the object can actually be removed.
export async function deleteAvatarFile(avatarUrl) {
  const key = keyFromPublicUrl(avatarUrl);
  if (!key) return;
  await deletePublicObject(key).catch(() => {});
}

// Used only by scripts/seed-content.js, for the generated placeholder
// avatars in scripts/lib/placeholder-avatar.js — bypasses the File-shaped
// input saveAvatar() expects since seeding builds a PNG buffer directly,
// not a browser File.
export async function saveGeneratedAvatar(accountId, pngBuffer) {
  await removeExistingAvatarObjects(accountId);
  const key = `avatars/${accountId}.png`;
  return uploadPublicObject(key, pngBuffer, "image/png");
}
