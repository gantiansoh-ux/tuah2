import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

// ---- Configuration ----
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB default (images/docs)
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB for videos

const ALLOWED_FOLDERS = new Set([
  "avatars",
  "posters",
  "banners",
  "logos",
  "documents",
  "videos",
]);

const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  images: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  documents: ["application/pdf"],
  videos: ["video/mp4", "video/webm", "video/quicktime"],
};

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  images: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
  documents: [".pdf"],
  videos: [".mp4", ".webm", ".mov"],
};

// ---- Helpers ----

function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

function getAllowedExtensions(folder: string): string[] {
  if (folder === "documents") return ALLOWED_EXTENSIONS.documents;
  if (folder === "videos") return ALLOWED_EXTENSIONS.videos;
  return ALLOWED_EXTENSIONS.images;
}

function getAllowedMimeTypes(folder: string): string[] {
  if (folder === "documents") return ALLOWED_MIME_TYPES.documents;
  if (folder === "videos") return ALLOWED_MIME_TYPES.videos;
  return ALLOWED_MIME_TYPES.images;
}

function getMaxSize(folder: string): number {
  return folder === "videos" ? MAX_VIDEO_SIZE : MAX_FILE_SIZE;
}

// ---- Route ----

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication
    const cookie = req.cookies.get(getCookieName())?.value;
    if (!cookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(cookie);
    if (!payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse multipart form data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data. Expected multipart/form-data." },
        { status: 400 }
      );
    }

    const fileField = formData.get("file");
    const folderField = formData.get("folder");

    // 3. Validate file exists
    if (!fileField || !(fileField instanceof File)) {
      return NextResponse.json(
        { error: "File is required. Send as form field 'file'." },
        { status: 400 }
      );
    }

    const file = fileField as File;

    // 4. Validate folder
    const folder = typeof folderField === "string" ? folderField.trim() : "documents";
    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json(
        {
          error: `Invalid folder '${folder}'. Allowed: ${Array.from(ALLOWED_FOLDERS).join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 5. Validate file size (videos get a larger cap)
    const maxSize = getMaxSize(folder);
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${maxSize / 1024 / 1024} MB for folder '${folder}'.`,
          size: file.size,
          maxSize,
        },
        { status: 413 }
      );
    }

    // 6. Validate file type (check content-type AND extension)
    const fileExt = path.extname(file.name).toLowerCase();
    const allowedExts = getAllowedExtensions(folder);
    const allowedMimes = getAllowedMimeTypes(folder);

    if (!allowedExts.includes(fileExt)) {
      return NextResponse.json(
        {
          error: `File type '${fileExt}' not allowed for folder '${folder}'. Allowed: ${allowedExts.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!allowedMimes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `MIME type '${file.type}' not allowed for folder '${folder}'. Allowed: ${allowedMimes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // 7. Generate safe filename and determine save path
    const safeFilename = generateFilename(file.name);
    const uploadsDir = path.join(process.cwd(), "public", "uploads", folder);
    const filePath = path.join(uploadsDir, safeFilename);

    // 8. Ensure upload directory exists
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (err: any) {
      console.error("Upload dir creation error:", err);
      return NextResponse.json(
        { error: "Failed to create upload directory." },
        { status: 500 }
      );
    }

    // 9. Write file to disk
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);
    } catch (err: any) {
      console.error("File write error:", err);
      return NextResponse.json(
        { error: "Failed to save uploaded file." },
        { status: 500 }
      );
    }

    // 10. Return the URL path (use API serve route for reliability)
    const urlPath = `/api/uploads/${folder}/${safeFilename}`;

    return NextResponse.json(
      {
        success: true,
        url: urlPath,
        filename: safeFilename,
        folder,
        size: file.size,
        originalName: file.name,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Internal server error during file upload." },
      { status: 500 }
    );
  }
}
