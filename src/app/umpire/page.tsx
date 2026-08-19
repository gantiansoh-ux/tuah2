"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface MyMatch {
  id: string;
  round: string;
  match_number: number;
  status: string;
  court_number: number | null;
  scheduled_time: string | null;
  tournament_id: string;
  tournament_title: string;
  tournament_status: string;
  category_name: string;
  player_1_name: string;
  player_2_name: string;
  winner_entry_id: string | null;
}

interface OpenTournament {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  category_count: number;
}

export default function UmpireDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [matches, setMatches] = useState<MyMatch[]>([]);
  // REDESIGN R2-F04 (Gan d2): matches in my approved tournaments that are still
  // UNASSIGNED (eligible to officiate once the organizer assigns them).
  const [availableMatches, setAvailableMatches] = useState<MyMatch[]>([]);
  const [rating, setRating] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [openTournaments, setOpenTournaments] = useState<OpenTournament[]>([]);
  const [myTournaments, setMyTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyMsg, setApplyMsg] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) loadAll();
  }, [authLoading, user]);

  async function loadAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/umpires/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMatches(data.matches || []);
        setAvailableMatches(data.availableMatches || []);
        setRating(data.rating || null);
        setApplications(data.applications || []);
        setInvitations(data.invitations || []);
        setOpenTournaments(data.openTournaments || []);
        setMyTournaments(data.myTournaments || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function apply(tournamentId: string) {
    try {
      const res = await fetch("/api/umpires/apply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournament_id: tournamentId,
          message: applyMsg[tournamentId] || "",
        }),
      });
      if (res.ok) {
        setToast("Application submitted! âœ…");
        setTimeout(() => setToast(null), 3000);
        loadAll();
      } else {
        const err = await res.json();
        setToast(err.error || "Failed to apply");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast("Network error");
      setTimeout(() => setToast(null), 3000);
    }
  }

  // Accept / decline an organizer invitation (two-way recruitment).
  async function respond(inviteId: string, action: "accept" | "decline") {
    try {
      const res = await fetch("/api/umpires/respond", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inviteId, action }),
      });
      if (res.ok) {
        setToast(action === "accept" ? "Invitation accepted! âœ…" : "Invitation declined");
        setTimeout(() => setToast(null), 3000);
        loadAll();
      } else {
        const err = await res.json();
        setToast(err.error || "Failed to respond");
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast("Network error");
      setTimeout(() => setToast(null), 3000);
    }
  }

  // BUG-008 fix (2026-08-07): spinner must only wait for auth resolution.
  // Previously `loading` (initial true) never resolved for unauth users because
  // loadAll() only ran when user existed -> infinite spinner, Sign In unreachable.
  if (authLoading || (user && loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-3xl p-10 shadow-xl max-w-sm w-full text-center">
          <div className="text-6xl mb-4">ðŸ‘¤</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Umpire Sign In</h1>
          <p className="text-gray-500 mb-6">Sign in with your umpire account to see your assigned matches.</p>
          <Link href="/auth/login" className="block w-full bg-emerald-700 text-white py-3 rounded-xl font-bold hover:bg-emerald-600 mb-3">
            Sign In
          </Link>
          <Link href="/auth/register" className="block w-full py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50">
            Create Umpire Account
          </Link>
        </div>
      </div>
    );
  }

  const live = matches.filter((m) => m.status === "in_progress" || m.status === "playing");
  const upcoming = matches.filter((m) => m.status === "scheduled");
  const done = matches.filter((m) => m.status === "completed" || m.status === "walkover");

  // #31: only umpire accounts may apply. Non-umpires see a disabled state
  // instead of a silent 403 from the API.
  const isUmpire = user.role === "umpire";

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">ðŸ¦‰</span>
          <span className="font-bold">Umpire Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {rating && rating.review_count > 0 && (
            <span className="text-sm bg-emerald-800 px-3 py-1 rounded-full">
              â­� {rating.avg_rating} ({rating.review_count})
            </span>
          )}
          <span className="text-sm text-emerald-200">{user.email}</span>
          <Link href="/umpire/profile" className="text-sm bg-emerald-800 px-3 py-1.5 rounded-lg hover:bg-emerald-700 font-medium">âš™ï¸� Profile & Availability</Link>
          <Link href="/" className="text-sm text-emerald-200 hover:text-emerald-100">â†� Home</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {toast && (
          <div className="fixed top-4 right-4 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
            {toast}
          </div>
        )}

        {/* My Rating */}
        {rating && rating.review_count > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-8 flex items-center gap-6">
            <div className="text-center">
              <div className="text-4xl font-black text-emerald-700">{rating.avg_rating}</div>
              <div className="text-xs text-gray-400 mt-1">avg rating</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={`text-2xl ${s <= Math.round(rating.avg_rating) ? "text-amber-400" : "text-gray-200"}`}>â˜…</span>
                ))}
              </div>
              <p className="text-sm text-gray-500">{rating.review_count} review(s) from organizers Â· best {rating.best_rating}â˜…</p>
            </div>
          </div>
        )}

        {/* My Tournaments (Q1a): the real umpire must be able to FIND the
            tournaments they officiate and open the live scoreboard. Gan 2026-08-19. */}
        {myTournaments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">ðŸ�† My Tournaments</h2>
            <div className="space-y-3">
              {myTournaments.map((t) => (
                <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.start_date ? new Date(t.start_date).toLocaleDateString() : ""}
                      {t.start_date && t.end_date ? " â€” " : ""}
                      {t.end_date ? new Date(t.end_date).toLocaleDateString() : ""}
                      {t.venue ? ` Â· ${t.venue}` : ""}
                      {t.category_count ? ` Â· ${t.category_count} categories` : ""}
                      {Number(t.my_assigned_matches) > 0 ? ` Â· ${t.my_assigned_matches} match(es) assigned to you` : ""}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Status: {t.status}</p>
                  </div>
                  <Link href={`/scoreboard/v2/${t.id}`} target="_blank"
                    className="shrink-0 inline-flex items-center gap-1 bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-emerald-600">
                    ðŸ“º Live Scoreboard
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* REDESIGN R2-F04 (Gan d2): Available Matches — matches in my approved tournaments
            that are not yet assigned to anyone. Once the organizer assigns a match to me,
            it moves into My Matches (active) below. No double count; another umpire's
            assigned match never shows here. */}
        {availableMatches.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">ðŸ“‹ Available in Your Tournaments</h2>
            <p className="text-sm text-gray-500 mb-3">These matches in your tournament are not yet assigned to an umpire. Ask the organizer to assign one to you to open the scoring pad.</p>
            <div className="space-y-2">
              {availableMatches.map((m) => (
                <div key={m.id} className="bg-emerald-50/50 rounded-xl border border-emerald-200 p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{m.player_1_name || "TBD"} <span className="text-gray-400">vs</span> {m.player_2_name || "TBD"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{m.tournament_title} Â· {m.category_name} Â· {m.round}{m.court_number ? ` Â· Court ${m.court_number}` : ""}</p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">Unassigned</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assigned Matches */}
        <h2 className="text-2xl font-bold text-gray-900 mb-4">ðŸŽ¯ My Matches</h2>

        {live.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> LIVE NOW
            </h3>
            {live.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border-l-4 border-red-500 p-4 mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.player_1_name || "TBD"} <span className="text-gray-400">vs</span> {m.player_2_name || "TBD"}</p>
                  <p className="text-xs text-gray-400 mt-1">{m.tournament_title} Â· {m.category_name} Â· {m.round}{m.court_number ? ` Â· Court ${m.court_number}` : ""}</p>
                </div>
                <Link href={`/umpire/v2/${m.id}`}
                  className="bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-red-600">
                  â–¶ Open Pad
                </Link>
              </div>
            ))}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">UPCOMING</h3>
            {upcoming.map((m) => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{m.player_1_name || "TBD"} <span className="text-gray-400">vs</span> {m.player_2_name || "TBD"}</p>
                  <p className="text-xs text-gray-400 mt-1">{m.tournament_title} Â· {m.category_name} Â· {m.round}{m.scheduled_time ? ` Â· ${new Date(m.scheduled_time).toLocaleString()}` : ""}</p>
                </div>
                <Link href={`/umpire/v2/${m.id}`}
                  className="bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-emerald-600">
                  Open Pad
                </Link>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">COMPLETED ({done.length})</h3>
            <div className="space-y-2">
              {done.map((m) => (
                <div key={m.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                  <p className="text-sm text-gray-600">{m.tournament_title} Â· {m.category_name} Â· {m.round}</p>
                  <p className="text-sm font-semibold text-gray-800">
                    {m.player_1_name || "?"} <span className="text-gray-300">vs</span> {m.player_2_name || "?"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {matches.length === 0 && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-10 text-center mb-8">
            <div className="text-5xl mb-3">ðŸ¦‰</div>
            <p className="text-gray-500 font-medium">No matches assigned yet</p>
            <p className="text-sm text-gray-400 mt-1">Organizers will assign you to matches, or apply to open tournaments below.</p>
          </div>
        )}

        {/* Invitations from organizers (two-way recruitment) */}
        {invitations.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">ðŸ“¨ TOURNAMENT INVITATIONS</h3>
            <div className="space-y-2">
              {invitations.map((i) => (
                <div key={i.id} className="bg-amber-50 rounded-xl border border-amber-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{i.tournament_title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {i.start_date ? new Date(i.start_date).toLocaleDateString() : ""}
                      {i.start_date && i.end_date ? " â€” " : ""}
                      {i.end_date ? new Date(i.end_date).toLocaleDateString() : ""}
                      {i.venue ? ` Â· ${i.venue}` : ""}
                      {i.category_count ? ` Â· ${i.category_count} categories` : ""}
                    </p>
                    {i.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{i.description}</p>
                    )}
                    {i.tournament_id && (
                      <Link href={`/tournament/${i.tournament_id}`} target="_blank"
                        className="inline-block mt-1.5 text-xs text-emerald-700 font-semibold hover:text-emerald-600 underline underline-offset-2">
                        ðŸ”� View tournament details â†’
                      </Link>
                    )}
                    {i.created_at && (
                      <p className="text-xs text-gray-400 mt-0.5">ðŸ“¨ Invited on {new Date(i.created_at).toLocaleString()}</p>
                    )}
                    {i.message && <p className="text-xs text-gray-500 mt-0.5 italic">"{i.message}"</p>}
                  </div>
                  {i.status === "pending" ? (
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button onClick={() => respond(i.id, "accept")}
                        className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-emerald-500">
                        âœ“ Accept
                      </button>
                      <button onClick={() => respond(i.id, "decline")}
                        className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-100">
                        âœ• Decline
                      </button>
                    </div>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-3 ${
                      i.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                    }`}>
                      {i.status === "approved" ? "ACCEPTED" : "DECLINED"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Applications */}
        {applications.length > 0 && (
          <div className="mb-8">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">MY APPLICATIONS</h3>
            <div className="space-y-2">
              {applications.map((a) => (
                <div key={a.id} className="bg-white rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{a.tournament_title}</p>
                    {a.created_at && (
                      <p className="text-xs text-gray-400 mt-0.5">ðŸ™‹ Applied on {new Date(a.created_at).toLocaleString()}</p>
                    )}
                    {a.message && <p className="text-xs text-gray-400 mt-0.5">"{a.message}"</p>}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    a.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                    a.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
                  }`}>
                    {a.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open Tournaments - apply */}
        {openTournaments.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">ðŸ“‹ Open Tournaments</h2>
            <p className="text-sm text-gray-400 mb-4">
              {isUmpire
                ? "Apply to umpire these tournaments â€” organizers will review your application."
                : "Your account is not set as an umpire. Switch your role or register an umpire account to apply."}
            </p>
            <div className="space-y-3">
              {openTournaments.map((t) => {
                const applied = applications.some((a) => a.tournament_id === t.id && a.status === "pending");
                return (
                  <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{t.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t.status} Â· {t.category_count} categor{t.category_count === 1 ? "y" : "ies"}
                          {t.start_date ? ` Â· ${new Date(t.start_date).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      {applied ? (
                        <span className="text-xs px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 font-medium">â�³ Applied</span>
                      ) : !isUmpire ? (
                        <span className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 font-medium" title="Only umpire accounts can apply">
                          ðŸ”’ Umpire account required
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            value={applyMsg[t.id] || ""}
                            onChange={(e) => setApplyMsg((p) => ({ ...p, [t.id]: e.target.value }))}
                            placeholder="Message (optional)"
                            className="w-44 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
                          />
                          <button onClick={() => apply(t.id)}
                            className="bg-emerald-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-emerald-600">
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
