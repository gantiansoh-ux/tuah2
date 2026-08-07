import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Serve uploaded files directly from disk
// This is more reliable than relying on Next.js public/ serving for dynamically added files
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const pathSegments = (await params).path;
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
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
