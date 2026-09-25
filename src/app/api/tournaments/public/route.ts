import { NextRequest, NextResponse } from "next/server";
import { queryAll, query } from "@/lib/db";

// GET /api/tournaments/public - Public tournament listing with pagination + filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "12")));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 0;

    // Only show active + completed tournaments to the public
    const allowedStatuses = ["registration", "published", "in_progress", "live", "completed"];
    conditions.push(`status = ANY($${++idx})`);
    params.push(allowedStatuses);

    // PRODUCT-READINESS-1: keep obvious internal test/fixture tournaments out of the
    // PUBLIC listing. Reversible, read-only filter (no data/schema change). Remove a
    // pattern or a domain to re-expose instantly.
    const TEST_TITLE_PATTERNS = [
      "^(AUDIT-[A-Z]|DE-|SW[0-9]|SWDBG|DBG-|TZ-|AliasV|GrpV|OpenV|KO[0-9]|RR[0-9]|Mixed_|Draft_|Final E2E|Final Updated|Updated Title|UI Test|Deadline-|T35-|[0-9]*P_|[0-9]*MT_|DBL_|[0-9]*KO_|[0-9]*RR_)",
      "^(CEO|UMP1|OwnCheck|PR Review)",
      "(real journey test|e2e cup|real e2e)",
    ];
    conditions.push(`NOT (${TEST_TITLE_PATTERNS.map(() => `title ~* $${++idx}`).join(" OR ")})`);
    TEST_TITLE_PATTERNS.forEach((p) => params.push(p));

    // Also exclude internal test-account owners from the public listing.
    conditions.push(
      `(organizer_id IS NULL OR organizer_id NOT IN (
         SELECT id FROM profiles
         WHERE email ILIKE '%@tuah.test' OR email ILIKE '%@test.tuah'
            OR email ILIKE '%@tuahdemo.com' OR email ILIKE '%@t.test'
            OR email ILIKE '%@tuah.com' OR email ILIKE '%@example.com'
       ))`
    );

    if (type) {
      conditions.push(`tournament_type = $${++idx}`);
      params.push(type);
    }

    if (status) {
      const statuses = status.split(',').map((st: string) => st.trim()).filter((st: string) => allowedStatuses.includes(st));
      if (statuses.length > 0) {
        conditions.push(`status = ANY($${++idx})`);
        params.push(statuses);
      }
    }

    if (search) {
      conditions.push(`(LOWER(title) LIKE $${++idx} OR LOWER(venue) LIKE $${++idx})`);
      const searchTerm = `%${search.toLowerCase()}%`;
      params.push(searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) FROM tournaments ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count || "0");

    // Get paginated results
    const tournaments = await queryAll(
      `SELECT id, title, tournament_type, poster_url, venue, start_date, end_date, entry_fee, prize, status, description
       FROM tournaments ${whereClause}
       ORDER BY start_date DESC NULLS LAST, created_at DESC
       LIMIT $${++idx} OFFSET $${++idx}`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      tournaments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
    });
  } catch (err: any) {
    console.error("Public tournament list error:", err);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}
