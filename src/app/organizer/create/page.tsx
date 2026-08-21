"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import VenuePicker from "@/components/VenuePicker";
import Link from "next/link";

// â”€â”€â”€ Tournament Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// REDESIGN F-01 (Gan d3/d4): TOURNAMENT TYPE = PURPOSE only (5 values).
// Purpose is classification / discovery / badge ONLY in the MVP - it does NOT
// enforce eligibility (no auto-reject by age/company/school yet) and is NOT a format.
const TOURNAMENT_TYPES = [
  { value: "junior", label: "Junior Tournament", icon: "\u{1F9D2}" },
  { value: "open", label: "Open Tournament", icon: "\u{1F30D}" },
  { value: "school", label: "School Tournament", icon: "\u{1F3EB}" },
  { value: "corporate", label: "Corporate Tournament", icon: "\u{1F4BC}" },
  { value: "veteran", label: "Veteran Tournament", icon: "\u{1F474}" },
];

// REDESIGN (Gan d1/d3): COMPETITION FORMAT = how it is played (match_format).
// MVP exposes ONLY knockout + round_robin. Round Robin->Knockout (group_knockout) is
// NOT exposed until the combined-stage workflow is proven end-to-end. League / Ladder /
// Festival / Team Event are future products (hidden, not selectable).
const FORMAT_OPTIONS = [
  { value: "round_robin", label: "Round Robin", icon: "🔄", desc: "Everyone plays everyone. Point-based standings." },
  { value: "knockout", label: "Knockout", icon: "❌", desc: "Single elimination bracket. Lose once, you are out." },
];

const AGE_GROUPS = ["U8", "U10", "U12", "U14", "U16", "Open"];
const GENDER_TYPES = [
  { value: "mens", label: "Men's" },
  { value: "womens", label: "Women's" },
  { value: "mixed", label: "Mixed" },
  { value: "any", label: "Open" },
];

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface WizardCategory {
  id: string;
  ageGroup: string;
  gender: string;
  type: string;
  points: number;
  bestOf: number;
  deuce: boolean;
}

interface UploadState {
  uploading: boolean;
  url: string;
  filename: string;
  error: string;
}

// â”€â”€â”€ Reusable FileUpload Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FileUpload({
  folder,
  accept,
  label,
  currentUrl,
  onUpload,
}: {
  folder: string;
  accept: string;
  label: string;
  currentUrl?: string;
  onUpload: (url: string) => void;
}) {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    url: currentUrl || "",
    filename: "",
    error: "",
  });
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({ uploading: true, url: "", filename: file.name, error: "" });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("folder", folder);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setState({ uploading: false, url: data.url, filename: data.filename, error: "" });
      onUpload(data.url);
    } catch (err: any) {
      setState({ uploading: false, url: "", filename: file.name, error: err.message });
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFile}
        className="hidden"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={state.uploading}
          className="px-4 py-2 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state.uploading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full" />
              Uploading...
            </span>
          ) : (
            "Choose File"
          )}
        </button>
        {state.url && (
          <div className="flex items-center gap-2">
            {folder !== "documents" && (
              <img
                src={state.url}
                alt="Preview"
                className="w-12 h-12 object-cover rounded-lg border"
              />
            )}
            <span className="text-sm text-gray-500 truncate max-w-[150px]">{state.filename}</span>
            <span className="text-xs text-emerald-600 font-medium">Uploaded ✓</span>
          </div>
        )}
        {state.error && <span className="text-sm text-red-500">{state.error}</span>}
      </div>
      {state.url && (
        <div className="mt-1">
          {folder !== "documents" && state.url && (
            <img
              src={state.url}
              alt={label}
              className="mt-2 max-h-40 rounded-xl border object-cover"
            />
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Counter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
let catIdCounter = 0;
function newCat(): WizardCategory {
  catIdCounter++;
  return {
    id: `cat_${catIdCounter}`,
    ageGroup: "Open",
    gender: "mens",
    type: "singles",
    points: 21,
    bestOf: 3,
    deuce: true,
  };
}

// â”€â”€â”€ Page Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function CreateTournamentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Step navigation
  const [step, setStep] = useState(1);

  // Tournament type
  const [tournamentType, setTournamentType] = useState("open");
  // REDESIGN (Gan d1): competition format written to tournaments.match_format
  const [matchFormat, setMatchFormat] = useState("round_robin");

  // Basic details
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [venueData, setVenueData] = useState<{ venue: string; lat: number | null; lng: number | null }>({ venue: "", lat: null, lng: null });
  const [rules, setRules] = useState("");
  const [prize, setPrize] = useState("");
  const [entryFee, setEntryFee] = useState(0);

  // Upload urls
  const [posterUrl, setPosterUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Dates
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [registrationDeadline, setRegistrationDeadline] = useState("");

  // P1-006: number of courts (1-20, default 4)
  const [numberOfCourts, setNumberOfCourts] = useState(4);

  // Categories
  const [categories, setCategories] = useState<WizardCategory[]>([newCat()]);

  // UI state
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    } else if (!authLoading && user && user.role !== 'organizer' && user.role !== 'admin') {
      router.push("/");
    }
  }, [user, authLoading]);

  function addCategory() {
    setCategories([...categories, newCat()]);
  }

  function removeCategory(id: string) {
    if (categories.length <= 1) return;
    setCategories(categories.filter((c) => c.id !== id));
  }

  function updateCategory(id: string, field: keyof WizardCategory, value: any) {
    setCategories(categories.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError("Tournament name is required");
      return;
    }
    if (!startDate || !endDate) {
      setError("Start and end dates are required");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/tournaments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          venue: venueData.venue.trim(),
          venue_lat: venueData.lat,
          venue_lng: venueData.lng,
          startDate,
          endDate,
          tournamentType,
          matchFormat,
          posterUrl: posterUrl || null,
          bannerUrl: bannerUrl || null,
          logoUrl: logoUrl || null,
          rules: rules.trim() || null,
          prize: prize.trim() || null,
          entryFee: entryFee || 0,
          number_of_courts: numberOfCourts,
          registrationDeadline: registrationDeadline || null,
          categories,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create tournament");
      }

      const { tournament } = await res.json();
      setSuccess(true);
      setTimeout(() => {
        router.push(`/organizer/${tournament.id}`);
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (authLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  if (!user) return null;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">{"\u{1F389}"}</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Tournament Created!</h2>
          <p className="text-gray-500 mb-6">Redirecting to your tournament page...</p>
          <div className="animate-spin w-6 h-6 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4">
        <Link href="/organizer" className="text-sm text-emerald-200 hover:text-emerald-100">
          ← Dashboard
        </Link>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                step >= s ? "bg-emerald-600" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">Create Tournament</h1>
        <p className="text-gray-500 mb-8">
          {step === 1
            ? "Step 1: Tournament Purpose"
            : step === 2
            ? "Step 2: Competition Format"
            : step === 3
            ? "Step 3: Basic Details"
            : step === 4
            ? "Step 4: Media & Rules"
            : step === 5
            ? "Step 5: Categories"
            : "Step 6: Review & Create"}
        </p>

        {/* â”€â”€â”€ STEP 1: Tournament Type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">What type of tournament is this?</h2>
            <p className="text-sm text-gray-500 mb-4">Choose the purpose / audience. This drives your tournament badge and discovery.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {TOURNAMENT_TYPES.map((tt) => (
                <button
                  key={tt.value}
                  type="button"
                  onClick={() => setTournamentType(tt.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    tournamentType === tt.value
                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-3xl">{tt.icon}</span>
                  <span className="text-sm font-medium text-gray-700 text-center leading-tight">{tt.label}</span>
                  {tournamentType === tt.value && (
                    <span className="text-xs text-emerald-600 font-semibold">Selected</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* REDESIGN STEP 2: Competition Format (Gan d1/d3) */}
        {step === 2 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">How will it be played?</h2>
            <p className="text-sm text-gray-500 mb-4">This sets the competition format used when the draw is generated.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FORMAT_OPTIONS.map((fo) => (
                <button
                  key={fo.value}
                  type="button"
                  onClick={() => setMatchFormat(fo.value)}
                  className={`flex flex-col items-start gap-2 p-5 rounded-xl border-2 transition-all ${
                    matchFormat === fo.value
                      ? "border-emerald-500 bg-emerald-50 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-3xl">{fo.icon}</span>
                    <span className="text-base font-semibold text-gray-800">{fo.label}</span>
                  </span>
                  <span className="text-sm text-gray-500 text-left leading-tight">{fo.desc}</span>
                  {matchFormat === fo.value && (
                    <span className="text-xs text-emerald-600 font-semibold mt-1">Selected format</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-4 bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500">
              Round Robin then Knockout (group stage into elimination) is coming soon.
            </div>
          </div>
        )}

        {/* Basic Details is now Step 3 */}
        {step === 3 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tournament Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="e.g. KL Open 2026"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="Tournament details, rules overview, what participants should know..."
              />
            </div>
            <div>
              <VenuePicker value={venueData} onChange={setVenueData} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Number of Courts
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={numberOfCourts}
                onChange={(e) => setNumberOfCourts(parseInt(e.target.value) || 4)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">1-20 courts. Used by the draw and auto-schedule.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date *
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date *
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Registration Deadline
              </label>
              <input
                type="date"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Leave empty = closes at start date</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Fee / Total Price (RM)
                </label>
                <input
                  type="number"
                  min={0}
                  value={entryFee}
                  onChange={(e) => setEntryFee(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="0 = Free"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prize</label>
                <input
                  value={prize}
                  onChange={(e) => setPrize(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. RM 5,000 + Trophy"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Media & Rules */}
        {step === 4 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-6">
            <h2 className="text-lg font-bold text-gray-900">Media & Rules</h2>

            <FileUpload
              folder="posters"
              accept="image/*"
              label="Poster"
              currentUrl={posterUrl}
              onUpload={setPosterUrl}
            />

            <FileUpload
              folder="banners"
              accept="image/*"
              label="Banner"
              currentUrl={bannerUrl}
              onUpload={setBannerUrl}
            />

            <FileUpload
              folder="logos"
              accept="image/*"
              label="Logo"
              currentUrl={logoUrl}
              onUpload={setLogoUrl}
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rules</label>
              <textarea
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows={6}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-sm"
                placeholder={`## Tournament Rules

1. All matches follow BWF regulations
2. Players must check in 30 minutes before scheduled match
3. Default time: 10 minutes after call
4. Shuttles provided: Yes / No
5. Dress code: Proper sports attire required`}
              />
              <p className="text-xs text-gray-400 mt-1">Markdown supported</p>
            </div>

            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-sm text-emerald-800 font-medium">{"\u{1F4A1}"} Pro Tip</p>
              <p className="text-sm text-emerald-600 mt-1">
                Upload high-quality images for better visibility. Posters should be at least
                800×1200px.
              </p>
            </div>
          </div>
        )}

        {/* â”€â”€â”€ STEP 4: Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {step === 5 && (
          <div className="space-y-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">
                    Category {categories.indexOf(cat) + 1}
                  </h3>
                  {categories.length > 1 && (
                    <button
                      onClick={() => removeCategory(cat.id)}
                      className="text-red-400 text-sm hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Age Group
                    </label>
                    <select
                      value={cat.ageGroup}
                      onChange={(e) => updateCategory(cat.id, "ageGroup", e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      {AGE_GROUPS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Gender
                    </label>
                    <select
                      value={cat.gender}
                      onChange={(e) => updateCategory(cat.id, "gender", e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      {GENDER_TYPES.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select
                      value={cat.type}
                      onChange={(e) => updateCategory(cat.id, "type", e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      <option value="singles">Singles</option>
                      <option value="doubles">Doubles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Points</label>
                    <select
                      value={cat.points}
                      onChange={(e) =>
                        updateCategory(cat.id, "points", Number(e.target.value))
                      }
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      <option value={11}>11 pts</option>
                      <option value={15}>15 pts (BWF new)</option>
                      <option value={21}>21 pts (standard)</option>
                      <option value={31}>31 pts</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
                    <select
                      value={cat.bestOf}
                      onChange={(e) =>
                        updateCategory(cat.id, "bestOf", Number(e.target.value))
                      }
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      <option value={1}>Best of 1</option>
                      <option value={3}>Best of 3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Deuce</label>
                    <select
                      value={cat.deuce ? "yes" : "no"}
                      onChange={(e) =>
                        updateCategory(cat.id, "deuce", e.target.value === "yes")
                      }
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    >
                      <option value="yes">Yes (win by 2)</option>
                      <option value="no">No (first to points)</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  {cat.ageGroup}{" "}
                  {GENDER_TYPES.find((g) => g.value === cat.gender)?.label}{" "}
                  {cat.type === "doubles" ? "Doubles" : "Singles"} · {cat.points} pts · Best of{" "}
                  {cat.bestOf} · Deuce: {cat.deuce ? "Yes" : "No"}
                </p>
              </div>
            ))}
            <button
              onClick={addCategory}
              className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-medium hover:border-emerald-400 hover:text-emerald-600 transition-all"
            >
              + Add Category
            </button>
          </div>
        )}

        {/* â”€â”€â”€ STEP 5: Review & Create â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {step === 6 && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Review Your Tournament</h2>

              {/* Type */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                <span className="text-2xl">
                  {TOURNAMENT_TYPES.find((t) => t.value === tournamentType)?.icon}
                </span>
                <div>
                  <span className="text-sm text-gray-500">Purpose</span>
                  <p className="font-medium text-gray-900">
                    {TOURNAMENT_TYPES.find((t) => t.value === tournamentType)?.label}
                  </p>
                  <span className="text-sm text-gray-500">Format</span>
                  <p className="font-medium text-gray-900">
                    {FORMAT_OPTIONS.find((f) => f.value === matchFormat)?.label}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-500">Name</span>
                  <span className="font-medium text-gray-900 text-right">{name}</span>
                </div>
                {description && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Description</span>
                    <span className="font-medium text-gray-900 text-right max-w-xs">
                      {description.length > 80
                        ? description.slice(0, 80) + "..."
                        : description}
                    </span>
                  </div>
                )}
                {venueData.venue && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray-500 shrink-0 mr-4">Venue</span>
                    <span className="font-medium text-gray-900 text-right text-sm leading-relaxed">
                      {venueData.venue}
                      {venueData.lat && venueData.lng && (
                        <span className="block text-xs text-gray-400 mt-1">
                          {"\u{1F4CD}"} {venueData.lat.toFixed(4)}, {venueData.lng.toFixed(4)}
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Dates</span>
                  <span className="font-medium text-gray-900 text-right">
                    {startDate} → {endDate}
                  </span>
                </div>
                {registrationDeadline && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Registration Deadline</span>
                    <span className="font-medium text-gray-900 text-right">
                      {registrationDeadline}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Price</span>
                  <span className="font-medium text-gray-900 text-right">
                    {entryFee > 0 ? `RM ${entryFee}` : "Free"}
                  </span>
                </div>
                {prize && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Prize</span>
                    <span className="font-medium text-gray-900 text-right">{prize}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Categories</span>
                  <span className="font-medium text-gray-900 text-right">
                    {categories.length} categories
                  </span>
                </div>
              </div>

              {/* Media previews */}
              {(posterUrl || bannerUrl || logoUrl) && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-500 mb-2">Media:</p>
                  <div className="flex gap-3">
                    {posterUrl && (
                      <img
                        src={posterUrl}
                        alt="Poster"
                        className="w-16 h-20 object-cover rounded-lg border"
                      />
                    )}
                    {bannerUrl && (
                      <img
                        src={bannerUrl}
                        alt="Banner"
                        className="h-20 object-cover rounded-lg border flex-1"
                      />
                    )}
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="w-16 h-16 object-cover rounded-lg border"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Categories detail */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <h3 className="font-bold text-gray-900 mb-3">Categories Detail</h3>
              {categories.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-2 border-b last:border-0 text-sm"
                >
                  <span className="text-gray-700">
                    {i + 1}. {c.ageGroup}{" "}
                    {GENDER_TYPES.find((g) => g.value === c.gender)?.label}{" "}
                    {c.type === "doubles" ? "Doubles" : "Singles"}
                  </span>
                  <span className="text-gray-400">
                    {c.points}pts · BO{c.bestOf} · {c.deuce ? "Deuce on" : "No deuce"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* â”€â”€â”€ Navigation Buttons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          {step < 6 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-8 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-8 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50"
            >
              {loading ? "Creating..." : "\u{1F389} Create Tournament"}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
