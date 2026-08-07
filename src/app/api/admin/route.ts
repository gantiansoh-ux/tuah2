import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne, queryAll } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // Verify auth
    const cookie = req.cookies.get(getCookieName())?.value;
    if (!cookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = await verifyToken(cookie);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (token.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "profiles";

    if (action === "profiles") {
      const search = url.searchParams.get("search")?.trim() || "";
      const role = url.searchParams.get("role")?.trim() || "";
      const limit = parseInt(url.searchParams.get("limit") || "1000");

      let sql = `SELECT id, email, full_name, role, phone, nickname, country, state, city,
                        gender, date_of_birth, club, rank, school, occupation, bio,
                        created_at, updated_at
                 FROM profiles`;
      const conds: string[] = [];
      const params: any[] = [];

      if (search) {
        conds.push(`(LOWER(full_name) LIKE $${params.length + 1} OR LOWER(email) LIKE $${params.length + 1} OR LOWER(COALESCE(phone,'')) LIKE $${params.length + 1} OR LOWER(COALESCE(city,'')) LIKE $${params.length + 1})`);
        params.push(`%${search.toLowerCase()}%`);
      }
      if (role) {
        conds.push(`role = $${params.length + 1}`);
        params.push(role);
      }
      if (conds.length) {
        sql += " WHERE " + conds.join(" AND ");
      }
      sql += " ORDER BY created_at DESC LIMIT " + limit;

      const profiles = await queryAll(sql, params);
      return NextResponse.json({ profiles, total: profiles.length });
    }

    if (action === "profile_detail") {
      const id = url.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      const profile = await queryOne(
        `SELECT * FROM profiles WHERE id = $1`, [id]
      );
      if (!profile) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }

      // Fetch role-specific details
      let roleDetail = null;
      if (profile.role === "player") {
        roleDetail = await queryOne(
          `SELECT * FROM player_profiles WHERE profile_id = $1`, [id]
        );
      } else if (profile.role === "organizer") {
        roleDetail = await queryOne(
          `SELECT * FROM organizer_profiles WHERE profile_id = $1`, [id]
        );
      } else if (profile.role === "umpire") {
        roleDetail = await queryOne(
          `SELECT * FROM umpire_profiles WHERE profile_id = $1`, [id]
        );
      } else if (profile.role === "coach") {
        roleDetail = await queryOne(
          `SELECT * FROM coach_profiles WHERE profile_id = $1`, [id]
        );
      } else if (profile.role === "court_owner") {
        roleDetail = await queryOne(
          `SELECT * FROM court_profiles WHERE owner_id = $1`, [id]
        );
      }

      // Count user's entries / registrations
      const entryCount = await queryOne(
        `SELECT COUNT(*) as count FROM entries WHERE player_1_id = $1 OR player_2_id = $1`, [id]
      );
      const tournamentCount = await queryOne(
        `SELECT COUNT(*) as count FROM tournaments WHERE organizer_id = $1`, [id]
      );

      return NextResponse.json({
        profile,
        role_detail: roleDetail,
        stats: {
          entries: parseInt(entryCount?.count || "0"),
          tournaments: parseInt(tournamentCount?.count || "0"),
        },
      });
    }

    if (action === "export") {
      // Full export for CSV: all profiles + role tables
      const profiles = await queryAll(
        `SELECT id, email, full_name, role, phone, nickname, country, state, city,
                gender, date_of_birth, club, rank, school, occupation, bio,
                playing_hand, website, created_at, updated_at
         FROM profiles ORDER BY created_at DESC`
      );
      // Attach role detail for each (limit to avoid N+1 blowup: batch fetch)
      const playerIds = profiles.filter(p => p.role === "player").map(p => p.id);
      const orgIds = profiles.filter(p => p.role === "organizer").map(p => p.id);
      const umpIds = profiles.filter(p => p.role === "umpire").map(p => p.id);
      const coachIds = profiles.filter(p => p.role === "coach").map(p => p.id);
      const courtIds = profiles.filter(p => p.role === "court_owner").map(p => p.id);

      const roleMap: Record<string, any> = {};
      if (playerIds.length) {
        const rows = await queryAll(`SELECT * FROM player_profiles WHERE profile_id = ANY($1)`, [playerIds]);
        rows.forEach(r => roleMap[r.profile_id] = { type: "player", ...r });
      }
      if (orgIds.length) {
        const rows = await queryAll(`SELECT * FROM organizer_profiles WHERE profile_id = ANY($1)`, [orgIds]);
        rows.forEach(r => roleMap[r.profile_id] = { type: "organizer", ...r });
      }
      if (umpIds.length) {
        const rows = await queryAll(`SELECT * FROM umpire_profiles WHERE profile_id = ANY($1)`, [umpIds]);
        rows.forEach(r => roleMap[r.profile_id] = { type: "umpire", ...r });
      }
      if (coachIds.length) {
        const rows = await queryAll(`SELECT * FROM coach_profiles WHERE profile_id = ANY($1)`, [coachIds]);
        rows.forEach(r => roleMap[r.profile_id] = { type: "coach", ...r });
      }
      if (courtIds.length) {
        const rows = await queryAll(`SELECT * FROM court_profiles WHERE owner_id = ANY($1)`, [courtIds]);
        rows.forEach(r => roleMap[r.owner_id] = { type: "court_owner", ...r });
      }

      return NextResponse.json({ profiles, role_map: roleMap });
    }

    if (action === "tournament_detail") {
      const id = url.searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      const tournament = await queryOne(
        `SELECT t.*, p.full_name AS organizer_name, p.email AS organizer_email
         FROM tournaments t
         LEFT JOIN profiles p ON t.organizer_id = p.id
         WHERE t.id = $1`, [id]
      );
      if (!tournament) {
        return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
      }

      // Categories with entry counts
      const categories = await queryAll(
        `SELECT c.id, c.name, c.scoring_config, COUNT(e.id) AS entry_count
         FROM categories c
         LEFT JOIN entries e ON e.category_id = c.id
         WHERE c.tournament_id = $1
         GROUP BY c.id ORDER BY c.name`, [id]
      );

      // Entries with player names (singles: player_1; doubles: player_1+player_2)
      // entries has no tournament_id - join through categories
      const entries = await queryAll(
        `SELECT e.id, e.category_id, e.status, e.seed,
                p1.full_name AS player1_name, p1.email AS player1_email,
                p2.full_name AS player2_name, p2.email AS player2_email
         FROM entries e
         JOIN categories c ON e.category_id = c.id
         LEFT JOIN profiles p1 ON e.player_1_id = p1.id
         LEFT JOIN profiles p2 ON e.player_2_id = p2.id
         WHERE c.tournament_id = $1
         ORDER BY e.created_at DESC`, [id]
      );

      // Match stats
      const matchStats = await queryOne(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'completed') AS completed
         FROM matches WHERE tournament_id = $1`, [id]
      );

      return NextResponse.json({
        tournament,
        categories,
        entries,
        match_stats: {
          total: parseInt(matchStats?.total || "0"),
          completed: parseInt(matchStats?.completed || "0"),
        },
      });
    }

    if (action === "tournaments") {
      const tournaments = await queryAll(
        `SELECT t.id, t.title, t.status, t.created_at, p.full_name AS organizer_name
         FROM tournaments t 
         LEFT JOIN profiles p ON t.organizer_id = p.id
         ORDER BY t.created_at DESC`
      );
      return NextResponse.json({ tournaments });
    }

    if (action === "stats") {
      const profileCount = await queryOne("SELECT COUNT(*) as count FROM profiles");
      const tournamentCount = await queryOne("SELECT COUNT(*) as count FROM tournaments");
      const matchCount = await queryOne("SELECT COUNT(*) as count FROM matches");
      const entryCount = await queryOne("SELECT COUNT(*) as count FROM entries");
      return NextResponse.json({
        stats: {
          profiles: parseInt(profileCount?.count || "0"),
          tournaments: parseInt(tournamentCount?.count || "0"),
          matches: parseInt(matchCount?.count || "0"),
          entries: parseInt(entryCount?.count || "0"),
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("Admin API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
