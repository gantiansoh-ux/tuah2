import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";

// GET /api/public/profile/[id] - public player profile (no auth)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return Response.json({ error: "Profile id required" }, { status: 400 });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    const profile = await queryOne(
      `SELECT p.id, p.full_name, p.nickname, p.avatar_url, p.club, p.rank,
              p.bio, p.country, p.state, p.city, p.showcase_video_url,
              p.playing_hand, p.gender,
              pp.ranking AS player_ranking,
              (SELECT COUNT(*) FROM entries e WHERE e.player_1_id = p.id OR e.player_2_id = p.id) AS tournament_count
       FROM profiles p
       LEFT JOIN player_profiles pp ON pp.profile_id = p.id
       WHERE p.id = $1`,
      [id]
    );

    if (!profile) {
      return Response.json({ error: "Profile not found" }, { status: 404 });
    }

    // Never expose email/phone/hash on a public endpoint
    return Response.json({ profile });
  } catch (err: any) {
    console.error("Public profile GET error:", err);
    return Response.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
