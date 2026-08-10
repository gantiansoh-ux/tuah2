import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { checkCategoryCapacity } from "@/lib/registration";

// GET /api/tournament_registrations/[id] - Get a specific registration
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
    return NextResponse.json({ registration: safe });
  } catch (err: any) {
    console.error("Get registration error:", err);
    return NextResponse.json({ error: "Failed to load registration" }, { status: 500 });
  }
}

// PATCH /api/tournament_registrations/[id] - approve or reject
// Also handles entries: approving sets entry registration_status='approved' + confirmed_at=NOW()
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const body = await req.json();
    const { status: newStatus } = body;
    if (!newStatus || !["approved", "rejected"].includes(newStatus)) {
      return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
    }

    // Verify organizer owns the tournament
    const check = await query(
      `SELECT r.id, r.tournament_id, r.profile_id, r.category_id
       FROM tournament_registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.id = $1 AND t.organizer_id = $2`,
      [id, payload.userId]
    );
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Not found or not yours" }, { status: 403 });
    }

    const reg = check.rows[0];

    // Update registration status
    const result = await query(
      `UPDATE tournament_registrations SET status = $1 WHERE id = $2 RETURNING *`,
      [newStatus, id]
    );

    // On approve, auto-create an entry if category_id exists
    if (newStatus === "approved") {
      if (reg.category_id && reg.profile_id) {
        try {
          const dup = await query(
            `SELECT id FROM entries WHERE category_id = $1 AND player_1_id = $2 LIMIT 1`,
            [reg.category_id, reg.profile_id]
          );
          // BUG-012: capacity gate before creating/finalizing the entry
          const cap = await checkCategoryCapacity(
            reg.category_id,
            { excludeEntryId: dup.rows.length > 0 ? dup.rows[0].id : undefined }
          );
          if (!cap.allowed) {
            return NextResponse.json({ error: cap.error }, { status: cap.status });
          }
          if (dup.rows.length === 0) {
            await query(
              `INSERT INTO entries (category_id, player_1_id, registration_status, confirmed_at)
               VALUES ($1, $2, 'approved', NOW())`,
              [reg.category_id, reg.profile_id]
            );
          } else {
            await query(
              `UPDATE entries SET registration_status = 'approved', confirmed_at = NOW()
               WHERE id = $1`,
              [dup.rows[0].id]
            );
          }
        } catch (_) {}
      }
    }

    return NextResponse.json({ registration: result.rows[0] });
  } catch (err: any) {
    console.error("Update registration error:", err);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
