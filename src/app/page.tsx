"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

function HomeContent() {
  const { session, profile } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-emerald-900 text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight">TUAH</span>
          <span className="text-emerald-300 text-xs font-medium">.com</span>
        </div>
        <div className="flex items-center gap-4">
          {session ? (
            <>
              <Link href="/organizer" className="text-sm hover:text-emerald-300">Dashboard</Link>
              <button
                onClick={async () => {
                  const { createBrowserClient } = await import("@supabase/ssr");
                  const supabase = createBrowserClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                  );
                  await supabase.auth.signOut();
                  window.location.href = "/";
                }}
                className="text-sm bg-emerald-700 px-4 py-2 rounded-lg hover:bg-emerald-600"
              >
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

      {/* Hero */}
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
          <Link href="/auth/register"
            className="inline-block bg-white text-emerald-900 font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0">
            Start Your Tournament →
          </Link>
        </div>
      </section>

      {/* 5 Roles */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-16 text-gray-900">
          One Platform, <span className="text-emerald-700">Five Roles</span>
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

          {/* Organizer */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-5">
              <span className="text-3xl">🏆</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Organizer</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Host tournaments your way. Set categories, manage registrations, auto-generate draws, assign umpires, book courts — all from one dashboard. No technical help needed.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-400">
              <li>✓ Step-by-step tournament wizard</li>
              <li>✓ Auto-draw & bracket generation</li>
              <li>✓ Live scoreboard on big screen</li>
            </ul>
          </div>

          {/* Player */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mb-5">
              <span className="text-3xl">🏸</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Player</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Find and join tournaments near you. Create your player profile with photos and videos to attract sponsors. Track your match history and rankings.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-400">
              <li>✓ Browse & join open tournaments</li>
              <li>✓ Personal player profile</li>
              <li>✓ Sponsor discovery page</li>
            </ul>
          </div>

          {/* Umpire */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="w-14 h-14 bg-yellow-100 rounded-2xl flex items-center justify-center mb-5">
              <span className="text-3xl">🎯</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Umpire</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Register as an umpire and get hired for tournaments. Set your rate, update your availability, and build your reputation through organizer reviews.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-400">
              <li>✓ Umpire profile with certifications</li>
              <li>✓ Set your match/day rate</li>
              <li>✓ Organizer ratings & reviews</li>
            </ul>
          </div>

          {/* Coach */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mb-5">
              <span className="text-3xl">📋</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Coach</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Showcase your coaching credentials and attract students. Get reviewed by players and build your reputation in the badminton community.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-400">
              <li>✓ Coach profile with certifications</li>
              <li>✓ Set your session rate</li>
              <li>✓ Student reviews & ratings</li>
            </ul>
          </div>

          {/* Court Owner */}
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="w-14 h-14 bg-orange-100 rounded-2xl flex items-center justify-center mb-5">
              <span className="text-3xl">🏟️</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">Court Owner</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              List your badminton courts for organizers and players to book. Manage availability, set hourly rates, and get reviews from users.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-400">
              <li>✓ Court listing with photos</li>
              <li>✓ Calendar & availability management</li>
              <li>✓ Booking & payment system</li>
            </ul>
          </div>

        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-16 text-gray-900">
            How It <span className="text-emerald-700">Works</span>
          </h2>
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-700">1</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Register</h3>
              <p className="text-sm text-gray-500">Sign up as Organizer and create your tournament in minutes</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-700">2</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Publish</h3>
              <p className="text-sm text-gray-500">Share the tournament link — players register themselves</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-700">3</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Draw & Play</h3>
              <p className="text-sm text-gray-500">Auto-generate brackets, assign umpires, and go live</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-emerald-700">4</span>
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Live Score</h3>
              <p className="text-sm text-gray-500">Score updates in real-time on the big screen and audience portal</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-emerald-900 to-green-800 text-white py-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to host your tournament?
          </h2>
          <p className="text-emerald-200 text-lg mb-10 max-w-2xl mx-auto">
            No calls, no meetings, no training needed. Sign up and start organizing in 5 minutes.
          </p>
          <Link href="/auth/register"
            className="inline-block bg-white text-emerald-900 font-bold px-10 py-4 rounded-2xl text-lg hover:bg-emerald-50 transition-all shadow-xl">
            Get Started Free →
          </Link>
        </div>
      </section>

      {/* Footer */}
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


