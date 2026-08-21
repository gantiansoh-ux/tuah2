"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";
import type { Tournament, Category, Entry, Match as MatchType } from "@/lib/types";
import { deuceCapFor } from "@/lib/scoring";

import BracketView from "@/components/BracketView";

// --------------------------------------------
// HELPERS
// --------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  registration: "bg-blue-100 text-blue-700",
  in_progress: "bg-green-100 text-green-700",
  completed: "bg-purple-100 text-purple-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration: "Registration",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};
function fmtLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


const MATCH_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-yellow-100 text-yellow-700",
  playing: "bg-green-100 text-green-700",
  in_progress: "bg-green-100 text-green-700",
  completed: "bg-purple-100 text-purple-700",
};

const AGE_GROUPS = ["U8", "U10", "U12", "U14", "U16", "Open"];
const GENDER_OPTIONS = [
  { value: "male", label: "Men's" },
  { value: "female", label: "Women's" },
  { value: "mixed", label: "Mixed" },
  { value: "any", label: "Open" },
];

function getPlayerName(e: any): string {
  const p1 = e.player_1_name || e.player_1_id?.slice(0, 8) || "TBD";
  if (e.player_2_name || e.player_2_id) {
    const p2 = e.player_2_name || e.player_2_id?.slice(0, 8) || "TBD";
    return `${p1} / ${p2}`;
  }
  return p1;
}

// Merge game scores into match objects for bracket display
function enrichWithScores(matches: any[], games: any[]): any[] {
  const gamesByMatch: Record<string, any[]> = {};
  for (const g of games) {
    if (!gamesByMatch[g.match_id]) gamesByMatch[g.match_id] = [];
    gamesByMatch[g.match_id].push(g);
  }
  return matches.map(m => {
    const gs = gamesByMatch[m.id] || [];
    const enriched = { ...m };
    for (let i = 0; i < gs.length && i < 3; i++) {
      const g = gs[i];
      const gKey = i + 1;
      enriched[`game${gKey}_1`] = g.score_entry_1 ?? g.score_1 ?? 0;
      enriched[`game${gKey}_2`] = g.score_entry_2 ?? g.score_2 ?? 0;
    }
    return enriched;
  });
}

// --------------------------------------------
// MODAL COMPONENTS
// --------------------------------------------
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// --------------------------------------------
// PAGE COMPONENT
// --------------------------------------------
// P1-006: inline court/time editor for a single match (organizer only)
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function MatchCourtEditor({ match, onSaved }: { match: any; onSaved: () => void }) {
  const [court, setCourt] = useState<string>(match.court_number ? String(match.court_number) : "");
  const [time, setTime] = useState<string>(match.scheduled_time ? toLocalInput(match.scheduled_time) : "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setSaving(true);
    setErr("");
    const body: any = {};
    if (court.trim() !== "") body.court_number = parseInt(court, 10);
    if (time.trim() !== "") body.scheduled_time = new Date(time).toISOString();
    if (Object.keys(body).length === 0) {
      setSaving(false);
      return;
    }
    const res = await fetch(`/api/matches/${match.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Failed to save");
    } else {
      onSaved();
    }
    setSaving(false);
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number" min={1} max={20} value={court}
        onChange={(e) => setCourt(e.target.value)}
        placeholder="Court"
        className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <input
        type="datetime-local" value={time}
        onChange={(e) => setTime(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button
        type="button" onClick={save} disabled={saving}
        className="text-xs bg-gray-800 text-white px-2 py-1 rounded-lg hover:bg-gray-700 disabled:opacity-50"
      >
        {saving ? "..." : "Save"}
      </button>
      {err && <span className="text-xs text-red-500">{err}</span>}
    </span>
  );
}

export default function TournamentDetailPage({
  params,
}: {
  params: { tournamentId: string };
}) {
  const { tournamentId } = params;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [tournament, setTournament] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [entries, setEntries] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [standings, setStandings] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "entries" | "draw" | "matches" | "registration">("overview");
  const [loading, setLoading] = useState(true);

  // - Authorization: only tournament owner or admin can see this page
  //   This runs AFTER loadAll() completes so we have tournament data
  useEffect(() => {
    if (!loading && tournament && user) {
      if (tournament.organizer_id !== user.id && user.role !== 'admin') {
        console.warn("Access denied - not tournament owner");
        router.push("/");
      }
    }
  }, [loading, tournament, user]);

  // -- Modal states --
  const [showEdit, setShowEdit] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // -- Form states --
  const [editForm, setEditForm] = useState({ title: "", description: "", venue: "", start_date: "", end_date: "", number_of_courts: 4 });
  const [catForm, setCatForm] = useState({ name: "", gender: "male", age: "Open", type: "singles", points: 21, bestOf: 3, deuce: true, format: "knockout" });
  const [importCSV, setImportCSV] = useState("");
  const [importCat, setImportCat] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [addPlayerCat, setAddPlayerCat] = useState("");
  const [addPlayerName, setAddPlayerName] = useState("");
  const [addPlayerStatus, setAddPlayerStatus] = useState("");
  const [generatingDraw, setGeneratingDraw] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // P1-006: auto-schedule state
  const [scheduling, setScheduling] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");
  const [editingSeeds, setEditingSeeds] = useState<Record<string, number | ''>>({});

  // Name editing state
  const [editingNames, setEditingNames] = useState<Record<string, { player_1_name: string; player_2_name: string }>>({});
  const [nameEditId, setNameEditId] = useState<string | null>(null);

  // Draw format state
  const [drawFormat, setDrawFormat] = useState<string>('knockout');
  const [drawOptions, setDrawOptions] = useState<Record<string, number>>({});
  const [showDrawOptions, setShowDrawOptions] = useState(false);

  // Umpire management - fetched from database
  const [showUmpires, setShowUmpires] = useState(false);
  const [dbUmpires, setDbUmpires] = useState<any[]>([]);
  const [newUmpireName, setNewUmpireName] = useState("");
  const [loadingUmpires, setLoadingUmpires] = useState(false);
  // Umpire applications + ratings
  const [umpireApps, setUmpireApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [ratingDraft, setRatingDraft] = useState<Record<string, { rating: number; review: string }>>({});
  // Invite an umpire (two-way recruitment - organizer invites umpire to officiate)
  const [invitingUmpire, setInvitingUmpire] = useState<string | null>(null);
  const [showRateModal, setShowRateModal] = useState<string | null>(null);
  // Explicit tournament-level umpire assignment (Q1b, Gan 2026-08-19): organizer
  // assigns an umpire to this whole tournament (optionally with working dates),
  // which surfaces in the umpire's own dashboard as "My Tournaments".
  const [umpAssignments, setUmpAssignments] = useState<any[]>([]);
  const [assigningUmpire, setAssigningUmpire] = useState<string | null>(null);

  // UI-SPEC-UMP1: client-side search / filter / sort for the Manage Umpires panel.
  // All of this is PURE UI over the already-loaded dbUmpires array - no API/data change.
  const [umpSearch, setUmpSearch] = useState("");
  const [umpStatus, setUmpStatus] = useState("all");
  const [umpCert, setUmpCert] = useState("any");
  const [umpSort, setUmpSort] = useState("rating");

  // Derived counts for the top summary stats bar (all from client-side data).
  const umpStats = useMemo(() => {
    const invited = dbUmpires.filter((u) => u.invite_status === "pending").length;
    const accepted = dbUmpires.filter((u) => u.invite_status === "approved").length;
    const declined = dbUmpires.filter((u) => u.invite_status === "rejected").length;
    const apps = umpireApps.filter((a) => a.status === "pending").length;
    return { all: dbUmpires.length, invited, accepted, declined, apps };
  }, [dbUmpires, umpireApps]);

  // Filtered + sorted umpires for the list (client-side only).
  const filteredUmpires = useMemo(() => {
    const q = umpSearch.trim().toLowerCase();
    let list = dbUmpires.filter((u) => {
      // status filter
      if (umpStatus === "invited" && u.invite_status !== "pending") return false;
      if (umpStatus === "accepted" && u.invite_status !== "approved") return false;
      if (umpStatus === "declined" && u.invite_status !== "rejected") return false;
      if (umpStatus === "uninvited" && u.invite_status) return false;
      // certification filter (substring match e.g. "BWF", "National", "Club")
      if (umpCert !== "any") {
        const cert = (u.certification || "").toLowerCase();
        if (!cert.includes(umpCert.toLowerCase())) return false;
      }
      // search: name OR email (email may be absent from API response; defensive)
      if (q) {
        const name = (u.full_name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
    // sort
    switch (umpSort) {
      case "rating":
        list = [...list].sort((a, b) => Number(b.avg_rating || 0) - Number(a.avg_rating || 0));
        break;
      case "matches":
        list = [...list].sort((a, b) => Number(b.matches_umpired || 0) - Number(a.matches_umpired || 0));
        break;
      case "available":
        list = [...list].sort((a, b) => {
          const la = (a.availability_days && a.availability_days.length) || 0;
          const lb = (b.availability_days && b.availability_days.length) || 0;
          return lb - la;
        });
        break;
      case "name":
        list = [...list].sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
        break;
      default:
        break;
    }
    return list;
  }, [dbUmpires, umpSearch, umpStatus, umpCert, umpSort]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    } else if (!authLoading && user && user.role !== 'organizer' && user.role !== 'admin') {
      router.push("/");
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (!user || !tournamentId) return;
    loadAll();
  }, [user, tournamentId]);

  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setTournament(data.tournament);
      // REDESIGN F-02 (Gan d1): single source of truth. Default the draw-format picker
      // to the tournament's authoritative match_format (not hardcoded 'knockout'), so an
      // organizer who chose Round Robin at creation gets a Round Robin draw by default.
      // They can still override via the picker before generating.
      if (data.tournament?.match_format) {
        setDrawFormat(data.tournament.match_format);
      }
      setCategories(data.categories || []);
      setEntries(data.entries || []);
      setMatches(data.matches || []);
      setGames(data.games || []);
      try {
        const st = await fetch(`/api/tournaments/${tournamentId}/standings`);
        if (st.ok) setStandings(await st.json());
      } catch {
        // standings are best-effort
      }
      // Load registrations
      const regRes = await fetch(`/api/tournament_registrations?tournament_id=${tournamentId}`);
      if (regRes.ok) {
        const regData = await regRes.json();
        setRegistrations(regData.registrations || []);
      }
    } catch (err) {
      console.error("Load tournament error:", err);
    } finally {
      setLoading(false);
    }
  }

  function openEdit() {
    if (!tournament) return;
    setEditForm({
      title: tournament.title || "",
      description: tournament.description || "",
      venue: tournament.venue || "",
      start_date: fmtLocalDate(tournament.start_date),
      end_date: fmtLocalDate(tournament.end_date),
      number_of_courts: tournament.number_of_courts || 4,
    });
    setShowEdit(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      const data = await res.json();
      setTournament(data.tournament);
      setShowEdit(false);
    } else {
      const err = await res.json();
      alert("Error: " + (err.error || "Failed to update"));
    }
  }

  async function addCategory() {
    const res = await fetch(`/api/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournament_id: tournamentId,
        name: catForm.name || `${catForm.age} ${GENDER_OPTIONS.find(g => g.value === catForm.gender)?.label} ${catForm.type === "doubles" ? "Doubles" : "Singles"}`,
        type: catForm.type,
        gender: catForm.gender,
        format: catForm.format,
        scoring_config: { points_per_game: catForm.points, best_of: catForm.bestOf, deuce: catForm.deuce, deuce_cap: deuceCapFor(catForm.points), serve_switch: 5 },
      }),
    });
    if (res.ok) {
      setShowAddCat(false);
      setCatForm({ name: "", gender: "male", age: "Open", type: "singles", points: 21, bestOf: 3, deuce: true, format: "knockout" });
      loadAll();
    } else {
      const err = await res.json();
      alert("Error: " + (err.error || "Failed to add category"));
    }
  }

  async function deleteCategory(catId: string) {
    if (!confirm("Delete this category and all its entries?")) return;
    const res = await fetch(`/api/categories/${catId}`, { method: "DELETE" });
    if (res.ok) loadAll();
  }

  async function doImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importCat) { alert("Select a category"); return; }
    setImportStatus("Importing...");
    const res = await fetch(`/api/entries/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: importCat, csv_text: importCSV }),
    });
    if (res.ok) {
      const data = await res.json();
      setImportStatus(`Imported ${data.count || 0} players successfully!`);
      setTimeout(() => { setShowImport(false); setImportCSV(""); setImportCat(""); setImportStatus(""); loadAll(); }, 1500);
    } else {
      const err = await res.json();
      setImportStatus("Error: " + (err.error || "Import failed"));
    }
  }

  async function addSinglePlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!addPlayerCat || !addPlayerName.trim()) { alert("Select category and enter player name"); return; }
    setAddPlayerStatus("Adding...");
    const res = await fetch(`/api/entries/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id: addPlayerCat, player_name: addPlayerName.trim() }),
    });
    if (res.ok) {
      setAddPlayerStatus("Player added!");
      setTimeout(() => { setShowAddPlayer(false); setAddPlayerName(""); setAddPlayerCat(""); setAddPlayerStatus(""); loadAll(); }, 1000);
    } else {
      const err = await res.json();
      setAddPlayerStatus("Error: " + (err.error || "Failed to add player"));
    }
  }

  async function publishTournament() {
    setPublishing(true);
    const res = await fetch(`/api/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    if (res.ok) {
      const data = await res.json();
      setTournament(data.tournament);
    }
    setPublishing(false);
  }

  // P1-006: auto-schedule all empty slots (POST /api/tournaments/[id]/schedule)
  async function autoSchedule() {
    setScheduling(true);
    setScheduleMsg("");
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Schedule failed");
      setScheduleMsg(`Scheduled ${data.scheduled} match(es); ${data.skipped} already had a time`);
      await loadAll();
    } catch (err: any) {
      setScheduleMsg("Error: " + (err.message || "schedule failed"));
    } finally {
      setScheduling(false);
    }
  }

  async function generateDraw() {
    if (!tournament || categories.length === 0) return;
    if (matches.length > 0 && !confirm("⚠️ A draw already exists for this tournament.\n\nRegenerating will DELETE all existing matches and create new ones based on the selected format. This cannot be undone.\n\nClick OK to continue.")) {
      return;
    }
    setGeneratingDraw(true);

    try {
      const body: Record<string, any> = { format: drawFormat };
      // Add draw-type-specific options
      if (drawFormat === 'swiss' && drawOptions.rounds) body.swiss_rounds = drawOptions.rounds;
      if (drawFormat === 'group_knockout') {
        if (drawOptions.groups) body.groups = drawOptions.groups;
        if (drawOptions.advance) body.advance = drawOptions.advance;
      }
      if (drawFormat === 'protected' && drawOptions.separation_rounds) body.separation_rounds = drawOptions.separation_rounds;

      const res = await fetch(`/api/tournaments/${tournamentId}/draw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || res.statusText);
      }

      const data = await res.json();
      console.log("Draw generated:", data);
      await loadAll();
    } catch (err: any) {
      console.error("Generate draw error:", err);
      alert("Failed to generate draw: " + err.message);
    }
    setGeneratingDraw(false);
  }

  async function approveRegistration(regId: string) {
    // Optimistic in-place update: no full reload -> no scroll jump -> approve multiple in a row
    setRegistrations((prev) =>
      prev.map((r: any) => (r.id === regId ? { ...r, status: "approved" } : r))
    );
    try {
      await fetch(`/api/tournament_registrations/${regId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
    } catch (e) {
      console.error("Approve registration error:", e);
      loadAll();
    }
  }

  async function rejectRegistration(regId: string) {
    // Optimistic in-place update: no full reload -> no scroll jump
    setRegistrations((prev) =>
      prev.map((r: any) => (r.id === regId ? { ...r, status: "rejected" } : r))
    );
    try {
      await fetch(`/api/tournament_registrations/${regId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
    } catch (e) {
      console.error("Reject registration error:", e);
      loadAll();
    }
  }

  async function saveSeed(entryId: string, seed: number | null) {
    setEditingSeeds(prev => ({...prev, [entryId]: seed ?? ''}));
    const res = await fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: seed ?? null }),
    });
    if (!res.ok) {
      const err = await res.json();
      console.error("Save seed error:", err);
    }
  }

  async function deleteEntry(entryId: string) {
    if (!confirm("Remove this player from the tournament?")) return;
    const res = await fetch(`/api/entries/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      loadAll();
    } else {
      const err = await res.json();
      alert("Error: " + (err.error || "Failed to delete entry"));
    }
  }

  function startNameEdit(entry: any) {
    setEditingNames(prev => ({...prev, [entry.id]: { player_1_name: entry.player_1_name || '', player_2_name: entry.player_2_name || '' }}));
    setNameEditId(entry.id);
  }

  async function saveNameEdit(entryId: string) {
    const names = editingNames[entryId];
    if (!names) return;
    const body: Record<string, string> = {};
    body.player_1_name = names.player_1_name;
    body.player_2_name = names.player_2_name;
    const res = await fetch(`/api/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setNameEditId(null);
      loadAll();
    } else {
      const err = await res.json();
      alert("Error: " + (err.error || "Failed to update name"));
    }
  }

  function cancelNameEdit() {
    setNameEditId(null);
  }

  // Load umpires from database (on page load so Live Matches dropdown has data)
  useEffect(() => {
    if (!tournamentId) return;
    let mounted = true;
    setLoadingUmpires(true);
    fetch(`/api/umpires?tournament_id=${tournamentId}`)
      .then((r) => r.ok ? r.json() : { umpires: [] })
      .then((data) => {
        if (mounted) {
          setDbUmpires(data.umpires || []);
          setLoadingUmpires(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadingUmpires(false);
      });
    return () => { mounted = false; };
  }, [showUmpires, tournamentId]);

  // Load umpire applications for this tournament
  useEffect(() => {
    if (!tournamentId) return;
    let mounted = true;
    setLoadingApps(true);
    fetch(`/api/umpires/applications?tournament_id=${tournamentId}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : { applications: [] })
      .then((data) => {
        if (mounted) {
          setUmpireApps(data.applications || []);
          setLoadingApps(false);
        }
      })
      .catch(() => {
        if (mounted) setLoadingApps(false);
      });
    return () => { mounted = false; };
  }, [showUmpires, tournamentId]);

  // Load explicit tournament-level umpire assignments (Q1b, Gan 2026-08-19)
  useEffect(() => {
    if (!tournamentId) return;
    let mounted = true;
    fetch(`/api/tournaments/${tournamentId}/umpires`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : { assignments: [] })
      .then((data) => { if (mounted) setUmpAssignments(data.assignments || []); })
      .catch(() => {});
    return () => { mounted = false; };
  }, [showUmpires, tournamentId]);

  // Explicitly assign an umpire to this whole tournament (Q1b)
  async function handleAssignUmpire(umpireId: string) {
    setAssigningUmpire(umpireId);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/umpires`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ umpire_id: umpireId, available_dates: [] }),
      });
      if (res.ok) {
        alert("✅ Umpire assigned to this tournament. It will appear in their 'My Tournaments'.");
        const r = await fetch(`/api/tournaments/${tournamentId}/umpires`, { credentials: "include" });
        if (r.ok) { const d = await r.json(); setUmpAssignments(d.assignments || []); }
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || "Failed to assign"));
      }
    } catch {
      alert("Failed to assign umpire");
    } finally {
      setAssigningUmpire(null);
    }
  }

  // Remove an explicit tournament-level umpire assignment (Q1b)
  async function handleUnassignUmpire(umpireId: string) {
    if (!confirm("Remove this umpire from the tournament assignments?")) return;
    try {
      await fetch(`/api/tournaments/${tournamentId}/umpires?umpire_id=${umpireId}`, {
        method: "DELETE", credentials: "include",
      });
      setUmpAssignments((prev) => prev.filter((a) => a.umpire_id !== umpireId));
    } catch {
      alert("Failed to unassign umpire");
    }
  }

  async function handleApplication(id: string, action: "approve" | "reject") {
    try {
      const res = await fetch("/api/umpires/applications", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) {
        loadAll();
        setUmpireApps((apps) => apps.map((a) => a.id === id ? { ...a, status: action === "approve" ? "approved" : "rejected" } : a));
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || "Failed to update application"));
      }
    } catch {
      alert("Failed to update application");
    }
  }

  // Invite an umpire from the All Umpires list to officiate this tournament.
  // The umpire then accepts/declines from their dashboard (two-way recruitment).
  async function handleInvite(umpireId: string) {
    setInvitingUmpire(umpireId);
    try {
      const res = await fetch("/api/umpires/invite", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId, umpire_id: umpireId }),
      });
      if (res.ok) {
        alert("✅ Invitation sent! The umpire will accept/decline from their dashboard.");
        loadAll();
        const r = await fetch(`/api/umpires?tournament_id=${tournamentId}`, { credentials: "include" });
        if (r.ok) { const d = await r.json(); setDbUmpires(d.umpires || []); }
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || "Failed to send invitation"));
      }
    } catch {
      alert("Failed to send invitation");
    } finally {
      setInvitingUmpire(null);
    }
  }

  async function submitRating(umpireId: string) {
    const draft = ratingDraft[umpireId];
    if (!draft || !draft.rating) {
      alert("Please select a rating");
      return;
    }
    try {
      const res = await fetch("/api/umpires/review", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          umpire_id: umpireId,
          tournament_id: tournamentId,
          rating: draft.rating,
          review: draft.review || "",
        }),
      });
      if (res.ok) {
        alert("Rating submitted! ✅");
        setShowRateModal(null);
        const r = await fetch("/api/umpires", { credentials: "include" });
        if (r.ok) {
          const data = await r.json();
          setDbUmpires(data.umpires || []);
        }
      } else {
        const err = await res.json();
        alert("Error: " + (err.error || "Failed to submit rating"));
      }
    } catch {
      alert("Failed to submit rating");
    }
  }

  // -- Render --
  if (authLoading || loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" /></div>;
  if (!user || !tournament) return null;

  const isOwner = tournament.organizer_id === user.id;
  const pendingRegs = registrations.filter((r: any) => r.status === "pending");

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <Link href="/organizer" className="text-sm text-emerald-200 hover:text-emerald-100">→ Dashboard</Link>
        <div className="flex items-center gap-3">
          {pendingRegs.length > 0 && isOwner && (
            <button onClick={() => setActiveTab("registration")}
              className="bg-yellow-500 text-black px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-yellow-400 animate-pulse">
              {pendingRegs.length} Pending
            </button>
          )}
          <span className="text-sm text-emerald-200">{user.name || user.email}</span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* ------ HEADER ------ */}
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-black text-gray-900">{tournament.title || "Untitled Tournament"}</h1>
              <div className="flex items-center flex-wrap gap-2 mt-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[tournament.status] || "bg-gray-100 text-gray-600"}`}>
                  {STATUS_LABELS[tournament.status] || tournament.status}
                </span>
                {tournament.venue && <span className="text-sm text-gray-400">{"\u{1F4CD}"} {tournament.venue}</span>}
                <span className="text-sm text-gray-400">
                  {fmtLocalDate(tournament.start_date)}{tournament.end_date ? ` → ${fmtLocalDate(tournament.end_date)}` : ""}
                </span>
                <span className="text-sm text-gray-400">· {entries.length} players · {categories.length} cats</span>
              </div>
              {tournament.description && <p className="text-gray-500 mt-3 text-sm">{tournament.description}</p>}
              {/* Poster / Banner / Logo thumbnails */}
              <div className="flex gap-2 mt-3">
                {tournament.poster_url && (
                  <a href={tournament.poster_url} target="_blank" rel="noopener noreferrer">
                    <img src={tournament.poster_url} alt="Poster" className="w-16 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" title="Poster" />
                  </a>
                )}
                {tournament.banner_url && (
                  <a href={tournament.banner_url} target="_blank" rel="noopener noreferrer">
                    <img src={tournament.banner_url} alt="Banner" className="w-24 h-16 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" title="Banner" />
                  </a>
                )}
                {tournament.logo_url && (
                  <a href={tournament.logo_url} target="_blank" rel="noopener noreferrer">
                    <img src={tournament.logo_url} alt="Logo" className="w-16 h-16 object-contain rounded-lg border border-gray-200 hover:opacity-80 transition-opacity" title="Logo" />
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 ml-4">
              {isOwner && (
                <>
                  <button onClick={openEdit}
                    className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50">
                    ✅ Edit
                  </button>
                  <button onClick={() => setShowAddCat(true)}
                    className="border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-50">
                    + Category
                  </button>
                  <button onClick={() => setShowAddPlayer(true)}
                    className="border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-50">
                    + Player
                  </button>
                  <button onClick={() => setShowImport(true)}
                    className="border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-50">
                    {"\u{1F4E5}"} CSV
                  </button>

                  {tournament.status === "draft" && (
                    <button onClick={publishTournament} disabled={publishing}
                      className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-500 disabled:opacity-50">
                      {publishing ? "..." : "Publish"}
                    </button>
                  )}
                  {(tournament.status === "registration" || tournament.status === "published" || tournament.status === "in_progress") && entries.length >= 2 && (
                    <button onClick={generateDraw} disabled={generatingDraw}
                      className="bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-50">
                      {generatingDraw ? "..." : "\u{1F3B2} Generate Draw"}
                    </button>
                  )}
                </>
              )}
              <button onClick={() => setShowUmpires(true)}
                className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50">
                {"\u{1F464}"} Umpires
                {umpireApps.filter((a: any) => a.status === "pending").length > 0 && (
                  <span className="ml-1.5 inline-flex items-center bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {umpireApps.filter((a: any) => a.status === "pending").length} pending
                  </span>
                )}
              </button>
              {/* TUA12 (2026-08-15): surface pending umpire approvals inline so a
                  non-technical organizer doesn't have to discover the modal. */}
              {umpireApps.filter((a: any) => a.status === "pending").length > 0 && (
                <div className="w-full sm:w-auto bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-amber-800 mb-1.5">
                    {"\u{1F64B}"} Pending umpire applications
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {umpireApps.filter((a: any) => a.status === "pending").map((a: any) => (
                      <div key={a.id} className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5">
                        <span className="text-sm text-gray-700 font-medium">{a.full_name}</span>
                        <button
                          onClick={() => handleApplication(a.id, "approve")}
                          disabled={loadingApps}
                          className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded-md font-semibold hover:bg-emerald-500 disabled:opacity-50">
                          Approve
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setShowQR(true)}
                className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50">
                {"\u{1F4F1}"} QR
              </button>
              <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}`)}
                className="border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-gray-50">
                {"\u{1F517}"} Link
              </button>
              {isOwner && tournament.status === "draft" && (
                <button onClick={() => setShowDeleteConfirm(true)}
                  className="border border-red-200 text-red-500 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-red-50">
                  {"\u{1F5D1}"} Delete
                </button>
              )}
            </div>
          </div>
        </div>
        {/* Report download buttons */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <a
            href={`/api/reports/${tournamentId}?type=draw`}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-500 transition-colors"
          >
            Export Draw Report
          </a>
          <a
            href={`/api/reports/${tournamentId}?type=completed`}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors"
          >
            Export Results Report
          </a>
        </div>



        {/* ------ TABS ------ */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm mb-6 overflow-x-auto">
          {[
            { key: "overview", label: "Overview" },
            { key: "entries", label: `Players (${entries.length})` },
            { key: "draw", label: `Draw (${matches.length})` },
            { key: "matches", label: "Live Matches" },
            { key: "registration", label: `Registrations${pendingRegs.length > 0 ? ` (${pendingRegs.length})` : ""}` },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.key ? "bg-emerald-700 text-white" : "text-gray-500 hover:text-gray-900"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ------ TAB: OVERVIEW ------ */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Tournament Stats</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-emerald-700">{categories.length}</div>
                  <div className="text-sm text-gray-500">Categories</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-blue-700">{entries.length}</div>
                  <div className="text-sm text-gray-500">Players Entered</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-purple-700">{matches.length}</div>
                  <div className="text-sm text-gray-500">Matches</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-orange-700">
                    {matches.filter((m: any) => m.status === "completed").length}
                  </div>
                  <div className="text-sm text-gray-500">Completed</div>
                </div>
              </div>
            </div>

            {/* Categories overview */}
            {categories.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">Categories</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {categories.map((cat: any) => (
                    <div key={cat.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{cat.name}</span>
                        <span className="text-sm text-gray-400 ml-3">
                          {cat.type} · {cat.scoring_config?.points_per_game || 21}pts BO{cat.scoring_config?.best_of || 3}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">
                          {entries.filter((e: any) => e.category_id === cat.id).length} players
                        </span>
                        {isOwner && (
                          <button onClick={() => deleteCategory(cat.id)}
                            className="text-xs text-red-400 hover:text-red-600">Delete</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            {isOwner && categories.length === 0 && (
              <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
                <p className="text-amber-800 font-medium">{"\u{1F4CB}"} No categories yet</p>
                <p className="text-amber-600 text-sm mt-1">Add categories so players can register for their events.</p>
                <button onClick={() => setShowAddCat(true)}
                  className="mt-3 bg-amber-600 text-white px-5 py-2 rounded-xl font-medium text-sm hover:bg-amber-500">
                  + Add Category
                </button>
              </div>
            )}

            {isOwner && categories.length > 0 && entries.length === 0 && tournament.status === "draft" && (
              <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
                <p className="text-blue-800 font-medium">{"\u{1F465}"} No players yet</p>
                <p className="text-blue-600 text-sm mt-1">Import players via CSV or add them one by one. Then publish & generate draw.</p>
                <button onClick={() => setShowImport(true)}
                  className="mt-3 bg-blue-600 text-white px-5 py-2 rounded-xl font-medium text-sm hover:bg-blue-500">
                  {"\u{1F4E5}"} Import Players
                </button>
              </div>
            )}
          </div>
        )}

        {/* ------ TAB: ENTRIES ------ */}
        {activeTab === "entries" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Player Entries</h2>
              {isOwner && (
                <div className="flex gap-2">
                  <button onClick={() => setShowAddPlayer(true)}
                    className="text-sm border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50">
                    + Add
                  </button>
                  <button onClick={() => setShowImport(true)}
                    className="text-sm border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50">
                    {"\u{1F4E5}"} CSV
                  </button>
                </div>
              )}
            </div>
            {entries.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium">Player(s)</th>
                    <th className="text-left px-6 py-3 font-medium">Category</th>
                    <th className="text-left px-6 py-3 font-medium">Seed</th>
                    {isOwner && <th className="text-right px-6 py-3 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e: any) => {
                    const cat = categories.find((c: any) => c.id === e.category_id);
                    const isEditingName = nameEditId === e.id;
                    const nameData = editingNames[e.id];
                    return (
                      <tr key={e.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">
                          {isEditingName ? (
                            <div className="flex flex-col gap-1">
                              <input
                                type="text"
                                value={nameData?.player_1_name || ''}
                                onChange={(ev) => setEditingNames(prev => ({...prev, [e.id]: {...prev[e.id], player_1_name: ev.target.value}}))}
                                className="px-2 py-1 border border-emerald-300 rounded text-sm outline-none focus:ring-2 focus:ring-emerald-500 w-40"
                                placeholder="Player 1 name"
                              />
                              {e.player_2_name !== undefined && (
                                <input
                                  type="text"
                                  value={nameData?.player_2_name || ''}
                                  onChange={(ev) => setEditingNames(prev => ({...prev, [e.id]: {...prev[e.id], player_2_name: ev.target.value}}))}
                                  className="px-2 py-1 border border-emerald-300 rounded text-sm outline-none focus:ring-2 focus:ring-emerald-500 w-40"
                                  placeholder="Player 2 name (doubles)"
                                />
                              )}
                              <div className="flex gap-1 mt-1">
                                <button onClick={() => saveNameEdit(e.id)} className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded hover:bg-emerald-500">Save</button>
                                <button onClick={cancelNameEdit} className="text-xs bg-gray-300 text-gray-700 px-2 py-0.5 rounded hover:bg-gray-400">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <span onClick={() => isOwner && startNameEdit(e)} className={isOwner ? "cursor-pointer hover:text-emerald-700 border-b border-dashed border-gray-300 hover:border-emerald-500" : ""}>
                              {getPlayerName(e)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-gray-500">{cat?.name || "?"}</td>
                        <td className="px-6 py-3">
                          <input 
                            type="number" 
                            min="0" max="32"
                            value={editingSeeds[e.id] !== undefined ? editingSeeds[e.id] : (e.seed || '')}
                            onChange={(e2) => setEditingSeeds(prev => ({...prev, [e.id]: parseInt(e2.target.value) || ''}))}
                            onBlur={(e2) => saveSeed(e.id, parseInt(e2.target.value) || null)}
                            className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-center text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                            placeholder="-"
                          />
                        </td>
                        {isOwner && (
                          <td className="px-6 py-3 text-right">
                            <button onClick={() => deleteEntry(e.id)}
                              className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                              title="Remove entry">
                              {"\u{1F5D1}"}
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">{"\u{1F465}"}</div>
                <p>No players entered yet.</p>
                {isOwner && (
                  <button onClick={() => setShowImport(true)}
                    className="mt-4 bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-600">
                    Import Players
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ------ TAB: DRAW ------ */}
        {activeTab === "draw" && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Draw / Bracket</h2>
              <div className="flex gap-2">
                {isOwner && (tournament.status === "registration" || tournament.status === "published" || tournament.status === "in_progress") && entries.length >= 2 && (
                  <>
                    <button onClick={() => setShowDrawOptions(!showDrawOptions)}
                      className="border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-50">
                      {"\u{1F3AF}"} {showDrawOptions ? 'Hide Options' : 'Draw Options'}
                    </button>
                    <button onClick={generateDraw} disabled={generatingDraw}
                      className="bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-50">
                      {generatingDraw ? "Generating..." : matches.length > 0 ? "\u{1F504} Regenerate" : "\u{1F3B2} Generate Draw"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Draw Type Selector (only when no draw exists or options toggled) */}
            {(showDrawOptions || matches.length === 0) && entries.length >= 2 && (
              <div className="bg-gray-50 rounded-2xl p-6 mb-6 border border-gray-200">
                <h3 className="font-bold text-gray-800 mb-4">Draw Format</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    { value: 'knockout', label: 'Knockout', desc: 'Single elimination bracket' },
                    { value: 'round_robin', label: 'Round Robin', desc: 'Everyone plays everyone' },
                    { value: 'swiss', label: 'Swiss System', desc: 'Round-based, no elimination' },
                    { value: 'double_elimination', label: 'Double Elim', desc: 'Two loss elimination' },
                    { value: 'group_knockout', label: 'Group+KO', desc: 'Groups then knockout' },
                    { value: 'manual', label: 'Manual', desc: 'Organizer assigns positions' },
                    { value: 'protected', label: 'Protected', desc: 'Same club avoidance' },
                    { value: 'club_separation', label: 'Club Separation', desc: 'Split clubs into halves' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setDrawFormat(opt.value);
                        setDrawOptions({});
                      }}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        drawFormat === opt.value
                          ? 'border-emerald-500 bg-emerald-50 shadow-sm'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-sm text-gray-900">{opt.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Format-specific options */}
                {drawFormat === 'swiss' && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Number of Swiss Rounds</label>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={drawOptions.rounds || Math.ceil(Math.log2(entries.length)) + 1}
                      onChange={(e) => setDrawOptions(prev => ({ ...prev, rounds: parseInt(e.target.value) || Math.ceil(Math.log2(entries.length)) + 1 }))}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Suggested: {Math.ceil(Math.log2(entries.length)) + 1} rounds for {entries.length} players</p>
                  </div>
                )}

                {drawFormat === 'group_knockout' && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Number of Groups</label>
                        <input
                          type="number"
                          min={2}
                          max={8}
                          value={drawOptions.groups || 4}
                          onChange={(e) => setDrawOptions(prev => ({ ...prev, groups: parseInt(e.target.value) || 4 }))}
                          className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Top N to Advance</label>
                        <input
                          type="number"
                          min={1}
                          max={4}
                          value={drawOptions.advance || 2}
                          onChange={(e) => setDrawOptions(prev => ({ ...prev, advance: parseInt(e.target.value) || 2 }))}
                          className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Players split into groups, top N from each advance to knockout stage</p>
                  </div>
                )}

                {drawFormat === 'protected' && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Separation Rounds</label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={drawOptions.separation_rounds || 2}
                      onChange={(e) => setDrawOptions(prev => ({ ...prev, separation_rounds: parseInt(e.target.value) || 2 }))}
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">Players from same club cannot meet in first N rounds</p>
                  </div>
                )}

                {(drawFormat === 'knockout' || drawFormat === 'double_elimination') && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <p className="text-sm text-gray-500">
                      {drawFormat === 'knockout' ? 'Standard single elimination bracket. Byes added for non-power-of-2 entries.' : 'Double elimination with winners bracket, losers bracket, and grand final.'}
                    </p>
                  </div>
                )}

                {(drawFormat === 'round_robin' || drawFormat === 'manual' || drawFormat === 'club_separation') && (
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <p className="text-sm text-gray-500">
                      {drawFormat === 'round_robin' && 'Every player plays every other player. Best for small groups (3-8 players).'}
                      {drawFormat === 'manual' && 'Create empty match slots. Organizer manually assigns players to positions.'}
                      {drawFormat === 'club_separation' && 'Players from the same club are placed in opposite bracket halves. Enforced for all rounds.'}
                    </p>
                  </div>
                )}

                <div className="mt-4 flex gap-3">
                  <button onClick={() => { setShowDrawOptions(false); generateDraw(); }} disabled={generatingDraw}
                    className="bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-50">
                    {generatingDraw ? "Generating..." : `{"\u{1F3B2}"} Generate ${drawFormat.replace(/_/g, ' ')} Draw`}
                  </button>
                  {matches.length > 0 && (
                    <button onClick={() => setShowDrawOptions(false)}
                      className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {matches.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">{"\u{1F3B2}"}</div>
                <p>Draw not generated yet.</p>
                {entries.length < 2 && <p className="text-sm mt-1">Need at least 2 players per category.</p>}
                {entries.length >= 2 && isOwner && tournament.status === "draft" && (
                  <p className="text-sm mt-1 text-yellow-600">Publish the tournament first, then generate the draw.</p>
                )}
                {entries.length >= 2 && isOwner && (tournament.status === "registration" || tournament.status === "published" || tournament.status === "in_progress") && (
                  <p className="text-sm mt-2 text-gray-500">Select a draw format above and click Generate.</p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {categories.map((cat: any) => {
                  const catMatches = matches.filter((m: any) => m.category_id === cat.id);
                  if (catMatches.length === 0) return null;

                  // Detect draw type from match round names
                  const firstRound = catMatches[0]?.round || '';
                  const isDoubleElim = firstRound.startsWith('WB ') || firstRound.startsWith('LB ') || firstRound === 'Grand Final';
                  const isGroupKnockout = catMatches.some((m: any) => m.round?.startsWith('Group '));
                  const isSwiss = firstRound.startsWith('Round ') && catMatches.every((m: any) => /^Round \d+$/.test(m.round || ''));
                  const isProtected = firstRound.startsWith('Protected Round');
                  const isKnockout = ['Final','SF','QF','R16','R32','R64','R128'].includes(firstRound) || catMatches.some((m: any) => m.round_index !== undefined && m.round_index >= 0);
                  const isRoundRobin = firstRound === 'Round Robin';

                  let drawBadge = '';
                  if (isDoubleElim) drawBadge = 'Double Elimination';
                  else if (isGroupKnockout) drawBadge = 'Group + Knockout';
                  else if (isSwiss) drawBadge = 'Swiss System';
                  else if (isProtected) drawBadge = 'Protected Draw';
                  else if (isKnockout) drawBadge = 'Knockout';
                  else if (isRoundRobin) drawBadge = 'Round Robin';
                  else if (firstRound === 'Manual Round 1') drawBadge = 'Manual';

                  // Group matches by bracket_group for separation display
                  const groups = new Map<string, any[]>();
                  for (const m of catMatches) {
                    const key = m.bracket_group || '_default';
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(m);
                  }

                  return (
                    <div key={cat.id} className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-gray-700 text-lg">{cat.name}</h3>
                          {drawBadge && (
                            <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              {drawBadge}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">{catMatches.length} matches</span>
                      </div>

                      {/* Bracket Tree Visualization for knockout-based formats */}
                      {isKnockout && !isGroupKnockout && !isProtected ? (
                        isDoubleElim ? (
                          /* Show Winners + Losers brackets separately */
                          <div className="space-y-6">
                            {Array.from(groups.entries()).map(([groupKey, groupMatches]) => {
                              const groupLabel =
                                groupKey === 'winners' ? '{"\u{1F3C6}"} Winners Bracket' :
                                groupKey === 'losers' ? '{"\u{1F504}"} Losers Bracket' :
                                groupKey === 'grand_final' ? '{"\u{1F3C5}"} Grand Final' :
                                groupKey;
                              return (
                                <div key={groupKey}>
                                  <h4 className="text-sm font-bold text-gray-600 mb-2">{groupLabel}</h4>
                                  <BracketView
                                    matches={groupMatches}
                                    getPlayerName={(eid: string | null) => {
                                      if (!eid) return "TBD";
                                      const e = entries.find((x: any) => x.id === eid);
                                      return e ? getPlayerName(e) : eid.slice(0, 8);
                                    }}
                                    courtLabel={(m) => m.court_name || (m.court_number ? `Court ${m.court_number}` : "")}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : isProtected ? (
                          <BracketView
                            matches={enrichWithScores(catMatches, games)}
                            getPlayerName={(eid: string | null) => {
                              if (!eid) return "TBD";
                              const e = entries.find((x: any) => x.id === eid);
                              return e ? getPlayerName(e) : eid.slice(0, 8);
                            }}
                            courtLabel={(m) => m.court_name || (m.court_number ? `Court ${m.court_number}` : "")}
                          />
                        ) : (
                          <BracketView
                            matches={enrichWithScores(catMatches, games)}
                            getPlayerName={(eid: string | null) => {
                              if (!eid) return "TBD";
                              const e = entries.find((x: any) => x.id === eid);
                              return e ? getPlayerName(e) : eid.slice(0, 8);
                            }}
                            courtLabel={(m) => m.court_name || (m.court_number ? `Court ${m.court_number}` : "")}
                          />
                        )
                      ) : isGroupKnockout ? (
                        /* Show groups separated visually with LIVE standings, then knockout stage */
                        <div className="space-y-6">
                          {(() => {
                            const catStand = standings?.categories?.find((c: any) => c.category_id === cat.id);
                            const koInfo = catStand?.ko;
                            const koMatches = catMatches.filter((m: any) => m.bracket_group === 'ko');
                            const koMatchesR1 = koMatches.filter((m: any) => m.round_index === 0);
                            const allFilled = koMatchesR1.length > 0 && koMatchesR1.every((m: any) => m.entry_1_id || m.entry_2_id);
                            return (
                              <div className="space-y-6">
                                {Array.from(groups.entries()).map(([groupKey, groupMatches]) => {
                                  if (!groupKey.startsWith('group-')) return null;
                                  const groupLabel = groupKey.replace('group-', 'Group ');
                                  const gStand = catStand?.groups?.find((g: any) => g.label === groupLabel.replace('Group ', ''));
                                  return (
                                    <div key={groupKey} className="bg-white rounded-xl border border-gray-200 p-4">
                                      <h4 className="text-sm font-bold text-gray-600 mb-2">{groupLabel}</h4>
                                      {gStand && gStand.entries.length > 0 && (
                                        <div className="overflow-x-auto mb-3">
                                          <table className="w-full text-sm">
                                            <thead>
                                              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                                                <th className="py-1.5 pr-2 w-8">#</th>
                                                <th className="py-1.5">Player</th>
                                                <th className="py-1.5 text-center w-12">W-L</th>
                                                <th className="py-1.5 text-center w-14">Sets</th>
                                                <th className="py-1.5 text-center w-14">Pts</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {gStand.entries.map((r: any) => (
                                                <tr key={r.entry_id} className="border-b border-gray-50 last:border-0">
                                                  <td className="py-1.5 pr-2 font-bold text-gray-400">{r.rank}</td>
                                                  <td className="py-1.5 font-medium text-gray-800 truncate max-w-[180px]">
                                                    {r.name}
                                                    {r.withdrawn && <span className="text-[10px] text-red-400 ml-1">(WD)</span>}
                                                  </td>
                                                  <td className="py-1.5 text-center text-gray-700">{r.wins}-{r.losses}</td>
                                                  <td className="py-1.5 text-center text-gray-500">{r.set_diff > 0 ? `+${r.set_diff}` : r.set_diff}</td>
                                                  <td className="py-1.5 text-center text-gray-500">{r.points_diff > 0 ? `+${r.points_diff}` : r.points_diff}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                      <div className="space-y-2">
                                        {groupMatches.map((m: any) => (
                                          <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 hover:bg-gray-100 transition-colors">
                                            <div className="flex items-center gap-3 flex-wrap">
                                              <span className="text-xs text-gray-400 font-mono">#{m.match_number}</span>
                                              <span className="font-medium text-gray-900">
                                                {entries.find((e: any) => e.id === m.entry_1_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_1_id)) : "TBD"}
                                              </span>
                                              <span className="text-gray-400">vs</span>
                                              <span className="font-medium text-gray-900">
                                                {entries.find((e: any) => e.id === m.entry_2_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_2_id)) : "TBD"}
                                              </span>
                                            </div>
                                            {m.status === 'completed' && (
                                              <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                {entries.find((e: any) => e.id === m.winner_entry_id) ? getPlayerName(entries.find((e: any) => e.id === m.winner_entry_id)) : ''} ✓
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                                {/* Knockout stage after groups */}
                                {koMatches.length > 0 && (
                                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                                    <div className="flex items-center justify-between mb-2">
                                      <h4 className="text-sm font-bold text-gray-600">{"\u{1F3C6}"} Knockout Stage</h4>
                                      {koInfo?.awaiting && (
                                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full animate-pulse">
                                          ⏳ Awaiting group results…
                                        </span>
                                      )}
                                      {koInfo && !koInfo.awaiting && allFilled && (
                                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                          ✅ Bracket set
                                        </span>
                                      )}
                                    </div>
                                    <BracketView
                                      matches={koMatches}
                                      getPlayerName={(eid: string | null) => {
                                        if (!eid) return "TBD";
                                        const e = entries.find((x: any) => x.id === eid);
                                        return e ? getPlayerName(e) : eid.slice(0, 8);
                                      }}
                                      courtLabel={(m) => m.court_name || (m.court_number ? `Court ${m.court_number}` : "")}
                                      entryBadges={koInfo?.badges || undefined}
                                      awaitingGroupResults={koInfo?.awaiting || false}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : isSwiss ? (
                        /* Swiss: group by round */
                        <div className="space-y-4">
                          {(() => {
                            // Group by round number
                            const byRound = new Map<string, any[]>();
                            for (const m of catMatches) {
                              const round = m.round || 'Unknown';
                              if (!byRound.has(round)) byRound.set(round, []);
                              byRound.get(round)!.push(m);
                            }
                            return Array.from(byRound.entries()).map(([round, roundMatches]) => (
                              <div key={round}>
                                <h4 className="text-sm font-bold text-emerald-700 mb-2">{round}</h4>
                                <div className="space-y-2">
                                  {roundMatches.map((m: any) => (
                                    <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 hover:bg-gray-100 transition-colors">
                                      <div className="flex items-center gap-3 flex-wrap">
                                        <span className="text-xs text-gray-400 font-mono">#{m.match_number}</span>
                                        <span className={`font-medium ${m.winner_id === m.entry_1_id ? "text-emerald-700" : "text-gray-900"}`}>
                                          {entries.find((e: any) => e.id === m.entry_1_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_1_id)) : "TBD"}
                                        </span>
                                        <span className="text-gray-400">vs</span>
                                        <span className={`font-medium ${m.winner_id === m.entry_2_id ? "text-emerald-700" : "text-gray-900"}`}>
                                          {entries.find((e: any) => e.id === m.entry_2_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_2_id)) : "TBD"}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${MATCH_STATUS_STYLES[m.status] || "bg-gray-100 text-gray-500"}`}>
                                          {m.status}
                                        </span>
                                        {m.status !== "completed" && (
                                          <Link href={`/umpire/v2/${m.id}`}
                                            className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600">
                                            Score
                                          </Link>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      ) : (
                        /* Fallback: flat list for round-robin, manual, or small brackets */
                        <div className="space-y-2">
                          {catMatches.map((m: any) => (
                            <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 hover:bg-gray-100 transition-colors">
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xs text-gray-400 font-mono">#{m.match_number}</span>
                                <span className="text-xs font-medium text-gray-500 bg-gray-200 px-2 py-0.5 rounded">{m.round}</span>
                                <span className={`font-medium ${m.winner_id === m.entry_1_id ? "text-emerald-700" : "text-gray-900"}`}>
                                  {entries.find((e: any) => e.id === m.entry_1_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_1_id)) : "TBD"}
                                </span>
                                <span className="text-gray-400">vs</span>
                                <span className={`font-medium ${m.winner_id === m.entry_2_id ? "text-emerald-700" : "text-gray-900"}`}>
                                  {entries.find((e: any) => e.id === m.entry_2_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_2_id)) : "TBD"}
                                </span>
                                <div className="flex gap-2 text-xs text-gray-400 ml-1">
                                  {m.scheduled_time && <span>{"\u{1F5D3}"} {new Date(m.scheduled_time).toLocaleString()}</span>}
                                  {m.court_name && <span>{"\u{1F3F8}"} {m.court_name}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${MATCH_STATUS_STYLES[m.status] || "bg-gray-100 text-gray-500"}`}>
                                  {m.status}
                                </span>
                                {m.status !== "completed" && (
                                  <Link href={`/umpire/v2/${m.id}`}
                                    className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-600">
                                    Score
                                  </Link>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ------ TAB: LIVE MATCHES ------ */}
        {activeTab === "matches" && (
          <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Live Matches</h2>
            {isOwner && (
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <button
                  onClick={autoSchedule}
                  disabled={scheduling}
                  className="text-sm bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                >
                  {scheduling ? "Scheduling..." : "Auto Schedule"}
                </button>
                {scheduleMsg && <span className="text-xs text-gray-500">{scheduleMsg}</span>}
              </div>
            )}
            {matches.filter((m: any) => m.status === "playing" || m.status === "scheduled").length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">{"\u{1F3AF}"}</div>
                <p>No active matches. Generate a draw first.</p>
              </div>
            ) : (
              categories.map((cat: any) => {
                const activeMatches = matches.filter((m: any) => m.category_id === cat.id && (m.status === "playing" || m.status === "scheduled"));
                if (activeMatches.length === 0) return null;
                return (
                  <div key={cat.id} className="mb-6">
                    <h3 className="font-semibold text-gray-700 mb-3">{cat.name}</h3>
                    <div className="space-y-2">
                      {activeMatches.map((m: any) => (
                        <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className={`w-2 h-2 rounded-full ${m.status === "playing" ? "bg-green-500 animate-pulse" : "bg-yellow-400"}`} />
                            <span className="font-medium text-gray-900">
                              {entries.find((e: any) => e.id === m.entry_1_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_1_id)) : "TBD"}
                            </span>
                            <span className="text-gray-400">vs</span>
                            <span className="font-medium text-gray-900">
                              {entries.find((e: any) => e.id === m.entry_2_id) ? getPlayerName(entries.find((e: any) => e.id === m.entry_2_id)) : "TBD"}
                            </span>
                            {m.court_name && <span className="text-xs text-gray-400 ml-2">· {m.court_name}</span>}
                            {m.scheduled_time && <span className="text-xs text-gray-400">{"\u{1F5D3}"} {new Date(m.scheduled_time).toLocaleString()}</span>}
                            {isOwner && (
                              <select
                                value={m.umpire_id || ''}
                                onChange={async (e2) => {
                                  const val = e2.target.value;
                                  await fetch(`/api/matches/${m.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ umpire_id: val || null }),
                                  });
                                  loadAll();
                                }}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">No umpire</option>
                                {umpireApps.filter((a: any) => a.status === "approved").map((a: any) => (
                                  <option key={a.umpire_id} value={a.umpire_id}>{a.full_name}</option>
                                ))}
                              </select>
                            )}
                            {!isOwner && m.umpire_id && <span className="text-xs text-gray-400">{"\u{1F464}"} {m.umpire_id}</span>}
                            {isOwner && (
                              <MatchCourtEditor match={m} onSaved={loadAll} />
                            )}
                          </div>
                          <Link href={`/umpire/v2/${m.id}`}
                            className="text-sm bg-emerald-700 text-white px-4 py-2 rounded-lg hover:bg-emerald-600">
                            {m.status === "playing" ? "Open Umpire Pad →" : "Score →"}
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ------ TAB: REGISTRATIONS ------ */}
        {activeTab === "registration" && (
          <div className="space-y-4">
            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
                <div className="text-xl font-black text-gray-900">{(entries.filter((e: any) => e.registration_status).length) + (registrations.length || 0)}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-yellow-200 shadow-sm text-center">
                <div className="text-xl font-black text-yellow-600">
                  {entries.filter((e: any) => e.registration_status === 'pending').length + registrations.filter((r: any) => r.status === 'pending').length}
                </div>
                <div className="text-xs text-yellow-600">Pending</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-green-200 shadow-sm text-center">
                <div className="text-xl font-black text-green-600">
                  {entries.filter((e: any) => e.registration_status === 'approved').length + registrations.filter((r: any) => r.status === 'approved').length}
                </div>
                <div className="text-xs text-green-600">Approved</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-red-200 shadow-sm text-center">
                <div className="text-xl font-black text-red-600">
                  {entries.filter((e: any) => e.registration_status === 'rejected').length + registrations.filter((r: any) => r.status === 'rejected').length}
                </div>
                <div className="text-xs text-red-600">Rejected</div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm text-center">
                <div className="text-xl font-black text-blue-600">{entries.filter((e: any) => e.payment_status === 'paid').length}</div>
                <div className="text-xs text-blue-600">Paid</div>
              </div>
            </div>

            {/* Entries-based Registrations (from public registrations) */}
            {entries.filter((e: any) => e.registration_status).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-emerald-50">
                  <h3 className="font-bold text-emerald-800">{"\u{1F4CD}"} Online Registrations</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium">Player Name</th>
                      <th className="text-left px-6 py-3 font-medium">Category</th>
                      <th className="text-left px-6 py-3 font-medium">Registration</th>
                      <th className="text-left px-6 py-3 font-medium">Payment</th>
                      <th className="text-left px-6 py-3 font-medium">Documents</th>
                      <th className="text-left px-6 py-3 font-medium">Confirmed At</th>
                      {isOwner && <th className="text-right px-6 py-3 font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {entries.filter((e: any) => e.registration_status).map((entry: any) => {
                      const cat = categories.find((c: any) => c.id === entry.category_id);
                      return (
                        <tr key={entry.id} className="border-t border-gray-50 hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{getPlayerName(entry)}</td>
                          <td className="px-6 py-3 text-gray-500">{cat?.name || "-"}</td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              entry.registration_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              entry.registration_status === 'approved' ? 'bg-green-100 text-green-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {entry.registration_status || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              entry.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                              entry.payment_status === 'refunded' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {entry.payment_status || 'unpaid'}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex gap-1.5">
                              {entry.ic_document_url && (
                                <a href={entry.ic_document_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
                                  title="View IC">IC</a>
                              )}
                              {entry.passport_url && (
                                <a href={entry.passport_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
                                  title="View Passport">Pass</a>
                              )}
                              {entry.student_card_url && (
                                <a href={entry.student_card_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-100"
                                  title="View Student Card">Stud</a>
                              )}
                              {!entry.ic_document_url && !entry.passport_url && !entry.student_card_url && (
                                <span className="text-xs text-gray-300">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3 text-xs text-gray-400">
                            {entry.confirmed_at ? new Date(entry.confirmed_at).toLocaleDateString() : '-'}
                          </td>
                          {isOwner && (
                            <td className="px-6 py-3 text-right">
                              {entry.registration_status === 'pending' && (
                                <div className="flex gap-2 justify-end">
                                  <button onClick={async () => {
                                    setEntries((prev: any[]) =>
                                      prev.map((e: any) => e.id === entry.id ? { ...e, registration_status: 'approved', confirmed_at: new Date().toISOString() } : e)
                                    );
                                    try {
                                      await fetch(`/api/entries/${entry.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ registration_status: 'approved', confirmed_at: new Date().toISOString() }),
                                      });
                                    } catch (err) { console.error(err); loadAll(); }
                                  }}
                                    className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200">
                                    ✅ Approve
                                  </button>
                                  <button onClick={async () => {
                                    setEntries((prev: any[]) =>
                                      prev.map((e: any) => e.id === entry.id ? { ...e, registration_status: 'rejected' } : e)
                                    );
                                    try {
                                      await fetch(`/api/entries/${entry.id}`, {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ registration_status: 'rejected' }),
                                      });
                                    } catch (err) { console.error(err); loadAll(); }
                                  }}
                                    className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200">
                                    ❌ Reject
                                  </button>
                                </div>
                              )}
                              {entry.registration_status === 'approved' && (
                                <span className="text-xs text-green-500 font-medium">✅ Approved</span>
                              )}
                              {entry.registration_status === 'rejected' && (
                                <span className="text-xs text-red-400 font-medium">✘ Rejected</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legacy Tournament Registrations */}
            {registrations.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="font-bold text-gray-900">
                    App Registrations
                    {pendingRegs.length > 0 && <span className="ml-2 text-yellow-600">({pendingRegs.length} pending)</span>}
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-6 py-3 font-medium">Player</th>
                      <th className="text-left px-6 py-3 font-medium">Category</th>
                      <th className="text-left px-6 py-3 font-medium">Date</th>
                      <th className="text-left px-6 py-3 font-medium">Status</th>
                      {isOwner && <th className="text-right px-6 py-3 font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.map((reg: any) => (
                      <tr key={reg.id} className="border-t border-gray-50 hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{reg.player_name || reg.profile_id?.slice(0, 8)}</td>
                        <td className="px-6 py-3 text-gray-500">-</td>
                        <td className="px-6 py-3 text-gray-400 text-xs">
                          {fmtLocalDate(reg.registered_at) || fmtLocalDate(reg.registration_date) || "-"}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            reg.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                            reg.status === "approved" ? "bg-green-100 text-green-700" :
                            "bg-red-100 text-red-700"
                          }`}>{reg.status}</span>
                        </td>
                        {isOwner && (
                          <td className="px-6 py-3 text-right">
                            {reg.status === "pending" && (
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => approveRegistration(reg.id)}
                                  className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-lg hover:bg-green-200">✅ Approve</button>
                                <button onClick={() => rejectRegistration(reg.id)}
                                  className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded-lg hover:bg-red-200">❌ Reject</button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty State */}
            {entries.filter((e: any) => e.registration_status).length === 0 && registrations.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">{"\u{1F4CD}"}</div>
                <p>No registrations yet. Share the tournament link for players to sign up.</p>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}/register`)}
                  className="mt-4 bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-medium text-sm hover:bg-emerald-600">
                  Copy Registration Link
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---------------------------------------- */}
      {/* MODALS */}
      {/* ---------------------------------------- */}

      {/* -- Edit Tournament -- */}
      {showEdit && (
        <Modal title="Edit Tournament" onClose={() => setShowEdit(false)}>
          <form onSubmit={saveEdit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tournament Name</label>
              <input type="text" required value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Venue/Location</label>
              <input type="text" value={editForm.venue} onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" placeholder="e.g. KL Badminton Centre" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Courts</label>
              <input type="number" min={1} max={20} value={editForm.number_of_courts}
                onChange={(e) => setEditForm({ ...editForm, number_of_courts: parseInt(e.target.value) || 4 })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowEdit(false)}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">Cancel</button>
              <button type="submit" className="flex-1 px-6 py-3 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-600">Save</button>
            </div>
          </form>
        </Modal>
      )}

      {/* -- Add Category -- */}
      {showAddCat && (
        <Modal title="Add Category" onClose={() => setShowAddCat(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Name (leave blank for auto)</label>
              <input type="text" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="e.g. U12 MS (auto if empty)" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Age Group</label>
                <select value={catForm.age} onChange={(e) => setCatForm({ ...catForm, age: e.target.value })}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Gender</label>
                <select value={catForm.gender} onChange={(e) => setCatForm({ ...catForm, gender: e.target.value })}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
                <select value={catForm.format} onChange={(e) => setCatForm({...catForm, format: e.target.value})}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  <option value="knockout">Knockout (Single Elimination)</option>
                  <option value="round_robin">Round Robin</option>
                  <option value="swiss">Swiss System</option>
                  <option value="double_elimination">Double Elimination</option>
                  <option value="group_knockout">Group + Knockout</option>
                  <option value="manual">Manual</option>
                  <option value="protected">Protected Draw</option>
                  <option value="club_separation">Club Separation</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                <select value={catForm.type} onChange={(e) => setCatForm({ ...catForm, type: e.target.value })}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  <option value="singles">Singles</option>
                  <option value="doubles">Doubles</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Points</label>
                <select value={catForm.points} onChange={(e) => setCatForm({ ...catForm, points: Number(e.target.value) })}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  <option value={11}>11 pts</option>
                  <option value={15}>15 pts (BWF 2026)</option>
                  <option value={21}>21 pts (standard)</option>
                  <option value={31}>31 pts</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Format</label>
                <select value={catForm.bestOf} onChange={(e) => setCatForm({ ...catForm, bestOf: Number(e.target.value) })}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  <option value={1}>Best of 1</option>
                  <option value={3}>Best of 3</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Deuce</label>
                <select value={catForm.deuce ? "yes" : "no"} onChange={(e) => setCatForm({ ...catForm, deuce: e.target.value === "yes" })}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                  <option value="yes">Yes (win by 2)</option>
                  <option value="no">No (first to)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddCat(false)}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={addCategory}
                className="flex-1 px-6 py-3 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-600">Add Category</button>
            </div>
          </div>
        </Modal>
      )}

      {/* -- Import CSV -- */}
      {showImport && (
        <Modal title="Import Players (CSV)" onClose={() => setShowImport(false)}>
          <form onSubmit={doImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select required value={importCat} onChange={(e) => setImportCat(e.target.value)}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none">
                <option value="">Select category...</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Player Names</label>
              <p className="text-xs text-gray-400 mb-2">One name per line. For doubles: <code>Player1 / Player2</code></p>
              <textarea value={importCSV} onChange={(e) => setImportCSV(e.target.value)} rows={8}
                placeholder={`John Lee\nJane Tan\nAli Bin Abu / Siti Binte\nChong Wei`}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl font-mono text-sm outline-none" />
            </div>
            {importStatus && (
              <div className={`px-4 py-3 rounded-xl text-sm ${importStatus.startsWith("Error") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                {importStatus}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setShowImport(false); setImportStatus(""); }}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={!importCat || !importCSV.trim()}
                className="flex-1 px-6 py-3 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-600 disabled:opacity-50">Import</button>
            </div>
          </form>
        </Modal>
      )}

      {/* -- QR Code -- */}
      {showQR && (
        <Modal title="Tournament QR Code" onClose={() => setShowQR(false)}>
          <div className="text-center">
            <div className="bg-white rounded-2xl p-4 inline-block border mb-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`${window.location.origin}/tournament/${tournamentId}`)}`}
                alt="QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>
            <p className="text-sm text-gray-500 mb-2">Scan to open Audience Portal</p>
            <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 break-all select-all">
              {window.location.origin}/tournament/{tournamentId}
            </div>
            <button onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/tournament/${tournamentId}`);
            }}
              className="mt-4 w-full bg-emerald-700 text-white py-3 rounded-xl font-medium text-sm hover:bg-emerald-600">
              Copy Link
            </button>
          </div>
        </Modal>
      )}

      {/* -- Delete Confirmation -- */}
      {showDeleteConfirm && (
        <Modal title="Delete Tournament?" onClose={() => setShowDeleteConfirm(false)}>
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-gray-700 mb-2 font-medium">This action cannot be undone.</p>
            <p className="text-sm text-gray-500 mb-6">
              All categories, entries, and matches will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-6 py-3 border border-gray-200 rounded-xl font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={async () => {
                try {
                  const res = await fetch(`/api/tournaments/${tournamentId}`, { method: "DELETE" });
                  if (res.ok) {
                    router.push("/organizer");
                  } else {
                    const err = await res.json();
                    alert("Error: " + (err.error || "Failed to delete"));
                  }
                } catch {
                  alert("Failed to delete tournament");
                }
              }}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* -- Umpire Management -- */}
      {showUmpires && (
        <Modal title="Manage Umpires" onClose={() => setShowUmpires(false)}>
          <div className="space-y-5">
            <p className="text-sm text-gray-500">Browse umpires, approve applications, and rate their performance.</p>

            {/* Top summary stats bar (UI-SPEC-UMP1) */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: "All umpires", value: umpStats.all, cls: "text-gray-900" },
                { label: "Invited", value: umpStats.invited, cls: "text-amber-600" },
                { label: "Accepted", value: umpStats.accepted, cls: "text-emerald-600" },
                { label: "Declined", value: umpStats.declined, cls: "text-red-500" },
                { label: "Applications", value: umpStats.apps, cls: "text-blue-600" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <b className={`block text-lg leading-tight ${s.cls}`}>{s.value}</b>
                  <span className="text-[11px] text-gray-500">{s.label}</span>
                </div>
              ))}
            </div>

            {/* Search + filter + sort toolbar (UI-SPEC-UMP1, all client-side) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"/></svg>
                <input
                  value={umpSearch}
                  onChange={(e) => setUmpSearch(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <select value={umpStatus} onChange={(e) => setUmpStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700">
                <option value="all">All statuses</option>
                <option value="invited">Invited</option>
                <option value="accepted">Accepted</option>
                <option value="declined">Declined</option>
                <option value="uninvited">Not invited</option>
              </select>
              <select value={umpCert} onChange={(e) => setUmpCert(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-2 bg-white text-gray-700">
                <option value="any">Any cert</option>
                <option value="BWF">BWF</option>
                <option value="National">National</option>
                <option value="Club">Club</option>
              </select>
              <div className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
                Sort by{" "}
                <select value={umpSort} onChange={(e) => setUmpSort(e.target.value)}
                  className="border-none text-emerald-700 font-semibold bg-transparent text-xs cursor-pointer">
                  <option value="rating">Top rated</option>
                  <option value="matches">Most matches</option>
                  <option value="available">Available first</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>

            {/* Umpire Applications */}
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">
                {"\u{1F4E5}"} Umpire Applications
                {umpireApps.filter((a) => a.status === "pending").length > 0 && (
                  <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {umpireApps.filter((a) => a.status === "pending").length} pending
                  </span>
                )}
              </h3>
              {loadingApps ? (
                <div className="text-center py-4 text-gray-400 animate-pulse">Loading applications...</div>
              ) : umpireApps.length === 0 ? (
                <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-3">
                  No applications yet. Share this tournament with umpires - they can apply from their dashboard.
                </p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {umpireApps.map((a: any) => (
                    <div key={a.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">
                            {a.full_name}
                            {a.avg_rating > 0 && (
                              <span className="ml-2 text-xs text-amber-600 font-medium">✓ {a.avg_rating} ({a.review_count})</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">{a.email}</p>
                          {a.message && <p className="text-xs text-gray-500 mt-1 italic">"{a.message}"</p>}
                          {a.direction === "invite" ? (
                            <p className="text-xs text-amber-600 font-medium mt-1">{"\u{1F4E8}"} Organizer invitation - waiting for umpire's reply</p>
                          ) : (
                            <p className="text-xs text-gray-400 font-medium mt-1">{"\u{1F4E5}"} Umpire self-application</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {a.status === "pending" && a.direction === "self" ? (
                            <>
                              <button onClick={() => handleApplication(a.id, "approve")}
                                className="text-xs bg-green-100 text-green-700 px-3 py-1.5 rounded-lg hover:bg-green-200 font-medium">
                                ✓ Approve
                              </button>
                              <button onClick={() => handleApplication(a.id, "reject")}
                                className="text-xs bg-red-100 text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-200 font-medium">
                                ✕ Reject
                              </button>
                            </>
                          ) : a.status === "pending" && a.direction === "invite" ? (
                            <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium shrink-0">
                              ⏳ Awaiting umpire
                            </span>
                          ) : (
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              a.status === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                            }`}>
                              {a.status.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All Umpires (UI-SPEC-UMP1 card layout) */}
            <div>
              <h3 className="text-sm font-bold text-gray-700 mb-2">{"\u{1F464}"} All Umpires ({filteredUmpires.length})
                {umpSearch || umpStatus !== "all" || umpCert !== "any" ? (
                  <span className="ml-2 text-xs text-gray-400 font-normal">filtered from {dbUmpires.length}</span>
                ) : null}
              </h3>
              <p className="text-xs text-gray-400 mb-2">Invite an umpire to officiate this tournament - "Invited" means pending their reply, "Accepted" means confirmed, "Declined" means they turned it down.</p>
              {loadingUmpires ? (
                <div className="text-center py-4 text-gray-400 animate-pulse">Loading umpires...</div>
              ) : dbUmpires.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <div className="text-3xl mb-2">{"\u{1F464}"}</div>
                  <p className="text-sm">No umpires found in the database.</p>
                </div>
              ) : filteredUmpires.length === 0 ? (
                <div className="text-center py-6 text-gray-400">
                  <div className="text-3xl mb-2">{"\u{1F50D}"}</div>
                  <p className="text-sm">No umpires match your filters.</p>
                </div>
              ) : (
                <div className="max-h-[26rem] overflow-y-auto space-y-2">
                  {filteredUmpires.map((u: any) => {
                    const isAssigned = umpAssignments.some((a) => a.umpire_id === u.id);
                    const status = u.invite_status;
                    const detailVisible = Number(u.rate) > 0 || u.certification || u.license_number || Number(u.experience_years) > 0 || (Array.isArray(u.availability_days) && u.availability_days.length > 0);
                    return (
                      <div key={u.id} className="border border-gray-100 rounded-xl bg-white p-3 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
                            {((u.full_name || "U").trim().charAt(0) || "U").toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-800 truncate">{u.full_name}</span>
                              {status === "pending" && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap">
                                  ◌ Invited{u.invite_created_at ? ` · ${new Date(u.invite_created_at).toLocaleDateString()}` : ""}
                                </span>
                              )}
                              {status === "approved" && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap">
                                  ✓ Accepted{u.invite_created_at ? ` · ${new Date(u.invite_created_at).toLocaleDateString()}` : ""}
                                </span>
                              )}
                              {status === "rejected" && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 whitespace-nowrap">✕ Declined</span>
                              )}
                              {isAssigned && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap">Assigned</span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-3 flex-wrap text-xs text-gray-500">
                              {Number(u.avg_rating) > 0 && (
                                <span className="font-bold text-amber-600">★ {Number(u.avg_rating).toFixed(1)}</span>
                              )}
                              {Number(u.matches_umpired) > 0 && (
                                <span>{u.matches_umpired} matches</span>
                              )}
                              {u.email && <span className="text-gray-400">{u.email}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            {/* Invite / Re-invite (declined -> re-invite as primary) */}
                            {(!u.invite_status || u.invite_status === "rejected") && (
                              <button onClick={() => handleInvite(u.id)} disabled={invitingUmpire === u.id}
                                className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg disabled:opacity-50 ${u.invite_status === "rejected"
                                  ? "bg-red-500 text-white hover:bg-red-600"
                                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"}`}>
                                {invitingUmpire === u.id ? "Sending..." : u.invite_status === "rejected" ? "\u{1F501} Re-invite" : "\u{1F4E8} Invite"}
                              </button>
                            )}
                            {/* Rate - always available */}
                            <button onClick={() => setShowRateModal(u.id)}
                              className="text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-1.5 rounded-lg hover:bg-amber-200">
                              ✓ Rate
                            </button>
                            {/* Assign to matches - primary emphasis for accepted */}
                            {isAssigned ? (
                              <button onClick={() => handleUnassignUmpire(u.id)}
                                className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-lg hover:bg-emerald-200">
                                ✓ Assigned · remove
                              </button>
                            ) : status === "approved" ? (
                              <button onClick={() => handleAssignUmpire(u.id)} disabled={assigningUmpire === u.id}
                                className="text-xs font-semibold bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-emerald-500 disabled:opacity-50">
                                {assigningUmpire === u.id ? "..." : "\u{1F3BD} Assign to matches"}
                              </button>
                            ) : (
                              <button onClick={() => handleAssignUmpire(u.id)} disabled={assigningUmpire === u.id}
                                className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                                {assigningUmpire === u.id ? "..." : "\u{1F3BD} Assign to matches"}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Detail column - KEEP full existing fields (rate/cert/license/years/availability) */}
                        {detailVisible && (
                          <div className="mt-2 pt-2 border-t border-dashed border-gray-200 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            {Number(u.rate) > 0 && (
                              <span className="font-semibold text-emerald-700">{"\u{1F4B0}"} RM{u.rate}/hr</span>
                            )}
                            {u.certification && <span>{"\u{1F393}"} {u.certification}</span>}
                            {u.license_number && <span>{"\u{1F4DC}"} {u.license_number}</span>}
                            {Number(u.experience_years) > 0 && <span>⏳ {u.experience_years} yrs exp</span>}
                            {Array.isArray(u.availability_days) && u.availability_days.length > 0 && (
                              <span title={u.availability_days.join(", ")}>{"\u{1F4C5}"} {u.availability_days.join(", ")}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-xs text-gray-400 mt-2 border-t border-gray-100 pt-3 flex items-center justify-between">
              <span>Assign umpires to matches from the Live Matches tab.</span>
              {!loadingUmpires && dbUmpires.length > 0 && (
                <span className="text-gray-400">Showing {filteredUmpires.length} of {dbUmpires.length} umpires</span>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Rate Umpire Modal */}
      {showRateModal && (
        <Modal title="Rate Umpire" onClose={() => setShowRateModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Rate this umpire's performance (1-5 stars).</p>
            <div className="flex gap-2 justify-center">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s}
                  onClick={() => setRatingDraft((d) => ({ ...d, [showRateModal]: { ...(d[showRateModal] || { rating: 0, review: "" }), rating: s } }))}
                  className={`text-3xl transition-all ${(ratingDraft[showRateModal]?.rating || 0) >= s ? "text-amber-400 scale-110" : "text-gray-200 hover:text-amber-200"}`}>
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={ratingDraft[showRateModal]?.review || ""}
              onChange={(e) => setRatingDraft((d) => ({ ...d, [showRateModal]: { ...(d[showRateModal] || { rating: 0, review: "" }), review: e.target.value } }))}
              placeholder="Review (optional)..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-400"
              rows={3}
            />
            <div className="flex gap-3">
              <button onClick={() => submitRating(showRateModal)}
                className="flex-1 bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600">
                Submit Rating
              </button>
              <button onClick={() => setShowRateModal(null)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

            {/* --- Add Player -> Self-Registration --- */}
      {showAddPlayer && (
        <Modal title="Self-Registration Only" onClose={() => setShowAddPlayer(false)}>
          <div className="space-y-4">
            <div className="bg-blue-50 rounded-xl p-6 text-center">
              <div className="text-4xl mb-3">{"\u{1F6AB}"}</div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Players Must Register Themselves</h3>
              <p className="text-sm text-gray-600 mb-4">
                Share the tournament link so players can sign up. You can approve them from the Registrations tab.
              </p>
              <div className="bg-white rounded-xl p-4 border border-blue-200">
                <p className="text-xs text-gray-500 mb-1">Player Registration Link:</p>
                <code className="text-sm text-emerald-700 font-mono break-all">
                  https://tuah.com/tournament/{tournamentId}
                </code>
              </div>
            </div>
            <button onClick={() => setShowAddPlayer(false)}
              className="w-full py-3 bg-emerald-700 text-white rounded-xl font-semibold hover:bg-emerald-600">
              Got it
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
