import { NextResponse } from "next/server";
import { getCurrentAccountId } from "@/lib/session";
import { getNotifications, getUnreadNotificationCount } from "@/lib/identity/service";

export async function GET() {
  const accountId = await getCurrentAccountId();
  if (!accountId) return NextResponse.json({ error: "You need to be logged in." }, { status: 401 });

  return NextResponse.json({
    notifications: await getNotifications(accountId),
    unreadCount: await getUnreadNotificationCount(accountId),
  });
}
