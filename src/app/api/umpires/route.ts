import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll } from "@/lib/db";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Optional ?tournament_id= lets the organizer UI show, per umpire, the
    // current invitation status (pending/accepted/declined + when it was sent)
    // for a specific tournament. Gan 2026-08-18: two-way recruitment must show
    // organizer-side feedback so it's clear what happened after inviting.
    const tournamentId = req.nextUrl.searchParams.get("tournament_id");

    const baseSql = `
      SELECT p.id, p.full_name,
             COALESCE(AVG(r.rating)::numeric(2,1), 0) AS avg_rating,
             COUNT(DISTINCT r.id)::int AS review_count,
             COUNT(DISTINCT m.id)::int AS matches_umpired,
             COALESCE(NULLIF(up.certification, ''), '') AS certification,
             COALESCE(NULLIF(up.license_number, ''), '') AS license_number,
             COALESCE(up.experience_years, 0) AS experience_years,
             COALESCE(up.availability->>'rate', '') AS rate,
             COALESCE(up.availability->'days', '[]'::jsonb) AS availability_days`;

    const inviteJoin = tournamentId
      ? `,
             (SELECT ua.status FROM umpire_applications ua
              WHERE ua.umpire_id = p.id
                AND ua.tournament_id = $1
                AND ua.direction = 'invite'
              ORDER BY ua.created_at DESC
              LIMIT 1) AS invite_status,
             (SELECT ua.created_at FROM umpire_applications ua
              WHERE ua.umpire_id = p.id
                AND ua.tournament_id = $1
                AND ua.direction = 'invite'
              ORDER BY ua.created_at DESC
              LIMIT 1) AS invite_created_at`
      : "";

    const fromSql = `
       FROM profiles p
       LEFT JOIN umpire_reviews r ON r.umpire_id = p.id
       LEFT JOIN matches m ON m.umpire_id = p.id
       LEFT JOIN umpire_profiles up ON up.profile_id = p.id
       WHERE p.role = 'umpire' OR 'umpire' = ANY(p.roles)
       GROUP BY p.id, p.full_name, up.certification, up.license_number, up.experience_years, up.availability
       ORDER BY avg_rating DESC, p.full_name ASC`;

    const sql = baseSql + inviteJoin + fromSql;

    const params = tournamentId ? [tournamentId] : [];
    const umpires = await queryAll(sql, params);

    return NextResponse.json({ umpires });
  } catch (err: any) {
    console.error("Umpires GET error:", err);
    return NextResponse.json({ error: "Failed to load umpires" }, { status: 500 });
  }
}
