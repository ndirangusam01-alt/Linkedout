import { NextResponse } from "next/server";
import { getAds } from "@/lib/content/service";

export async function GET() {
  return NextResponse.json(await getAds());
}
