import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne } from "@/lib/db";

const err = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/challenges/[id] — challenge detail.
 *  Public read allowed only when the challenge's match belongs to a public
 *  tournament (registration/published/in_progress/completed); otherwise a
 *  logged-in user is required (contract §4 public-read rule). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return err(404, "Challenge not found");

  try {
    const row = await queryOne(
      `SELECT c.*, COALESCE(p.full_name, '') AS player_name
       FROM challenges c
       LEFT JOIN profiles p ON c.player_id = p.id
       WHERE c.id = $1`,
      [id]
    );
    if (!row) return err(404, "Challenge not found", "CHALLENGE_NOT_FOUND");

    const t = await queryOne(
      `SELECT t.status FROM challenges c JOIN matches m ON c.match_id = m.id JOIN tournaments t ON m.tournament_id = t.id WHERE c.id = $1`,
      [id]
    );
    const isPublic = t && ["registration", "published", "in_progress", "completed"].includes(t.status);
    if (!isPublic) {
      const cookie = _req.cookies.get(getCookieName())?.value;
      const payload = cookie ? await verifyToken(cookie) : null;
      if (!payload) return err(401, "Unauthorized");
    }

    return NextResponse.json(row);
  } catch (e: any) {
    console.error("Get challenge error:", e);
    return err(500, "Failed to load challenge");
  }
}
