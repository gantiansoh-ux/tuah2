"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

// Category preset builder
const AGE_GROUPS = ["U8", "U10", "U12", "U14", "U16", "Open"];
const GENDER_TYPES = [
  { value: "mens" as const, label: "Men's" },
  { value: "womens" as const, label: "Women's" },
  { value: "mixed" as const, label: "Mixed" },
  { value: "open" as const, label: "Open" },
];
const PLAY_TYPES = ["singles", "doubles"] as const;

interface WizardCategory {
  id: string;
  ageGroup: string;
  gender: string;
  type: string;
  points: number;
  bestOf: number;
  deuce: boolean;
}

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

export default function CreateTournamentPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [regOpen, setRegOpen] = useState("");
  const [regClose, setRegClose] = useState("");
  const [entryFee, setEntryFee] = useState(0);
  const [categories, setCategories] = useState<WizardCategory[]>([newCat()]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !session) router.push("/auth/login");
  }, [session, authLoading]);

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
    if (!name.trim()) { setError("Tournament name is required"); return; }
    if (!startDate || !endDate) { setError("Start and end dates are required"); return; }
    setError("");
    setLoading(true);

    const { data: tournament, error: tErr } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: session!.user.id,
        name: name.trim(),
        description: description.trim(),
        location: location.trim(),
        start_date: startDate,
        end_date: endDate,
        registration_open: regOpen || null,
        registration_close: regClose || null,
        entry_fee: entryFee || 0,
        status: "draft",
      })
      .select()
      .single();

    if (tErr || !tournament) {
      setError(tErr?.message || "Failed to create tournament");
      setLoading(false);
      return;
    }

    // Insert categories
    if (categories.length > 0) {
      const catInserts = categories.map((c) => ({
        tournament_id: tournament.id,
        name: `${c.ageGroup} ${GENDER_TYPES.find(g => g.value === c.gender)?.label} ${c.type === "doubles" ? "Doubles" : "Singles"}`,
        gender: c.gender,
        age_group: c.ageGroup.toLowerCase(),
        type: c.type,
        scoring_config: { points_per_game: c.points, best_of: c.bestOf, deuce: c.deuce },
        max_players: c.type === "doubles" ? 32 : 64,
      }));
      await supabase.from("categories").insert(catInserts);
    }

    setLoading(false);
    router.push(`/organizer/${tournament.id}`);
    router.refresh();
  }

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  if (!session) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4">
        <Link href="/organizer" className="text-sm text-emerald-200 hover:text-emerald-100">← Dashboard</Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-8">
          <div className={`flex-1 h-2 rounded-full ${step >= 1 ? "bg-emerald-600" : "bg-gray-200"}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 2 ? "bg-emerald-600" : "bg-gray-200"}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 3 ? "bg-emerald-600" : "bg-gray-200"}`} />
          <div className={`flex-1 h-2 rounded-full ${step >= 4 ? "bg-emerald-600" : "bg-gray-200"}`} />
        </div>

        <h1 className="text-3xl font-black text-gray-900 mb-2">Create Tournament</h1>
        <p className="text-gray-500 mb-8">
          {step === 1 ? "Step 1: Basic Info" : step === 2 ? "Step 2: Categories" : step === 3 ? "Step 3: Registration Settings" : "Step 4: Review & Create"}
        </p>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="e.g. KL Open 2026" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="Tournament details, rules, etc." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="e.g. Kuala Lumpur Sports Complex" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Categories */}
        {step === 2 && (
          <div className="space-y-4">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-gray-900">Category {categories.indexOf(cat) + 1}</h3>
                  {categories.length > 1 && (
                    <button onClick={() => removeCategory(cat.id)} className="text-red-400 text-sm hover:text-red-600">Remove</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Age Group</label>
                    <select value={cat.ageGroup} onChange={(e) => updateCategory(cat.id, "ageGroup", e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                    <select value={cat.gender} onChange={(e) => updateCategory(cat.id, "gender", e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      {GENDER_TYPES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select value={cat.type} onChange={(e) => updateCategory(cat.id, "type", e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      <option value="singles">Singles</option>
                      <option value="doubles">Doubles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Points</label>
                    <select value={cat.points} onChange={(e) => updateCategory(cat.id, "points", Number(e.target.value))}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      <option value={11}>11 pts</option>
                      <option value={15}>15 pts (BWF new)</option>
                      <option value={21}>21 pts (standard)</option>
                      <option value={31}>31 pts</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
                    <select value={cat.bestOf} onChange={(e) => updateCategory(cat.id, "bestOf", Number(e.target.value))}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      <option value={1}>Best of 1</option>
                      <option value={3}>Best of 3</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Deuce</label>
                    <select value={cat.deuce ? "yes" : "no"} onChange={(e) => updateCategory(cat.id, "deuce", e.target.value === "yes")}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                      <option value="yes">Yes (win by 2)</option>
                      <option value="no">No (first to points)</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-3">
                  {cat.ageGroup} {GENDER_TYPES.find(g => g.value === cat.gender)?.label} {cat.type === "doubles" ? "Doubles" : "Singles"} · {cat.points} pts · Best of {cat.bestOf} · Deuce: {cat.deuce ? "Yes" : "No"}
                </p>
              </div>
            ))}
            <button onClick={addCategory} className="w-full py-4 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400 font-medium hover:border-emerald-400 hover:text-emerald-600 transition-all">
              + Add Category
            </button>
          </div>
        )}

        {/* Step 3: Registration */}
        {step === 3 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Opens</label>
              <input type="date" value={regOpen} onChange={(e) => setRegOpen(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Leave empty for immediate</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Closes</label>
              <input type="date" value={regClose} onChange={(e) => setRegClose(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
              <p className="text-xs text-gray-400 mt-1">Leave empty = closes at start date</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entry Fee (RM)</label>
              <input type="number" min={0} value={entryFee} onChange={(e) => setEntryFee(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="0 = Free" />
            </div>
            <div className="bg-emerald-50 rounded-xl p-4">
              <p className="text-sm text-emerald-800 font-medium">💡 Pro Tip</p>
              <p className="text-sm text-emerald-600 mt-1">Once you publish, players can register themselves via the tournament link. No manual entry needed.</p>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm space-y-5">
            <h2 className="text-xl font-bold text-gray-900">Review Your Tournament</h2>
            <div className="space-y-3">
              <div className="flex justify-between"><span className="text-gray-500">Name</span><span className="font-medium text-gray-900 text-right">{name}</span></div>
              {description && <div className="flex justify-between"><span className="text-gray-500">Description</span><span className="font-medium text-gray-900 text-right max-w-xs">{description}</span></div>}
              {location && <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="font-medium text-gray-900 text-right">{location}</span></div>}
              <div className="flex justify-between"><span className="text-gray-500">Dates</span><span className="font-medium text-gray-900 text-right">{startDate} → {endDate}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Entry Fee</span><span className="font-medium text-gray-900 text-right">{entryFee > 0 ? `RM ${entryFee}` : "Free"}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Categories</span><span className="font-medium text-gray-900 text-right">{categories.length} categories</span></div>
            </div>
            <div className="border-t pt-4">
              <p className="text-sm text-gray-500 mb-2">Categories detail:</p>
              {categories.map((c, i) => (
                <div key={c.id} className="text-sm text-gray-600 mb-1">
                  {i + 1}. {c.ageGroup} {GENDER_TYPES.find(g => g.value === c.gender)?.label} {c.type} · {c.points}pts BO{c.bestOf}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="px-6 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50">← Back</button>
          ) : (
            <div />
          )}
          {step < 4 ? (
            <button onClick={() => setStep(step + 1)} className="px-8 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600">Next →</button>
          ) : (
            <button onClick={handleCreate} disabled={loading}
              className="px-8 py-3 bg-emerald-700 text-white rounded-xl font-bold hover:bg-emerald-600 disabled:opacity-50">
              {loading ? "Creating..." : "🎉 Create Tournament"}
            </button>
          )}
        </div>
        {error && <div className="mt-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>}
      </div>
    </div>
  );
}
