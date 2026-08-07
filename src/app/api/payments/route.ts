import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getCookieName } from "@/lib/auth";
import { query, queryOne, queryAll } from "@/lib/db";

// POST /api/payments - Record a payment
// Requires auth: anonymous users must get 401, and a user can only
// record payment for their own entry (no paying on others' behalf).
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      entry_id,
      tournament_id,
      amount,
      payment_method,
      user_email,
      player_name,
    } = body;

    if (!entry_id) {
      return NextResponse.json({ error: "entry_id is required" }, { status: 400 });
    }
    if (!tournament_id) {
      return NextResponse.json({ error: "tournament_id is required" }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
    }
    if (!payment_method || !["fpx", "duitnow"].includes(payment_method)) {
      return NextResponse.json({ error: "payment_method must be 'fpx' or 'duitnow'" }, { status: 400 });
    }

    // Verify entry exists
    const entry = await queryOne("SELECT * FROM entries WHERE id = $1", [entry_id]);
    if (!entry) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    // Ownership check: entry must belong to the authenticated user
    // (player_1_id or player_2_id must match the logged-in profile)
    if (entry.player_1_id !== payload.userId && entry.player_2_id !== payload.userId) {
      return NextResponse.json({ error: "Not your entry" }, { status: 403 });
    }

    // Generate a payment reference
    const payment_reference = `TUAH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const user_id = payload.userId;

    // Create payment record
    const paymentResult = await query(
      `INSERT INTO payments (user_id, tournament_id, entry_id, amount, currency, payment_method, payment_reference, status, paid_at)
       VALUES ($1, $2, $3, $4, 'MYR', $5, $6, 'completed', NOW())
       RETURNING *`,
      [
        user_id,
        tournament_id,
        entry_id,
        amount,
        payment_method,
        payment_reference,
      ]
    );

    const payment = paymentResult.rows[0];

    // Update entry: payment_status='paid', payment_method, payment_reference
    await query(
      `UPDATE entries
       SET payment_status = 'paid',
           payment_method = $1,
           payment_reference = $2
       WHERE id = $3`,
      [payment_method, payment_reference, entry_id]
    );

    return NextResponse.json({
      success: true,
      payment,
      payment_reference,
    }, { status: 201 });
  } catch (err: any) {
    console.error("Payment creation error:", err);
    return NextResponse.json({ error: "Failed to process payment" }, { status: 500 });
  }
}

// GET /api/payments - List payments (optional, for organizer dashboard)
export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(getCookieName())?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await verifyToken(cookie);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const tournament_id = req.nextUrl.searchParams.get("tournament_id");
    const entry_id = req.nextUrl.searchParams.get("entry_id");

    let payments;
    if (entry_id) {
      payments = await queryAll(
        "SELECT * FROM payments WHERE entry_id = $1 ORDER BY created_at DESC",
        [entry_id]
      );
    } else if (tournament_id) {
      payments = await queryAll(
        "SELECT * FROM payments WHERE tournament_id = $1 ORDER BY created_at DESC",
        [tournament_id]
      );
    } else if (payload.role === "organizer") {
      // For organizers, get payments for their tournaments
      payments = await queryAll(
        `SELECT p.* FROM payments p
         JOIN tournaments t ON t.id = p.tournament_id
         WHERE t.organizer_id = $1
         ORDER BY p.created_at DESC`,
        [payload.userId]
      );
    } else {
      payments = await queryAll(
        "SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC",
        [payload.userId]
      );
    }

    return NextResponse.json({ payments });
  } catch (err: any) {
    console.error("List payments error:", err);
    return NextResponse.json({ error: "Failed to load payments" }, { status: 500 });
  }
}
