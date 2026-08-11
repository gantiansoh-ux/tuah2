import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";
import {
  deriveGroups,
  computeGroupStandings,
  buildKOPairings,
} from "@/lib/groupStandings";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/tournaments/[id]/standings
// Per-category group standings (live, recomputed on every request) + knockout
// fill state for group_knockout categories. Public read (same rules as the
// tournament detail endpoint; draft tournaments are owner/admin only).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  try {
    const tournament = await queryOne(`SELECT * FROM tournaments WHERE id = $1`, [id]);
    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.status === "draft") {
      const cookie = req.cookies.get(getCookieName())?.value;
      const payload = cookie ? await verifyToken(cookie) : null;
      const isOwner =
        payload && (payload.userId === tournament.organizer_id || payload.role === "admin");
      if (!isOwner) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const categories = await queryAll(
      `SELECT * FROM categories WHERE tournament_id = $1 ORDER BY name`,
      [id]
    );

    const out: any[] = [];
    for (const cat of categories) {
      let config: any = null;
      if (cat.scoring_config) {
        config =
          typeof cat.scoring_config === "string"
            ? JSON.parse(cat.scoring_config)
            : cat.scoring_config;
      }
      const fmt = config?.format || null;
      if (fmt !== "group_knockout") {
        out.push({
          category_id: cat.id,
          category_name: cat.name,
          format: fmt,
          groups: [],
          ko: null,
        });
        continue;
      }

      const numGroups = config.numGroups || 4;
      const advance = config.advance ?? 2;

      const entries = await queryAll(
        `SELECT e.*, COALESCE(p1.full_name,'') AS player_1_name, COALESCE(p2.full_name,'') AS player_2_name
         FROM entries e
         LEFT JOIN profiles p1 ON e.player_1_id = p1.id
         LEFT JOIN profiles p2 ON e.player_2_id = p2.id
         WHERE e.category_id = $1
         AND (e.registration_status IS NULL OR e.registration_status != 'rejected')`,
        [cat.id]
      );
      const matches = await queryAll(
        `SELECT * FROM matches WHERE category_id = $1 ORDER BY match_number`,
        [cat.id]
      );
      const games = await queryAll(
        `SELECT g.* FROM games g JOIN matches m ON g.match_id = m.id
         WHERE m.category_id = $1 AND m.bracket_group LIKE 'group-%' ORDER BY g.match_id, g.game_number`,
        [cat.id]
      );
      const gamesByMatch = new Map<string, any[]>();
      for (const g of games) {
        const arr = gamesByMatch.get(g.match_id) || [];
        arr.push(g);
        gamesByMatch.set(g.match_id, arr);
      }

      const groupMatches = matches.filter((m: any) =>
        m.bracket_group?.startsWith("group-")
      );
      const koMatches = matches.filter((m: any) => m.bracket_group === "ko");

      const entryInfos = entries.map((e: any) => ({
        entry_id: e.id,
        seed: e.seed,
        withdrawn: e.status === "withdrawn",
        name: e.player_2_name
          ? `${e.player_1_name} / ${e.player_2_name}`
          : e.player_1_name || e.id.slice(0, 8),
      }));

      const derived = deriveGroups(entryInfos, numGroups, groupMatches);
      const withGames = groupMatches.map((m: any) => ({
        ...m,
        games: gamesByMatch.get(m.id) || [],
      }));
      const standings = computeGroupStandings(derived, withGames);

      const allGroupDone =
        groupMatches.length > 0 &&
        groupMatches.every((m: any) => m.status === "completed");
      const pairings = allGroupDone ? buildKOPairings(standings, advance) : [];

      const badges: Record<string, string> = {};
      for (const p of pairings) {
        if (p.e1) badges[p.e1.entry_id] = p.e1.label;
        if (p.e2) badges[p.e2.entry_id] = p.e2.label;
      }

      const koR1Count = koMatches.filter((m: any) => m.round_index === 0).length;
      const koFilled =
        allGroupDone && koMatches.some((m: any) => m.entry_1_id || m.entry_2_id);

      out.push({
        category_id: cat.id,
        category_name: cat.name,
        format: fmt,
        numGroups,
        advance,
        groups: standings,
        ko: {
          awaiting: !allGroupDone,
          filled: koFilled,
          pairings,
          badges,
          ko_matches: koMatches.length,
          ko_r1: koR1Count,
        },
      });
    }

    return NextResponse.json({ categories: out });
  } catch (err: any) {
    console.error("Standings error:", err);
    return NextResponse.json({ error: "Failed to load standings" }, { status: 500 });
  }
}
