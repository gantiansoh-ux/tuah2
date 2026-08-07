import { NextResponse } from "next/server";

// Permanent health endpoint for the uptime monitor.
// Always 200 when the Next.js server + API layer are alive.
export async function GET() {
  return NextResponse.json({ ok: true, service: "tuah", ts: Date.now() });
}
