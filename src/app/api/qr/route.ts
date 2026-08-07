import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// GET /api/qr?url=<encoded>&size=256&fg=111827&bg=ffffff
// Returns a QR code PNG for the given URL (used for audience portal QR access).
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  if (!url) {
    return NextResponse.json({ error: "url param is required" }, { status: 400 });
  }
  // Only allow http(s) URLs to avoid SSRF-ish weirdness in an image generator
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  const size = Math.min(1024, Math.max(128, parseInt(req.nextUrl.searchParams.get("size") || "320", 10) || 320));
  const fg = req.nextUrl.searchParams.get("fg") || "111827";
  const bg = req.nextUrl.searchParams.get("bg") || "ffffff";

  try {
    const png = await QRCode.toBuffer(url, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: `#${fg}`, light: `#${bg}` },
    });
    return new NextResponse(png, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
      },
    });
  } catch (e: any) {
    console.error("QR generation error:", e);
    return NextResponse.json({ error: "Failed to generate QR" }, { status: 500 });
  }
}
