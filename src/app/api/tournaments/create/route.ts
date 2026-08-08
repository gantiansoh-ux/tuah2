import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { getPool, queryOne } from "@/lib/db";

// BUG-001 fix (2026-08-03): gender 'open' passed through to categories.gender,
// violating categories_gender_check (male/female/mixed/any only) -> 500.
// Now: normalized (open->any) + whitelist validated (invalid -> 400, no 500).
// Also wrapped tournament+categories inserts in a transaction (no orphan tournaments).

const GENDER_MAP: Record<string, string> = {
  mens: "male",
  womens: "female",
  mixed: "mixed",
  open: "any",
  male: "male",
  female: "female",
  any: "any",
};

const VALID_GENDERS = Object.keys(GENDER_MAP);

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only organizers can create tournaments
  if (payload.role !== 'organizer') {
    return NextResponse.json({ error: "Only organizers can create tournaments" }, { status: 403 });
  }

  try {
    let body;
    try { body = await req.json(); } catch { body = {}; }

    // Debug: log body keys
    console.log("CREATE TOURNAMENT BODY:", JSON.stringify(body));

    // Support both camelCase and snake_case field names
    // Note: Next.js route handler JSON parsing is case-sensitive.
    // We extract both formats and use whichever is provided.
    
    const name = body.name || body.title || null;
    const description = body.description || null;
    const venue = body.venue || body.location || null;
    const location = body.location || body.venue || null;
    const venueLat = body.venue_lat || body.venueLat || body.lat || null;
    const venueLng = body.venue_lng || body.venueLng || body.lng || null;
    const startDate = body.startDate || body.start_date || null;
    const endDate = body.endDate || body.end_date || null;
    const regClose = body.regClose || body.registration_close || body.registrationDeadline || null;
    const regOpen = body.regOpen || body.registration_open || null;
    const status = body.status || "draft";
    const tournamentType = body.tournamentType || body.tournament_type || null;
    const posterUrl = body.posterUrl || body.poster_url || null;
    const bannerUrl = body.bannerUrl || body.banner_url || null;
    const logoUrl = body.logoUrl || body.logo_url || null;
    const rules = body.rules || null;
    const prize = body.prize || null;
    const entryFee = body.entryFee || body.entry_fee || 0;
    const categories = Array.isArray(body.categories) ? body.categories : [];

    console.log("PARSED FIELDS:", JSON.stringify({name, description, location, startDate, endDate, regClose, status}));

    if (!name) {
      return NextResponse.json({ error: "Tournament name/title is required", debug: { body } }, { status: 400 });
    }

    if (!tournamentType) {
      return NextResponse.json({ error: "Tournament type is required (e.g. open, knockout, round_robin)" }, { status: 400 });
    }

    // #48: validate against DB CHECK constraint to avoid 500 leak
    const validTypes = ['junior', 'open', 'school', 'corporate', 'veteran', 'team_event', 'league', 'knockout', 'round_robin', 'ladder', 'festival'];
    if (!validTypes.includes(tournamentType)) {
      return NextResponse.json({
        error: `Invalid tournament type. Must be one of: ${validTypes.join(', ')}`,
        status: 400,
      }, { status: 400 });
    }

    if (!startDate) {
      return NextResponse.json({ error: "startDate is required" }, { status: 400 });
    }

    if (!endDate) {
      return NextResponse.json({ error: "endDate is required" }, { status: 400 });
    }

    if (!status) {
      console.log("WARN: status is falsy, using 'draft'");
    }

    // BUG-001: validate + normalize category genders BEFORE any insert
    // (invalid gender -> 400, tournament not created -> no orphan)
    for (const rawCat of categories) {
      const cat = rawCat && typeof rawCat === "object" ? rawCat : null;
      if (!cat) continue;
      if (cat.gender && !VALID_GENDERS.includes(cat.gender)) {
        return NextResponse.json({
          error: `Invalid category gender: '${cat.gender}'. Must be one of: ${VALID_GENDERS.join(', ')}`,
        }, { status: 400 });
      }
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Create tournament
      const tResult = await client.query(
        `INSERT INTO tournaments (organizer_id, title, description, venue, venue_lat, venue_lng, start_date, end_date, registration_deadline, registration_open, status, tournament_type, poster_url, banner_url, logo_url, rules, prize, entry_fee)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         RETURNING *`,
        [payload.userId, name, description, venue, venueLat, venueLng, startDate, endDate, regClose, regOpen, status || "draft", tournamentType, posterUrl, bannerUrl, logoUrl, rules, prize, entryFee]
      );

      const tournament = tResult.rows[0];

      // Create categories (skip null/invalid entries instead of 500ing)
      if (categories && categories.length > 0) {
        for (const rawCat of categories) {
          const cat = rawCat && typeof rawCat === "object" ? rawCat : null;
          if (!cat) continue; // skip null/invalid category entries
          const genderLabel = cat.gender === "mens" ? "Men's" : cat.gender === "womens" ? "Women's" : cat.gender === "mixed" ? "Mixed" : "Open";
          const typeLabel = cat.type === "doubles" ? "Doubles" : "Singles";
          // Prefer explicit name; fall back to composed label, deduping consecutive repeats
          // (e.g. ageGroup 'Open' + gender 'any' fallback 'Open' -> "Open Open Singles")
          const catParts = [cat.ageGroup, genderLabel, typeLabel].filter(Boolean);
          const catName = (cat.name && cat.name.trim())
            ? cat.name.trim()
            : catParts.filter((p: string, i: number) => i === 0 || p !== catParts[i - 1]).join(" ");
          
          // BUG-001: normalize 'open' -> 'any' (and any other UI value) to DB-valid values
          const gender = GENDER_MAP[cat.gender] || "any";
          
          await client.query(
            `INSERT INTO categories (tournament_id, name, type, gender, scoring_config, max_entries)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              tournament.id,
              catName,
              cat.type === "doubles" ? "doubles" : "singles",
              gender,
              JSON.stringify({
                points_per_game: cat.points || 21,
                best_of: cat.bestOf || 3,
                deuce: cat.deuce !== false,
                deuce_cap: 30,
                serve_switch: 5,
              }),
              cat.type === "doubles" ? 32 : 64,
            ]
          );
        }
      }

      await client.query("COMMIT");
      return NextResponse.json({ tournament }, { status: 201 });
    } catch (txErr) {
      await client.query("ROLLBACK").catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Create tournament error:", err);
    return NextResponse.json({ error: "Failed to create tournament" }, { status: 500 });
  }
}
