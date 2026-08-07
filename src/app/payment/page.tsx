"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

// Wrapper to handle suspense boundary for useSearchParams
function PaymentContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const entry_id = searchParams.get("entry_id");
  const amount = searchParams.get("amount");
  const tournament_id = searchParams.get("tournament_id");
  const tournament_name = searchParams.get("tournament_name") || "Tournament";

  const [tournament, setTournament] = useState<any>(null);
  const [entry, setEntry] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<"fpx" | "duitnow" | null>(null);
  const [selectedBank, setSelectedBank] = useState("");
  const [processing, setProcessing] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [paymentRef, setPaymentRef] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const banks = [
    "Maybank",
    "CIMB Bank",
    "Public Bank",
    "RHB Bank",
    "Hong Leong Bank",
    "Bank Islam",
    "AmBank",
    "Affin Bank",
    "Alliance Bank",
    "Bank Muamalat",
  ];

  const feeAmount = amount ? parseFloat(amount) : 0;

  useEffect(() => {
    if (!entry_id || !tournament_id) return;
    loadData();
  }, [entry_id, tournament_id]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournament_id}`);
      if (res.ok) {
        const data = await res.json();
        setTournament(data.tournament);
      }
    } catch (err) {
      console.error("Load error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment() {
    if (!paymentMethod) {
      setError("Please select a payment method");
      return;
    }
    if (paymentMethod === "fpx" && !selectedBank) {
      setError("Please select your bank");
      return;
    }

    setProcessing(true);
    setError("");

    // Mock 2-second processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id,
          tournament_id,
          amount: feeAmount,
          payment_method: paymentMethod,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPaymentRef(data.payment_reference || "");
        setCompleted(true);
      } else {
        const err = await res.json();
        setError(err.error || "Payment failed. Please try again.");
      }
    } catch {
      setError("Payment failed. Please try again.");
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!entry_id || !amount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">🔗</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h2>
          <p className="text-gray-500 mb-4">This payment link is invalid or expired.</p>
          <Link href="/" className="text-emerald-700 hover:underline font-medium">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">Payment Successful!</h1>
            <p className="text-gray-500 mb-6">Your registration payment has been processed.</p>

            <div className="bg-emerald-50 rounded-2xl p-6 mb-6 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Tournament</span>
                <span className="text-sm font-medium text-gray-900">
                  {tournament_name || tournament?.title || tournament?.name || "Tournament"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Amount Paid</span>
                <span className="text-sm font-bold text-emerald-700">RM {feeAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Payment Method</span>
                <span className="text-sm font-medium text-gray-900">
                  {paymentMethod === "fpx" ? `FPX - ${selectedBank}` : "DuitNow QR"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Reference</span>
                <span className="text-sm font-mono text-gray-900">{paymentRef || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Date</span>
                <span className="text-sm text-gray-900">{new Date().toLocaleDateString()}</span>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href={`/tournament/${tournament_id}`}
                className="block w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-600"
              >
                Back to Tournament
              </Link>
              <button
                onClick={() => window.print()}
                className="w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50"
              >
                🖨️ Print Receipt
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <Link href={`/tournament/${tournament_id}`} className="text-sm text-emerald-700 hover:underline mb-6 inline-block">
          ← Back to Tournament
        </Link>

        <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100">
          <h1 className="text-2xl font-black text-gray-900 mb-1">Complete Payment</h1>
          <p className="text-gray-500 text-sm mb-6">
            Register for <strong>{tournament_name || tournament?.title || tournament?.name || "Tournament"}</strong>
          </p>

          {/* Amount Summary */}
          <div className="bg-gray-50 rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">Entry Fee</span>
              <span className="text-lg font-bold text-gray-900">RM {feeAmount.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 mt-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-xl font-black text-emerald-700">RM {feeAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Payment Method Selection */}
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Select Payment Method</h2>
            <div className="space-y-3">
              {/* FPX Option */}
              <button
                onClick={() => { setPaymentMethod("fpx"); setError(""); }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  paymentMethod === "fpx"
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === "fpx" ? "border-emerald-500" : "border-gray-300"
                  }`}>
                    {paymentMethod === "fpx" && <div className="w-3 h-3 rounded-full bg-emerald-500" />}
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">FPX Online Banking</span>
                    <p className="text-xs text-gray-400 mt-0.5">Pay via your online banking account</p>
                  </div>
                </div>
              </button>

              {/* FPX Bank Selection */}
              {paymentMethod === "fpx" && (
                <div className="pl-8">
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Select your bank...</option>
                    {banks.map((bank) => (
                      <option key={bank} value={bank}>{bank}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* DuitNow Option */}
              <button
                onClick={() => { setPaymentMethod("duitnow"); setError(""); }}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  paymentMethod === "duitnow"
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    paymentMethod === "duitnow" ? "border-emerald-500" : "border-gray-300"
                  }`}>
                    {paymentMethod === "duitnow" && <div className="w-3 h-3 rounded-full bg-emerald-500" />}
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">DuitNow QR</span>
                    <p className="text-xs text-gray-400 mt-0.5">Scan QR with any banking app</p>
                  </div>
                </div>
              </button>

              {/* DuitNow QR Placeholder */}
              {paymentMethod === "duitnow" && (
                <div className="pl-8">
                  <div className="bg-gray-50 rounded-2xl p-6 text-center border-2 border-dashed border-gray-200">
                    <div className="w-36 h-36 mx-auto bg-white rounded-xl flex items-center justify-center border border-gray-200 mb-3">
                      <div className="text-center">
                        <div className="text-5xl mb-2">📱</div>
                        <div className="text-xs text-gray-400">QR Placeholder</div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      Scan this QR code with your banking app (Maybank, Touch n Go, GrabPay, etc.)
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                      In production, a real DuitNow QR will be displayed here
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 mb-4">
              {error}
            </div>
          )}

          {/* Pay Button */}
          <button
            onClick={handlePayment}
            disabled={processing || !paymentMethod || (paymentMethod === "fpx" && !selectedBank)}
            className="w-full bg-emerald-700 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {processing ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                Processing...
              </span>
            ) : (
              `Pay RM ${feeAmount.toFixed(2)}`
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-4">
            🔒 This is a mock payment page. No real payment will be processed.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    }>
      <PaymentContent />
    </Suspense>
  );
}
