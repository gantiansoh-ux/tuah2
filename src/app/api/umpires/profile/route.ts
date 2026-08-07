import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

// GET /api/umpires/profile - current umpire's profile & availability
// PATCH /api/umpires/profile - update rate, availability, certification, etc.
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let up = await queryOne("SELECT * FROM umpire_profiles WHERE profile_id = $1", [payload.userId]);
    if (!up) {
      // Create a default row so the profile page always has something to edit
      const ins = await query(
        `INSERT INTO umpire_profiles (profile_id, certification, license_number, experience_years, matches_controlled, accuracy_rating, availability, languages, bio)
         VALUES ($1, '', '', 0, 0, 0, '{}'::jsonb, '{}'::text[], '')
         RETURNING *`,
        [payload.userId]
      );
      up = ins.rows[0];
    }

    const profile = await queryOne(
      "SELECT id, email, full_name, phone, avatar_url, roles FROM profiles WHERE id = $1",
      [payload.userId]
    );

    return NextResponse.json({ profile: { ...profile, umpire_profile: up } });
  } catch (err: any) {
    console.error("Umpire profile GET error:", err);
    return NextResponse.json({ error: "Failed to load umpire profile" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Ensure row exists
    const existing = await queryOne("SELECT id FROM umpire_profiles WHERE profile_id = $1", [payload.userId]);
    if (!existing) {
      await query(
        `INSERT INTO umpire_profiles (profile_id, certification, license_number, experience_years, matches_controlled, accuracy_rating, availability, languages, bio)
         VALUES ($1, '', '', 0, 0, 0, '{}'::jsonb, '{}'::text[], '')`,
        [payload.userId]
      );
    }

    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const upd = (col: string, val: any, transform?: (v: any) => any) => {
      if (val === undefined) return;
      sets.push(`${col} = $${idx}`);
      values.push(transform ? transform(val) : val);
      idx++;
    };

    upd("certification", body.certification);
    upd("license_number", body.license_number);
    upd("experience_years", body.experience_years, (v) => parseInt(v, 10) || 0);
    upd("bio", body.bio);
    upd("languages", body.languages, (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",").map((s: string) => s.trim()).filter(Boolean) : []));
    upd("availability", body.availability, (v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : "{}"));

    if (sets.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    values.push(payload.userId);
    const result = await query(
      `UPDATE umpire_profiles SET ${sets.join(", ")} WHERE profile_id = $${idx} RETURNING *`,
      values
    );

    return NextResponse.json({ umpire_profile: result.rows[0], success: true });
  } catch (err: any) {
    console.error("Umpire profile PATCH error:", err);
    return NextResponse.json({ error: "Failed to update umpire profile" }, { status: 500 });
  }
}
