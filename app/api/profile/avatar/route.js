import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { getAccountById, setAvatarPath, clearAvatarPath } from "@/lib/identity/service";
import { saveAvatar, deleteAvatarFile, AVATAR_MAX_BYTES } from "@/lib/avatars";

export async function POST(request) {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No avatar file uploaded." }, { status: 400 });
  }

  try {
    // saveAvatar uploads to object storage and returns the full public
    // URL directly — stored as-is, no proxy route needed (see
    // lib/avatars.js and lib/storage.js).
    const avatarUrl = await saveAvatar(accountId, file);
    await setAvatarPath(accountId, avatarUrl);
    return NextResponse.json({ avatarUrl });
  } catch (e) {
    if (e.code === "INVALID_TYPE" || e.code === "TOO_LARGE") {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("Avatar upload failed:", e);
    return NextResponse.json({ error: "Could not upload avatar." }, { status: 500 });
  }
}

export async function DELETE() {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  const account = await getAccountById(accountId);
  if (account?.avatarPath) await deleteAvatarFile(account.avatarPath);
  await clearAvatarPath(accountId);
  return NextResponse.json({ ok: true });
}
