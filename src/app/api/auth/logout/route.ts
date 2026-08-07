import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName, clearCookieHeader } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", clearCookieHeader());
  return response;
}
