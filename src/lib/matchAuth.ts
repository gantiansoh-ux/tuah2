import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
}

/**
 * Verify the current user is allowed to control a match:
 * - the assigned umpire (matches.umpire_id == user)
 * - the tournament organizer
 * - an admin
 * Returns { ok: true, match } or { ok: false, response }
 */
export async function canControlMatch(userId: string, userRole: string, matchId: string) {
  const match = await queryOne(
    `SELECT m.*, t.organizer_id
     FROM matches m
     JOIN tournaments t ON m.tournament_id = t.id
     WHERE m.id = $1`,
    [matchId]
  );

  if (!match) {
    return { ok: false, match: null, response: NextResponse.json({ error: "Match not found" }, { status: 404 }) };
  }

  const isAssignedUmpire = match.umpire_id === userId;
  const isOrganizer = match.organizer_id === userId;
  const isAdmin = userRole === "admin";

  if (!isAssignedUmpire && !isOrganizer && !isAdmin) {
    return {
      ok: false,
      match,
      response: NextResponse.json(
        { error: "Not authorized — only the assigned umpire or tournament organizer can control this match" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, match, response: null };
}
