import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { verifyToken, getCookieName } from "@/lib/auth";
import { queryAll } from "@/lib/db";

// Serve uploaded files directly from disk
// This is more reliable than relying on Next.js public/ serving for dynamically added files
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const pathSegments = (await params).path;
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // SEC-3A2-01b: documents/* are private. Require login + authorization
    // (the document's player, the tournament organizer, or an admin). Returns
    // 401 for anonymous and 403 for logged-in-but-not-authorized callers — NOT
    // 404, so an existing document is never confused with a missing file.
    // All other folders (avatars, posters, banners, logos, videos) stay public.
    if (pathSegments[0] === "documents") {
      const cookie = req.cookies.get(getCookieName())?.value;
      if (!cookie) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const payload = await verifyToken(cookie);
      if (!payload) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      // Find which entries reference this document. Authorized if the caller is
      // the player themselves (player_1_id/player_2_id), the tournament
      // organizer (entry -> category -> tournament), or an admin.
      const rel = pathSegments.join("/");
      const refs = [`/api/uploads/${rel}`, `/uploads/${rel}`, rel];
      const docRows = await queryAll(
        `SELECT e.id AS entry_id, e.player_1_id, e.player_2_id, t.organizer_id
         FROM entries e
         JOIN categories c ON c.id = e.category_id
         JOIN tournaments t ON t.id = c.tournament_id
         WHERE e.ic_document_url = ANY($1)
            OR e.passport_url = ANY($1)
            OR e.student_card_url = ANY($1)
         LIMIT 10`,
        [refs]
      );
      const authorized = docRows.some(
        (r: any) =>
          payload.role === "admin" ||
          r.player_1_id === payload.userId ||
          r.player_2_id === payload.userId ||
          r.organizer_id === payload.userId
      );
      if (!authorized) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Security: prevent path traversal
    const safePath = pathSegments.join(path.sep).replace(/\.\.\//g, "").replace(/\.\./g, "");
    const filePath = path.join(process.cwd(), "public", "uploads", safePath);

    // Validate file exists
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const buffer = await fs.readFile(filePath);

    // Determine MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".pdf": "application/pdf",
      ".svg": "image/svg+xml",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mov": "video/quicktime",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (err: any) {
    console.error("File serve error:", err);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
