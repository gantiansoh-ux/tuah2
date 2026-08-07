import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query } from "@/lib/db";

// DELETE /api/categories/[id] - delete a category
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    // Verify ownership via tournament
    const check = await query(
      `SELECT c.id FROM categories c
       JOIN tournaments t ON t.id = c.tournament_id
       WHERE c.id = $1 AND t.organizer_id = $2`,
      [id, payload.userId]
    );
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Category not found or not owned by you" }, { status: 403 });
    }

    // Delete the category (entries cascade via FK)
    await query("DELETE FROM categories WHERE id = $1", [id]);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Delete category error:", err);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
