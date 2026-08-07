"use client";

export const dynamic = "force-dynamic";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface PublicTournament {
  id: string;
  title: string;
  tournament_type: string;
  venue: string | null;
  start_date: string;
  end_date: string;
  entry_fee: string;
  prize: string | null;
  status: string;
  description: string | null;
}

function HomeContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [tournaments, setTournaments] = useState<PublicTournament[] | null>(null);
  const [tournamentStats, setTournamentStats] = useState<Record<string, { categories: number; matches: number }>>({});

  useEffect(() => {
    fetch("/api/tournaments/public")
      .then((r) => r.json())
      .then((d) => {
        const list: PublicTournament[] = (d.tournaments || []).filter(
          // Filter out obvious test/garbage tournaments for a clean client demo
          (t) => !/test|v2|clean/i.test(t.title) && t.title.trim().length > 0
        );
        // Rank: in_progress first, then published, then completed; cap at 6
        const rank: Record<string, number> = { in_progress: 0, published: 1, completed: 2 };
        const sorted = [...list]
          .sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9))
          .slice(0, 6);
        setTournaments(sorted);
        // Fetch stats for each tournament (categories + match counts)
        sorted.forEach((t) => {
          fetch(`/api/tournaments/${t.id}`)
            .then((r) => r.json())
            .then((td) => {
              const cats = (td.categories || []).length;
              const matches = (td.matches || []).length;
              setTournamentStats((prev) => ({ ...prev, [t.id]: { categories: cats, matches } }));
            })
            .catch(() => {});
        });
      })
      .catch(() => setTournaments([]));
  }, []);

  const statusBadge = (s: string) => {
    if (s === "in_progress" || s === "live") return <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>LIVE</span>;
    if (s === "registration") return <span className="inline-flex items-center bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Registration Open</span>;
    if (s === "published") return <span className="inline-flex items-center bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">OPEN</span>;
    if (s === "completed") return <span className="inline-flex items-center bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full">COMPLETED</span>;
    return <span className="inline-flex items-center bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full">Upcoming</span>;
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen">
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight">TUAH</span>
          <span className="text-emerald-300 text-xs font-medium">.com</span>
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <>
              {user.role === 'organizer' || user.role === 'admin' ? (
                <Link href="/organizer" className="text-sm hover:text-emerald-300">Dashboard</Link>
              ) : user.role === 'player' ? (
                <Link href="/player" className="text-sm hover:text-emerald-300">Player</Link>
              ) : null}
              <button onClick={signOut} className="text-sm bg-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-600">
                Sign Out
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-sm hover:text-emerald-300">Log In</Link>
              <Link href="/auth/register" className="text-sm bg-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-500 font-semibold">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-green-700 text-white">
        <div className="max-w-6xl mx-auto px-6 py-24 text-center">
          <h1 className="text-5xl md:text-7xl font-black mb-6 tracking-tight">
            TUAH<span className="text-emerald-300">.com</span>
          </h1>
          <p className="text-xl md:text-2xl text-emerald-100 max-w-3xl mx-auto mb-4">
            Tournament Umpire Automation Hawkeye
          </p>
          <p className="text-lg text-emerald-200 max-w-2xl mx-auto mb-12">
            The all-in-one DIY platform for badminton tournaments. 
            Host competitions, manage draws, score matches live, and connect with players, umpires, coaches, and courts — 
            all without needing our help.
          </p>
          {user ? (
            <Link href={user.role === 'organizer' || user.role === 'admin' ? "/organizer" : "/player"}
              className="inline-block bg-white text-emerald-900 font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0">
              {user.role === 'organizer' || user.role === 'admin' ? 'Go to Dashboard →' : 'Browse Tournaments →'}
            </Link>
          ) : (
            <Link href="/auth/register"
              className="inline-block bg-white text-emerald-900 font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0">
              Start Your Tournament →
            </Link>
          )}
        </div>
      </section>

      {/* Live Tournaments */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-3xl font-bold text-gray-900">
            Tournaments
          </h2>
          {tournaments && tournaments.length > 0 && (
            <Link href="/tournaments" className="text-sm font-semibold text-emerald-700 hover:text-emerald-600">
              View Tournaments →
            </Link>
          )}
        </div>
        {tournaments === null ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <p className="text-gray-400 text-center py-12">No tournaments yet — be the first to host!</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((t) => {
              const st = tournamentStats[t.id];
              return (
                <Link key={t.id} href={`/tournament/${t.id}`}
                  className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 hover:shadow-xl transition-all hover:-translate-y-1 hover:border-emerald-200 group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                      🏸
                    </div>
                    {statusBadge(t.status)}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5 group-hover:text-emerald-700 transition-colors">{t.title}</h3>
                  {t.venue && <p className="text-sm text-gray-500 mb-1">📍 {t.venue}</p>}
                  <p className="text-xs text-gray-500 mb-4">📅 {fmtDate(t.start_date)}{t.end_date && fmtDate(t.end_date) !== fmtDate(t.start_date) ? ` – ${fmtDate(t.end_date)}` : ""}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {st && (
                      <>
                        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{st.categories} {st.categories === 1 ? "category" : "categories"}</span>
                        <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{st.matches} {st.matches === 1 ? "match" : "matches"}</span>
                      </>
                    )}
                    {t.prize && <span className="text-xs font-semibold bg-yellow-50 text-yellow-700 px-2.5 py-1 rounded-full">💰 {t.prize.slice(0, 40)}{t.prize.length > 40 ? "…" : ""}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 5 Roles */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-16 text-gray-900">
          One Platform, <span className="text-emerald-700">Five Roles</span>
        </h2>
        <div className="flex flex-wrap justify-center gap-6">
          {[
            { emoji: "🏆", title: "Organizer", href: "/organizer", desc: "Host tournaments your way. Set categories, manage registrations, auto-generate draws, assign umpires, book courts — all from one dashboard.", color: "emerald" },
            { emoji: "🏸", title: "Player", href: "/player", desc: "Find and join tournaments near you. Create your player profile with photos and videos to attract sponsors. Track your match history and rankings.", color: "blue" },
            { emoji: "🎯", title: "Umpire", href: "/umpire", desc: "Register as an umpire and get hired for tournaments. Set your rate, update your availability, and build your reputation.", color: "yellow" },
            { emoji: "📋", title: "Coach", href: "/coach", desc: "Showcase your coaching credentials and attract students. Get reviewed by players and build your reputation.", color: "purple" },
            { emoji: "🏟️", title: "Court Owner", href: "/court-owner", desc: "List your badminton courts for organizers and players to book. Manage availability, set hourly rates.", color: "orange" },
          ].map((item) => (
            <Link key={item.title} href={item.href} className="block bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1 w-full md:w-[380px]">
              <div className={`w-14 h-14 bg-${item.color}-100 rounded-2xl flex items-center justify-center mb-5`}>
                <span className="text-3xl">{item.emoji}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-16 text-gray-900">
            How It <span className="text-emerald-700">Works</span>
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            {["Register", "Publish", "Draw & Play", "Live Score"].map((title, i) => (
              <div key={title} className="text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-emerald-700">{i + 1}</span>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600">
                  {i === 0 && "Sign up as Organizer and create your tournament in minutes"}
                  {i === 1 && "Share the tournament link — players register themselves"}
                  {i === 2 && "Auto-generate brackets, assign umpires, and go live"}
                  {i === 3 && "Score updates in real-time on the big screen and audience portal"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-emerald-900 to-green-800 text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to host your tournament?</h2>
          <p className="text-emerald-200 text-lg mb-10 max-w-2xl mx-auto">
            No calls, no meetings, no training needed. Sign up and start organizing in 5 minutes.
          </p>
          {user ? (
            <Link href={user.role === 'organizer' || user.role === 'admin' ? "/organizer" : "/player"}
              className="inline-block bg-white text-emerald-900 font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-50 transition-all shadow-xl">
              {user.role === 'organizer' || user.role === 'admin' ? "Go to Dashboard →" : "Browse Tournaments →"}
            </Link>
          ) : (
            <Link href="/auth/register"
              className="inline-block bg-white text-emerald-900 font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-50 transition-all shadow-xl">
              Get Started Free →
            </Link>
          )}
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-400 py-12 px-6">
        <div className="max-w-6xl mx-auto text-center text-sm">
          <p className="font-bold text-white text-lg mb-2">TUAH.com</p>
          <p>Tournament Umpire Automation Hawkeye</p>
          <p className="mt-2">© 2026 TUAH.com — All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

export default function HomePage() {
  return <HomeContent />;
}
