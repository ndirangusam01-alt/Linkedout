import { NextResponse } from "next/server";
import { getRoomParticipants } from "@/lib/content/service";

export async function GET(request, { params }) {
  const { id } = await params;
  return NextResponse.json({ participants: await getRoomParticipants(id) });
}
