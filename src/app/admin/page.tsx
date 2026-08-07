"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone?: string;
  nickname?: string;
  country?: string;
  state?: string;
  city?: string;
  gender?: string;
  date_of_birth?: string;
  club?: string;
  rank?: string;
  school?: string;
  occupation?: string;
  bio?: string;
  created_at: string;
}

interface Tournament {
  id: string;
  title: string;
  status: string;
  created_at: string;
  organizer_name: string;
}

interface Stats {
  profiles: number;
  tournaments: number;
  matches: number;
  entries: number;
}

interface ProfileDetail {
  profile: Record<string, any>;
  role_detail: Record<string, any> | null;
  stats: { entries: number; tournaments: number };
}

interface TournamentDetail {
  tournament: Record<string, any>;
  categories: Record<string, any>[];
  entries: Record<string, any>[];
  match_stats: { total: number; completed: number };
}

const ROLE_LABELS: Record<string, string> = {
  player: "Player",
  organizer: "Organizer",
  umpire: "Umpire",
  coach: "Coach",
  court_owner: "Court Owner",
  admin: "Admin",
};

const PROFILE_FIELD_LABELS: Record<string, string> = {
  email: "Email",
  full_name: "Full Name",
  role: "Role",
  phone: "Phone",
  nickname: "Nickname",
  country: "Country",
  state: "State",
  city: "City",
  gender: "Gender",
  date_of_birth: "Date of Birth",
  club: "Club",
  rank: "Rank",
  school: "School",
  occupation: "Occupation",
  bio: "Bio",
  playing_hand: "Playing Hand",
  website: "Website",
  avatar_url: "Avatar URL",
  created_at: "Registered At",
  updated_at: "Updated At",
};

const PLAYER_FIELD_LABELS: Record<string, string> = {
  nationality: "Nationality",
  ranking: "Ranking Points",
  handedness: "Handedness",
  club: "Club",
};

const ORGANIZER_FIELD_LABELS: Record<string, string> = {
  organization: "Organization",
  contact_email: "Contact Email",
  contact_phone: "Contact Phone",
  is_verified: "Verified",
};

const UMPIRE_FIELD_LABELS: Record<string, string> = {
  certification: "Certification",
  license_number: "License Number",
  experience_years: "Experience (Years)",
  matches_controlled: "Matches Controlled",
  accuracy_rating: "Accuracy Rating",
  languages: "Languages",
  bio: "Bio",
};

const COACH_FIELD_LABELS: Record<string, string> = {
  coaching_license: "Coaching License",
  years_experience: "Experience (Years)",
  current_club: "Current Club",
  coaching_fees: "Coaching Fees",
  rating: "Rating",
  bio: "Bio",
};

const COURT_FIELD_LABELS: Record<string, string> = {
  hall_name: "Hall Name",
  address: "Address",
  court_surface: "Surface",
  court_lighting: "Lighting",
  parking: "Parking",
  air_conditioning: "Air Conditioning",
  cafe: "Cafe",
  toilet: "Toilet",
  shower: "Shower",
  wheelchair_access: "Wheelchair Access",
  rental_price: "Rental Price",
};

function formatValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 80 ? s.slice(0, 80) + "…" : s;
    } catch {
      return "—";
    }
  }
  if (typeof v === "string" && v.startsWith("{")) return v;
  return String(v);
}

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"stats" | "profiles" | "tournaments">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<ProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tournamentDetail, setTournamentDetail] = useState<TournamentDetail | null>(null);
  const [tournamentDetailLoading, setTournamentDetailLoading] = useState(false);

  // Search/filter state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [exporting, setExporting] = useState(false);

  async function fetchData(query: string) {
    try {
      const res = await fetch(`/api/admin?${query}`, { credentials: "include" });
      if (res.status === 403) {
        setError("Access denied. Admin only.");
        setLoading(false);
        return null;
      }
      if (res.status === 401) {
        router.push("/auth/login");
        return null;
      }
      const data = await res.json();
      return data;
    } catch {
      setError("Failed to load data");
      setLoading(false);
      return null;
    }
  }

  async function loadStats() {
    const data = await fetchData("action=stats");
    if (data?.stats) setStats(data.stats);
    setLoading(false);
  }

  async function loadProfiles() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("action", "profiles");
    if (search) params.set("search", search);
    if (roleFilter) params.set("role", roleFilter);
    const data = await fetchData(params.toString());
    if (data?.profiles) setProfiles(data.profiles);
    setLoading(false);
  }

  async function loadTournaments() {
    setLoading(true);
    const data = await fetchData("action=tournaments");
    if (data?.tournaments) setTournaments(data.tournaments);
    setLoading(false);
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    const data = await fetchData(`action=profile_detail&id=${id}`);
    if (data?.profile) setDetail(data);
    setDetailLoading(false);
  }

  async function openTournamentDetail(id: string) {
    setTournamentDetailLoading(true);
    setTournamentDetail(null);
    const data = await fetchData(`action=tournament_detail&id=${id}`);
    if (data?.tournament) setTournamentDetail(data);
    setTournamentDetailLoading(false);
  }

  function doSearch() {
    setSearch(searchInput.trim());
    loadProfiles();
  }

  async function exportCSV() {
    setExporting(true);
    try {
      const data = await fetchData("action=export");
      if (!data?.profiles) return;
      const roleMap = data.role_map || {};

      const headers = [
        "ID", "Full Name", "Email", "Role", "Phone", "Nickname", "Gender",
        "Date of Birth", "Country", "State", "City", "Club", "Rank",
        "School", "Occupation", "Bio", "Playing Hand", "Website", "Registered At",
        // role-specific
        "Role Detail Type", "Role Detail JSON"
      ];

      const rows = data.profiles.map((p: any) => {
        const rd = roleMap[p.id];
        return [
          p.id, p.full_name, p.email, p.role, p.phone, p.nickname, p.gender,
          p.date_of_birth, p.country, p.state, p.city, p.club, p.rank,
          p.school, p.occupation, p.bio, p.playing_hand, p.website, p.created_at,
          rd ? rd.type : "",
          rd ? JSON.stringify(Object.fromEntries(Object.entries(rd).filter(([k]) => !["profile_id", "owner_id", "type"].includes(k)))) : ""
        ];
      });

      const csv = [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `tuah_users_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => { loadStats(); }, []);

  // Reload profiles when role filter changes
  useEffect(() => {
    if (activeTab === "profiles") {
      loadProfiles();
    }
  }, [roleFilter, search]);

  function renderDetailRows() {
    if (!detail) return null;
    const { profile, role_detail } = detail;
    const rows: { label: string; value: string }[] = [];

    const baseOrder = ["full_name", "email", "role", "phone", "nickname", "gender", "date_of_birth", "country", "state", "city", "club", "rank", "school", "occupation", "bio", "website", "created_at", "updated_at"];
    for (const key of baseOrder) {
      if (profile[key] !== null && profile[key] !== undefined && profile[key] !== "") {
        rows.push({ label: PROFILE_FIELD_LABELS[key] || key, value: formatValue(profile[key]) });
      }
    }

    if (role_detail) {
      const labels =
        profile.role === "player" ? PLAYER_FIELD_LABELS :
        profile.role === "organizer" ? ORGANIZER_FIELD_LABELS :
        profile.role === "umpire" ? UMPIRE_FIELD_LABELS :
        profile.role === "coach" ? COACH_FIELD_LABELS :
        profile.role === "court_owner" ? COURT_FIELD_LABELS : null;

      if (labels) {
        for (const [key, label] of Object.entries(labels)) {
          if (role_detail[key] !== null && role_detail[key] !== undefined && role_detail[key] !== "") {
            rows.push({ label, value: formatValue(role_detail[key]) });
          }
        }
      }
    }

    return rows;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-2">TUAH Admin</h1>
        <p className="text-gray-400 mb-6">System overview & management</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-700 pb-2">
          <button
            onClick={() => { setActiveTab("stats"); loadStats(); }}
            className={`px-4 py-2 rounded-t ${activeTab === "stats" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => { setActiveTab("profiles"); loadProfiles(); }}
            className={`px-4 py-2 rounded-t ${activeTab === "profiles" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
          >
            Users
          </button>
          <button
            onClick={() => { setActiveTab("tournaments"); loadTournaments(); }}
            className={`px-4 py-2 rounded-t ${activeTab === "tournaments" ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}
          >
            Tournaments
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 p-4 rounded mb-4">{error}</div>
        )}

        {/* Stats Overview */}
        {activeTab === "stats" && (
          <div>
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
                <p className="mt-2 text-gray-400">Loading stats...</p>
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Users" value={stats.profiles} color="emerald" />
                <StatCard label="Tournaments" value={stats.tournaments} color="blue" />
                <StatCard label="Matches" value={stats.matches} color="purple" />
                <StatCard label="Entries" value={stats.entries} color="amber" />
              </div>
            ) : null}
          </div>
        )}

        {/* Profiles Table */}
        {activeTab === "profiles" && (
          <div className="overflow-x-auto">
            {/* Search / Filter / Export bar */}
            <div className="flex flex-wrap gap-3 mb-4 items-center">
              <div className="flex gap-2 flex-1 min-w-[250px]">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doSearch(); }}
                  placeholder="Search name, email, phone, city..."
                  className="flex-1 px-3 py-2 rounded bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={doSearch}
                  className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 text-sm font-medium"
                >
                  Search
                </button>
                {search && (
                  <button
                    onClick={() => { setSearch(""); setSearchInput(""); loadProfiles(); }}
                    className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm"
                  >
                    ✖
                  </button>
                )}
              </div>
              <select
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); }}
                className="px-3 py-2 rounded bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Roles</option>
                <option value="player">Player</option>
                <option value="organizer">Organizer</option>
                <option value="umpire">Umpire</option>
                <option value="coach">Coach</option>
                <option value="court_owner">Court Owner</option>
                <option value="admin">Admin</option>
              </select>
              <button
                onClick={exportCSV}
                disabled={exporting}
                className="px-4 py-2 rounded bg-blue-700 hover:bg-blue-600 text-sm font-medium disabled:opacity-50"
              >
                {exporting ? "Exporting..." : "⬇ Export CSV"}
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : (
              <div className="mb-4 text-sm text-gray-400">
                {profiles.length} users {search && <span>matching "<span className="text-emerald-400">{search}</span>"</span>} • Click <span className="text-emerald-400">View</span> for full registration details
              </div>
            )}
            {!loading && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Email</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">City</th>
                    <th className="py-3 px-4">Registered</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-4 font-medium">{p.full_name || "-"}</td>
                      <td className="py-3 px-4 text-gray-300">{p.email}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          p.role === "admin" ? "bg-purple-900 text-purple-200" :
                          p.role === "organizer" ? "bg-emerald-900 text-emerald-200" :
                          p.role === "umpire" ? "bg-blue-900 text-blue-200" :
                          "bg-gray-700 text-gray-200"
                        }`}>
                          {ROLE_LABELS[p.role] || p.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">{p.phone || "—"}</td>
                      <td className="py-3 px-4 text-gray-400 text-sm">{p.city || "—"}</td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => openDetail(p.id)}
                          className="px-3 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-xs font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tournaments Table */}
        {activeTab === "tournaments" && (
          <div className="overflow-x-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400 text-sm">
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Organizer</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map((t) => (
                    <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-4 font-medium">{t.title}</td>
                      <td className="py-3 px-4 text-gray-300">{t.organizer_name || "-"}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          t.status === "in_progress" ? "bg-green-900 text-green-200" :
                          t.status === "completed" ? "bg-blue-900 text-blue-200" :
                          "bg-gray-700 text-gray-200"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-sm">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => openTournamentDetail(t.id)}
                          className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-xs font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Tournament Detail Modal */}
      {tournamentDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setTournamentDetail(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-700 sticky top-0 bg-gray-900">
              <div>
                <h2 className="text-xl font-bold">{tournamentDetail.tournament.title || "Tournament"}</h2>
                <p className="text-gray-400 text-sm">
                  {tournamentDetail.tournament.organizer_name || "-"}{" "}
                  <span className="text-gray-600">•</span> {tournamentDetail.tournament.organizer_email || ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  tournamentDetail.tournament.status === "in_progress" ? "bg-green-900 text-green-200" :
                  tournamentDetail.tournament.status === "completed" ? "bg-blue-900 text-blue-200" :
                  "bg-gray-700 text-gray-200"
                }`}>
                  {tournamentDetail.tournament.status}
                </span>
                <button onClick={() => setTournamentDetail(null)} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
              </div>
            </div>

            {/* Match stats + entries count */}
            <div className="grid grid-cols-3 gap-3 p-5 border-b border-gray-800">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{tournamentDetail.match_stats.total}</div>
                <div className="text-xs text-gray-400">Total Matches</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{tournamentDetail.match_stats.completed}</div>
                <div className="text-xs text-gray-400">Completed</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{tournamentDetail.entries.length}</div>
                <div className="text-xs text-gray-400">Entries</div>
              </div>
            </div>

            {tournamentDetailLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : (
              <div className="p-5">
                {/* Categories */}
                <h3 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">Categories</h3>
                <div className="flex flex-wrap gap-2 mb-6">
                  {tournamentDetail.categories.map((c) => (
                    <span key={c.id} className="px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-sm">
                      {c.name} <span className="text-gray-400">({c.entry_count})</span>
                    </span>
                  ))}
                  {tournamentDetail.categories.length === 0 && (
                    <p className="text-gray-500 text-sm">No categories.</p>
                  )}
                </div>

                {/* Entries */}
                <h3 className="text-sm font-semibold text-blue-400 mb-3 uppercase tracking-wide">
                  Registrations ({tournamentDetail.entries.length})
                </h3>
                <div className="max-h-[300px] overflow-y-auto border border-gray-800 rounded-lg">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-gray-800">
                      <tr className="text-gray-400 text-xs">
                        <th className="py-2 px-3">Player(s)</th>
                        <th className="py-2 px-3">Email</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournamentDetail.entries.map((e) => (
                        <tr key={e.id} className="border-b border-gray-800/50 text-sm">
                          <td className="py-2 px-3 font-medium">
                            {e.player1_name || "-"}
                            {e.player2_name ? ` / ${e.player2_name}` : ""}
                          </td>
                          <td className="py-2 px-3 text-gray-400">
                            {e.player1_email || "-"}{e.player2_email ? ` / ${e.player2_email}` : ""}
                          </td>
                          <td className="py-2 px-3 text-gray-300">
                            {tournamentDetail.categories.find((c) => c.id === e.category_id)?.name || "-"}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              e.status === "confirmed" ? "bg-emerald-900 text-emerald-200" :
                              e.status === "pending" ? "bg-amber-900 text-amber-200" :
                              "bg-gray-700 text-gray-200"
                            }`}>
                              {e.status || "registered"}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {tournamentDetail.entries.length === 0 && (
                        <tr><td colSpan={4} className="py-4 text-center text-gray-500">No registrations yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tournament detail loading overlay */}
      {tournamentDetailLoading && !tournamentDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-400">Loading tournament details...</p>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setDetail(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-700 sticky top-0 bg-gray-900">
              <div>
                <h2 className="text-xl font-bold">{detail.profile.full_name || "User"}</h2>
                <p className="text-gray-400 text-sm">{detail.profile.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  detail.profile.role === "admin" ? "bg-purple-900 text-purple-200" :
                  detail.profile.role === "organizer" ? "bg-emerald-900 text-emerald-200" :
                  detail.profile.role === "umpire" ? "bg-blue-900 text-blue-200" :
                  "bg-gray-700 text-gray-200"
                }`}>
                  {ROLE_LABELS[detail.profile.role] || detail.profile.role}
                </span>
                <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-white text-xl px-2">✖</button>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 p-5 border-b border-gray-800">
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{detail.stats.tournaments}</div>
                <div className="text-xs text-gray-400">Tournaments (as organizer)</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{detail.stats.entries}</div>
                <div className="text-xs text-gray-400">Tournament Entries</div>
              </div>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : (
              <div className="p-5">
                <h3 className="text-sm font-semibold text-emerald-400 mb-3 uppercase tracking-wide">Registration Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {renderDetailRows()?.map((row, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-800/50">
                      <span className="text-gray-400 text-sm">{row.label}</span>
                      <span className="text-white text-sm text-right font-medium">{row.value}</span>
                    </div>
                  ))}
                </div>
                {renderDetailRows()?.length === 0 && (
                  <p className="text-gray-500 text-sm py-4">No additional registration details available.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail loading overlay (when fetching) */}
      {detailLoading && !detail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-400">Loading user details...</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "from-emerald-600 to-emerald-800",
    blue: "from-blue-600 to-blue-800",
    purple: "from-purple-600 to-purple-800",
    amber: "from-amber-600 to-amber-800",
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} rounded-xl p-6 shadow-lg`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm opacity-80 mt-1">{label}</div>
    </div>
  );
}
