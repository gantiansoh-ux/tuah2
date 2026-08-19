import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll, queryOne } from "@/lib/db";

// GET /api/umpires/me - current umpire's assigned matches + rating profile
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = payload.userId;

  try {
    // Assigned matches with tournament + category info
    const matches = await queryAll(
      `SELECT m.id, m.round, m.match_number, m.status, m.court_number, m.scheduled_time,
              m.entry_1_id, m.entry_2_id, m.winner_entry_id,
              t.id AS tournament_id, t.title AS tournament_title, t.status AS tournament_status,
              c.name AS category_name,
              COALESCE(p1.full_name, '') AS player_1_name,
              COALESCE(p2.full_name, '') AS player_2_name
       FROM matches m
       JOIN tournaments t ON m.tournament_id = t.id
       JOIN categories c ON m.category_id = c.id
       LEFT JOIN entries e1 ON m.entry_1_id = e1.id
       LEFT JOIN entries e2 ON m.entry_2_id = e2.id
       LEFT JOIN profiles p1 ON e1.player_1_id = p1.id
       LEFT JOIN profiles p2 ON e2.player_1_id = p2.id
       WHERE m.umpire_id = $1
       ORDER BY
         CASE WHEN m.status = 'in_progress' THEN 0
              WHEN m.status = 'scheduled' THEN 1
              ELSE 2 END,
         m.scheduled_time ASC NULLS LAST,
         m.match_number ASC`,
      [uid]
    );

    // My rating summary
    const rating = await queryOne(
      `SELECT COALESCE(AVG(rating)::numeric(2,1), 0) AS avg_rating,
              COUNT(*)::int AS review_count,
              MAX(rating) AS best_rating
       FROM umpire_reviews WHERE umpire_id = $1`,
      [uid]
    );

    // My pending applications (self-initiated: direction = 'self')
    const applications = await queryAll(
      `SELECT a.id, a.tournament_id, a.message, a.status, a.created_at, t.title AS tournament_title
       FROM umpire_applications a
       JOIN tournaments t ON a.tournament_id = t.id
       WHERE a.umpire_id = $1 AND a.direction = 'self'
       ORDER BY a.created_at DESC`,
      [uid]
    );

    // Invitations received from organizers (direction = 'invite'), pending first
    const invitations = await queryAll(
      `SELECT a.id, a.tournament_id, a.message, a.status, a.created_at, t.title AS tournament_title,
              t.start_date, t.end_date, t.venue, t.description, t.status AS tournament_status,
              (SELECT COUNT(*)::int FROM categories c WHERE c.tournament_id = t.id) AS category_count
       FROM umpire_applications a
       JOIN tournaments t ON a.tournament_id = t.id
       WHERE a.umpire_id = $1 AND a.direction = 'invite'
       ORDER BY
         CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END,
         a.created_at DESC`,
      [uid]
    );

    // Open tournaments I could apply to (registration/published, not completed)
    const openTournaments = await queryAll(
      `SELECT t.id, t.title, t.start_date, t.end_date, t.status,
              COUNT(DISTINCT c.id) AS category_count
       FROM tournaments t
       LEFT JOIN categories c ON c.tournament_id = t.id
       WHERE t.status IN ('registration', 'published', 'in_progress')
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT 20`
    );

    // MY TOURNAMENTS (Q1a + Q1b): this umpire's tournaments = those where they are
    // (a) an approved/confirmed umpire via invite/apply (umpire_applications approved)
    //    OR (b) explicitly assigned by the organizer (tournament_umpire_assignments).
    // Gan 2026-08-19: a real umpire must be able to FIND the tournaments they officiate.
    const myTournaments = await queryAll(
      `SELECT t.id, t.title, t.start_date, t.end_date, t.status, t.venue,
              COUNT(DISTINCT c.id) AS category_count,
              COUNT(DISTINCT m.id) FILTER (WHERE m.umpire_id = $1) AS my_assigned_matches
       FROM (
         SELECT a.tournament_id FROM umpire_applications a
         WHERE a.umpire_id = $1 AND a.status = 'approved'
         UNION
         SELECT tu.tournament_id FROM tournament_umpire_assignments tu
         WHERE tu.umpire_id = $1
       ) src
       JOIN tournaments t ON t.id = src.tournament_id
       LEFT JOIN categories c ON c.tournament_id = t.id
       LEFT JOIN matches m ON m.tournament_id = t.id
       GROUP BY t.id
       ORDER BY t.start_date DESC NULLS LAST`,
      [uid]
    );

    return NextResponse.json({ matches, rating, applications, invitations, openTournaments, myTournaments });
  } catch (err: any) {
    console.error("Umpire me error:", err);
    return NextResponse.json({ error: "Failed to load umpire data" }, { status: 500 });
  }
}
