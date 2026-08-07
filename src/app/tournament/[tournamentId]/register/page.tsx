"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function TournamentRegisterPage() {
  const params = useParams();
  const router = useRouter();
  const tournamentId = params.tournamentId as string;

  const [tournament, setTournament] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [entryResult, setEntryResult] = useState<any>(null);

  // Form state
  const [playerName, setPlayerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [partnerName, setPartnerName] = useState("");
  const [icDocumentUrl, setIcDocumentUrl] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [studentCardUrl, setStudentCardUrl] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);

  // Selected category type (to conditionally show partner name)
  const [selectedCategory, setSelectedCategory] = useState<any>(null);

  useEffect(() => {
    if (tournamentId) loadTournament();
  }, [tournamentId]);

  useEffect(() => {
    if (categoryId) {
      const cat = categories.find((c: any) => c.id === categoryId);
      setSelectedCategory(cat || null);
    } else {
      setSelectedCategory(null);
    }
  }, [categoryId, categories]);

  async function loadTournament() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Tournament not found");
        } else {
          setError("Failed to load tournament");
        }
        return;
      }
      const data = await res.json();
      setTournament(data.tournament);
      setCategories(data.categories || []);
    } catch (err) {
      console.error("Load error:", err);
      setError("Failed to load tournament details");
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file: File, type: string): Promise<string> {
    if (!file) return "";

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`${type}: Only JPG, PNG, WebP, and PDF files are allowed`);
    }

    // Validate file size (10 MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(`${type}: File too large (max 10 MB)`);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", "documents");

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || `${type} upload failed`);
    }

    const data = await res.json();
    return data.url || "";
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, field: string) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(field);
    try {
      const url = await uploadFile(file, field);
      switch (field) {
        case "ic":
          setIcDocumentUrl(url);
          break;
        case "passport":
          setPassportUrl(url);
          break;
        case "studentCard":
          setStudentCardUrl(url);
          break;
      }
    } catch (err: any) {
      alert(err.message || "Upload failed");
    } finally {
      setUploading(null);
      // Clear the input so re-uploading the same file triggers change
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!playerName.trim()) { setError("Full Name is required"); return; }
    if (!email.trim()) { setError("Email is required"); return; }
    if (!categoryId) { setError("Please select a category"); return; }

    if (selectedCategory?.type === "doubles" && !partnerName.trim()) {
      setError("Partner name is required for doubles");
      return;
    }

    // Check if school tournament requires student card
    if (tournament?.tournament_type === "school" && !studentCardUrl) {
      setError("Student card is required for school tournaments");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/public_registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          category_id: categoryId,
          player_name: playerName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          partner_name: partnerName.trim() || null,
          ic_document_url: icDocumentUrl || null,
          passport_url: passportUrl || null,
          student_card_url: studentCardUrl || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setSubmitting(false);
        return;
      }

      setEntryResult(data);
      setSuccess(true);
    } catch (err) {
      console.error("Registration error:", err);
      setError("Failed to submit registration. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // ── Error State ──
  if (error && !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Unable to Load</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <Link href="/" className="text-emerald-700 hover:underline font-medium">
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  // ── Success State ──
  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto px-4 py-12">
          <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">Registration Submitted!</h1>
            <p className="text-gray-500 mb-6">
              Your registration for <strong>{tournament?.title || tournament?.name}</strong> has been submitted successfully.
            </p>

            <div className="bg-emerald-50 rounded-2xl p-6 mb-6 text-left space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Player</span>
                <span className="text-sm font-medium text-gray-900">{playerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Email</span>
                <span className="text-sm text-gray-900">{email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Category</span>
                <span className="text-sm font-medium text-gray-900">
                  {categories.find((c: any) => c.id === categoryId)?.name || "—"}
                </span>
              </div>
              {partnerName && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Partner</span>
                  <span className="text-sm text-gray-900">{partnerName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Status</span>
                <span className="text-sm px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">
                  Pending Approval
                </span>
              </div>
              {tournament?.entry_fee > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Entry Fee</span>
                  <span className="text-sm font-bold text-emerald-700">
                    RM {parseFloat(tournament.entry_fee || 0).toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-t border-emerald-200 pt-3 mt-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-500">Registration ID</span>
                  <span className="text-xs font-mono text-gray-900">{entryResult?.entry?.id?.slice(0, 8)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {tournament?.entry_fee > 0 && entryResult?.entry?.id && (
                <Link
                  href={`/payment?entry_id=${entryResult.entry.id}&amount=${tournament.entry_fee}&tournament_id=${tournamentId}&tournament_name=${encodeURIComponent(tournament?.title || tournament?.name || "Tournament")}`}
                  className="block w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-600"
                >
                  💳 Proceed to Payment (RM {parseFloat(tournament.entry_fee || 0).toFixed(2)})
                </Link>
              )}
              <Link
                href={`/tournament/${tournamentId}`}
                className="block w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50"
              >
                Back to Tournament
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty State (no categories) ──
  if (categories.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-lg mx-auto px-4 py-12">
          <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Categories Available</h2>
            <p className="text-gray-500 mb-4">
              This tournament doesn&apos;t have any categories yet. Registration is not available at this time.
            </p>
            <Link
              href={`/tournament/${tournamentId}`}
              className="inline-block bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-600"
            >
              Back to Tournament
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration Form ──
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href={`/tournament/${tournamentId}`}
          className="text-sm text-emerald-700 hover:underline mb-6 inline-block"
        >
          ← Back to Tournament
        </Link>

        {/* Tournament Info Banner */}
        <div className="bg-gradient-to-r from-emerald-900 to-emerald-800 text-white rounded-3xl p-6 mb-8">
          <div className="flex items-start gap-4">
            {tournament?.poster_url && (
              <img
                src={tournament.poster_url}
                alt={tournament.title || tournament.name}
                className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-black">{tournament?.title || tournament?.name || "Tournament"}</h1>
              <div className="flex flex-wrap gap-2 mt-2 text-emerald-200 text-sm">
                {tournament?.tournament_type && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-700/50 text-xs capitalize">
                    {tournament.tournament_type}
                  </span>
                )}
                {tournament?.venue && <span>📍 {tournament.venue}</span>}
              </div>
              <div className="text-sm text-emerald-200 mt-1">
                {tournament?.start_date && new Date(tournament.start_date).toLocaleDateString()}
                {tournament?.end_date && ` — ${new Date(tournament.end_date).toLocaleDateString()}`}
              </div>
              {tournament?.entry_fee > 0 && (
                <div className="mt-2 text-lg font-bold text-yellow-300">
                  Entry Fee: RM {parseFloat(tournament.entry_fee).toFixed(2)}
                </div>
              )}
              {tournament?.prize && (
                <div className="text-sm text-emerald-200 mt-1">🏆 {tournament.prize}</div>
              )}
            </div>
          </div>
        </div>

        {/* Registration Form */}
        <div className="bg-white rounded-3xl p-8 shadow-lg border border-gray-100">
          <h2 className="text-2xl font-black text-gray-900 mb-6">Player Registration</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. John Lee"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Contact Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. john@example.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Phone Number <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +60 12-345 6789"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Category Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Select Category <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Choose a category...</option>
                {categories.map((cat: any) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} — {cat.type === "doubles" ? "Doubles" : "Singles"}
                    {cat.gender ? ` (${cat.gender})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Partner Name (for doubles) */}
            {selectedCategory?.type === "doubles" && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Partner Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Enter your doubles partner's full name"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            )}

            {/* Document Uploads */}
            <div className="border-t border-gray-100 pt-5 mt-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Document Uploads</h3>
              <p className="text-xs text-gray-400 mb-4">
                Upload clear copies of your documents. Accepted formats: JPG, PNG, WebP, PDF. Max 10 MB per file.
              </p>

              {/* IC / MyKad */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  IC / MyKad Document <span className="text-gray-400">(optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => handleFileUpload(e, "ic")}
                    className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                    disabled={uploading === "ic"}
                  />
                  {uploading === "ic" && (
                    <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  )}
                </div>
                {icDocumentUrl && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-emerald-600">✅ Uploaded</span>
                    <a
                      href={icDocumentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      View
                    </a>
                  </div>
                )}
              </div>

              {/* Passport */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Passport <span className="text-gray-400">(optional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => handleFileUpload(e, "passport")}
                    className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                    disabled={uploading === "passport"}
                  />
                  {uploading === "passport" && (
                    <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                  )}
                </div>
                {passportUrl && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-xs text-emerald-600">✅ Uploaded</span>
                    <a
                      href={passportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      View
                    </a>
                  </div>
                )}
              </div>

              {/* Student Card (only if school tournament) */}
              {tournament?.tournament_type === "school" && (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Student Card <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => handleFileUpload(e, "studentCard")}
                      className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                      disabled={uploading === "studentCard"}
                    />
                    {uploading === "studentCard" && (
                      <div className="animate-spin w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full" />
                    )}
                  </div>
                  {studentCardUrl && (
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs text-emerald-600">✅ Uploaded</span>
                      <a
                        href={studentCardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-700 hover:underline"
                      >
                        View
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-emerald-700 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Submitting...
                </span>
              ) : (
                "Submit Registration"
              )}
            </button>

            <p className="text-xs text-gray-400 text-center mt-4">
              By submitting, you agree to the tournament rules and terms.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
