import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne } from "@/lib/db";

// ============================================================
// /api/tournament_registrations/[id] — READ-ONLY LEGACY ADAPTER (P1-1 arch wave)
// ------------------------------------------------------------------
// See route.ts in the parent dir. `entries` is the sole authority; approvals and
// rejections flow through PATCH /api/entries/[id]. This legacy PATCH is demoted
// to READ-ONLY and returns 410 — it performs NO state write (HARD GUARD).
// Only the historic GET (self/org/admin visibility) is preserved.
// ============================================================

// GET /api/tournament_registrations/[id] - read a legacy registration (history)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    // SEC-3A2-04: a registration (with player email) is only visible to the
    // registrant themselves, the tournament organizer, or an admin.
    const registration = await queryOne(
      `SELECT r.*, p.full_name AS player_name, p.email AS player_email, t.organizer_id
       FROM tournament_registrations r
       LEFT JOIN profiles p ON r.profile_id = p.id
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.id = $1`,
      [id]
    );

    if (!registration) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }

    const isSelf = registration.profile_id === payload.userId;
    const isOrg = payload.role === "admin" || registration.organizer_id === payload.userId;
    if (!isSelf && !isOrg) {
      return NextResponse.json({ error: "Forbidden — not your registration" }, { status: 403 });
    }

    // Don't leak the internal join column back to the caller.
    const { organizer_id, ...safe } = registration;
    return NextResponse.json({ registration: { ...safe, legacy: true } });
  } catch (err: any) {
    console.error("Get registration error:", err);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}

// PATCH /api/tournament_registrations/[id] — READ-ONLY (NO STATE WRITE)
// Approval/rejection now flows through PATCH /api/entries/[id]
// (registration_status). This legacy handler refuses to write and returns 410.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    {
      error: "Approval/rejection moved to PATCH /api/entries/[id]. This legacy endpoint is read-only (no state is written).",
    },
    { status: 410 }
  );
}
