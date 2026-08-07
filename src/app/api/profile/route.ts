import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryOne } from "@/lib/db";

// Columns allowed for update (must match profiles table)
const ALLOWED_COLUMNS = new Set([
  "full_name",
  "nickname",
  "phone",
  "avatar_url",
  "country",
  "state",
  "city",
  "gender",
  "date_of_birth",
  "playing_hand",
  "club",
  "school",
  "occupation",
  "social_media",
  "website",
  "showcase_video_url",
]);

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
    const profile = await queryOne(
      `SELECT id, email, full_name, nickname, phone, avatar_url,
              country, state, city, gender, date_of_birth,
              playing_hand, club, school, occupation,
              social_media, website, showcase_video_url, roles, created_at
       FROM profiles
       WHERE id = $1`,
      [payload.userId]
    );

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile });
  } catch (err: any) {
    console.error("Profile GET error:", err);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await verifyToken(cookie);
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: Record<string, any>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Filter only allowed columns that were actually provided
    const updates: Record<string, any> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED_COLUMNS.has(key)) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update. Allowed: " + Array.from(ALLOWED_COLUMNS).join(", ") },
        { status: 400 }
      );
    }

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [column, value] of Object.entries(updates)) {
      setClauses.push(`${column} = $${paramIndex}`);
      // Handle social_media JSONB properly
      if (column === "social_media" && typeof value === "object" && value !== null) {
        values.push(JSON.stringify(value));
      } else {
        values.push(value ?? null);
      }
      paramIndex++;
    }

    values.push(payload.userId);

    const result = await queryOne(
      `UPDATE profiles
       SET ${setClauses.join(", ")}
       WHERE id = $${paramIndex}
       RETURNING id, email, full_name, nickname, phone, avatar_url,
                  country, state, city, gender, date_of_birth,
                  playing_hand, club, school, occupation,
                  social_media, website, showcase_video_url, roles, created_at`,
      values
    );

    if (!result) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json({ profile: result, success: true });
  } catch (err: any) {
    console.error("Profile POST error:", err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

// PATCH /api/profile - alias of POST (RESTful update)
export async function PATCH(req: NextRequest) {
  return POST(req);
}
