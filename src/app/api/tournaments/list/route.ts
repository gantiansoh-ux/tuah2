import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryAll } from "@/lib/db";

// GET /api/tournaments/list — organizer-scoped tournament list with
// search / status filter / pagination (P1-002, PLAN-P1-002-MINIMAL.md).
//
// Contract (additive, backward compatible):
//   search  : substring on LOWER(title) OR LOWER(venue), public parity
//   status  : comma-separated subset of
//             draft|published|registration|in_progress|completed|cancelled
//             (invalid values silently dropped; NO param = ALL statuses,
//             INCLUDING draft — organizer management view, NOT the public
//             registration semantics)
//   page    : int >= 1, default 1 (isFinite guard -> 1)
//   limit   : 1..50, default 12 (clamped)
// Response:
//   { tournaments, pagination:{page,limit,total,totalPages,hasMore},
//     status_counts }
//   status_counts = whole-org scope (only organizer_id filter; unaffected by
//   search/status/page) so dashboard stats stay stable while filtering.
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
    const { searchParams } = req.nextUrl;

    const search = (searchParams.get("search") || "").trim();
    const statusParam = (searchParams.get("status") || "").trim();

    const pageRaw = Number(searchParams.get("page"));
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

    const limitParam = searchParams.get("limit");
    const limitRaw = limitParam === null || limitParam === "" ? NaN : Number(limitParam);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 12;
    const offset = (page - 1) * limit;

    const VALID_STATUSES = ["draft", "published", "registration", "in_progress", "completed", "cancelled"];
    const statuses = statusParam
      .split(",")
      .map((s: string) => s.trim())
      .filter((s: string) => VALID_STATUSES.includes(s));

    // Dynamic WHERE builder (mirrors public route, parameterized)
    const conditions: string[] = [`organizer_id = $1`];
    const params: any[] = [payload.userId];
    let idx = 1;

    if (statuses.length > 0) {
      conditions.push(`status = ANY($${++idx})`);
      params.push(statuses);
    }

    if (search) {
      conditions.push(`(LOWER(title) LIKE $${++idx} OR LOWER(venue) LIKE $${++idx})`);
      const term = `%${search.toLowerCase()}%`;
      params.push(term, term);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Total (same filter scope)
    const countResult = await query(`SELECT COUNT(*) FROM tournaments ${whereClause}`, params);
    const total = parseInt(countResult.rows[0]?.count || "0");

    // Paginated rows — ordering unchanged (created_at DESC)
    const tournaments = await queryAll(
      `SELECT id, title, status, venue, start_date, end_date, tournament_type, poster_url, banner_url, logo_url, entry_fee, created_at
       FROM tournaments ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${++idx} OFFSET $${++idx}`,
      [...params, limit, offset]
    );

    // status_counts — whole-org scope only (organizer_id), independent of search/status/page
    const countsResult = await query(
      `SELECT status, COUNT(*)::int AS count FROM tournaments WHERE organizer_id = $1 GROUP BY status`,
      [payload.userId]
    );
    const status_counts: Record<string, number> = {};
    for (const row of countsResult.rows) {
      status_counts[row.status] = Number(row.count);
    }

    return NextResponse.json({
      tournaments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: offset + limit < total,
      },
      status_counts,
    });
  } catch (err: any) {
    console.error("List tournaments error:", err);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}
